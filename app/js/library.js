// Glance data model: indexed dataset (exams / roots / words / affixes) + legacy file import.
(function () {
  let DS = {};
  let affixMap = new Map();
  const books = {};

  // Curated common affixes for allomorph fallback (the raw affix index contains noisy fragments).
  const FB_PREFIX = ['counter', 'contra', 'circum', 'infra', 'inter', 'intra', 'intro', 'trans', 'super', 'under', 'over', 'semi', 'micro', 'macro', 'multi', 'mono', 'hyper', 'hypo', 'retro', 'extra', 'fore', 'anti', 'auto', 'peri', 'para', 'syn', 'sym', 'epi', 'dia', 'meta', 'neo', 'proto', 'pseudo', 'uni', 'sub', 'suc', 'suf', 'sug', 'sup', 'sur', 'sus', 'mis', 'out', 'un', 're', 'in', 'im', 'il', 'ir', 'dis', 'de', 'pre', 'pro', 'con', 'com', 'col', 'cor', 'co', 'ex', 'ef', 'en', 'em', 'e', 'ab', 'abs', 'ad', 'ac', 'af', 'ag', 'ap', 'ar', 'as', 'at', 'ob', 'oc', 'of', 'op', 'os', 'be', 'bene', 'mal', 'mid', 'mini', 'non', 'pan', 'poly', 'post', 'up', 'with', 'by', 'a', 'an', 'bi', 'tri'].sort((a, b) => b.length - a.length);
  const FB_SUFFIX = ['ation', 'ition', 'tion', 'sion', 'ion', 'ment', 'ness', 'able', 'ible', 'ical', 'ial', 'al', 'ive', 'ous', 'ious', 'eous', 'ful', 'less', 'ly', 'er', 'or', 'ist', 'ity', 'ty', 'ance', 'ence', 'ant', 'ent', 'ary', 'ory', 'ure', 'age', 'dom', 'hood', 'ship', 'en', 'ify', 'ise', 'ize', 'ate', 'ism', 'ics', 'ess', 'ette', 'let', 'ling'].sort((a, b) => b.length - a.length);

  // Quality filter: higher-level books drop elementary words everyone already knows.
  // CEFR rank; unknown (0) is always kept since difficulty can't be judged.
  const CEFR_RANK = { A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6 };
  const BOOK_MIN_RANK = { '中考': 0, '高考': 2, '四级': 3, '六级': 3, '考研': 3, '专四': 3, '专八': 3, '托福': 3, '雅思': 3, 'GRE': 3 };
  function passesQuality(cefr, tag) {
    const min = BOOK_MIN_RANK[tag] || 0;
    if (!min) return true;
    const r = CEFR_RANK[cefr] || 0;
    return r === 0 || r >= min;
  }

  function uniq(a) { return Array.from(new Set((a || []).filter(Boolean))); }
  function asList(v) {
    if (!v) return [];
    if (Array.isArray(v)) return v.filter(Boolean).map(String);
    return String(v).split(/[;；\n]/).map(s => s.trim()).filter(Boolean);
  }

  function affixGloss(raw, kind) {
    if (!raw) return '';
    const cands = kind === 'prefix' ? [raw + '-', raw] : ['-' + raw, raw];
    for (const c of cands) { const hit = affixMap.get(c); if (hit) return hit.zh || hit.en || ''; }
    return '';
  }

  function deriveMorphemes(entry) {
    const fam = entry.rootFamily;
    const word = entry.word || '';
    if (!fam || !fam.root) return [];
    const root = fam.root;
    const idx = word.toLowerCase().indexOf(root.toLowerCase());
    const chips = [];
    if (idx >= 0) {
      const pre = word.slice(0, idx), suf = word.slice(idx + root.length);
      if (pre) chips.push({ text: pre, type: 'prefix', gloss: affixGloss(pre, 'prefix') });
      chips.push({ text: root, type: 'root', gloss: fam.rootZh || fam.rootEn || '' });
      if (suf) chips.push({ text: suf, type: 'suffix', gloss: affixGloss(suf, 'suffix') });
    } else {
      // Root allomorph (e.g. introduce → duc vs duct): split off known affixes, keep canonical root.
      const lw = word.toLowerCase();
      let pre = '', suf = '';
      for (const p of FB_PREFIX) if (p.length >= 2 && lw.startsWith(p)) { pre = p; break; }
      for (const s of FB_SUFFIX) if (s.length >= 2 && lw.endsWith(s) && word.length - s.length > pre.length) { suf = s; break; }
      if (pre) chips.push({ text: pre, type: 'prefix', gloss: affixGloss(pre, 'prefix') });
      chips.push({ text: root, type: 'root', gloss: fam.rootZh || fam.rootEn || '' });
      if (suf) chips.push({ text: suf, type: 'suffix', gloss: affixGloss(suf, 'suffix') });
    }
    return chips;
  }

  function enrich(word, meaning, cefr, phonetic, rootId, rootZh, rootEn, familySize) {
    const d = (DS.words || {})[word] || {};
    const root = rootId || d.root || '';
    const e = {
      word,
      meaning: meaning || d.zh || '',
      zh: d.zh || meaning || '',
      cefr: cefr || d.cf || '',
      phonetic: String(phonetic || d.ipa || '').replace(/^\/+|\/+$/g, ''),
      fr: d.fr || 0,
      root,
      rootFamily: root ? { root, rootZh: rootZh || '', rootEn: rootEn || '', familySize: familySize || 0 } : null,
      synonyms: uniq((d.def || []).flatMap(x => x[2] || [])),
      derivatives: d.der || [],
      inflections: d.inf || [],
      etymology: d.ety || '',
      audio: d.au || [],
      tags: d.tag || [],
      definitions: d.def || [],
      examples: asList(d.examples),
      collocations: asList(d.collocations)
    };
    e.morphemes = deriveMorphemes(e);
    return e;
  }

  function init(dataset) {
    DS = dataset || {};
    affixMap = new Map((DS.affixes || []).map(a => [a.id, a]));
    for (const k of Object.keys(books)) delete books[k];
  }

  function getBook(tag) {
    if (books[tag]) return books[tag];
    const ex = (DS.exams || {})[tag];
    if (!ex) return null;
    const entries = [], groups = [];
    for (const g of ex.groups || []) {
      const ge = { root: g.root, rootZh: g.rootZh, rootEn: g.rootEn, familySize: g.familySize, words: [] };
      for (const w of g.words || []) {
        if (!passesQuality(w[2], tag)) continue;
        const e = enrich(w[0], w[1], w[2], w[3], g.root, g.rootZh, g.rootEn, g.familySize);
        entries.push(e); ge.words.push(e);
      }
      if (ge.words.length) groups.push(ge);
    }
    for (const w of ex.loose || []) {
      if (!passesQuality(w[2], tag)) continue;
      entries.push(enrich(w[0], w[1], w[2], w[3], '', '', '', 0));
    }
    const book = { tag, name: tag + '词库', n: entries.length, entries, groups };
    books[tag] = book;
    return book;
  }

  function listBooks() {
    const tags = (DS.meta && DS.meta.exams) || Object.keys(DS.exams || {});
    return tags.map(t => {
      const ex = (DS.exams || {})[t] || {};
      let n = 0;
      for (const g of ex.groups || []) for (const w of g.words || []) if (passesQuality(w[2], t)) n++;
      for (const w of ex.loose || []) if (passesQuality(w[2], t)) n++;
      return { tag: t, name: t + '词库', n };
    });
  }

  function getFamily(root) {
    const r = (DS.roots || {})[root];
    if (!r) return null;
    return {
      root, g: r.g || '', zh: r.zh || '', tier: r.tier || '', size: r.size || (r.family || []).length,
      family: (r.family || []).map(w => ({ word: w[0], meaning: w[1] || '' })),
      tree: (DS.roottrees || {})[root] || null
    };
  }

  function listRoots(limit) {
    const roots = DS.roots || {};
    const arr = Object.keys(roots).map(k => ({ root: k, zh: roots[k].zh || '', g: roots[k].g || '', size: roots[k].size || 0 }));
    arr.sort((a, b) => b.size - a.size);
    return limit ? arr.slice(0, limit) : arr;
  }

  function getAffixes() { return DS.affixes || []; }
  function getMeta() { return DS.meta || {}; }
  function hasData() { return !!(DS.exams && Object.keys(DS.exams).length); }

  function search(query, limit = 40) {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return { words: [], roots: [], affixes: [] };
    const words = [], roots = [], affixes = [];
    const wd = DS.words || {};
    for (const w of Object.keys(wd)) {
      if (w.toLowerCase().includes(q) || (wd[w].zh || '').includes(query.trim())) {
        words.push({ word: w, zh: wd[w].zh || '', root: wd[w].root || '', cf: wd[w].cf || '' });
        if (words.length >= limit) break;
      }
    }
    const rd = DS.roots || {};
    for (const r of Object.keys(rd)) {
      if (r.toLowerCase().includes(q) || (rd[r].zh || '').includes(query.trim())) {
        roots.push({ root: r, zh: rd[r].zh || '', size: rd[r].size || 0 });
        if (roots.length >= 15) break;
      }
    }
    for (const a of DS.affixes || []) {
      if (a.id.toLowerCase().includes(q) || (a.zh || '').includes(query.trim())) {
        affixes.push(a);
        if (affixes.length >= 15) break;
      }
    }
    return { words, roots, affixes };
  }

  function lookup(word) {
    const d = (DS.words || {})[word];
    if (!d) return null;
    let rootId = d.root || '', rootZh = '', rootEn = '', famSize = 0;
    const r = (DS.roots || {})[rootId];
    if (r) { rootZh = r.zh || ''; rootEn = r.g || ''; famSize = r.size || 0; }
    return enrich(word, d.zh, d.cf, d.ipa, rootId, rootZh, rootEn, famSize);
  }

  function buildCards(entry) {
    const cards = [];
    if (entry.meaning) cards.push({ id: 'meaning', title: '释义', kind: 'text', text: entry.meaning });
    if (entry.morphemes && entry.morphemes.length) {
      const label = { prefix: '前缀', root: '词根', suffix: '后缀' };
      cards.push({ id: 'morphemes', title: '构词解析', kind: 'list', items: entry.morphemes.map(m => m.text + '（' + (label[m.type] || '词素') + '）' + (m.gloss ? '：' + m.gloss : '')) });
    }
    if (entry.definitions && entry.definitions.length) cards.push({ id: 'definitions', title: '英文释义', kind: 'list', items: entry.definitions.map(d => (d[0] ? d[0] + '. ' : '') + d[1]) });
    if (entry.rootFamily && entry.rootFamily.root) {
      const f = entry.rootFamily;
      cards.push({ id: 'family', title: '词根家族', kind: 'text', text: `${f.root} · ${f.rootZh || ''}${f.rootEn ? ' (' + f.rootEn + ')' : ''}`, root: f.root });
    }
    if (entry.synonyms && entry.synonyms.length) cards.push({ id: 'synonyms', title: '近义词', kind: 'list', items: entry.synonyms });
    if (entry.derivatives && entry.derivatives.length) cards.push({ id: 'derivatives', title: '派生词', kind: 'list', items: entry.derivatives.map(d => `${d[0]}${d[1] ? ' (' + d[1] + ')' : ''}`) });
    if (entry.etymology) cards.push({ id: 'etymology', title: '词源', kind: 'text', text: entry.etymology });
    if (entry.examples && entry.examples.length) cards.push({ id: 'examples', title: '例句', kind: 'list', items: entry.examples });
    if (entry.collocations && entry.collocations.length) cards.push({ id: 'collocations', title: '搭配', kind: 'list', items: entry.collocations });
    if (entry.inflections && entry.inflections.length) cards.push({ id: 'inflections', title: '词形变化', kind: 'list', items: entry.inflections });
    return cards;
  }

  // ---- legacy file import (JSON / TSV) ----
  function fromCet6(json) {
    const am = new Map((json.affixes || []).map(a => [a.affix, a]));
    const entries = [];
    for (const g of json.groups || []) {
      const fam = { root: g.root, rootZh: g.rootZh, rootEn: g.rootEn, origin: g.origin, familySize: g.familySize };
      for (const w of g.words || []) entries.push({ word: w.word, meaning: w.meaning, cefr: w.cefr || '', phonetic: w.phonetic || '', example: w.example || '', rootFamily: fam });
    }
    return { entries, affixes: am };
  }
  function fromFlat(arr) {
    const entries = arr.filter(w => w && w.word).map(w => ({
      word: w.word, meaning: w.meaning || w.zh || '', cefr: w.cefr || '', phonetic: w.phonetic || '',
      example: w.example || '', examples: w.examples, synonyms: w.synonyms, antonyms: w.antonyms, collocations: w.collocations,
      rootFamily: w.rootFamily || (w.root ? { root: w.root, rootZh: w.rootZh || '', rootEn: w.rootEn || '' } : null)
    }));
    return { entries, affixes: new Map() };
  }
  function fromTsv(text) {
    const entries = text.replace(/\r\n/g, '\n').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
      .map(line => { const p = line.split('\t'); return { word: (p[0] || '').trim(), meaning: (p[1] || '').trim(), example: (p[2] || '').trim(), phonetic: '', cefr: '', rootFamily: null }; })
      .filter(w => w.word);
    return { entries, affixes: new Map() };
  }
  function parse(text, name) {
    const t = (text || '').trim();
    let base;
    if (t.startsWith('{') || t.startsWith('[')) {
      const json = JSON.parse(t);
      base = Array.isArray(json) ? fromFlat(json) : (json.groups ? fromCet6(json) : fromFlat(json.words || []));
    } else base = fromTsv(t);
    const savedAffix = affixMap;
    affixMap = base.affixes;
    for (const e of base.entries) {
      e.morphemes = deriveMorphemes(e);
      e.synonyms = asList(e.synonyms); e.examples = asList(e.examples || e.example); e.collocations = asList(e.collocations);
    }
    affixMap = savedAffix;
    return { name: name || 'library', entries: base.entries, custom: true };
  }

  window.Library = { init, getBook, listBooks, getFamily, listRoots, getAffixes, getMeta, hasData, search, lookup, buildCards, deriveMorphemes, parse };
})();