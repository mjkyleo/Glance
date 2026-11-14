// Platform adapter: same web core runs in Electron (Windows) and Capacitor/browser (Android).
(function () {
  const isElectron = !!(window.process && window.process.versions && window.process.versions.electron);
  const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  let ipc = null;
  if (isElectron) {
    ipc = window.require('electron').ipcRenderer;
  }

  const SETTINGS_KEY = 'glance.settings';

  // ---- TTS: native plugin on Android, Web Speech on Electron/browser ----
  let voices = [];
  function refreshVoices() { voices = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : []; }
  if (window.speechSynthesis) { refreshVoices(); speechSynthesis.onvoiceschanged = refreshVoices; }
  function nativeTTS() {
    return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.TextToSpeech) || null;
  }
  function detectLang(text) {
    if (/[぀-ヿ]/.test(text)) return 'ja-JP';
    if (/[가-힯]/.test(text)) return 'ko-KR';
    if (/[一-鿿]/.test(text)) return 'zh-CN';
    return 'en-US';
  }

  // ---- real human audio (Wiktionary commons) with TTS fallback ----
  let audioEl = null;
  function audioUrl(au) {
    const path = String(au || '').split('|').pop();
    if (!path || !/\.(ogg|wav|mp3)$/i.test(path)) return '';
    return 'https://upload.wikimedia.org/wikipedia/commons/' + path;
  }
  function playAudio(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      let a;
      try { a = new Audio(url); } catch (e) { return reject(e); }
      if (audioEl) { try { audioEl.pause(); } catch {} }
      audioEl = a;
      let settled = false;
      const to = setTimeout(() => { if (settled) return; settled = true; try { a.pause(); } catch {} reject(new Error('timeout')); }, timeoutMs);
      const ok = () => { if (settled) return; settled = true; clearTimeout(to); resolve(); };
      const bad = e => { if (settled) return; settled = true; clearTimeout(to); reject(e || new Error('audio')); };
      a.addEventListener('playing', ok);
      a.addEventListener('error', () => bad());
      a.play().catch(bad);
    });
  }

  window.Platform = {
    isElectron,
    isNative,

    async speak(text, opts) {
      if (!text) return;
      opts = opts || {};
      const lang = opts.lang || detectLang(text);
      const rate = Number(opts.rate ?? 1);
      if (opts.preferAudio !== false && Array.isArray(opts.audio)) {
        for (const au of opts.audio) {
          const url = audioUrl(au);
          if (!url) continue;
          try { await playAudio(url, 3500); return; }
          catch (e) { /* offline / blocked / unsupported → fall back to TTS */ }
        }
      }
      const tts = nativeTTS();
      if (tts) {
        try { await tts.speak({ text, lang, rate, pitch: 1.0, volume: 1.0, category: 'ambient' }); return; }
        catch (e) { console.warn('native TTS failed, fallback', e); }
      }
      if (window.speechSynthesis) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = lang;
        const lc = lang.toLowerCase();
        const v = voices.find(x => (x.lang || '').toLowerCase() === lc) ||
          voices.find(x => (x.lang || '').toLowerCase().startsWith(lc.split('-')[0]));
        if (v) u.voice = v;
        u.rate = rate;
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
      }
    },

    stopSpeak() {
      if (audioEl) { try { audioEl.pause(); } catch {} }
      const tts = nativeTTS();
      if (tts && tts.stop) { try { tts.stop(); } catch {} }
      if (window.speechSynthesis) speechSynthesis.cancel();
    },

    async getSettings() {
      if (isElectron) return ipc.invoke('get-settings');
      try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; }
    },

    async saveSettings(s) {
      if (isElectron) { ipc.send('save-settings', s); return; }
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    },

    async loadBundledLibrary() {
      if (isElectron) return ipc.invoke('get-bundled-library');
      const res = await fetch('data/cet6.json');
      return res.text();
    },

    async loadDataset() {
      if (isElectron) return ipc.invoke('get-dataset');
      const names = ['meta', 'exams', 'roots', 'roottrees', 'words', 'affixes', 'official'];
      const out = {};
      await Promise.all(names.map(async n => {
        try { const r = await fetch('data/' + n + '.json'); out[n] = r.ok ? await r.json() : null; }
        catch { out[n] = null; }
      }));
      return out;
    },

    async pickLibrary() {
      if (isElectron) {
        const r = await ipc.invoke('dialog:openLibrary');
        return r ? { name: r.filePath, text: r.content } : null;
      }
      return new Promise(resolve => {
        const inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = '.json,.tsv,.csv,.txt,application/json,text/plain,text/csv,text/tab-separated-values';
        inp.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
        document.body.appendChild(inp);
        let settled = false, timer = 0;
        const cleanup = () => {
          clearTimeout(timer);
          window.removeEventListener('focus', onFocus);
          inp.remove();
        };
        const finish = value => {
          if (settled) return;
          settled = true;
          cleanup();
          resolve(value);
        };
        const onFocus = () => {
          // The picker closed; give `change` a moment to arrive before treating it as cancel.
          setTimeout(() => { if (!settled && !(inp.files && inp.files.length)) finish(null); }, 800);
        };
        inp.addEventListener('change', () => {
          const f = inp.files && inp.files[0];
          if (!f) return finish(null);
          const rd = new FileReader();
          rd.onload = () => finish({ name: f.name, text: String(rd.result) });
          rd.onerror = () => finish(null);
          rd.readAsText(f);
        });
        window.addEventListener('focus', onFocus);
        timer = setTimeout(() => finish(null), 180000);
        inp.click();
      });
    },

    // GET + JSON parse. Routes around browser CORS: Electron IPC → CapacitorHttp → fetch.
    async fetchJson(url, opts) {
      opts = opts || {};
      const headers = opts.headers || {};
      const timeout = Math.min(Math.max(Number(opts.timeout) || 15000, 1000), 60000);
      if (isElectron) {
        try { return await ipc.invoke('http-get', { url, headers, timeout }); }
        catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
      }
      const http = isNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      try {
        let status, text;
        if (http) {
          const r = await http.get({ url, headers, connectTimeout: timeout, readTimeout: timeout });
          status = r.status; text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
        } else {
          const ctl = new AbortController();
          const to = setTimeout(() => ctl.abort(), timeout);
          try {
            const res = await fetch(url, { headers, signal: ctl.signal });
            status = res.status; text = await res.text();
          } finally { clearTimeout(to); }
        }
        let data;
        try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch { data = null; }
        if (status < 200 || status >= 300) return { ok: false, status, error: 'HTTP ' + status, data };
        if (data === null || data === undefined) return { ok: false, status, error: '返回内容不是有效 JSON' };
        return { ok: true, status, data };
      } catch (err) {
        const msg = String((err && err.message) || err);
        return { ok: false, error: /abort|timeout/i.test(msg) ? '网络超时' : msg };
      }
    },

    // Unified OpenAI-compatible chat call. Routes around browser CORS per platform.
    // args: { base, key, model, messages, temperature, jsonMode, anthropic }
    // resolves { ok, content } or { ok:false, error }.
    async llmChat(args) {
      const { base, key, model, messages, temperature, jsonMode, anthropic } = args || {};
      if (!base || !key || !model) return { ok: false, error: '缺少 API 配置（服务商 / Key / 模型）' };
      if (isElectron) return ipc.invoke('llm-chat', args);
      const url = String(base).replace(/\/+$/, '') + '/chat/completions';
      const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
      if (anthropic) headers['anthropic-dangerous-direct-browser-access'] = 'true';
      const body = { model, messages, temperature: temperature ?? 0.3, stream: false };
      if (jsonMode) body.response_format = { type: 'json_object' };
      const http = isNative && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
      try {
        let status, text;
        if (http) {
          const r = await http.post({ url, headers, data: body, connectTimeout: 60000, readTimeout: 60000 });
          status = r.status; text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
        } else {
          const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
          status = res.status; text = await res.text();
        }
        if (status < 200 || status >= 300) return { ok: false, error: 'HTTP ' + status + '：' + String(text).slice(0, 300) };
        let data;
        try { data = typeof text === 'string' ? JSON.parse(text) : text; } catch { return { ok: false, error: '返回内容不是有效 JSON' }; }
        const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        if (typeof content !== 'string') return { ok: false, error: '响应中没有解释内容' };
        return { ok: true, content };
      } catch (err) {
        return { ok: false, error: String((err && err.message) || err) };
      }
    },

    // ---- storage location & uninstall-proof shared mirror ----
    storageInfo() {
      if (isElectron) return ipc.invoke('storage-info');
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (isNative && P && P.GlanceStorage) return P.GlanceStorage.info();
      return Promise.resolve({ platform: 'browser', key: SETTINGS_KEY });
    },
    storageSetDir(dir) {
      if (isElectron) return ipc.invoke('storage-set-dir', dir ? { dir } : undefined);
      return Promise.resolve(null);
    },
    storageResetDir() {
      if (isElectron) return ipc.invoke('storage-reset-dir');
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (isNative && P && P.GlanceStorage) return P.GlanceStorage.clearFolder();
      return Promise.resolve(null);
    },
    storageOpenDir() {
      if (isElectron) return ipc.invoke('storage-open-dir');
      return Promise.resolve('');
    },
    storagePickFolder() {
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (isNative && P && P.GlanceStorage) return P.GlanceStorage.pickFolder();
      return Promise.resolve(null);
    },
    storageWriteMirror(json) {
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (isNative && P && P.GlanceStorage) return P.GlanceStorage.writeMirror({ json });
      return Promise.resolve(null);
    },
    storageReadMirror() {
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (isNative && P && P.GlanceStorage) return P.GlanceStorage.readMirror();
      return Promise.resolve({ found: false });
    },

    // Save a text file: Electron save dialog, Android filesystem+share, browser download.
    async saveTextFile(name, text) {
      if (isElectron) return ipc.invoke('save-text-file', { name, text });
      const P = window.Capacitor && window.Capacitor.Plugins;
      if (isNative && P && P.Filesystem && P.Share) {
        try {
          const w = await P.Filesystem.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' });
          await P.Share.share({ title: name, url: w.uri, dialogTitle: '导出 AI 解释' });
          return true;
        } catch (e) { /* fall through to browser download */ }
      }
      try {
        const blob = new Blob([text], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        return true;
      } catch (e) { return false; }
    }
  };
})();