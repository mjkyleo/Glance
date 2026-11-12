// Glance store: persistence + learning-domain logic (SRS states, daily plan/logs, favorites, history, errors).
(function () {
  const DEFAULTS = {
    activeBook: '六级',
    plan: { newPerDay: 20, reviewCap: 0 },
    srs: {},
    logs: {},
    favorites: {},
    favGroups: ['默认'],
    history: [],
    errors: {},
    customBooks: {},
    cardOrder: ['meaning', 'mnemonic', 'morphemes', 'definitions', 'family', 'synonyms', 'derivatives', 'etymology', 'inflections'],
    autoSpeak: false,
    preferAudio: true,
    ttsRate: 1,
    ttsLang: '',
    fsrs: { w: null, seqs: {}, count: 0, lastOpt: 0 },
    ai: { provider: 'deepseek', key: '', model: '', base: '', enabled: false },
    aiCache: {}
  };

  let data = null;
  let saveTimer = null;

  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) { const x = d || new Date(); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
  function today() { return dateKey(new Date()); }

  function normalize(raw) {
    const d = Object.assign({}, raw || {});
    for (const k of Object.keys(DEFAULTS)) {
      if (d[k] === undefined || d[k] === null) d[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
    }
    d.plan = Object.assign({ newPerDay: 20, reviewCap: 0 }, d.plan || {});
    if (!Array.isArray(d.favGroups) || !d.favGroups.length) d.favGroups = ['默认'];
    if (!Array.isArray(d.history)) d.history = [];
    if (!Array.isArray(d.cardOrder) || !d.cardOrder.length) d.cardOrder = DEFAULTS.cardOrder.slice();
    if (!d.cardOrder.includes('mnemonic')) { const i = d.cardOrder.indexOf('meaning'); d.cardOrder.splice(i < 0 ? 0 : i + 1, 0, 'mnemonic'); }
    if (!d.fsrs || typeof d.fsrs !== 'object') d.fsrs = { w: null, seqs: {}, count: 0, lastOpt: 0 };
    if (!d.fsrs.seqs || typeof d.fsrs.seqs !== 'object') d.fsrs.seqs = {};
    if (!d.ai || typeof d.ai !== 'object') d.ai = { provider: 'deepseek', key: '', model: '', base: '', enabled: false };
    if (!d.aiCache || typeof d.aiCache !== 'object') d.aiCache = {};
    return d;
  }

  async function load() {
    const raw = (await Platform.getSettings()) || {};
    data = normalize(raw);
    return data;
  }

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
  }
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (data) Platform.saveSettings(data);
  }

  function getLog(date) {
    const key = date || today();
    if (!data.logs[key]) data.logs[key] = { newWords: [], reviewWords: [], know: 0, fuzzy: 0, forgot: 0, ms: 0 };
    const l = data.logs[key];
    if (!Array.isArray(l.newWords)) l.newWords = [];
    if (!Array.isArray(l.reviewWords)) l.reviewWords = [];
    return l;
  }

  // Grade a word: advance FSRS state + record daily activity + feed personalization.
  function recordGrade(word, kind, grade, ms) {
    const now = Date.now();
    const prev = data.srs[word];
    const w = data.fsrs.w || SRS.DEFAULT_W;
    const elapsed = prev && prev.last ? (now - prev.last) / SRS.DAY : 0;
    const next = SRS.review(prev, grade, now, w);
    data.srs[word] = next;
    logReview(word, elapsed, SRS.G[grade] || 3);
    const log = getLog();
    if (grade === SRS.GRADE.KNOW) log.know++;
    else if (grade === SRS.GRADE.FUZZY) log.fuzzy++;
    else log.forgot++;
    if (kind === 'new') { if (!log.newWords.includes(word)) log.newWords.push(word); }
    else if (!log.reviewWords.includes(word)) log.reviewWords.push(word);
    if (ms && ms > 0 && ms < 600000) log.ms += ms;
    save();
    return next;
  }

  // Append to the per-word review sequence used to personalize FSRS weights.
  function logReview(word, elapsedDays, g) {
    const f = data.fsrs;
    const seq = f.seqs[word] || (f.seqs[word] = []);
    seq.push({ t: Math.max(0, elapsedDays), g });
    if (seq.length > 30) seq.splice(0, seq.length - 30);
    f.count++;
    // Trim oldest words once the corpus grows large, to bound memory + optimize cost.
    const keys = Object.keys(f.seqs);
    if (keys.length > 1000) { for (let i = 0; i < keys.length - 1000; i++) delete f.seqs[keys[i]]; }
    if (f.count - f.lastOpt >= 200) {
      f.lastOpt = f.count;
      const snapshot = JSON.parse(JSON.stringify(f.seqs));
      const baseW = f.w || SRS.DEFAULT_W;
      setTimeout(() => {
        try { data.fsrs.w = SRS.optimize(snapshot, baseW); save(); } catch (e) { /* keep current weights */ }
      }, 0);
    }
  }

  function planProgress() {
    const log = getLog();
    const newDone = log.newWords.length;
    const reviewDone = log.reviewWords.length;
    const newPerDay = data.plan.newPerDay;
    const newLeft = Math.max(0, newPerDay - newDone);
    return {
      newDone, reviewDone, newPerDay, newLeft,
      know: log.know, fuzzy: log.fuzzy, forgot: log.forgot, ms: log.ms,
      graded: log.know + log.fuzzy + log.forgot
    };
  }

  function streak() {
    const keys = Object.keys(data.logs).filter(k => {
      const l = data.logs[k];
      return (l.know + l.fuzzy + l.forgot) > 0;
    }).sort();
    if (!keys.length) return { count: 0, last: null, todayDone: false };
    const last = keys[keys.length - 1];
    const todayDone = last === today();
    let count = 0;
    let cursor = new Date(last + 'T00:00:00');
    const have = new Set(keys);
    while (have.has(dateKey(cursor))) { count++; cursor.setDate(cursor.getDate() - 1); }
    return { count, last, todayDone };
  }

  function mastery(entries) {
    const m = { fresh: 0, learning: 0, known: 0, relearn: 0 };
    const boxes = new Array(SRS.MAX_BOX + 1).fill(0);
    for (const e of entries) {
      const s = data.srs[e.word];
      if (SRS.isNew(s)) { m.fresh++; boxes[0]++; continue; }
      boxes[Math.min(s.box, SRS.MAX_BOX)]++;
      if (SRS.isKnown(s)) m.known++;
      else if (s.state === 'relearn') m.relearn++;
      else m.learning++;
    }
    return { counts: m, boxes, total: entries.length };
  }

  function trend(days) {
    const out = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now); d.setDate(now.getDate() - i);
      const key = dateKey(d);
      const l = data.logs[key] || { newWords: [], reviewWords: [], know: 0, fuzzy: 0, forgot: 0, ms: 0 };
      out.push({ date: key, label: (d.getMonth() + 1) + '/' + d.getDate(), nw: (l.newWords || []).length, rv: (l.reviewWords || []).length, graded: l.know + l.fuzzy + l.forgot });
    }
    return out;
  }

  // favorites (生词本)
  function isFavorite(word) { return !!data.favorites[word]; }
  function addFavorite(word, group) {
    data.favorites[word] = { ts: Date.now(), group: group || data.favGroups[0] || '默认' };
    save();
  }
  function removeFavorite(word) { delete data.favorites[word]; save(); }
  function favoriteWords(group) {
    return Object.keys(data.favorites)
      .filter(w => !group || data.favorites[w].group === group)
      .sort((a, b) => data.favorites[b].ts - data.favorites[a].ts);
  }
  function addFavGroup(name) {
    name = String(name || '').trim();
    if (name && !data.favGroups.includes(name)) { data.favGroups.push(name); save(); }
  }

  // search history
  function addHistory(word) {
    data.history = data.history.filter(h => h.word !== word);
    data.history.unshift({ word, ts: Date.now() });
    if (data.history.length > 100) data.history.length = 100;
    save();
  }
  function clearHistory() { data.history = []; save(); }

  // errors (错题本)
  function addError(word) {
    const e = data.errors[word] || { count: 0, last: 0 };
    e.count++; e.last = Date.now();
    data.errors[word] = e;
    save();
  }
  function clearError(word) { delete data.errors[word]; save(); }
  function errorWords() {
    return Object.keys(data.errors).sort((a, b) => data.errors[b].last - data.errors[a].last);
  }

  // AI explanations (config + local cache)
  function setAiConfig(patch) { Object.assign(data.ai, patch || {}); save(); }
  function aiExplanation(word) { return data.aiCache[word] || null; }
  function saveAiExplanation(word, record) { data.aiCache[word] = record; save(); }
  function deleteAiExplanation(word) { delete data.aiCache[word]; save(); }
  function aiWords() { return Object.keys(data.aiCache).sort((a, b) => (data.aiCache[b].ts || 0) - (data.aiCache[a].ts || 0)); }

  window.Store = {
    load, save, flush, get data() { return data; },
    today, dateKey, getLog, recordGrade, planProgress, streak, mastery, trend,
    isFavorite, addFavorite, removeFavorite, favoriteWords, addFavGroup,
    addHistory, clearHistory, addError, clearError, errorWords,
    setAiConfig, aiExplanation, saveAiExplanation, deleteAiExplanation, aiWords
  };
})();