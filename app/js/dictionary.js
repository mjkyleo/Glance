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
      const key = str(pos);
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
      const key = str(pos);
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

  function buildUrl(p, word, cfg) {
    const w = encodeURIComponent(word);
    if (p.id === 'freezh') return 'https://dict.youdao.com/jsonapi?q=' + w;
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
    if (p.id === 'uapis') return 'https://uapis.cn/api/v1/dictionary/lookup?word=' + w;
    return 'https://api.dictionaryapi.dev/api/v2/entries/en/' + w;
  }

  function headersFor(p, cfg) {
    const headers = {};
    if (p.custom && cfg.key) headers.Authorization = 'Bearer ' + cfg.key;
    // 有道只拒绝带 Origin 的浏览器请求；桌面 IPC / CapacitorHttp 本就不带 Origin。
    if (p.id === 'freezh') headers['User-Agent'] = 'Mozilla/5.0';
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
      return { error: friendly(res) };
    }
    let record;
    try {
      if (p.id === 'freezh') record = normalizeYoudao(res.data, word, url);
      else if (p.id === 'uapis') record = normalizeUapis(res.data, word, url);
      else if (p.custom) record = normalizeCustom(res.data, word, url);
      else if (p.id === 'mw') record = normalizeMw(res.data, word, url);
      else record = normalizeFree(res.data, word, url);
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
    if (p.needKey && !str(cfg.key)) return { ok: false, error: '请先在「我的 → 词典」填写 ' + p.name + ' 的 API Key' };
    if (p.custom && !str(cfg.base)) return { ok: false, error: '请填写自定义词典的 API 地址（含 {word}）' };

    let out = await attempt(p, word, cfg);
    // 多源回退：有道/UAPI 在纯浏览器里会被跨域拦截，最终落到带 CORS 的 dictionaryapi.dev。
    // 命中「未找到该词」即停止，避免对生僻/拼错的词浪费 UAPI 访客积分。
    const FALLBACK = { freezh: ['uapis', 'free'], uapis: ['freezh', 'free'], free: ['uapis', 'freezh'], mw: ['free'] };
    if (!out.record) {
      for (const fid of (FALLBACK[p.id] || [])) {
        const fb = await attempt(getProvider(fid), word, cfg);
        if (fb.record) { fb.record.fallbackFrom = p.id; out = fb; break; }
        if (fb.error === '词典中未找到该词') { out = fb; break; }
      }
    }
    if (!out.record) return { ok: false, error: out.error };
    Store.saveDictEntry(word, out.record);
    return { ok: true, record: out.record, cached: false };
  }

  window.Dictionary = { PROVIDERS, getProvider, lookup, normalizeYoudao, normalizeUapis, normalizeFree, normalizeMw, normalizeCustom, buildUrl };
})();
