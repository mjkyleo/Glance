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

  // The raw affix index has a few wrong glosses (e.g. con- "cone"); override the common
  // assimilated com- prefixes so decomposition and mnemonic stay correct.
  const AFFIX_GLOSS_FIX = { con: '共同、一起', com: '共同、一起', col: '共同、一起', cor: '共同、一起', co: '共同、一起' };
  function affixGloss(raw, kind) {
    if (!raw) return '';
    if (kind === 'prefix' && AFFIX_GLOSS_FIX[raw.toLowerCase()]) return AFFIX_GLOSS_FIX[raw.toLowerCase()];
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

  // Part-of-speech labels: the dataset stores POS as abbreviations inside the zh string
  // (e.g. "n. 行为 / vt. 指挥 / vi. 领导"). Surface them as explained, grouped senses.
  const POS_LABEL = {
    n: { zh: '名词', en: 'noun', note: '' },
    v: { zh: '动词', en: 'verb', note: '' },
    vt: { zh: '及物动词', en: 'transitive verb', note: '后接宾语' },
    vi: { zh: '不及物动词', en: 'intransitive verb', note: '不直接接宾语' },
    a: { zh: '形容词', en: 'adjective', note: '修饰名词' },
    adj: { zh: '形容词', en: 'adjective', note: '修饰名词' },
    ad: { zh: '副词', en: 'adverb', note: '修饰动词 / 形容词' },
    adv: { zh: '副词', en: 'adverb', note: '修饰动词 / 形容词' },
    prep: { zh: '介词', en: 'preposition', note: '' },
    conj: { zh: '连词', en: 'conjunction', note: '' },
    pron: { zh: '代词', en: 'pronoun', note: '' },
    num: { zh: '数词', en: 'numeral', note: '' },
    art: { zh: '冠词', en: 'article', note: '' },
    int: { zh: '感叹词', en: 'interjection', note: '' },
    interj: { zh: '感叹词', en: 'interjection', note: '' },
    aux: { zh: '助动词', en: 'auxiliary verb', note: '' },
    abbr: { zh: '缩写', en: 'abbreviation', note: '' }
  };
  function posInfo(abbr) {
    const k = String(abbr || '').toLowerCase().replace(/\.$/, '');
    return POS_LABEL[k] || null;
  }
  function parseSenses(zh) {
    if (!zh) return [];
    const out = [];
    String(zh).split(/\s*\/\s*/).forEach(seg => {
      seg = seg.trim();
      if (!seg) return;
      let pos = '', domain = '';
      const pm = seg.match(/^([a-z]+)\.\s*/i);
      if (pm && posInfo(pm[1])) { pos = pm[1].toLowerCase(); seg = seg.slice(pm[0].length).trim(); }
      const dm = seg.match(/^\[([^\]]+)\]\s*/);
      if (dm) { domain = dm[1]; seg = seg.slice(dm[0].length).trim(); }
      if (!seg) return;
      out.push({ pos, domain, gloss: seg });
    });
    return out;
  }
  function primaryGloss(e) {
    const s = (e.senses && e.senses[0]) || null;
    const raw = s ? s.gloss : (e.meaning || e.zh || '');
    return raw.split(/[,，;；]/).slice(0, 2).map(x => x.trim()).filter(Boolean).join('、');
  }
  // Offline mnemonic hook: chain the morpheme glosses into the core meaning so the
  // root story is visible without tapping. Only synthesize when at least two segment
  // glosses support it — a single noisy root gloss can mislead (e.g. in- "not" vs "into").
  // AI memoryTip (when cached) overrides this.
  function cleanGloss(g) { return String(g || '').replace(/^[….\s]+/, '').split(/[；;]/)[0].replace(/[（）()]/g, '').trim(); }
  function buildMnemonic(e) {
    const core = primaryGloss(e);
    if (!core) return '';
    const parts = (e.morphemes || []).map(m => ({ g: cleanGloss(m.gloss), t: m.text })).filter(x => x.g).map(x => x.g + '（' + x.t + '）');
    if (parts.length >= 2) return parts.join(' + ') + ' → ' + core;
    return '';
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
    e.senses = parseSenses(e.zh);
    e.mnemonic = buildMnemonic(e);
    return e;
  }

  function init(dataset) {
    DS = dataset || {};
    affixMap = new Map((DS.affixes || []).map(a => [a.id, a]));
    for (const k of Object.keys(books)) delete books[k];
    for (const k of Object.keys(lowerCache)) delete lowerCache[k];
    for (const k of Object.keys(officialSetCache)) delete officialSetCache[k];
    for (const k of Object.keys(officialBookCache)) delete officialBookCache[k];
  }

  function getBook(tag) {
    if (books[tag]) return books[tag];
    const offLevel = OFFICIAL_BY_TAG[tag];
    if (offLevel) { const b = officialBook(offLevel); books[tag] = b; return b; }
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
    const examBooks = tags.map(t => {
      const ex = (DS.exams || {})[t] || {};
      let n = 0;
      for (const g of ex.groups || []) for (const w of g.words || []) if (passesQuality(w[2], t)) n++;
      for (const w of ex.loose || []) if (passesQuality(w[2], t)) n++;
      return { tag: t, name: t + '词库', n };
    });
    const offBooks = officialLevels().map(o => ({ tag: o.tag, name: o.name, n: officialCount(o.level), official: true }));
    return offBooks.concat(examBooks);
  }

  // Exam ladder for the optional "skip lower-book duplicates" filter: a book's
  // lower set is every exam strictly below it (六级 → 中考/高考/四级).
  const BOOK_RANK = { '中考': 0, '高考': 1, '四级': 2, '六级': 3, '专四': 4, '考研': 5, '专八': 6, '雅思': 7, '托福': 8, 'GRE': 9 };
  const lowerCache = {};
  function lowerTags(tag) {
    const r = BOOK_RANK[tag];
    if (r === undefined) return [];
    return Object.keys(BOOK_RANK).filter(t => BOOK_RANK[t] < r);
  }
  function lowerWordSet(tag) {
    if (lowerCache[tag]) return lowerCache[tag];
    const set = new Set();
    for (const t of lowerTags(tag)) {
      const b = getBook(t);
      if (b) for (const e of b.entries) set.add(e.word);
    }
    lowerCache[tag] = set;
    return set;
  }

  // ---- official syllabus (考纲) root reference ----
  // The 2016 CET syllabus word list is the authoritative foundation: A group (no ★,
  // CET-4) and B group (★, CET-6). Entries keep the printed form (variants a/b,
  // homographs word¹, optional letters mo(u)ld, phrases according to); matching
  // normalises them to comparable lowercase forms.
  const OFFICIAL = {
    cet4: { tag: '考纲四级', name: '考纲四级（官方）' },
    cet6: { tag: '考纲六级', name: '考纲六级（官方）' }
  };
  const OFFICIAL_BY_TAG = { '考纲四级': 'cet4', '考纲六级': 'cet6' };
  const SUP_RE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]/g;
  function officialForms(text) {
    const t = String(text || '').replace(SUP_RE, '').trim();
    if (!t) return [];
    const out = new Set();
    for (const part of t.split('/')) {
      const p = part.trim().toLowerCase();
      if (!p) continue;
      if (p.indexOf('(') >= 0) {
        out.add(p.replace(/\(([^)]*)\)/g, '$1'));   // with optional letter: mould
        out.add(p.replace(/\([^)]*\)/g, ''));       // without: mold
      } else out.add(p);
    }
    return Array.from(out).filter(Boolean);
  }
  function officialRaw(level) { return (DS.official || {})[level] || []; }
  function officialLevels() {
    return Object.keys(OFFICIAL).filter(l => Array.isArray((DS.official || {})[l]))
      .map(l => ({ level: l, tag: OFFICIAL[l].tag, name: OFFICIAL[l].name, n: officialRaw(l).length }));
  }
  const officialSetCache = {};
  function officialWordSet(level) {
    if (officialSetCache[level]) return officialSetCache[level];
    const set = new Set();
    for (const text of officialRaw(level)) for (const f of officialForms(text)) set.add(f);
    officialSetCache[level] = set;
    return set;
  }
  function officialCount(level) {
    const seen = new Set();
    for (const text of officialRaw(level)) { const f = officialForms(text)[0]; if (f) seen.add(f); }
    return seen.size;
  }
  const officialBookCache = {};
  function officialBook(level) {
    if (officialBookCache[level]) return officialBookCache[level];
    const meta = OFFICIAL[level];
    const entries = [], seen = new Set();
    for (const text of officialRaw(level)) {
      const word = officialForms(text)[0];
      if (!word || seen.has(word)) continue;
      seen.add(word);
      const e = enrich(word, '', '', '', '', '', '', 0);
      e.official = true;
      e.officialText = text;
      entries.push(e);
    }
    const book = { tag: meta.tag, name: meta.name, n: entries.length, entries, groups: [], official: true };
    officialBookCache[level] = book;
    return book;
  }
  // Compare any book's entries against an official level: covered (in syllabus),
  // beyond (超纲), missing (syllabus words the book lacks) + coverage ratios.
  function compareToOfficial(entries, level) {
    const offSet = officialWordSet(level);
    const coveredWords = [], beyondWords = [], seen = new Set();
    const srcFormSet = new Set();
    let covered = 0;
    for (const e of entries || []) {
      const w = e.word;
      const forms = officialForms(w);
      for (const f of forms) srcFormSet.add(f);
      const key = String(w).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      if (forms.some(f => offSet.has(f))) { covered++; coveredWords.push(w); }
      else beyondWords.push(w);
    }
    const missingWords = [], offSeen = new Set();
    for (const text of officialRaw(level)) {
      const forms = officialForms(text);
      const primary = forms[0];
      if (!primary || offSeen.has(primary)) continue;
      offSeen.add(primary);
      if (!forms.some(f => srcFormSet.has(f))) missingWords.push(primary);
    }
    const total = seen.size, offTotal = offSeen.size;
    return {
      total, covered, beyond: beyondWords.length, missing: missingWords.length, offTotal,
      coverageBook: total ? covered / total : 0,
      coverageOfficial: offTotal ? (offTotal - missingWords.length) / offTotal : 0,
      coveredWords, beyondWords, missingWords
    };
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
    if (entry.mnemonic) cards.push({ id: 'mnemonic', title: '助记', kind: 'mnemonic', text: entry.mnemonic });
    if (entry.morphemes && entry.morphemes.length) {
      const label = { prefix: '前缀', root: '词根', suffix: '后缀' };
      cards.push({ id: 'morphemes', title: '构词解析', kind: 'list', items: entry.morphemes.map(m => m.text + '（' + (label[m.type] || '词素') + '）' + (m.gloss ? '：' + m.gloss : '')) });
    }
    if (entry.rootFamily && entry.rootFamily.root) {
      const f = entry.rootFamily;
      cards.push({
        id: 'family', title: '词根与词源', kind: 'family', root: f.root,
        text: `${f.root} · ${f.rootZh || ''}`,
        etymology: entry.etymology || ''
      });
    } else if (entry.etymology) {
      cards.push({ id: 'etymology', title: '词源', kind: 'text', text: entry.etymology });
    }
    if (entry.synonyms && entry.synonyms.length) cards.push({ id: 'synonyms', title: '近义词', kind: 'list', items: entry.synonyms });
    if (entry.derivatives && entry.derivatives.length) cards.push({ id: 'derivatives', title: '派生词', kind: 'list', items: entry.derivatives.map(d => `${d[0]}${d[1] ? ' (' + d[1] + ')' : ''}`) });
    if (entry.inflections && entry.inflections.length) cards.push({ id: 'inflections', title: '词形变化', kind: 'list', items: entry.inflections });
    if (entry.examples && entry.examples.length) cards.push({ id: 'examples', title: '例句', kind: 'list', items: entry.examples });
    if (entry.collocations && entry.collocations.length) cards.push({ id: 'collocations', title: '搭配', kind: 'list', items: entry.collocations });
    if (entry.definitions && entry.definitions.length) cards.push({ id: 'definitions', title: '英文释义', kind: 'list', items: entry.definitions.map(d => { const p = posInfo(d[0]); return (p ? p.zh + ' ' + d[0] + ' ' : (d[0] ? d[0] + '. ' : '')) + d[1]; }) });
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
  const HEADER_WORDS = new Set(['word', 'words', 'term', 'terms', 'vocab', 'vocabulary', '单词', '词汇', '英文', '英语']);
  const HEADER_MEANINGS = new Set(['meaning', 'meanings', 'definition', 'translation', 'zh', 'cn', 'chinese', '释义', '中文', '解释', '意思']);
  function splitRow(line, delim) {
    if (delim === '\t') return line.split('\t');
    const cells = [];
    let cur = '', quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"' && !cur) quoted = true;
      else if (ch === delim) { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  }
  function fromDelimited(text) {
    const lines = String(text).replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const delim = lines[0] && lines[0].includes('\t') ? '\t' : ',';
    const seen = new Set(), entries = [];
    lines.forEach((line, i) => {
      const cells = splitRow(line, delim).map(s => s.trim());
      const word = cells[0] || '', meaning = cells[1] || '';
      if (!word) return;
      const wordHeader = HEADER_WORDS.has(word.toLowerCase());
      const meaningHeader = HEADER_MEANINGS.has(meaning.toLowerCase());
      if (i === 0 && wordHeader && (!meaning || meaningHeader)) return;
      const key = word.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ word, meaning, example: cells[2] || '', phonetic: '', cefr: '', rootFamily: null });
    });
    return { entries, affixes: new Map() };
  }
  function parse(text, name) {
    const t = String(text || '').replace(/^\uFEFF/, '').trim();
    let base;
    if (t.startsWith('{') || t.startsWith('[')) {
      const json = JSON.parse(t);
      base = Array.isArray(json) ? fromFlat(json) : (json.groups ? fromCet6(json) : fromFlat(json.words || []));
    } else base = fromDelimited(t);
    const savedAffix = affixMap;
    affixMap = base.affixes;
    for (const e of base.entries) {
      e.morphemes = deriveMorphemes(e);
      e.synonyms = asList(e.synonyms); e.examples = asList(e.examples || e.example); e.collocations = asList(e.collocations);
    }
    affixMap = savedAffix;
    return { name: name || 'library', entries: base.entries, custom: true };
  }

  window.Library = { init, getBook, listBooks, lowerTags, lowerWordSet, getFamily, listRoots, getAffixes, getMeta, hasData, search, lookup, buildCards, deriveMorphemes, posInfo, parse, officialLevels, officialForms, officialWordSet, officialCount, officialBook, compareToOfficial };
})();