// Glance store: persistence + learning-domain logic (SRS states, daily plan/logs, favorites, history, errors).
(function () {
  const DEFAULTS = {
    activeBook: '六级',
    plan: { newPerDay: 20, reviewCap: 0 },
    srs: {},
    logs: {},
    views: {},
    favorites: {},
    favGroups: ['默认'],
    history: [],
    errors: {},
    customBooks: {},
    cardOrder: ['mnemonic', 'morphemes', 'family', 'synonyms', 'derivatives', 'inflections', 'examples', 'collocations', 'definitions'],
    studyPanel: {
      phonetic: true, meaning: true, morphemes: true, mnemonic: true, definitions: true,
      examples: true, family: true, synonyms: true, derivatives: true, etymology: true, inflections: true
    },
    studyPanelOrder: [
      'phonetic', 'morphemes', 'mnemonic', 'meaning', 'definitions',
      'family', 'synonyms', 'derivatives', 'inflections', 'etymology', 'examples'
    ],
    theme: 'blue',
    autoSpeak: false,
    preferAudio: true,
    ttsRate: 1,
    ttsLang: '',
    fsrs: { w: null, seqs: {}, count: 0, lastOpt: 0 },
    ai: { provider: 'deepseek', key: '', model: '', base: '', enabled: false, autoExplain: false },
    aiCache: {},
    dict: { provider: 'freezh', key: '', base: '' },
    dictCache: {},
    quiz: {
      config: {
        scope: 'mixed', count: 10, types: ['en2zh', 'zh2en', 'cloze'],
        difficulty: 'auto', online: true, theme: ''
      },
      ability: 0.5, answered: 0, correct: 0, streak: 0, history: {}
    },
    quizExamples: {},
    background: { image: '', veil: 38, blur: 0 }
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
    if (!d.views || typeof d.views !== 'object') d.views = {};
    if (!Array.isArray(d.cardOrder) || !d.cardOrder.length) d.cardOrder = DEFAULTS.cardOrder.slice();
    // 旧版默认顺序（含独立的释义/词源卡）升级为新版合并结构；用户自定义顺序保持不动。
    const OLD_CARD_ORDER = 'meaning,mnemonic,morphemes,definitions,family,synonyms,derivatives,etymology,inflections';
    if (d.cardOrder.join(',') === OLD_CARD_ORDER) d.cardOrder = DEFAULTS.cardOrder.slice();
    if (!d.cardOrder.includes('mnemonic')) d.cardOrder.unshift('mnemonic');
    if (!d.studyPanel || typeof d.studyPanel !== 'object' || Array.isArray(d.studyPanel)) d.studyPanel = {};
    d.studyPanel = Object.assign({}, DEFAULTS.studyPanel, d.studyPanel);
    const panelIds = DEFAULTS.studyPanelOrder;
    if (!Array.isArray(d.studyPanelOrder)) d.studyPanelOrder = [];
    const savedOrder = d.studyPanelOrder.filter((id, i) => panelIds.includes(id) && d.studyPanelOrder.indexOf(id) === i);
    d.studyPanelOrder = savedOrder.concat(panelIds.filter(id => !savedOrder.includes(id)));
    if (!['blue', 'green', 'yellow', 'gray', 'black', 'paper', 'sakura', 'violet'].includes(d.theme)) d.theme = 'blue';
    if (!d.fsrs || typeof d.fsrs !== 'object') d.fsrs = { w: null, seqs: {}, count: 0, lastOpt: 0 };
    if (!d.fsrs.seqs || typeof d.fsrs.seqs !== 'object') d.fsrs.seqs = {};
    if (!d.ai || typeof d.ai !== 'object') d.ai = { provider: 'deepseek', key: '', model: '', base: '', enabled: false, autoExplain: false };
    else d.ai = Object.assign({ provider: 'deepseek', key: '', model: '', base: '', enabled: false, autoExplain: false }, d.ai);
    if (!d.aiCache || typeof d.aiCache !== 'object') d.aiCache = {};
    if (!d.dict || typeof d.dict !== 'object') d.dict = { provider: 'free', key: '', base: '' };
    if (!d.dictCache || typeof d.dictCache !== 'object') d.dictCache = {};
    if (!d.quizExamples || typeof d.quizExamples !== 'object') d.quizExamples = {};
    if (!d.quiz || typeof d.quiz !== 'object') d.quiz = {};
    const QSCOPES = ['book', 'theme', 'favorites', 'errors', 'due', 'mixed'];
    const QTYPES = ['en2zh', 'zh2en', 'cloze'];
    const qc = d.quiz.config && typeof d.quiz.config === 'object' ? d.quiz.config : {};
    const qtypes = Array.isArray(qc.types) ? qc.types.filter((t, i) => QTYPES.includes(t) && qc.types.indexOf(t) === i) : [];
    d.quiz.config = {
      scope: QSCOPES.includes(qc.scope) ? qc.scope : 'mixed',
      count: [5, 10, 20].includes(qc.count) ? qc.count : 10,
      types: qtypes.length ? qtypes : QTYPES.slice(),
      difficulty: ['auto', 'easy', 'normal', 'hard'].includes(qc.difficulty) ? qc.difficulty : 'auto',
      online: qc.online !== false,
      theme: typeof qc.theme === 'string' ? qc.theme : ''
    };
    d.quiz.ability = typeof d.quiz.ability === 'number' ? Math.max(0.05, Math.min(0.95, d.quiz.ability)) : 0.5;
    d.quiz.answered = Math.max(0, Number(d.quiz.answered) || 0);
    d.quiz.correct = Math.max(0, Number(d.quiz.correct) || 0);
    d.quiz.streak = Math.trunc(Number(d.quiz.streak) || 0);
    if (!d.quiz.history || typeof d.quiz.history !== 'object' || Array.isArray(d.quiz.history)) d.quiz.history = {};
    if (!d.background || typeof d.background !== 'object') d.background = { image: '', veil: 38, blur: 0 };
    d.background.image = typeof d.background.image === 'string' && /^data:image\//.test(d.background.image) ? d.background.image : '';
    d.background.veil = typeof d.background.veil === 'number' ? Math.max(0, Math.min(80, d.background.veil)) : 38;
    d.background.blur = typeof d.background.blur === 'number' ? Math.max(0, Math.min(16, d.background.blur)) : 0;
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

  // encounters (every time a word is actually shown to the learner)
  function recordView(word) {
    if (!word) return;
    const now = Date.now();
    const v = data.views[word] || (data.views[word] = { n: 0, first: now, last: 0 });
    v.n++;
    if (!v.first) v.first = now;
    v.last = now;
    save();
  }
  function viewInfo(word) { return data.views[word] || null; }
  function viewCount(word) { const v = data.views[word]; return v ? v.n : 0; }
  function topViews(limit) {
    return Object.keys(data.views)
      .map(w => ({ word: w, n: data.views[w].n || 0, last: data.views[w].last || 0 }))
      .filter(x => x.n > 0)
      .sort((a, b) => b.n - a.n || b.last - a.last)
      .slice(0, limit || 20);
  }
  function totalViews() {
    let n = 0;
    for (const w of Object.keys(data.views)) n += data.views[w].n || 0;
    return n;
  }
  function viewedWordCount() { return Object.keys(data.views).length; }

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

  // external dictionary (config + per-word cache, offline-friendly)
  function setDictConfig(patch) { Object.assign(data.dict, patch || {}); save(); }
  function dictEntry(word) { return data.dictCache[word] || null; }
  function saveDictEntry(word, record) { data.dictCache[word] = record; save(); }
  function deleteDictEntry(word) { delete data.dictCache[word]; save(); }
  function dictWords() { return Object.keys(data.dictCache).sort((a, b) => (data.dictCache[b].ts || 0) - (data.dictCache[a].ts || 0)); }

  // quiz: configuration, adaptive ability and per-word test history
  function setQuizConfig(patch) { Object.assign(data.quiz.config, patch || {}); save(); }
  function recordQuizResult(word, correct, difficulty) {
    const q = data.quiz;
    q.answered = (q.answered || 0) + 1;
    if (correct) { q.correct = (q.correct || 0) + 1; q.streak = Math.max(1, (q.streak || 0) + 1); }
    else q.streak = Math.min(-1, (q.streak || 0) - 1);
    q.ability = Math.max(0.05, Math.min(0.95, (q.ability ?? 0.5) + (correct ? 0.035 : -0.055)));
    const h = q.history[word] || (q.history[word] = { n: 0, correct: 0, wrong: 0, last: 0 });
    h.n++; if (correct) h.correct++; else h.wrong++;
    h.last = Date.now();
    if (typeof difficulty === 'number') h.diff = difficulty;
    const keys = Object.keys(q.history);
    if (keys.length > 2000) {
      keys.sort((a, b) => (q.history[a].last || 0) - (q.history[b].last || 0))
        .slice(0, keys.length - 2000).forEach(w => delete q.history[w]);
    }
    save();
  }
  function quizExamples(word) {
    const r = data.quizExamples[word];
    return r && Array.isArray(r.examples) ? r.examples : null;
  }
  function saveQuizExamples(word, examples, provider) {
    data.quizExamples[word] = { examples: (examples || []).slice(0, 6), provider: provider || '', ts: Date.now() };
    save();
  }

  // background wallpaper (image stored as a compressed data URL)
  function setBackground(patch) { Object.assign(data.background, patch || {}); save(); }

  // ---- portable backup: universal words table + lossless settings/progress block ----
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function isObj(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function iso(ms) { return ms ? new Date(ms).toISOString() : null; }
  function wordState(s) {
    if (!s || SRS.isNew(s)) return 'new';
    if (SRS.isKnown(s)) return 'known';
    return s.state === 'relearn' ? 'relearn' : 'learning';
  }

  function exportData() {
    const srs = data.srs || {}, views = data.views || {}, fav = data.favorites || {}, errs = data.errors || {};
    const all = new Set();
    [srs, views, fav, errs].forEach(map => Object.keys(map).forEach(w => all.add(w)));
    (data.history || []).forEach(h => { if (h && h.word) all.add(h.word); });
    const words = Array.from(all).sort().map(w => {
      const s = srs[w] || {}, v = views[w] || {}, e = errs[w] || {};
      return {
        word: w, state: wordState(s), box: s.box || 0, due: iso(s.due), reps: s.reps || 0, lapses: s.lapses || 0,
        views: v.n || 0, firstSeen: iso(v.first), lastSeen: iso(v.last),
        favorite: !!fav[w], favoriteGroup: fav[w] ? (fav[w].group || '') : '', errors: e.count || 0
      };
    });
    const counts = { known: 0, learning: 0, relearn: 0, fresh: 0 };
    all.forEach(w => { counts[wordState(srs[w])]++; });
    const daysActive = Object.keys(data.logs || {}).filter(k => {
      const l = data.logs[k];
      return l && ((l.know || 0) + (l.fuzzy || 0) + (l.forgot || 0)) > 0;
    }).length;
    const ai = Object.assign({}, data.ai || {}); delete ai.key;
    const dict = Object.assign({}, data.dict || {}); delete dict.key;
    return {
      app: 'Glance', kind: 'learning-data', schema: 1, exportedAt: new Date().toISOString(),
      summary: {
        totalWords: all.size, known: counts.known, learning: counts.learning, relearn: counts.relearn, fresh: counts.fresh,
        favorites: Object.keys(fav).length, totalViews: totalViews(), daysActive
      },
      words,
      data: {
        srs: clone(srs), logs: clone(data.logs || {}), views: clone(views), favorites: clone(fav),
        favGroups: (data.favGroups || []).slice(), history: clone(data.history || []), errors: clone(errs),
        fsrs: clone(data.fsrs || {}), aiCache: clone(data.aiCache || {}), dictCache: clone(data.dictCache || {}),
        customBooks: clone(data.customBooks || {}),
        quiz: clone(data.quiz || {}), quizExamples: clone(data.quizExamples || {}),
        settings: {
          plan: clone(data.plan), activeBook: data.activeBook, cardOrder: (data.cardOrder || []).slice(),
          studyPanel: clone(data.studyPanel || {}), studyPanelOrder: (data.studyPanelOrder || []).slice(), theme: data.theme || 'blue',
          autoSpeak: data.autoSpeak, preferAudio: data.preferAudio, ttsRate: data.ttsRate, ttsLang: data.ttsLang,
          ai, dict,
          background: { veil: data.background.veil, blur: data.background.blur }
        }
      }
    };
  }

  function mergeHistory(a, b) {
    const seen = new Set(), out = [];
    (a || []).concat(b || []).sort((x, y) => (y.ts || 0) - (x.ts || 0)).forEach(h => {
      if (!h || !h.word || seen.has(h.word)) return;
      seen.add(h.word); out.push({ word: h.word, ts: h.ts || 0 });
    });
    return out.slice(0, 100);
  }

  function mergeQuiz(src, replace) {
    const q = data.quiz;
    const clampA = x => Math.max(0.05, Math.min(0.95, Number(x) || 0.5));
    if (replace) {
      const c = isObj(src.config) ? src.config : {};
      const types = Array.isArray(c.types) ? c.types.filter(t => ['en2zh', 'zh2en', 'cloze'].includes(t)) : [];
      q.config = {
        scope: ['book', 'theme', 'favorites', 'errors', 'due', 'mixed'].includes(c.scope) ? c.scope : 'mixed',
        count: [5, 10, 20].includes(c.count) ? c.count : 10,
        types: types.length ? types : ['en2zh', 'zh2en', 'cloze'],
        difficulty: ['auto', 'easy', 'normal', 'hard'].includes(c.difficulty) ? c.difficulty : 'auto',
        online: c.online !== false,
        theme: typeof c.theme === 'string' ? c.theme : ''
      };
      q.ability = clampA(src.ability);
      q.answered = Math.max(0, Number(src.answered) || 0);
      q.correct = Math.max(0, Number(src.correct) || 0);
      q.streak = Math.trunc(Number(src.streak) || 0);
      q.history = {};
    } else {
      const a1 = q.answered || 0, a2 = Math.max(0, Number(src.answered) || 0);
      if (a2 > 0) q.ability = clampA(((q.ability ?? 0.5) * a1 + clampA(src.ability) * a2) / (a1 + a2));
      q.answered = a1 + a2;
      q.correct = (q.correct || 0) + Math.max(0, Number(src.correct) || 0);
    }
    if (isObj(src.history)) {
      for (const w of Object.keys(src.history)) {
        const h = src.history[w];
        if (!isObj(h)) continue;
        const cur = q.history[w];
        if (!cur) q.history[w] = { n: h.n || 0, correct: h.correct || 0, wrong: h.wrong || 0, last: h.last || 0, diff: h.diff };
        else {
          cur.n += h.n || 0; cur.correct += h.correct || 0; cur.wrong += h.wrong || 0;
          cur.last = Math.max(cur.last || 0, h.last || 0);
          if (typeof h.diff === 'number') cur.diff = h.diff;
        }
      }
    }
  }

  function importData(payload, mode) {
    if (!isObj(payload) || payload.kind !== 'learning-data') throw new Error('不是 Glance 学习数据文件');
    const replace = mode === 'replace';
    const src = isObj(payload.data) ? payload.data : null;
    const now = Date.now();
    const result = { mode: replace ? 'replace' : 'merge', words: 0, views: 0, favorites: 0 };
    if (!src && !Array.isArray(payload.words)) throw new Error('文件里没有可导入的学习数据');

    if (replace) {
      data.srs = {}; data.logs = {}; data.views = {}; data.favorites = {}; data.errors = {};
      data.history = []; data.favGroups = ['默认']; data.aiCache = {}; data.dictCache = {};
      data.quizExamples = {};
      data.quiz = { config: clone(DEFAULTS.quiz.config), ability: 0.5, answered: 0, correct: 0, streak: 0, history: {} };
    }

    if (src) {
      if (isObj(src.srs)) for (const w of Object.keys(src.srs)) if (isObj(src.srs[w])) { data.srs[w] = src.srs[w]; result.words++; }
      if (isObj(src.logs)) for (const k of Object.keys(src.logs)) if (isObj(src.logs[k])) data.logs[k] = src.logs[k];
      if (isObj(src.views)) for (const w of Object.keys(src.views)) {
        const v = src.views[w]; if (!isObj(v)) continue;
        const cur = data.views[w];
        if (!cur) { data.views[w] = { n: v.n || 0, first: v.first || 0, last: v.last || 0 }; result.views++; }
        else {
          cur.n += v.n || 0;
          cur.first = Math.min(cur.first || v.first || now, v.first || cur.first || now);
          cur.last = Math.max(cur.last || 0, v.last || 0);
        }
      }
      if (isObj(src.favorites)) for (const w of Object.keys(src.favorites)) {
        if (!isObj(src.favorites[w])) continue;
        data.favorites[w] = src.favorites[w]; result.favorites++;
      }
      if (Array.isArray(src.favGroups)) {
        src.favGroups.forEach(g => { if (typeof g === 'string' && g.trim() && !data.favGroups.includes(g)) data.favGroups.push(g); });
      }
      if (Array.isArray(src.history)) data.history = mergeHistory(data.history, src.history);
      if (isObj(src.errors)) for (const w of Object.keys(src.errors)) {
        const e = src.errors[w]; if (!isObj(e)) continue;
        const cur = data.errors[w];
        if (!cur || (e.count || 0) > (cur.count || 0)) data.errors[w] = { count: e.count || 0, last: e.last || 0 };
        else cur.last = Math.max(cur.last || 0, e.last || 0);
      }
      if (isObj(src.aiCache)) for (const w of Object.keys(src.aiCache)) if (isObj(src.aiCache[w])) data.aiCache[w] = src.aiCache[w];
      if (isObj(src.dictCache)) for (const w of Object.keys(src.dictCache)) if (isObj(src.dictCache[w])) data.dictCache[w] = src.dictCache[w];
      if (isObj(src.customBooks)) for (const k of Object.keys(src.customBooks)) if (isObj(src.customBooks[k])) data.customBooks[k] = src.customBooks[k];
      if (isObj(src.quiz)) mergeQuiz(src.quiz, replace);
      if (isObj(src.quizExamples)) {
        for (const w of Object.keys(src.quizExamples)) {
          const r = src.quizExamples[w];
          if (!isObj(r) || !Array.isArray(r.examples)) continue;
          const cur = data.quizExamples[w];
          if (!cur || (r.ts || 0) > (cur.ts || 0)) data.quizExamples[w] = r;
        }
      }
      if (isObj(src.fsrs) && (replace || !data.fsrs || !data.fsrs.count)) data.fsrs = src.fsrs;
      if (replace && isObj(src.settings)) {
        const s = src.settings;
        if (isObj(s.plan)) data.plan = Object.assign({ newPerDay: 20, reviewCap: 0 }, s.plan);
        if (typeof s.activeBook === 'string' && s.activeBook) data.activeBook = s.activeBook;
        if (Array.isArray(s.cardOrder) && s.cardOrder.length) data.cardOrder = s.cardOrder.slice();
        if (isObj(s.studyPanel)) data.studyPanel = Object.assign({}, DEFAULTS.studyPanel, s.studyPanel);
        if (Array.isArray(s.studyPanelOrder) && s.studyPanelOrder.length) data.studyPanelOrder = s.studyPanelOrder.slice();
        if (['blue', 'green', 'yellow', 'gray', 'black', 'paper', 'sakura', 'violet'].includes(s.theme)) data.theme = s.theme;
        ['autoSpeak', 'preferAudio'].forEach(k => { if (typeof s[k] === 'boolean') data[k] = s[k]; });
        if (typeof s.ttsRate === 'number') data.ttsRate = s.ttsRate;
        if (typeof s.ttsLang === 'string') data.ttsLang = s.ttsLang;
        const keepAi = data.ai.key || '';
        if (isObj(s.ai)) data.ai = Object.assign({}, data.ai, s.ai, { key: keepAi });
        const keepDict = (data.dict && data.dict.key) || '';
        if (isObj(s.dict)) data.dict = Object.assign({}, data.dict, s.dict, { key: keepDict });
        if (isObj(s.background)) {
          if (typeof s.background.veil === 'number') data.background.veil = Math.max(0, Math.min(80, s.background.veil));
          if (typeof s.background.blur === 'number') data.background.blur = Math.max(0, Math.min(16, s.background.blur));
        }
      }
    } else {
      // generic table only: best-effort rebuild
      payload.words.forEach(r => {
        if (!isObj(r) || typeof r.word !== 'string' || !r.word) return;
        const w = r.word;
        const st = r.state || 'new';
        if (st !== 'new') {
          const box = r.box || (st === 'known' ? SRS.GRADUATED : 1);
          data.srs[w] = { box, due: Date.parse(r.due) || 0, reps: r.reps || 0, lapses: r.lapses || 0, last: Date.parse(r.lastSeen) || 0, state: st === 'known' ? 'known' : st, S: 0, D: 0 };
          result.words++;
        }
        if (r.views > 0) { data.views[w] = { n: r.views, first: Date.parse(r.firstSeen) || 0, last: Date.parse(r.lastSeen) || 0 }; result.views++; }
        if (r.favorite) { data.favorites[w] = { ts: Date.parse(r.lastSeen) || now, group: r.favoriteGroup || data.favGroups[0] || '默认' }; result.favorites++; }
        if (r.errors > 0) data.errors[w] = { count: r.errors, last: Date.parse(r.lastSeen) || 0 };
      });
    }
    save();
    return result;
  }

  window.Store = {
    load, save, flush, get data() { return data; },
    today, dateKey, getLog, recordGrade, planProgress, streak, mastery, trend,
    isFavorite, addFavorite, removeFavorite, favoriteWords, addFavGroup,
    addHistory, clearHistory, addError, clearError, errorWords,
    recordView, viewInfo, viewCount, topViews, totalViews, viewedWordCount,
    exportData, importData,
    defaultCardOrder: () => DEFAULTS.cardOrder.slice(),
    setAiConfig, aiExplanation, saveAiExplanation, deleteAiExplanation, aiWords,
    setDictConfig, dictEntry, saveDictEntry, deleteDictEntry, dictWords,
    setQuizConfig, recordQuizResult, quizExamples, saveQuizExamples, setBackground
  };
})();