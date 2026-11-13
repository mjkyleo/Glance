// Glance quiz engine: candidate pool, difficulty model, weighted sampling,
// distractor generation and session rules for 英选中 / 中选英 / 例句填空.
// All randomness lives here; the UI only renders what this module returns.
(function () {
  const DAY = 86400000;
  const TYPE_LABEL = { en2zh: '英选中', zh2en: '中选英', cloze: '例句填空', audio2word: '听音选词' };
  const TYPES = ['en2zh', 'zh2en', 'cloze', 'audio2word'];
  const SCOPES = [
    { id: 'book', name: '当前词书' },
    { id: 'theme', name: '当前专项' },
    { id: 'favorites', name: '生词本' },
    { id: 'errors', name: '错题本' },
    { id: 'due', name: '到期复习' },
    { id: 'mixed', name: '全部混合' }
  ];
  const DIFFICULTY_TARGET = { easy: 0.3, normal: 0.55, hard: 0.78 };
  const RECENT_WINDOW = 7 * DAY;

  function clamp(x, lo, hi) { return Math.min(hi, Math.max(lo, x)); }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function shuffle(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [r[i], r[j]] = [r[j], r[i]];
    }
    return r;
  }
  function pickWeighted(weights) {
    let total = 0;
    for (const w of weights) total += Math.max(0, w);
    if (total <= 0) return Math.floor(Math.random() * weights.length);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]);
      if (r <= 0) return i;
    }
    return weights.length - 1;
  }
  function pickNWeighted(items, weights, n) {
    const idx = items.map((_, i) => i);
    const w = weights.slice();
    const out = [];
    while (out.length < n && idx.length) {
      const k = pickWeighted(w);
      out.push(items[idx[k]]);
      idx.splice(k, 1); w.splice(k, 1);
    }
    return out;
  }

  function currentBook() {
    const tag = Store.data.activeBook;
    const custom = Store.data.customBooks[tag];
    if (custom) return { entries: custom.entries || [] };
    return Library.getBook(tag) || Library.getBook('六级') || { entries: [] };
  }
  function activeWord() {
    const book = currentBook();
    return { book, map: new Map((book.entries || []).map(e => [e.word, e])) };
  }

  // ---------- entry helpers ----------
  function primaryGloss(e) {
    const s = (e.senses && e.senses[0]) || null;
    const raw = s ? s.gloss : (e.meaning || e.zh || '');
    return String(raw).split(/[,，;；]/).slice(0, 2).map(x => x.trim()).filter(Boolean).join('、');
  }
  function posGroup(e) {
    let p = '';
    if (e.senses && e.senses[0] && e.senses[0].pos) p = e.senses[0].pos;
    else if (e.definitions && e.definitions[0] && e.definitions[0][0]) p = e.definitions[0][0];
    p = String(p || '').toLowerCase().replace(/\.$/, '');
    if (p === 'a') return 'adj';
    if (p === 'ad') return 'adv';
    if (p === 'vt' || p === 'vi') return 'v';
    if (['n', 'v', 'adj', 'adv', 'prep', 'conj', 'pron', 'num', 'art', 'int', 'aux', 'abbr'].includes(p)) return p;
    return '';
  }
  function rootOf(e) { return e.root || (e.rootFamily && e.rootFamily.root) || ''; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s"'“”‘’.,，。;；:：!?！？()（）\[\]【】\-—–]/g, ''); }
  function glossKey(e) { return norm(primaryGloss(e)); }
  function escapeRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  // ---------- distractor universe ----------
  let poolCache = null, poolKey = '';
  function pool() {
    const tag = Store.data.activeBook;
    if (poolCache && poolKey === tag) return poolCache;
    const map = new Map();
    (currentBook().entries || []).forEach(e => { if (e && e.word) map.set(e.word, e); });
    // Custom books can be tiny; borrow a standard book so same-POS distractors exist.
    if (map.size < 240) {
      ['六级', '考研', '雅思', '托福'].forEach(t => {
        if (map.size >= 240) return;
        const b = Library.getBook(t);
        if (b) (b.entries || []).forEach(e => { if (e.word && !map.has(e.word)) map.set(e.word, e); });
      });
    }
    const entries = Array.from(map.values());
    const byPos = new Map();
    entries.forEach(e => {
      const g = posGroup(e) || 'other';
      let arr = byPos.get(g);
      if (!arr) { arr = []; byPos.set(g, arr); }
      arr.push(e);
    });
    poolCache = { entries, byPos, index: map };
    poolKey = tag;
    return poolCache;
  }

  function listEntries(words) {
    const p = pool();
    const out = [], seen = new Set();
    for (const w of words || []) {
      if (!w || seen.has(w)) continue;
      seen.add(w);
      const e = p.index.get(w) || Library.lookup(w);
      if (e && e.word && primaryGloss(e)) out.push(e);
    }
    return out;
  }

  function scopeWords(cfg) {
    const set = new Set();
    const add = w => { if (w) set.add(w); };
    const book = currentBook();
    const scope = cfg.scope || 'mixed';
    if (scope === 'book' || scope === 'mixed') (book.entries || []).forEach(e => add(e.word));
    if (scope === 'theme') Themes.wordsOf(cfg.theme).forEach(add);
    if (scope === 'favorites' || scope === 'mixed') Store.favoriteWords('').forEach(add);
    if (scope === 'errors' || scope === 'mixed') Store.errorWords().forEach(add);
    if (scope === 'due') {
      const now = Date.now();
      (book.entries || []).forEach(e => { if (SRS.isDue(Store.data.srs[e.word], now)) add(e.word); });
    }
    if (scope === 'mixed') {
      const views = Store.data.views || {};
      Object.keys(views)
        .sort((a, b) => (views[b].n || 0) - (views[a].n || 0))
        .slice(0, 300)
        .forEach(add);
    }
    return Array.from(set);
  }

  // ---------- difficulty ----------
  const intrinsicCache = new Map();
  function intrinsic(e) {
    if (intrinsicCache.has(e.word)) return intrinsicCache.get(e.word);
    const len = clamp((String(e.word).length - 4) / 10, 0, 1);
    const cefr = { A1: 0.05, A2: 0.16, B1: 0.32, B2: 0.5, C1: 0.72, C2: 0.9 }[e.cefr] ?? 0.42;
    const fr = Number(e.fr) || 0;
    const rarity = fr > 0 ? clamp(Math.log10(fr) / 4.8, 0, 1) : 0.55;
    const morph = e.morphemes && e.morphemes.length ? clamp((e.morphemes.length - 2) * 0.08, 0, 0.16) : 0.12;
    const common = clamp(((e.tags || []).length) / 4, 0, 1);
    const d = clamp(0.28 * len + 0.34 * cefr + 0.22 * rarity + 0.08 * morph + 0.08 * (1 - common), 0, 1);
    intrinsicCache.set(e.word, d);
    return d;
  }
  function stateDifficulty(e) {
    const s = Store.data.srs[e.word];
    let d;
    if (!s || SRS.isNew(s)) d = 0.55;
    else if (SRS.isKnown(s)) d = 0.2;
    else if (s.state === 'relearn') d = 0.8;
    else d = 0.52;
    if (s && !SRS.isNew(s)) {
      d -= Math.min(0.18, (s.reps || 0) * 0.025);
      d += Math.min(0.24, (s.lapses || 0) * 0.07);
    }
    const h = Store.data.quiz.history[e.word];
    if (h && h.n) d += (0.72 - (h.correct || 0) / h.n) * 0.32;
    return clamp(d, 0, 1);
  }
  function questionDifficulty(e, type) {
    const typeAdj = type === 'cloze' ? 0.09 : type === 'zh2en' ? 0.035 : type === 'audio2word' ? 0.07 : 0;
    return clamp(0.48 * intrinsic(e) + 0.4 * stateDifficulty(e) + typeAdj, 0, 1);
  }
  function ability() { return clamp(Store.data.quiz.ability ?? 0.5, 0.05, 0.95); }
  function targetDifficulty(cfg) {
    if (cfg.difficulty !== 'auto') return DIFFICULTY_TARGET[cfg.difficulty] || 0.55;
    // Auto keeps the hit rate in the 70–85% band: stronger learners see harder items.
    return clamp(0.25 + ability() * 0.62, 0.28, 0.8);
  }
  function fitScore(d, target) {
    return clamp(Math.exp(-Math.pow(d - target, 2) / (2 * 0.18 * 0.18)), 0.08, 1);
  }

  // ---------- candidate weights ----------
  function baseWeight(e, scope, now) {
    const s = Store.data.srs[e.word];
    let w;
    if (!s || SRS.isNew(s)) w = 1.1;
    else if (SRS.isKnown(s)) w = 0.3;
    else if (s.state === 'relearn') w = 2.4;
    else w = 1.15;
    if (SRS.isDue(s, now)) {
      const overdue = clamp((now - s.due) / DAY, 0, 14);
      w += 2.2 + Math.min(1.8, overdue * 0.22);
    }
    const err = Store.data.errors[e.word];
    if (err) w += Math.min(2.4, 0.6 + (err.count || 1) * 0.45);
    if (Store.isFavorite(e.word)) w += 0.8;
    if (s && !SRS.isNew(s) && !SRS.isKnown(s) && (s.box || 0) <= 1) w += 0.5;
    if (scope === 'book' || scope === 'theme') w += 0.1;
    const v = Store.viewInfo(e.word);
    if (!v || !v.n) w += 0.25;
    return clamp(w, 0.08, 8);
  }
  function noveltyBonus(e) {
    const v = Store.viewInfo(e.word);
    const h = Store.data.quiz.history[e.word];
    return 1 + (v && v.n ? 0 : 0.12) + (h && h.n ? 0 : 0.06);
  }
  function recentPenalty(word, now) {
    const h = Store.data.quiz.history[word];
    if (!h || !h.last) return 0;
    const age = now - h.last;
    if (age > RECENT_WINDOW) return 0;
    return (1 - age / RECENT_WINDOW) * 2.4 + Math.min(0.8, (h.n || 0) * 0.05);
  }

  // ---------- examples + cloze ----------
  function parseExample(raw) {
    let s = String(raw || '').replace(/^\s*[-•·]\s*/, '').trim();
    if (!s) return null;
    let en = s, zh = '';
    const m = s.match(/^(.+?)\s+[—–]\s+(.+)$/);
    if (m) { en = m[1].trim(); zh = m[2].trim(); }
    else {
      const m2 = s.match(/^(.+?)\s+-\s+(.+)$/);
      if (m2 && /[\u4e00-\u9fff]/.test(m2[2])) { en = m2[1].trim(); zh = m2[2].trim(); }
    }
    if (en.length < 12 || en.length > 240) return null;
    if (/_{2,}/.test(en)) return null;
    return { en, zh };
  }
  function localExamples(e) {
    const out = [];
    (e.examples || []).forEach(x => {
      const p = typeof x === 'string' ? parseExample(x) : (x && x.en ? { en: String(x.en), zh: String(x.zh || '') } : null);
      if (p) out.push(p);
    });
    return out;
  }
  function cachedExamples(e) { return Store.quizExamples(e.word) || []; }
  function allExamples(e) {
    const cached = cachedExamples(e);
    return cached.length ? cached : localExamples(e);
  }
  function hasCloze(e) {
    if (!allExamples(e).length) return false;
    return !!buildCloze(e, allExamples(e));
  }
  function examplesFromRecord(rec) {
    const list = [];
    const push = raw => { const p = parseExample(raw); if (p) list.push(p); };
    (rec.examples || []).forEach(push);
    (rec.meanings || []).forEach(m => (m.defs || []).forEach(d => { if (d.example) push(d.example); }));
    const seen = new Set();
    return list.filter(x => { const k = x.en.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
  }
  async function ensureExamples(e, cfg) {
    if (cachedExamples(e).length) return cachedExamples(e);
    if (!cfg.online || !window.Dictionary) return localExamples(e);
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return [];
    try {
      const res = await Dictionary.lookup(e.word, Store.data.dict);
      if (!res.ok) return [];
      const list = examplesFromRecord(res.record);
      if (list.length) Store.saveQuizExamples(e.word, list, res.record.provider || '');
      return list;
    } catch (err) { return []; }
  }
  async function prefetchExamples(entries, cfg, limit, onProgress) {
    if (!cfg.types.includes('cloze') || !cfg.online) return;
    const need = entries.filter(e => !hasCloze(e)).slice(0, limit);
    const total = need.length;
    if (!total) return;
    let done = 0;
    const queue = need.slice();
    const worker = async () => {
      while (queue.length) {
        const e = queue.shift();
        await ensureExamples(e, cfg);
        done++;
        if (onProgress) onProgress(done, total);
      }
    };
    await Promise.all(Array.from({ length: Math.min(5, total) }, worker));
  }

  // Mirror the matched inflection onto distractors so cloze options read naturally.
  function inflectLike(word, form) {
    const w = String(word || '');
    const f = String(form || '').toLowerCase();
    if (!w || !f || f === w.toLowerCase()) return w;
    if (f.endsWith('ing')) {
      if (w.endsWith('ie')) return w.slice(0, -2) + 'ying';
      if (w.endsWith('e')) return w.slice(0, -1) + 'ing';
      if (/[^aeiou][aeiou][bdgklmnprt]$/.test(w)) return w + w.slice(-1) + 'ing';
      return w + 'ing';
    }
    if (f.endsWith('ied')) return w.endsWith('y') ? w.slice(0, -1) + 'ied' : w + 'ed';
    if (f.endsWith('ed')) return w.endsWith('e') ? w + 'd' : w + 'ed';
    if (f.endsWith('ies')) return w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's';
    if (f.endsWith('es')) return /(s|x|z|ch|sh)$/.test(w) ? w + 'es' : w + 's';
    if (f.endsWith('s')) return w + 's';
    return w;
  }
  function buildCloze(e, list) {
    const forms = [e.word].concat((e.inflections || []).filter(Boolean));
    for (const ex of list || []) {
      const en = String(ex.en || '');
      if (en.length < 20) continue;
      for (const form of forms) {
        const re = new RegExp('\\b' + escapeRe(form) + '\\b', 'i');
        const m = en.match(re);
        if (!m) continue;
        const before = en.slice(0, m.index).replace(/\s+$/, '');
        const after = en.slice(m.index + m[0].length).replace(/^\s+/, '');
        if ((before + ' ' + after).trim().length < 16) continue;
        return { before, after, form: m[0], zh: ex.zh || '' };
      }
    }
    return null;
  }

  // ---------- distractors ----------
  function editDistance(a, b) {
    a = String(a).slice(0, 24); b = String(b).slice(0, 24);
    const n = a.length, m = b.length;
    if (!n) return m;
    if (!m) return n;
    let prev = new Array(m + 1);
    for (let j = 0; j <= m; j++) prev[j] = j;
    for (let i = 1; i <= n; i++) {
      const cur = [i];
      for (let j = 1; j <= m; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur;
    }
    return prev[m];
  }
  function semanticNeighbor(a, b) {
    const ga = glossKey(a), gb = glossKey(b);
    if (!ga || !gb) return true;
    if (ga.includes(gb) || gb.includes(ga)) return true;
    const sa = (a.synonyms || []).map(norm);
    const sb = (b.synonyms || []).map(norm);
    if (sa.includes(norm(b.word)) || sb.includes(norm(a.word))) return true;
    if (sa.some(x => x && gb.includes(x)) || sb.some(x => x && ga.includes(x))) return true;
    return false;
  }
  function similarity(a, b) {
    let s = 0;
    const ra = rootOf(a), rb = rootOf(b);
    if (ra && ra === rb) s += 3;
    if (posGroup(a) && posGroup(a) === posGroup(b)) s += 2;
    const ta = Themes.themesOf(a.word) || [];
    const tb = Themes.themesOf(b.word) || [];
    if (ta.some(x => tb.includes(x))) s += 1.5;
    if ((a.tags || []).some(t => (b.tags || []).includes(t))) s += 1;
    const la = a.word.length, lb = b.word.length;
    const ed = editDistance(a.word.toLowerCase(), b.word.toLowerCase());
    s += 1.5 * clamp(1 - ed / Math.max(4, Math.max(la, lb)), 0, 1);
    s += 0.5 * clamp(1 - Math.abs(la - lb) / 4, 0, 1);
    s += clamp(1 - Math.abs(intrinsic(a) - intrinsic(b)), 0, 1);
    if (semanticNeighbor(a, b)) s -= 5;
    return s;
  }

  // ---------- listening distractors ----------
  // IPA strings in the dataset mix several conventions (ә/ə, /slashes/, stress dots),
  // so canonicalise before comparing. Length and stress marks are dropped so that
  // near-homophones stay close without collapsing genuinely different words.
  function canonIpa(raw) {
    return String(raw || '').toLowerCase()
      .replace(/[\/\[\]().'ˈˌˑ:ː]/g, '')
      .replace(/ә/g, 'ə').replace(/ɡ/g, 'g').replace(/ɹ/g, 'r').replace(/ɾ/g, 'r')
      .replace(/ɪ/g, 'i').replace(/ʊ/g, 'u').replace(/ɔ/g, 'o').replace(/ɒ/g, 'o')
      .replace(/ɑ/g, 'a').replace(/æ/g, 'a').replace(/ʌ/g, 'a')
      .replace(/ɜ/g, 'ə').replace(/ɚ/g, 'ə').replace(/ɝ/g, 'ə')
      .replace(/[^a-zəθðʃʒŋ]/g, '');
  }
  function phoneticKey(e) { return canonIpa(e && (e.phonetic || e.ipa)); }
  function phoneticSim(a, b) {
    const pa = phoneticKey(a), pb = phoneticKey(b);
    if (!pa || !pb) return 0;
    const base = clamp(1 - editDistance(pa, pb) / Math.max(pa.length, pb.length, 1), 0, 1);
    let pre = 0;
    while (pre < pa.length && pre < pb.length && pa[pre] === pb[pre]) pre++;
    let suf = 0;
    while (suf < pa.length && suf < pb.length && pa[pa.length - 1 - suf] === pb[pb.length - 1 - suf]) suf++;
    const shared = Math.max(1, Math.min(pa.length, pb.length));
    return clamp(base * 0.72 + (pre / shared) * 0.16 + (suf / shared) * 0.12, 0, 1);
  }
  function buildAudioDistractors(entry, p) {
    const targetPh = phoneticKey(entry);
    if (!targetPh) return null;
    const scored = [];
    const seenWord = new Set([entry.word.toLowerCase()]);
    const seenPh = new Set([targetPh]);
    const targetWord = entry.word.toLowerCase();
    for (const c of p.entries) {
      if (!c || !c.word) continue;
      const w = c.word.toLowerCase();
      if (seenWord.has(w)) continue;
      if (semanticNeighbor(entry, c)) continue;
      // A bare stem match (consider → considerate) hands the answer away.
      if (w.includes(targetWord) || targetWord.includes(w)) continue;
      let sharedPrefix = 0;
      while (sharedPrefix < targetWord.length && sharedPrefix < w.length && targetWord[sharedPrefix] === w[sharedPrefix]) sharedPrefix++;
      if (sharedPrefix >= 6 && sharedPrefix >= Math.min(targetWord.length, w.length) - 2) continue;
      const ph = phoneticKey(c);
      if (ph && seenPh.has(ph)) continue;
      const phon = ph ? phoneticSim(entry, c) : 0;
      const spell = 1 - editDistance(entry.word.toLowerCase(), w) / Math.max(4, entry.word.length, c.word.length);
      const posBonus = posGroup(entry) && posGroup(entry) === posGroup(c) ? 0.08 : 0;
      scored.push({ c, s: phon + clamp(spell, 0, 1) * 0.34 + posBonus, phon });
      seenWord.add(w);
      if (ph) seenPh.add(ph);
    }
    scored.sort((a, b) => b.s - a.s);
    // Only words that actually sound close should become options; otherwise the
    // listener could pick the answer from obviously unrelated spellings.
    let close = scored.filter(x => x.phon >= 0.46);
    if (close.length < 4) close = scored.filter(x => x.phon >= 0.36);
    if (close.length < 3) return null;
    const items = close.slice(0, 10);
    const chosen = [];
    while (chosen.length < 3 && items.length) {
      // Cubic weighting keeps the options in the closest sound-alike band while
      // still varying which three appear across sessions.
      const weights = items.map(x => Math.max(0.004, Math.pow(Math.max(0.05, x.phon - 0.3), 2.2) * 8));
      const k = pickWeighted(weights);
      chosen.push(items[k].c);
      items.splice(k, 1);
    }
    if (chosen.length < 3) return null;
    const avg = chosen.reduce((n, c) => n + phoneticSim(entry, c), 0) / chosen.length;
    return { list: chosen.map(c => c.word), entries: chosen, avg };
  }

  function buildDistractors(entry, type, p, phase) {
    if (type === 'audio2word') return buildAudioDistractors(entry, p);
    const g = posGroup(entry);
    const correctKey = glossKey(entry);
    let candidates;
    if (type === 'zh2en' || type === 'cloze') {
      // Same POS is a hard requirement; if the pool cannot supply 3, change the question.
      candidates = g ? (p.byPos.get(g) || []) : [];
    } else {
      candidates = p.entries;
    }
    const seenGloss = new Set([correctKey]);
    const seenWord = new Set([entry.word]);
    const scored = [];
    for (const c of candidates) {
      if (!c || c.word === entry.word) continue;
      if (seenWord.has(c.word)) continue;
      const key = glossKey(c);
      if (!key || seenGloss.has(key)) continue;
      if (semanticNeighbor(entry, c)) continue;
      scored.push({ c, s: similarity(entry, c) });
      seenWord.add(c.word);
    }
    scored.sort((a, b) => b.s - a.s);
    let top = scored.slice(0, type === 'en2zh' ? 14 : 12);
    if (top.length < 3 && type === 'en2zh') top = scored.slice(0, 24);
    if (top.length < 3) return null;
    const chosen = [];
    const items = top.slice();
    while (chosen.length < 3 && items.length) {
      const weights = items.map(x => Math.max(0.05, x.s + 4));
      const k = pickWeighted(weights);
      chosen.push(items[k].c);
      items.splice(k, 1);
    }
    if (chosen.length < 3) return null;
    const avg = chosen.reduce((n, c) => n + similarity(entry, c), 0) / chosen.length;
    return { list: chosen.map(c => type === 'en2zh' ? primaryGloss(c) : c.word), entries: chosen, avg };
  }

  // ---------- question construction ----------
  function availableTypes(e, cfg, p) {
    const out = [];
    if (cfg.types.includes('en2zh') && p.entries.length >= 4) out.push('en2zh');
    if (cfg.types.includes('zh2en')) {
      const g = posGroup(e);
      const arr = g ? (p.byPos.get(g) || []) : [];
      let n = 0;
      for (const c of arr) {
        if (c.word === e.word) continue;
        if (semanticNeighbor(e, c)) continue;
        if (glossKey(c) === glossKey(e)) continue;
        n++;
        if (n >= 3) break;
      }
      if (n >= 3) out.push('zh2en');
    }
    if (cfg.types.includes('cloze') && hasCloze(e)) out.push('cloze');
    if (cfg.types.includes('audio2word') && p.entries.length >= 4 && phoneticKey(e)) out.push('audio2word');
    return out;
  }

  function buildQuestion(e, type, cfg, p, phase) {
    const diff = questionDifficulty(e, type);
    const root = rootOf(e);
    if (type === 'audio2word') {
      const d = buildAudioDistractors(e, p);
      if (!d) return null;
      const byWord = new Map([[e.word, e]]);
      d.entries.forEach(c => byWord.set(c.word, c));
      const opts = shuffle([e.word].concat(d.list)).map(w => ({ text: w, word: w, gloss: primaryGloss(byWord.get(w) || e) }));
      const correct = e.word;
      const options = opts.map(o => o.text);
      return {
        word: e.word, type, entry: e, difficulty: clamp(diff + (d.avg > 0.72 ? 0.04 : 0), 0, 1), root, pos: posGroup(e),
        display: { word: '', phonetic: '', question: '听发音，选择对应的单词' },
        options, optionWords: opts.map(o => o.word), optionGloss: opts.map(o => o.gloss),
        correctIndex: options.indexOf(correct), correct, gloss: primaryGloss(e)
      };
    }
    if (type === 'en2zh') {
      const d = buildDistractors(e, 'en2zh', p, phase);
      if (!d) return null;
      const correct = primaryGloss(e);
      const options = shuffle([correct].concat(d.list));
      return {
        word: e.word, type, entry: e, difficulty: clamp(diff + (d.avg > 7 ? 0.04 : 0), 0, 1), root, pos: posGroup(e),
        display: { word: e.word, phonetic: e.phonetic || '', question: '选择正确的释义' },
        options, optionWords: options.map(() => ''), optionGloss: options.map(() => ''),
        correctIndex: options.indexOf(correct), correct, gloss: correct
      };
    }
    if (type === 'zh2en') {
      const d = buildDistractors(e, 'zh2en', p, phase);
      if (!d) return null;
      const byWord = new Map([[e.word, e]]);
      d.entries.forEach(c => byWord.set(c.word, c));
      const opts = shuffle([e.word].concat(d.list)).map(w => ({ text: w, word: w, gloss: primaryGloss(byWord.get(w) || e) }));
      const correct = e.word;
      const options = opts.map(o => o.text);
      return {
        word: e.word, type, entry: e, difficulty: clamp(diff + (d.avg > 8 ? 0.04 : 0), 0, 1), root, pos: posGroup(e),
        display: { word: primaryGloss(e), phonetic: '', question: '选择对应的英文单词' },
        options, optionWords: opts.map(o => o.word), optionGloss: opts.map(o => o.gloss),
        correctIndex: options.indexOf(correct), correct, gloss: primaryGloss(e)
      };
    }
    const cloze = buildCloze(e, allExamples(e));
    if (!cloze) return null;
    const d = buildDistractors(e, 'cloze', p, phase);
    if (!d) return null;
    const inflected = cloze.form.toLowerCase() !== e.word.toLowerCase();
    const correct = inflected ? inflectLike(e.word, cloze.form) : e.word;
    const seen = new Set([correct.toLowerCase()]);
    const opts = [{ text: correct, word: e.word, gloss: primaryGloss(e) }];
    for (const c of d.entries) {
      const f = inflected ? inflectLike(c.word, cloze.form) : c.word;
      const k = f.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      opts.push({ text: f, word: c.word, gloss: primaryGloss(c) });
      if (opts.length >= 4) break;
    }
    if (opts.length < 4) return null;
    const shuffled = shuffle(opts);
    const options = shuffled.map(o => o.text);
    return {
      word: e.word, type, entry: e, difficulty: clamp(diff + (d.avg > 8 ? 0.04 : 0), 0, 1), root, pos: posGroup(e),
      display: {
        word: '', phonetic: '',
        question: inflected ? '选择正确的单词形式填入空格' : '选择正确的单词填入空格',
        sentence: cloze
      },
      options, optionWords: shuffled.map(o => o.word), optionGloss: shuffled.map(o => o.gloss),
      correctIndex: options.indexOf(correct), correct, gloss: primaryGloss(e)
    };
  }

  // ---------- session generation ----------
  function typeAllowed(type, recentTypes, phase) {
    if (phase > 0) return true;
    return !(recentTypes.length >= 2 && recentTypes[recentTypes.length - 1] === type && recentTypes[recentTypes.length - 2] === type);
  }
  function rootAllowed(root, recentRoots, phase) {
    if (phase > 0 || !root) return true;
    return !(recentRoots.length >= 2 && recentRoots[recentRoots.length - 1] === root && recentRoots[recentRoots.length - 2] === root);
  }
  function chooseType(types, recentTypes) {
    const last = recentTypes[recentTypes.length - 1];
    const weights = types.map(t => (t === last ? 0.55 : 1));
    return types[pickWeighted(weights)];
  }
  function candidateScore(c, usedRoots, recentRoots, cfg, now, phase) {
    const rootBonus = c.root && !usedRoots.has(c.root) ? 1.15 : 1;
    const target = targetDifficulty(cfg);
    let fit = 0;
    for (const t of c.types) fit = Math.max(fit, fitScore(questionDifficulty(c.e, t), target));
    const rp = phase >= 2 ? 0 : recentPenalty(c.e.word, now) * (phase === 1 ? 0.5 : 1);
    const last = recentRoots[recentRoots.length - 1];
    const rootPenalty = c.root && recentRoots.includes(c.root) ? (c.root === last ? 0.9 : 0.35) : 0;
    return Math.max(0.02, c.base * fit * rootBonus * c.novelty - rp - rootPenalty);
  }

  function sample(scored, cfg, p, now) {
    const used = new Set();
    const usedRoots = new Set();
    const recentTypes = [];
    const recentRoots = [];
    const questions = [];
    const relaxations = [];
    const limit = cfg.count;
    for (const phase of [0, 1, 2]) {
      while (questions.length < limit) {
        const allowed = [];
        for (const c of scored) {
          if (used.has(c.e.word)) continue;
          if (!rootAllowed(c.root, recentRoots, phase)) continue;
          const types = c.types.filter(t => typeAllowed(t, recentTypes, phase));
          if (!types.length) continue;
          allowed.push(c);
        }
        if (!allowed.length) break;
        const weights = allowed.map(c => candidateScore(c, usedRoots, recentRoots, cfg, now, phase));
        const c = allowed[pickWeighted(weights)];
        let types = c.types.filter(t => typeAllowed(t, recentTypes, phase));
        let q = null;
        while (types.length && !q) {
          const type = chooseType(types, recentTypes);
          q = buildQuestion(c.e, type, cfg, p, phase);
          if (!q) {
            types = types.filter(t => t !== type);
            c.types = c.types.filter(t => t !== type);
          }
        }
        if (!q) { used.add(c.e.word); continue; }
        questions.push(q);
        used.add(c.e.word);
        if (c.root) usedRoots.add(c.root);
        recentRoots.push(c.root || '');
        if (recentRoots.length > 2) recentRoots.shift();
        recentTypes.push(q.type);
        if (recentTypes.length > 2) recentTypes.shift();
      }
      if (questions.length >= limit) break;
      if (phase === 0) relaxations.push('放宽词根/题型连续限制');
      if (phase === 1) relaxations.push('忽略近期已测惩罚');
    }
    return { questions, relaxations };
  }

  function buildScored(entries, cfg, p, now) {
    const target = targetDifficulty(cfg);
    const out = [];
    for (const e of entries) {
      const types = availableTypes(e, cfg, p);
      if (!types.length) continue;
      const base = baseWeight(e, cfg.scope, now);
      const novelty = noveltyBonus(e);
      let fit = 0;
      for (const t of types) fit = Math.max(fit, fitScore(questionDifficulty(e, t), target));
      out.push({
        e, types, base, fit, novelty, root: rootOf(e),
        // Sorting hint only; the sampler re-scores with live root coverage.
        hint: base * fit * novelty
      });
    }
    out.sort((a, b) => b.hint - a.hint);
    return out;
  }

  function warningsFor(questions, cfg, estimateInfo) {
    const warnings = [];
    const types = {};
    questions.forEach(q => { types[q.type] = (types[q.type] || 0) + 1; });
    if (questions.length < cfg.count) {
      warnings.push('可用题量不足：计划 ' + cfg.count + ' 题，实际生成 ' + questions.length + ' 题。可以缩小范围、减少题数或调整题型。');
    }
    if (cfg.types.includes('cloze') && !types.cloze) {
      warnings.push(cfg.online ? '本轮没有找到可用例句，例句题已自动回退为其他题型。' : '未开启联网补充例句，本轮没有例句题。');
    }
    if (cfg.types.includes('audio2word') && !types.audio2word) {
      warnings.push('部分单词缺少近音干扰词，听音题已自动回退为其他题型。');
    }
    if (cfg.types.length === 1 && questions.length > 2) {
      warnings.push('只选了一种题型，为保证「不连续 3 题同题型」，部分题目放宽了题型限制。');
    }
    if (estimateInfo && estimateInfo.onlineCloze) {
      warnings.push('已有 ' + estimateInfo.onlineCloze + ' 个词需要联网获取例句；离线时会自动回退。');
    }
    return warnings;
  }

  function buildConfig(input) {
    const c = input || {};
    const types = Array.isArray(c.types) ? c.types.filter(t => TYPES.includes(t)) : [];
    return {
      scope: SCOPES.some(s => s.id === c.scope) ? c.scope : 'mixed',
      count: [5, 10, 20].includes(c.count) ? c.count : 10,
      types: types.length ? Array.from(new Set(types)) : TYPES.slice(),
      difficulty: ['auto', 'easy', 'normal', 'hard'].includes(c.difficulty) ? c.difficulty : 'auto',
      online: c.online !== false,
      theme: typeof c.theme === 'string' ? c.theme : ''
    };
  }

  // Synchronous estimate used by the start screen (never touches the network).
  function estimate(input) {
    const cfg = buildConfig(input);
    const p = pool();
    const entries = listEntries(scopeWords(cfg));
    const counts = { en2zh: 0, zh2en: 0, cloze: 0, audio2word: 0 };
    let available = 0;
    for (const e of entries) {
      const types = availableTypes(e, cfg, p);
      if (!types.length) continue;
      available++;
      types.forEach(t => counts[t]++);
    }
    const onlineCloze = cfg.types.includes('cloze') && cfg.online
      ? entries.filter(e => !hasCloze(e)).length
      : 0;
    return { pool: entries.length, available, types: counts, onlineCloze, cfg };
  }

  async function buildSession(input, opts) {
    opts = opts || {};
    const cfg = buildConfig(input);
    const now = Date.now();
    const p = pool();
    let entries = listEntries(scopeWords(cfg));
    if (!entries.length) return { questions: [], config: cfg, warnings: ['当前范围没有可用的词。'] };

    if (cfg.types.includes('cloze') && cfg.online) {
      // Prefetch only likely candidates: rank by base weight before sampling.
      const ranked = entries.slice().sort((a, b) => baseWeight(b, cfg.scope, now) - baseWeight(a, cfg.scope, now));
      const limit = Math.min(20, Math.max(cfg.count, 10));
      await prefetchExamples(ranked.slice(0, limit), cfg, limit, opts.onProgress);
      entries = ranked;
    }

    const scored = buildScored(entries, cfg, p, now);
    const { questions, relaxations } = sample(scored, cfg, p, now);
    const info = estimate(cfg);
    return {
      questions, config: cfg, relaxations,
      available: info.available, estimates: info,
      warnings: warningsFor(questions, cfg, info)
    };
  }

  window.QuizEngine = {
    TYPES, TYPE_LABEL, SCOPES, DIFFICULTY_TARGET, buildConfig, estimate, buildSession,
    primaryGloss, posGroup, rootOf, pool, scopeWords, listEntries,
    intrinsic, stateDifficulty, questionDifficulty, targetDifficulty, ability,
    phoneticKey, phoneticSim
  };
})();
