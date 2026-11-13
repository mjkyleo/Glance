// Glance dictionary: external lookups (free / Merriam-Webster / custom) with per-word local cache.
(function () {
  const PROVIDERS = [
    {
      id: 'free', name: '免费词典 (dictionaryapi.dev)', needKey: false, custom: false,
      hint: '默认免费词典（Wiktionary 源，无需 Key），含音标、词性、多义项与例句。'
    },
    {
      id: 'mw', name: 'Merriam-Webster 大学词典', needKey: true, custom: false,
      hint: '权威韦氏大学词典，需在 dictionaryapi.com 免费申请 Key。'
    },
    {
      id: 'custom', name: '自定义端点', needKey: false, custom: true,
      hint: '通用 JSON 端点，URL 中用 {word} 占位（可选 {key}）；带 Key 时默认以 Bearer 发送。'
    }
  ];
  function getProvider(id) { return PROVIDERS.find(p => p.id === id) || PROVIDERS[0]; }

  function arr(x) { return Array.isArray(x) ? x : (x == null ? [] : [x]); }
  function str(x) { return x == null ? '' : String(x).trim(); }
  function uniq(list) {
    const seen = new Set(), out = [];
    (list || []).forEach(x => { const s = str(x); if (s && !seen.has(s)) { seen.add(s); out.push(s); } });
    return out;
  }
  function audioUrl(a) {
    const s = str(a);
    if (!s) return '';
    if (s.startsWith('//')) return 'https:' + s;
    return /^https?:\/\//i.test(s) ? s : '';
  }
  function capDefs(defs, n) { return defs.slice(0, n || 8); }
  function cleanIpa(s) { return str(s).replace(/^\/+|\/+$/g, ''); }

  function normalizeFree(json, word, url) {
    const entries = Array.isArray(json) ? json : (json && Array.isArray(json.entries) ? json.entries : []);
    const meanings = [];
    const byPos = new Map();
    const audio = [];
    let ipa = '', sourceUrl = url;
    entries.forEach(en => {
      if (!en || typeof en !== 'object') return;
      if (!ipa && str(en.phonetic)) ipa = cleanIpa(en.phonetic);
      arr(en.phonetics).forEach(p => {
        if (p && !ipa && str(p.text)) ipa = cleanIpa(p.text);
        const u = audioUrl(p && p.audio);
        if (u && !audio.includes(u)) audio.push(u);
      });
      if (en.sourceUrls && en.sourceUrls[0]) sourceUrl = str(en.sourceUrls[0]);
      arr(en.meanings).forEach(m => {
        if (!m || typeof m !== 'object') return;
        const pos = str(m.partOfSpeech);
        let group = byPos.get(pos);
        if (!group) { group = { pos, defs: [] }; byPos.set(pos, group); meanings.push(group); }
        arr(m.definitions).forEach(d => {
          if (!d || typeof d !== 'object') return;
          const enDef = str(d.definition);
          if (!enDef) return;
          if (group.defs.some(x => x.en === enDef)) return;
          group.defs.push({
            en: enDef,
            example: str(d.example),
            synonyms: uniq(arr(d.synonyms)).slice(0, 8),
            antonyms: uniq(arr(d.antonyms)).slice(0, 8)
          });
        });
      });
    });
    meanings.forEach(g => { g.defs = capDefs(g.defs); });
    return {
      word, ipa, audio: audio.slice(0, 3),
      meanings: meanings.filter(g => g.defs.length).slice(0, 10),
      provider: 'free', sourceUrl, ts: Date.now()
    };
  }

  function mwAudio(name) {
    const a = str(name);
    if (!a) return '';
    const sub = /^bix/i.test(a) ? 'bix' : (/^gg/i.test(a) ? 'gg' : a[0]);
    return 'https://media.merriam-webster.com/audio/prons/en/us/mp3/' + sub + '/' + a + '.mp3';
  }

  function normalizeMw(json, word, url) {
    const list = Array.isArray(json) ? json : [];
    const meanings = [];
    const audio = [];
    let ipa = '';
    list.forEach(item => {
      if (!item || typeof item !== 'object') return;
      const hwi = item.hwi || {};
      const prs = arr(hwi.prs)[0] || {};
      if (!ipa) ipa = cleanIpa(prs.mw || hwi.hw);
      const au = mwAudio(prs.sound && prs.sound.audio);
      if (au && !audio.includes(au)) audio.push(au);
      const defs = arr(item.shortdef).map(d => ({ en: str(d) })).filter(d => d.en);
      if (!defs.length) return;
      const meta = item.meta || {};
      const syns = uniq(arr(meta.syns).reduce((acc, x) => acc.concat(arr(x)), [])).slice(0, 8);
      const ants = uniq(arr(meta.ants).reduce((acc, x) => acc.concat(arr(x)), [])).slice(0, 8);
      if (syns.length) defs[0].synonyms = syns;
      if (ants.length) defs[0].antonyms = ants;
      meanings.push({ pos: str(item.fl), defs: capDefs(defs) });
    });
    return {
      word, ipa, audio: audio.slice(0, 3),
      meanings: meanings.slice(0, 10),
      provider: 'mw', sourceUrl: url, ts: Date.now()
    };
  }

  // Generic walker for user-configured endpoints: pull {partOfSpeech, definitions[]} shapes.
  function collectCustom(node, out, depth) {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { node.forEach(n => collectCustom(n, out, depth + 1)); return; }
    if (typeof node !== 'object') return;
    const pos = str(node.partOfSpeech || node.pos || node.type || node.wordClass);
    const defs = node.definitions || node.defs;
    if (Array.isArray(defs) && defs.length) {
      const clean = [];
      defs.forEach(d => {
        if (typeof d === 'string') { if (str(d)) clean.push({ en: str(d) }); return; }
        if (!d || typeof d !== 'object') return;
        const en = str(d.definition || d.en || d.meaning || d.zh || d.text || d.translation);
        if (!en) return;
        clean.push({
          en,
          example: str(d.example || d.example_en || d.ex_en),
          synonyms: uniq(arr(d.synonyms)).slice(0, 8),
          antonyms: uniq(arr(d.antonyms)).slice(0, 8)
        });
      });
      if (clean.length) out.push({ pos, defs: capDefs(clean) });
      return;
    }
    const direct = str(node.definition || node.meaning || node.translation || node.zh);
    if (direct) { out.push({ pos, defs: [{ en: direct }] }); return; }
    ['meanings', 'entries', 'results', 'items', 'data', 'tuc', 'trs'].forEach(k => {
      if (node[k]) collectCustom(node[k], out, depth + 1);
    });
  }

  function normalizeCustom(json, word, url) {
    const root = Array.isArray(json) ? json :
      (json && (json.entries || json.results || json.data || json.meanings)) || json;
    const meanings = [];
    collectCustom(root, meanings, 0);
    const audio = [];
    let ipa = '';
    const ipaRaw = json && (json.ipa || json.phonetic || json.pronunciation);
    if (ipaRaw) ipa = cleanIpa(ipaRaw);
    arr(json && json.audio).forEach(a => { const u = audioUrl(a); if (u) audio.push(u); });
    const seen = new Set();
    const deduped = meanings.filter(m => {
      const key = m.pos + '|' + (m.defs[0] ? m.defs[0].en : '');
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
    return {
      word, ipa, audio: audio.slice(0, 3),
      meanings: deduped.slice(0, 10),
      provider: 'custom', sourceUrl: url, ts: Date.now()
    };
  }

  function buildUrl(p, word, cfg) {
    const w = encodeURIComponent(word);
    if (p.id === 'mw') {
      return 'https://dictionaryapi.com/api/v3/references/collegiate/json/' + w + '?key=' + encodeURIComponent(cfg.key || '');
    }
    if (p.custom) {
      let base = str(cfg.base);
      if (base.includes('{word}')) base = base.replace(/\{word\}/g, w);
      else base += (base.includes('?') ? '&' : '?') + 'word=' + w;
      if (cfg.key && base.includes('{key}')) base = base.replace(/\{key\}/g, encodeURIComponent(cfg.key));
      return base;
    }
    return 'https://api.dictionaryapi.dev/api/v2/entries/en/' + w;
  }

  function friendly(res) {
    if (!res) return '查询失败';
    if (res.error === '网络超时') return '网络超时，请检查网络后重试';
    if (res.status === 404) return '词典中未找到该词';
    if (res.status === 429) return '请求过于频繁，请稍后再试';
    if (res.status >= 500) return '词典服务暂时不可用（HTTP ' + res.status + '）';
    return str(res.error) || '查询失败';
  }

  // lookup(word, cfg, {force}) → { ok, record, cached } | { ok:false, error }
  async function lookup(word, cfg, opts) {
    word = str(word).toLowerCase();
    if (!word) return { ok: false, error: '缺少单词' };
    cfg = cfg || (window.Store && Store.data && Store.data.dict) || {};
    if (!opts || !opts.force) {
      const cached = Store.dictEntry(word);
      if (cached && Array.isArray(cached.meanings) && cached.meanings.length) return { ok: true, record: cached, cached: true };
    }
    const p = getProvider(cfg.provider);
    if (p.needKey && !str(cfg.key)) return { ok: false, error: '请先在「设置 → 外部词典」填写 ' + p.name + ' 的 API Key' };
    if (p.custom && !str(cfg.base)) return { ok: false, error: '请填写自定义词典的 API 地址（含 {word}）' };
    const url = buildUrl(p, word, cfg);
    const headers = {};
    if (p.custom && cfg.key) headers.Authorization = 'Bearer ' + cfg.key;
    const res = await Platform.fetchJson(url, { headers });
    if (!res.ok) {
      if (p.id === 'mw' && Array.isArray(res.data) && typeof res.data[0] === 'string') {
        return { ok: false, error: '未找到该词，可能拼写有误：' + res.data.slice(0, 5).join(' / ') };
      }
      return { ok: false, error: friendly(res) };
    }
    let record;
    try {
      record = p.custom ? normalizeCustom(res.data, word, url) : (p.id === 'mw' ? normalizeMw(res.data, word, url) : normalizeFree(res.data, word, url));
    } catch (e) {
      return { ok: false, error: '无法解析词典返回内容' };
    }
    if (!record || !record.meanings.length) {
      if (p.id === 'mw' && Array.isArray(res.data) && typeof res.data[0] === 'string') {
        return { ok: false, error: '未找到该词，可能拼写有误：' + res.data.slice(0, 5).join(' / ') };
      }
      return { ok: false, error: '词典没有返回该词的释义' };
    }
    record.provider = p.id;
    record.sourceUrl = record.sourceUrl || url;
    record.ts = Date.now();
    Store.saveDictEntry(word, record);
    return { ok: true, record, cached: false };
  }

  window.Dictionary = { PROVIDERS, getProvider, lookup, normalizeFree, normalizeMw, normalizeCustom, buildUrl };
})();
