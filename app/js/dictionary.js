// Glance dictionary: external lookups (Youdao / free / Merriam-Webster / custom) with per-word local cache.
(function () {
  const PROVIDERS = [
    {
      id: 'freezh', name: '中英词典', needKey: false, custom: false,
      hint: '免 Key 的中英/英中词典：中文释义、双音标、双语例句、考试标签与助记。桌面/安卓端直连；浏览器预览若被跨域拦截会自动回退免费英文词典。'
    },
    {
      id: 'uapis', name: '中英词典 (UAPI)', needKey: false, custom: false,
      hint: '免 Key 的中英词典（uapis.cn）：中英双释义、英美音标与真人发音、词形变化、词组、近义词与双语例句。桌面/安卓端直连；浏览器预览会被跨域拦截，自动回退其它词典。访客积分有 4 QPS 上限。'
    },
    {
      id: 'free', name: '免费词典 (dictionaryapi.dev)', needKey: false, custom: false,
      hint: '免费英文词典（Wiktionary 源，无需 Key），含音标、词性、多义项与例句。'
    },
    {
      id: 'mw', name: 'Merriam-Webster 大学词典', needKey: true, custom: false,
      hint: '权威韦氏大学词典，需在 dictionaryapi.com 免费申请 Key。'
    }
  ];
  // 用户添加的词典：与内置词典同样参与开关、排序与多源合并。
  function customProviders(cfg) {
    const list = (cfg && Array.isArray(cfg.custom) && cfg.custom) ||
      (window.Store && Store.data && Store.data.dict && Store.data.dict.custom) || [];
    return list.map(c => ({
      id: c.id, name: c.name || '自定义词典', needKey: false, custom: true,
      base: c.base || '', format: c.format || 'auto', auth: c.auth || 'bearer', headerName: c.headerName || '',
      hint: '自定义端点：' + (c.base || '')
    }));
  }
  function allProviders(cfg) { return PROVIDERS.concat(customProviders(cfg)); }
  function getProvider(id, cfg) { return allProviders(cfg).find(p => p.id === id) || PROVIDERS[0]; }
  function enabledProviders(cfg) {
    const ids = (cfg && Array.isArray(cfg.enabled) && cfg.enabled) || [];
    const all = allProviders(cfg);
    return ids.map(id => all.find(p => p.id === id)).filter(Boolean);
  }
  function signature(cfg) { return enabledProviders(cfg).map(p => p.id).join(','); }
  function keyFor(p, cfg) {
    const keys = (cfg && cfg.keys) || {};
    return str(keys[p.id] || (cfg && cfg.provider === p.id ? cfg.key : ''));
  }
  function configError(p, cfg) {
    if (p.needKey && !keyFor(p, cfg)) return '未填写 ' + p.name + ' 的 API Key';
    if (p.custom && !str(p.base)) return '未填写 ' + p.name + ' 的 API 地址（含 {word}）';
    if (p.custom && !/^https?:\/\//i.test(str(p.base))) return p.name + ' 的 API 地址需以 http(s):// 开头';
    return '';
  }

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

  // Youdao wraps values as string, {"#text": ...} or arrays of both.
  function ydText(x) {
    if (x == null) return '';
    if (Array.isArray(x)) return x.map(ydText).filter(Boolean).join('');
    if (typeof x === 'object') return str(x['#text'] || x.text || '');
    return str(x);
  }

  function normalizeYoudao(json, word, url) {
    if (!json || typeof json !== 'object') return null;
    const ecWord = json.ec && arr(json.ec.word)[0];
    const eeWord = json.ee && json.ee.word;
    const ceWord = json.ce && arr(json.ce.word)[0];
    if (!ecWord && !eeWord && !ceWord) return null;  // 未收录：仅有 input/meta/le/lang

    const isZh = (json.meta && json.meta.guessLanguage === 'zh') || (!ecWord && !eeWord && !!ceWord);
    const meanings = [];
    const byPos = new Map();
    function group(pos) {
      const key = str(pos).replace(/[:：]+$/, '');
      let g = byPos.get(key);
      if (!g) { g = { pos: key, defs: [] }; byPos.set(key, g); meanings.push(g); }
      return g;
    }
    function addDef(pos, d) {
      if (!d || (!d.en && !d.zh)) return;
      const g = group(pos);
      if (g.defs.some(x => (x.en || '') === (d.en || '') && (x.zh || '') === (d.zh || ''))) return;
      g.defs.push(d);
    }

    let ipa = '', ipaUk = '';
    if (ecWord) {
      ipa = cleanIpa(ecWord.usphone || ecWord.ukphone);
      const uk = cleanIpa(ecWord.ukphone);
      if (uk && uk !== ipa) ipaUk = uk;
      arr(ecWord.trs).forEach(trs => arr(trs && trs.tr).forEach(tr => {
        const raw = ydText(tr && tr.l && tr.l.i);
        raw.split(/\n+/).forEach(line => {
          line = line.trim();
          if (!line) return;
          const m = line.match(/^([a-z]+\.)\s+(.*)$/i);
          const pos = m ? m[1] : '';
          (m ? m[2] : line).split('；').forEach(part => {
            part = part.trim();
            if (part) addDef(pos, { zh: part });
          });
        });
      }));
    }
    if (eeWord) {
      arr(eeWord.trs).forEach(trs => {
        const pos = trs && trs.pos;
        arr(trs && trs.tr).forEach(tr => {
          const en = ydText(tr && tr.l && tr.l.i);
          if (!en) return;
          const synonyms = uniq(arr(tr['similar-words']).map(x => x && (x.similar || x.w))).slice(0, 8);
          addDef(pos, synonyms.length ? { en, synonyms } : { en });
        });
      });
    }
    if (isZh && ceWord) {
      arr(ceWord.trs).forEach(trs => arr(trs && trs.tr).forEach(tr => {
        const en = ydText(tr && tr.l && tr.l.i);
        const zh = ydText(tr && tr.l && tr.l['#tran']).replace(/[；;]\s*$/, '');
        addDef('', { en, zh });
      }));
    }

    if (!ipa) {
      const sw = arr(json.simple && json.simple.word)[0];
      if (sw) {
        ipa = cleanIpa(sw.usphone || sw.ukphone);
        const uk = cleanIpa(sw.ukphone);
        if (uk && uk !== ipa) ipaUk = uk;
      }
    }

    const audio = [];
    if (ecWord) {
      [ecWord.usspeech, ecWord.ukspeech].forEach(s => {
        const t = str(s);
        if (t) audio.push('https://dict.youdao.com/dictvoice?audio=' + t);
      });
      if (!audio.length) {
        const q = encodeURIComponent(word);
        audio.push('https://dict.youdao.com/dictvoice?audio=' + q + '&type=2');
        audio.push('https://dict.youdao.com/dictvoice?audio=' + q + '&type=1');
      }
    }

    const pairs = arr(json.blng_sents_part && json.blng_sents_part['sentence-pair']);
    const examples = pairs.slice(0, 3).map(p => {
      const s = ydText(p && p.sentence);
      const t = ydText(p && p['sentence-translation']);
      return s && t ? s + ' — ' + t : (s || t);
    }).filter(Boolean);
    const flat = meanings.reduce((acc, m) => acc.concat(m.defs), []);
    examples.forEach((ex, i) => { const d = flat[i] || flat[0]; if (d && !d.example) d.example = ex; });

    arr(json.syno && json.syno.synos).forEach(s => {
      const node = s && s.syno;
      if (!node) return;
      const words = uniq(arr(node.ws).map(x => x && x.w)).slice(0, 8);
      if (!words.length) return;
      const g = byPos.get(str(node.pos)) || meanings[0];
      if (g && g.defs[0] && !g.defs[0].synonyms) g.defs[0].synonyms = words;
    });

    meanings.forEach(g => { g.defs = capDefs(g.defs); });
    const YD_EXAM = { '高中': '高考', 'CET4': '四级', 'CET6': '六级', 'IELTS': '雅思', 'TOEFL': '托福', 'SAT': 'SAT', 'GRE': 'GRE', '考研': '考研', '商务英语': '商务英语' };
    const exam = uniq(arr(json.ec && json.ec.exam_type).map(x => YD_EXAM[str(x)] || str(x))).slice(0, 8);
    const mnemonic = str(json.individual && json.individual.mnemonic && json.individual.mnemonic.method);

    return {
      word, ipa, ipaUk, audio: audio.slice(0, 3),
      meanings: meanings.filter(g => g.defs.length).slice(0, 10),
      lang: isZh ? 'zh' : 'en',
      exam, mnemonic,
      provider: 'freezh', sourceUrl: 'https://dict.youdao.com/result?word=' + encodeURIComponent(word) + '&lang=' + (isZh ? 'zh' : 'en'),
      ts: Date.now()
    };
  }

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

  function normalizeUapis(json, word, url) {
    const entry = json && json.found && json.entry ? json.entry : null;
    if (!entry) return null;
    const meanings = [];
    const byPos = new Map();
    function group(pos) {
      const key = str(pos).replace(/[:：]+$/, '');
      let g = byPos.get(key);
      if (!g) { g = { pos: key, defs: [] }; byPos.set(key, g); meanings.push(g); }
      return g;
    }
    // 中文释义：真实数据把词性内嵌在 meaning 开头（"adj. …"），文档另有 part_of_speech 字段。
    arr(entry.definitions).forEach(d => {
      if (!d || typeof d !== 'object') return;
      let pos = str(d.part_of_speech), zh = str(d.meaning);
      if (!zh) return;
      if (!pos) {
        const m = zh.match(/^([a-zA-Z]+(?:\.\s*&\s*[a-zA-Z]+)*\.)\s*(.*)$/);
        if (m) { pos = m[1]; zh = m[2]; }
      }
      if (zh) group(pos).defs.push({ zh });
    });
    arr(entry.english_definitions).forEach(d => {
      if (!d || typeof d !== 'object') return;
      const en = str(d.definition);
      if (!en) return;
      const g = group(str(d.part_of_speech));
      if (g.defs.some(x => x.en === en)) return;
      g.defs.push({ en, example: str(arr(d.examples)[0]) });
    });

    const ph = entry.phonetics || {}, us = ph.us || {}, uk = ph.uk || {};
    const ipa = cleanIpa(us.text || uk.text);
    let ipaUk = cleanIpa(uk.text);
    if (ipaUk === ipa) ipaUk = '';
    const audio = [];
    [us.audio, uk.audio].forEach(a => {
      const s = str(a);
      if (!s) return;
      const u = s.startsWith('/') ? 'https://uapis.cn' + s : audioUrl(s);
      if (u && !audio.includes(u)) audio.push(u);
    });

    const flat = meanings.reduce((acc, m) => acc.concat(m.defs), []);
    arr(entry.examples).slice(0, 3).forEach((ex, i) => {
      const s = str(ex && ex.source), t = str(ex && ex.translation);
      const line = s && t ? s + ' — ' + t : (s || t);
      const d = flat[i] || flat[0];
      if (line && d && !d.example) d.example = line;
    });
    arr(entry.synonyms).forEach(s => {
      const words = uniq(arr(s && s.words)).slice(0, 8);
      if (!words.length) return;
      const g = byPos.get(str(s && s.part_of_speech)) || meanings[0];
      if (g && g.defs[0] && !g.defs[0].synonyms) g.defs[0].synonyms = words;
    });
    meanings.forEach(g => { g.defs = capDefs(g.defs); });

    const UAPIS_EXAM = { '初中': '中考', '高中': '高考', 'CET4': '四级', 'CET6': '六级', 'IELTS': '雅思', 'TOEFL': '托福', 'SAT': 'SAT', 'GRE': 'GRE', '考研': '考研', '商务英语': '商务英语' };
    const exam = uniq(arr(entry.exam_tags).map(x => UAPIS_EXAM[str(x)] || str(x))).slice(0, 8);
    const phrases = arr(entry.phrases).map(p => ({ phrase: str(p && p.phrase), meaning: str(p && p.meaning) })).filter(p => p.phrase).slice(0, 8);
    const wordForms = arr(entry.word_forms).map(f => ({ name: str(f && f.name), value: str(f && f.value) })).filter(f => f.name && f.value).slice(0, 8);

    return {
      word, ipa, ipaUk, audio: audio.slice(0, 3),
      meanings: meanings.filter(g => g.defs.length).slice(0, 10),
      lang: 'en', exam, phrases, wordForms,
      provider: 'uapis', sourceUrl: url, ts: Date.now()
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

  // 「自动」格式：先按响应结构嗅探已知词典，再退回通用释义遍历。
  function normalizeAuto(json, word, url) {
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      if (json.ec || json.ee || json.ce) { const r = normalizeYoudao(json, word, url); if (r) return r; }
      if (json.entry && (json.found === true || json.found === undefined)) { const r = normalizeUapis(json, word, url); if (r) return r; }
      if (Array.isArray(json.shortdef) || (json.meta && json.hwi)) { const r = normalizeMw([json], word, url); if (r) return r; }
    }
    if (Array.isArray(json) && json[0] && typeof json[0] === 'object') {
      if (json[0].meanings || json[0].phonetics) { const r = normalizeFree(json, word, url); if (r && r.meanings.length) return r; }
      if (json[0].shortdef) { const r = normalizeMw(json, word, url); if (r && r.meanings.length) return r; }
    }
    return normalizeCustom(json, word, url);
  }

  function normalizeFor(p, json, word, url) {
    const fmt = p.custom ? (p.format || 'auto') : p.id;
    if (fmt === 'youdao' || fmt === 'freezh') return normalizeYoudao(json, word, url);
    if (fmt === 'uapis') return normalizeUapis(json, word, url);
    if (fmt === 'mw') return normalizeMw(json, word, url);
    if (fmt === 'free') return normalizeFree(json, word, url);
    return normalizeAuto(json, word, url);
  }

  function buildUrl(p, word, cfg) {
    const w = encodeURIComponent(word);
    const key = keyFor(p, cfg);
    if (p.id === 'freezh') return 'https://dict.youdao.com/jsonapi?q=' + w;
    if (p.id === 'uapis') return 'https://uapis.cn/api/v1/dictionary/lookup?word=' + w;
    if (p.id === 'free') return 'https://api.dictionaryapi.dev/api/v2/entries/en/' + w;
    if (p.id === 'mw') {
      return 'https://dictionaryapi.com/api/v3/references/collegiate/json/' + w + '?key=' + encodeURIComponent(key);
    }
    let base = str(p.base);
    const hasWord = base.includes('{word}');
    if (hasWord) base = base.replace(/\{word\}/g, w);
    else base += (base.includes('?') ? '&' : '?') + 'word=' + w;
    if (key && base.includes('{key}')) base = base.replace(/\{key\}/g, encodeURIComponent(key));
    else if (key && p.auth === 'query') base += (base.includes('?') ? '&' : '?') + 'key=' + encodeURIComponent(key);
    return base;
  }

  function headersFor(p, cfg) {
    const headers = {};
    const key = keyFor(p, cfg);
    if (p.custom && key && !str(p.base).includes('{key}')) {
      if (p.auth === 'bearer') headers.Authorization = 'Bearer ' + key;
      else if (p.auth === 'header') headers[str(p.headerName) || 'X-API-Key'] = key;
    }
    // 有道只拒绝带 Origin 的浏览器请求；桌面 IPC / CapacitorHttp 本就不带 Origin。
    if (p.id === 'freezh' || (p.custom && p.format === 'youdao')) headers['User-Agent'] = 'Mozilla/5.0';
    return headers;
  }

  function friendly(res) {
    if (!res) return '查询失败';
    if (res.error === '网络超时') return '网络超时，请检查网络后重试';
    if (res.status === 403) return '词典拒绝请求（HTTP 403，浏览器跨域限制）';
    if (res.status === 404) return '词典中未找到该词';
    if (res.status === 429) return '请求过于频繁，请稍后再试';
    if (res.status >= 500) return '词典服务暂时不可用（HTTP ' + res.status + '）';
    return str(res.error) || '查询失败';
  }

  async function attempt(p, word, cfg) {
    const url = buildUrl(p, word, cfg);
    const res = await Platform.fetchJson(url, { headers: headersFor(p, cfg) });
    if (!res.ok) {
      if (p.id === 'mw' && Array.isArray(res.data) && typeof res.data[0] === 'string') {
        return { error: '未找到该词，可能拼写有误：' + res.data.slice(0, 5).join(' / ') };
      }
      return { error: friendly(res), status: res.status || 0 };
    }
    let record;
    try {
      record = normalizeFor(p, res.data, word, url);
    } catch (e) {
      return { error: '无法解析词典返回内容' };
    }
    if (!record || !record.meanings.length) {
      if (p.id === 'mw' && Array.isArray(res.data) && typeof res.data[0] === 'string') {
        return { error: '未找到该词，可能拼写有误：' + res.data.slice(0, 5).join(' / ') };
      }
      return { error: '词典没有返回该词的释义' };
    }
    record.provider = p.id;
    record.sourceUrl = record.sourceUrl || url;
    record.ts = Date.now();
    return { record };
  }

  // 连通性测试：用样例词真实请求一次，返回耗时与释义条数。
  async function testProvider(p, cfg, word) {
    const err = configError(p, cfg);
    if (err) return { ok: false, error: err };
    const t0 = Date.now();
    const out = await attempt(p, str(word) || 'hello', cfg);
    const ms = Date.now() - t0;
    if (!out.record) return { ok: false, error: out.error, ms };
    const n = out.record.meanings.reduce((acc, m) => acc + m.defs.length, 0);
    return { ok: true, ms, count: n, ipa: out.record.ipa || '', sample: out.record.meanings[0].defs[0] };
  }

  const POS_CANON = {
    n: 'n', noun: 'n', v: 'v', verb: 'v', vt: 'v', vi: 'v',
    adj: 'adj', adjective: 'adj', a: 'adj', adv: 'adv', adverb: 'adv',
    pron: 'pron', pronoun: 'pron', prep: 'prep', preposition: 'prep',
    conj: 'conj', conjunction: 'conj', int: 'int', interjection: 'int',
    art: 'art', article: 'art', num: 'num', numeral: 'num', det: 'det', determiner: 'det'
  };
  function posKey(pos) {
    const s = str(pos).toLowerCase().replace(/[.\s:：]/g, '');
    return POS_CANON[s] || s;
  }
  function defKey(d) { return str(d.zh || d.en).toLowerCase().replace(/\s+/g, ' '); }

  // 多词典合并：按词性归组、按释义文本去重，保留每条释义的来源以便界面标注。
  function mergeRecords(word, records) {
    const first = records[0];
    const out = {
      word, ipa: '', ipaUk: '', audio: [], meanings: [],
      lang: first.lang || 'en', exam: [], mnemonic: '', phrases: [], wordForms: [],
      provider: first.provider, providers: records.map(r => r.provider),
      sources: records, ts: Date.now()
    };
    const byPos = new Map();
    records.forEach(r => {
      if (!out.ipa && r.ipa) out.ipa = r.ipa;
      if (!out.ipaUk && r.ipaUk) out.ipaUk = r.ipaUk;
      if (!out.lang || out.lang === 'en') out.lang = r.lang || out.lang;
      if (!out.mnemonic && r.mnemonic) out.mnemonic = r.mnemonic;
      (r.audio || []).forEach(u => { if (u && !out.audio.includes(u)) out.audio.push(u); });
      (r.exam || []).forEach(t => { if (t && !out.exam.includes(t)) out.exam.push(t); });
      (r.phrases || []).forEach(p => {
        if (p && p.phrase && !out.phrases.some(x => x.phrase === p.phrase)) out.phrases.push(p);
      });
      (r.wordForms || []).forEach(f => {
        if (f && f.name && !out.wordForms.some(x => x.name === f.name)) out.wordForms.push(f);
      });
      (r.meanings || []).forEach(m => {
        const key = posKey(m.pos);
        let g = byPos.get(key);
        if (!g) { g = { pos: str(m.pos), defs: [] }; byPos.set(key, g); out.meanings.push(g); }
        if (!g.pos && m.pos) g.pos = str(m.pos);
        (m.defs || []).forEach(d => {
          const k = defKey(d);
          if (!k) return;
          const hit = g.defs.find(x => defKey(x) === k);
          if (hit) {
            if (!hit.en && d.en) hit.en = d.en;
            if (!hit.zh && d.zh) hit.zh = d.zh;
            if (!hit.example && d.example) hit.example = d.example;
            if (!hit.synonyms && d.synonyms) hit.synonyms = d.synonyms;
            if (!hit.src.includes(r.provider)) hit.src.push(r.provider);
            return;
          }
          const copy = Object.assign({}, d, { src: [r.provider] });
          g.defs.push(copy);
        });
      });
    });
    out.meanings.forEach(g => { g.defs = g.defs.slice(0, 10); });
    out.meanings = out.meanings.filter(g => g.defs.length).slice(0, 12);
    out.audio = out.audio.slice(0, 4);
    out.exam = out.exam.slice(0, 8);
    out.phrases = out.phrases.slice(0, 10);
    out.wordForms = out.wordForms.slice(0, 10);
    if (out.ipaUk === out.ipa) out.ipaUk = '';
    return out;
  }

  // 浏览器预览下有道/UAPI 会被跨域拦截：仅当全部启用词典都因网络/跨域失败时，
  // 才临时借用其它内置免费词典救急，并在结果里标注 fallbackFrom。
  const RESCUE = ['free', 'uapis', 'freezh'];
  function isNetworkError(err) {
    return /fetch|network|跨域|超时|403|CORS|load failed/i.test(str(err));
  }

  // lookup(word, cfg, {force}) → { ok, record, cached, errors } | { ok:false, error, errors }
  async function lookup(word, cfg, opts) {
    word = str(word).toLowerCase();
    if (!word) return { ok: false, error: '缺少单词' };
    cfg = cfg || (window.Store && Store.data && Store.data.dict) || {};
    const enabled = enabledProviders(cfg);
    const sig = signature(cfg);
    if (!opts || !opts.force) {
      const cached = Store.dictEntry(word);
      if (cached && Array.isArray(cached.meanings) && cached.meanings.length && (cached.sig || '') === sig) {
        return { ok: true, record: cached, cached: true };
      }
    }
    if (!enabled.length) return { ok: false, error: '没有启用任何词典，请到「我的 → 词典」至少开启一个' };

    const errors = [], ready = [];
    enabled.forEach(p => {
      const err = configError(p, cfg);
      if (err) errors.push({ provider: p.id, error: err }); else ready.push(p);
    });
    if (!ready.length) return { ok: false, error: errors[0].error, errors };

    const records = [];
    if (cfg.merge === false) {
      // 单源模式：按优先级顺序查询，命中即停，节省配额。
      for (const p of ready) {
        const out = await attempt(p, word, cfg);
        if (out.record) { records.push(out.record); break; }
        errors.push({ provider: p.id, error: out.error });
        if (out.error === '词典中未找到该词') break;
      }
    } else {
      const settled = await Promise.all(ready.map(p => attempt(p, word, cfg).then(out => ({ p, out }))));
      settled.forEach(({ p, out }) => {
        if (out.record) records.push(out.record);
        else errors.push({ provider: p.id, error: out.error });
      });
    }

    if (!records.length && errors.some(x => isNetworkError(x.error))) {
      const tried = new Set(ready.map(p => p.id));
      for (const id of RESCUE) {
        if (tried.has(id)) continue;
        const fb = await attempt(getProvider(id, cfg), word, cfg);
        if (fb.record) { fb.record.fallbackFrom = enabled[0].id; records.push(fb.record); break; }
      }
    }
    if (!records.length) {
      const notFound = errors.find(x => x.error === '词典中未找到该词');
      return { ok: false, error: (notFound || errors[0]).error, errors };
    }
    const record = records.length > 1 ? mergeRecords(word, records) : records[0];
    if (records.length === 1) record.providers = [record.provider];
    record.sig = sig;
    Store.saveDictEntry(word, record);
    return { ok: true, record, cached: false, errors };
  }

  window.Dictionary = {
    PROVIDERS, getProvider, allProviders, enabledProviders, signature, keyFor, configError,
    lookup, testProvider, mergeRecords, buildUrl, headersFor,
    normalizeYoudao, normalizeUapis, normalizeFree, normalizeMw, normalizeCustom, normalizeAuto
  };
})();
