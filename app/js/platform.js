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

  window.Platform = {
    isElectron,
    isNative,

    async speak(text, opts) {
      if (!text) return;
      opts = opts || {};
      const lang = opts.lang || detectLang(text);
      const rate = Number(opts.rate ?? 1);
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
      const names = ['meta', 'exams', 'roots', 'roottrees', 'words', 'affixes'];
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
        inp.accept = '.json,.tsv,.txt';
        inp.onchange = () => {
          const f = inp.files && inp.files[0];
          if (!f) return resolve(null);
          const rd = new FileReader();
          rd.onload = () => resolve({ name: f.name, text: String(rd.result) });
          rd.onerror = () => resolve(null);
          rd.readAsText(f);
        };
        inp.click();
      });
    },

    openOverlay() { if (isElectron) ipc.send('open-overlay-window'); }
  };
})();