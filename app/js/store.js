// Glance store: persistence + learning-domain logic (SRS states, daily plan/logs, favorites, history, errors).
(function () {
  const DEFAULTS = {
    activeBook: '六级',
    profile: { nickname: '', avatar: '' },
    plan: { newPerDay: 20, reviewCap: 0 },
    srs: {},
    logs: {},
    views: {},
    favorites: {},
    favGroups: ['默认'],
    customThemes: [],
    history: [],
    errors: {},
    customBooks: {},
    studyPanel: {
      phonetic: true, meaning: true, morphemes: true, mnemonic: true, definitions: true,
      examples: true, family: true, synonyms: true, derivatives: true, etymology: true, inflections: true,
      collocations: true, freq: true, cloze: true, dict: true, ai: true
    },
    studyPanelOrder: [
      'phonetic', 'morphemes', 'mnemonic', 'meaning', 'definitions',
      'family', 'synonyms', 'derivatives', 'inflections', 'etymology', 'examples',
      'collocations', 'freq', 'cloze', 'dict', 'ai'
    ],
    theme: 'blue',
    progressBars: true,
    bookFilter: { skipLower: false, skipKnown: false, skipBasic: true, excludeBooks: [] },
    autoSpeak: false,
    preferAudio: true,
    ttsRate: 1,
    ttsLang: '',
    fsrs: { w: null, seqs: {}, count: 0, lastOpt: 0 },
    ai: { provider: 'deepseek', key: '', model: '', base: '', enabled: false },
    aiCache: {},
    space: { report: {}, clinic: {}, qa: {}, tutor: {}, article: {} },
    rootsView: { sort: 'size', hideSmall: true },
    dict: { provider: 'freezh', enabled: ['freezh'], merge: true, custom: [], keys: {} },
    dictCache: {},
    quiz: {
      config: {
        scope: 'mixed', count: 10, types: ['en2zh', 'zh2en', 'cloze', 'audio2word'],
        difficulty: 'auto', online: true, theme: ''
      },
      ability: 0.5, answered: 0, correct: 0, streak: 0, history: {}
    },
    quizExamples: {},
    exams: { progress: {}, wrong: [], aiCache: {} },
    background: { image: '', veil: 38, blur: 0 }
  };

  let data = null;
  let saveTimer = null;
  let flushHook = null;
  function setFlushHook(fn) { flushHook = fn; }

  function pad(n) { return String(n).padStart(2, '0'); }
  function dateKey(d) { const x = d || new Date(); return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate()); }
  function today() { return dateKey(new Date()); }

  // 词典配置：内置 id + 用户添加的自定义词典，enabled 为启用顺序（优先级）。
  // Key 统一放 keys[id]，自定义词典条目本身不含密钥，便于落盘加密与备份剔除。
  const DICT_BUILTIN = ['freezh', 'uapis', 'free', 'mw'];
  const DICT_FORMATS = ['auto', 'youdao', 'uapis', 'free', 'mw'];
  const DICT_AUTH = ['none', 'bearer', 'query', 'header'];
  function normalizeDict(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const d = { provider: 'freezh', enabled: ['freezh'], merge: src.merge !== false, custom: [], keys: {} };
    if (src.keys && typeof src.keys === 'object' && !Array.isArray(src.keys)) {
      Object.keys(src.keys).forEach(id => {
        const v = src.keys[id];
        // 空串是主进程解密失败的占位：保留 id，让密文不被下一次落盘抹掉。
        if (typeof v === 'string') d.keys[id] = v.trim();
      });
    }
    (Array.isArray(src.custom) ? src.custom : []).forEach((c, i) => {
      if (!c || typeof c !== 'object') return;
      const base = typeof c.base === 'string' ? c.base.trim() : '';
      const id = typeof c.id === 'string' && c.id.trim() ? c.id.trim() : 'custom-' + (i + 1);
      if (!base || d.custom.some(x => x.id === id)) return;
      const name = typeof c.name === 'string' && c.name.trim() ? c.name.trim() : '自定义词典';
      d.custom.push({
        id, name: name.slice(0, 20), base,
        format: DICT_FORMATS.includes(c.format) ? c.format : 'auto',
        auth: DICT_AUTH.includes(c.auth) ? c.auth : 'bearer',
        headerName: typeof c.headerName === 'string' ? c.headerName.trim().slice(0, 40) : ''
      });
    });
    // 旧版单选配置迁移：provider + key + base（自定义端点）→ enabled / keys / custom。
    const legacyProvider = typeof src.provider === 'string' && src.provider ? src.provider : '';
    const legacyKey = typeof src.key === 'string' ? src.key.trim() : '';
    const legacyBase = typeof src.base === 'string' ? src.base.trim() : '';
    if (legacyKey && legacyProvider && (legacyProvider !== 'custom' || !legacyBase) && !d.keys[legacyProvider]) d.keys[legacyProvider] = legacyKey;
    let legacyId = legacyProvider;
    if (legacyProvider === 'custom' && legacyBase && !d.custom.some(c => c.base === legacyBase)) {
      legacyId = 'custom-1';
      let n = 1;
      while (d.custom.some(c => c.id === legacyId)) legacyId = 'custom-' + (++n);
      d.custom.push({ id: legacyId, name: '自定义词典', base: legacyBase, format: 'auto', auth: legacyKey ? 'bearer' : 'none', headerName: '' });
      if (legacyKey && !d.keys[legacyId]) d.keys[legacyId] = legacyKey;
    }
    const known = id => DICT_BUILTIN.includes(id) || d.custom.some(c => c.id === id);
    if (Array.isArray(src.enabled)) {
      const seen = new Set();
      d.enabled = src.enabled.filter(id => typeof id === 'string' && known(id) && !seen.has(id) && seen.add(id));
    } else {
      d.enabled = known(legacyId) ? [legacyId] : ['freezh'];
    }
    d.provider = d.enabled[0] || (known(legacyId) ? legacyId : 'freezh');
    return d;
  }

  function normalize(raw) {
    const d = Object.assign({}, raw || {});
    for (const k of Object.keys(DEFAULTS)) {
      if (d[k] === undefined || d[k] === null) d[k] = JSON.parse(JSON.stringify(DEFAULTS[k]));
    }
    d.plan = Object.assign({ newPerDay: 20, reviewCap: 0 }, d.plan || {});
    if (!d.profile || typeof d.profile !== 'object' || Array.isArray(d.profile)) d.profile = { nickname: '', avatar: '' };
    d.profile.nickname = typeof d.profile.nickname === 'string' ? d.profile.nickname.trim().slice(0, 16) : '';
    d.profile.avatar = typeof d.profile.avatar === 'string' && /^data:image\/[a-z]+;base64,/i.test(d.profile.avatar) ? d.profile.avatar : '';
    if (!Array.isArray(d.favGroups) || !d.favGroups.length) d.favGroups = ['默认'];
    d.customThemes = normalizeCustomThemes(d.customThemes);
    if (!Array.isArray(d.history)) d.history = [];
    if (!d.views || typeof d.views !== 'object') d.views = {};
    if (!d.studyPanel || typeof d.studyPanel !== 'object' || Array.isArray(d.studyPanel)) d.studyPanel = {};
    d.studyPanel = Object.assign({}, DEFAULTS.studyPanel, d.studyPanel);
    const panelIds = DEFAULTS.studyPanelOrder;
    // 旧版弹层卡片顺序已废除：没有新顺序时它整段接管，否则只补缺失的块。
    if (Array.isArray(d.cardOrder)) {
      const legacy = d.cardOrder.filter((id, i) => panelIds.includes(id) && d.cardOrder.indexOf(id) === i);
      d.studyPanelOrder = Array.isArray(raw && raw.studyPanelOrder) ? d.studyPanelOrder : legacy;
      delete d.cardOrder;
    }
    if (!Array.isArray(d.studyPanelOrder)) d.studyPanelOrder = [];
    const savedOrder = d.studyPanelOrder.filter((id, i) => panelIds.includes(id) && d.studyPanelOrder.indexOf(id) === i);
    d.studyPanelOrder = savedOrder.concat(panelIds.filter(id => !savedOrder.includes(id)));
    d.progressBars = d.progressBars !== false;
    if (!d.bookFilter || typeof d.bookFilter !== 'object' || Array.isArray(d.bookFilter)) d.bookFilter = { skipLower: false, skipKnown: false, skipBasic: true, excludeBooks: [] };
    else d.bookFilter = {
      skipLower: d.bookFilter.skipLower === true,
      skipKnown: d.bookFilter.skipKnown === true,
      skipBasic: d.bookFilter.skipBasic !== false,
      excludeBooks: Array.isArray(d.bookFilter.excludeBooks) ? d.bookFilter.excludeBooks.filter(t => typeof t === 'string' && t) : []
    };
    if (!['blue', 'green', 'yellow', 'gray', 'black', 'paper', 'sakura', 'violet'].includes(d.theme)) d.theme = 'blue';
    if (!d.fsrs || typeof d.fsrs !== 'object') d.fsrs = { w: null, seqs: {}, count: 0, lastOpt: 0 };
    if (!d.fsrs.seqs || typeof d.fsrs.seqs !== 'object') d.fsrs.seqs = {};
    if (!d.ai || typeof d.ai !== 'object') d.ai = { provider: 'deepseek', key: '', model: '', base: '', enabled: false };
    else d.ai = Object.assign({ provider: 'deepseek', key: '', model: '', base: '', enabled: false }, d.ai);
    delete d.ai.autoExplain;
    // 开发期内置免费服务商已随其 Key 一起移除：旧存档回落默认服务商，并清掉残留的开发模型名。
    if (['devfree', 'qnafree', 'qwenmaas'].indexOf(d.ai.provider) >= 0) { d.ai.provider = 'deepseek'; d.ai.model = ''; }
    if (!d.aiCache || typeof d.aiCache !== 'object') d.aiCache = {};
    d.space = normalizeSpace(d.space);
    if (!d.rootsView || typeof d.rootsView !== 'object' || Array.isArray(d.rootsView)) d.rootsView = { sort: 'size', hideSmall: true };
    else d.rootsView = { sort: d.rootsView.sort === 'alpha' ? 'alpha' : 'size', hideSmall: d.rootsView.hideSmall !== false };
    d.dict = normalizeDict(d.dict);
    if (!d.dictCache || typeof d.dictCache !== 'object') d.dictCache = {};
    if (!d.quizExamples || typeof d.quizExamples !== 'object') d.quizExamples = {};
    d.exams = normalizeExams(d.exams);
    if (!d.quiz || typeof d.quiz !== 'object') d.quiz = {};
    const QSCOPES = ['book', 'theme', 'favorites', 'errors', 'due', 'mixed'];
    const QTYPES = ['en2zh', 'zh2en', 'cloze', 'audio2word'];
    const qc = d.quiz.config && typeof d.quiz.config === 'object' ? d.quiz.config : {};
    const qtypes = Array.isArray(qc.types) ? qc.types.filter((t, i) => QTYPES.includes(t) && qc.types.indexOf(t) === i) : [];
    // Users who kept the old default trio get the new listening type once; a
    // deliberate custom subset is left untouched.
    if (qtypes.length === 3 && ['en2zh', 'zh2en', 'cloze'].every(t => qtypes.includes(t))) qtypes.push('audio2word');
    d.quiz.config = {
      scope: QSCOPES.includes(qc.scope) ? qc.scope : 'mixed',
      count: [5, 10, 20].includes(qc.count) ? qc.count : 10,
      types: qtypes.length ? qtypes : QTYPES.slice(),
      difficulty: ['auto', 'easy', 'normal', 'hard'].includes(qc.difficulty) ? qc.difficulty : 'auto',
      online: qc.online !== false,
      theme: typeof qc.theme === 'string' ? qc.theme : '',
      explore: Math.max(0, Math.min(40, Math.round(Number(qc.explore ?? 20) || 0))),
      confusion: qc.confusion !== false,
      curated: qc.curated !== false
    };
    d.quiz.ability = typeof d.quiz.ability === 'number' ? Math.max(0.05, Math.min(0.95, d.quiz.ability)) : 0.5;
    d.quiz.answered = Math.max(0, Number(d.quiz.answered) || 0);
    d.quiz.correct = Math.max(0, Number(d.quiz.correct) || 0);
    d.quiz.streak = Math.trunc(Number(d.quiz.streak) || 0);
    if (!d.quiz.history || typeof d.quiz.history !== 'object' || Array.isArray(d.quiz.history)) d.quiz.history = {};
    Object.keys(d.quiz.history).forEach(w => {
      const h = d.quiz.history[w];
      if (!h || typeof h !== 'object') { delete d.quiz.history[w]; return; }
      if (h.mix) d.quiz.history[w].mix = cleanMix(h.mix);
    });
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
    if (flushHook) { try { flushHook(); } catch (e) { /* hook must never break saving */ } }
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

  // custom theme groups (自定义专项词组)
  function normalizeCustomThemes(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [], ids = new Set();
    raw.forEach(t => {
      if (!t || typeof t !== 'object' || typeof t.id !== 'string' || !t.id || ids.has(t.id)) return;
      const name = typeof t.name === 'string' ? t.name.trim().slice(0, 20) : '';
      if (!name) return;
      const words = [];
      (Array.isArray(t.words) ? t.words : []).forEach(w => { if (typeof w === 'string' && w && !words.includes(w)) words.push(w); });
      ids.add(t.id);
      out.push({ id: t.id, name, words, ts: +t.ts || 0 });
    });
    return out;
  }
  function customThemes() { return data.customThemes; }
  function createCustomTheme(name) {
    name = String(name || '').trim().slice(0, 20);
    if (!name) return { ok: false, error: '分组名不能为空' };
    if (data.customThemes.some(t => t.name === name)) return { ok: false, error: '已有同名分组' };
    const t = { id: 'ct_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, words: [], ts: Date.now() };
    data.customThemes.push(t); save();
    return { ok: true, theme: t };
  }
  function renameCustomTheme(id, name) {
    name = String(name || '').trim().slice(0, 20);
    const t = data.customThemes.find(x => x.id === id);
    if (!t || !name || data.customThemes.some(x => x.id !== id && x.name === name)) return false;
    t.name = name; t.ts = Date.now(); save(); return true;
  }
  function removeCustomTheme(id) { data.customThemes = data.customThemes.filter(t => t.id !== id); save(); }
  function addWordsToCustomTheme(id, words) {
    const t = data.customThemes.find(x => x.id === id);
    if (!t) return 0;
    let n = 0;
    (Array.isArray(words) ? words : [words]).forEach(w => { if (typeof w === 'string' && w && !t.words.includes(w)) { t.words.push(w); n++; } });
    if (n) { t.ts = Date.now(); save(); }
    return n;
  }
  function removeWordFromCustomTheme(id, word) {
    const t = data.customThemes.find(x => x.id === id);
    if (!t) return;
    t.words = t.words.filter(w => w !== word); t.ts = Date.now(); save();
  }

  // search history
  function addHistory(word) {
    if (typeof word !== 'string' || !word.trim()) return;
    word = word.trim();
    data.history = data.history.filter(h => h.word !== word);
    data.history.unshift({ word, ts: Date.now() });
    if (data.history.length > 100) data.history.length = 100;
    save();
  }
  function clearHistory() { data.history = []; save(); }

  // ===================== exam practice（真题刷题） =====================
  const EXAM_ID_RE = /^\d{4}-\d{2}[-_]\d{2}$/;
  const SPACE_KINDS = ['report', 'clinic', 'qa', 'tutor', 'article'];
  const SPACE_CAPS = { report: 14, clinic: 300, qa: 100, tutor: 60, article: 30 };
  const ARTICLE_RANGES = ['s', 'm', 'l'];
  const TUTOR_MINUTES = [10, 15, 20, 30];
  const TUTOR_FOCUS = ['auto', 'due', 'errors', 'study'];
  const TUTOR_STRATEGY = ['teach', 'guide', 'recite'];
  function normalizeTutorSession(v) {
    if (!v || typeof v.date !== 'string' || !Array.isArray(v.steps)) return null;
    const steps = v.steps.slice(0, 24).map(s => {
      if (!s || !['review', 'clinic', 'study'].includes(s.kind)) return null;
      const words = Array.isArray(s.words) ? s.words.filter(w => typeof w === 'string' && w).slice(0, 12) : [];
      if (s.kind !== 'study' && !words.length) return null;
      if (s.kind === 'study' && typeof s.studyId !== 'string') return null;
      return { kind: s.kind, words, studyId: String(s.studyId || ''), title: String(s.title || '').slice(0, 80) };
    }).filter(Boolean);
    if (!steps.length) return null;
    const picks = {};
    if (v.picks && typeof v.picks === 'object') Object.keys(v.picks).slice(0, 400).forEach(k => { if (typeof v.picks[k] === 'string') picks[k] = v.picks[k].slice(0, 200); });
    const revealed = {};
    if (v.revealed && typeof v.revealed === 'object') Object.keys(v.revealed).slice(0, 40).forEach(k => { revealed[k] = !!v.revealed[k]; });
    const qa = Array.isArray(v.qa) ? v.qa.filter(x => x && typeof x.q === 'string' && typeof x.a === 'string').slice(-40) : [];
    return {
      date: v.date.slice(0, 10), steps, idx: Math.min(Math.max(+v.idx || 0, 0), steps.length),
      picks, revealed, qa,
      wrong: Array.isArray(v.wrong) ? v.wrong.filter(w => typeof w === 'string').slice(0, 60) : [],
      correct: +v.correct || 0, total: +v.total || 0,
      startedAt: +v.startedAt || 0, done: !!v.done, t: +v.t || 0
    };
  }
  function normalizeSpace(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { report: {}, clinic: {}, qa: {}, tutor: {}, article: {} };
    SPACE_KINDS.forEach(kind => {
      const bag = src[kind] && typeof src[kind] === 'object' ? src[kind] : {};
      Object.keys(bag).forEach(k => {
        const v = bag[k];
        if (!v || typeof v !== 'object') return;
        if (kind === 'qa') {
          const turns = Array.isArray(v.turns) ? v.turns.filter(x => x && typeof x.q === 'string' && typeof x.a === 'string').slice(-40) : [];
          if (!turns.length) return;
          out.qa[k] = { turns, t: +v.t || 0, provider: String(v.provider || ''), model: String(v.model || '') };
        } else if (kind === 'tutor' && k === 'plan') {
          out.tutor[k] = {
            minutes: TUTOR_MINUTES.includes(+v.minutes) ? +v.minutes : 15,
            focus: TUTOR_FOCUS.includes(v.focus) ? v.focus : 'auto',
            strategy: TUTOR_STRATEGY.includes(v.strategy) ? v.strategy : 'teach',
            t: +v.t || 0
          };
        } else if (kind === 'tutor' && k === 'session') {
          const s = normalizeTutorSession(v);
          if (s) out.tutor[k] = s;
        } else if (kind === 'article' && k === 'prefs') {
          out.article[k] = { range: ARTICLE_RANGES.includes(v.range) ? v.range : 'm', t: +v.t || 0 };
        } else if (kind === 'article') {
          const paras = Array.isArray(v.paras) ? v.paras.filter(p => p && typeof p.en === 'string' && p.en.trim()).slice(0, 8).map(p => ({ en: p.en.slice(0, 2000), zh: String(p.zh || '').slice(0, 2000) })) : [];
          if (!paras.length) return;
          out.article[k] = {
            paras,
            words: Array.isArray(v.words) ? v.words.filter(w => typeof w === 'string' && w).slice(0, 20) : [],
            range: ARTICLE_RANGES.includes(v.range) ? v.range : 'm',
            t: +v.t || 0, provider: String(v.provider || ''), model: String(v.model || '')
          };
        } else {
          if (typeof v.text !== 'string' || !v.text.trim()) return;
          out[kind][k] = { text: v.text.slice(0, 4000), t: +v.t || 0, provider: String(v.provider || ''), model: String(v.model || '') };
        }
      });
      const keys = Object.keys(out[kind]).sort((a, b) => (out[kind][b].t || 0) - (out[kind][a].t || 0));
      // tutor plan/session are the live learning record: never evict them by cache cap.
      const evictable = kind === 'tutor' ? keys.filter(k => k !== 'plan' && k !== 'session') : keys;
      evictable.slice(SPACE_CAPS[kind]).forEach(k => { delete out[kind][k]; });
    });
    return out;
  }
  function spaceGet(kind, key) { return (data.space[kind] || {})[key] || null; }
  function spaceSet(kind, key, rec) {
    if (!SPACE_KINDS.includes(kind) || typeof key !== 'string' || !key) return;
    data.space = normalizeSpace(Object.assign({}, data.space, { [kind]: Object.assign({}, data.space[kind], { [key]: rec }) }));
    save();
  }
  function spaceDel(kind, key) {
    if (!SPACE_KINDS.includes(kind) || !data.space[kind] || !(key in data.space[kind])) return;
    delete data.space[kind][key];
    save();
  }

  const EXAM_TYPES = ['reading', 'matching', 'writing', 'translation', 'cloze', 'listening'];
  function normalizeExams(raw) {
    const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const out = { progress: {}, wrong: [], aiCache: {} };
    if (src.progress && typeof src.progress === 'object') {
      for (const id of Object.keys(src.progress)) {
        if (!EXAM_ID_RE.test(id)) continue;
        const p = src.progress[id];
        if (!p || typeof p !== 'object') continue;
        const a = {};
        if (p.a && typeof p.a === 'object') for (const key of Object.keys(p.a)) {
          const no = +key;
          if (!(no >= 1 && no <= 57)) continue;
          const r = p.a[key];
          if (!r || typeof r !== 'object') continue;
          a[no] = { p: typeof r.p === 'string' ? r.p.slice(0, 200) : '', ok: r.ok === 1 ? 1 : r.ok === 0 ? 0 : -1, m: ['auto', 'self', 'ai', 'pick'].includes(r.m) ? r.m : 'self', t: +r.t || 0 };
        }
        const done = {};
        if (p.done && typeof p.done === 'object') for (const ty of Object.keys(p.done)) {
          if (EXAM_TYPES.includes(ty)) done[ty] = +p.done[ty] || 0;
        }
        out.progress[id] = { a, done, at: +p.at || 0 };
      }
    }
    if (Array.isArray(src.wrong)) src.wrong.forEach(w => {
      if (!w || typeof w !== 'object' || !EXAM_ID_RE.test(w.examId || '')) return;
      const no = +w.no;
      if (!(no >= 1 && no <= 57)) return;
      if (out.wrong.some(x => x.examId === w.examId && x.no === no)) return;
      out.wrong.push({ examId: w.examId, no, type: typeof w.type === 'string' ? w.type : 'reading', t: +w.t || 0 });
    });
    out.wrong = out.wrong.slice(0, 300);
    if (src.aiCache && typeof src.aiCache === 'object') for (const k of Object.keys(src.aiCache)) {
      const v = src.aiCache[k];
      if (!v || typeof v !== 'object' || typeof v.text !== 'string') continue;
      out.aiCache[k] = { text: v.text.slice(0, 4000), t: +v.t || 0, provider: typeof v.provider === 'string' ? v.provider : '', model: typeof v.model === 'string' ? v.model : '' };
    }
    return out;
  }
  function examProgress(examId) { return data.exams.progress[examId] || null; }
  function examAnswer(examId, no, type, pick, ok, mode) {
    if (!EXAM_ID_RE.test(String(examId || '')) || !(no >= 1 && no <= 57)) return;
    const now = Date.now();
    let p = data.exams.progress[examId];
    if (!p) { p = data.exams.progress[examId] = { a: {}, done: {}, at: 0 }; }
    p.a[no] = { p: String(pick == null ? '' : pick).slice(0, 200), ok: ok === 1 ? 1 : ok === 0 ? 0 : -1, m: ['auto', 'self', 'ai', 'pick'].includes(mode) ? mode : 'self', t: now };
    p.at = now;
    data.exams.wrong = data.exams.wrong.filter(w => !(w.examId === examId && w.no === no));
    if (ok === 0) {
      data.exams.wrong.unshift({ examId, no, type: EXAM_TYPES.includes(type) ? type : 'reading', t: now });
      if (data.exams.wrong.length > 300) data.exams.wrong.length = 300;
    }
    save();
  }
  function examFinish(examId, type) {
    if (!EXAM_ID_RE.test(String(examId || '')) || !EXAM_TYPES.includes(type)) return;
    let p = data.exams.progress[examId];
    if (!p) { p = data.exams.progress[examId] = { a: {}, done: {}, at: 0 }; }
    p.done[type] = Date.now(); p.at = p.done[type];
    save();
  }
  function examWrong() { return data.exams.wrong.slice(); }
  function removeExamWrong(examId, no) {
    data.exams.wrong = data.exams.wrong.filter(w => !(w.examId === examId && w.no === no));
    save();
  }
  function examAi(key) { return data.exams.aiCache[key] || null; }
  function saveExamAi(key, text, provider, model) {
    if (typeof key !== 'string' || !key || typeof text !== 'string' || !text.trim()) return;
    data.exams.aiCache[key] = { text: text.slice(0, 4000), t: Date.now(), provider: String(provider || ''), model: String(model || '') };
    const keys = Object.keys(data.exams.aiCache);
    if (keys.length > 300) {
      keys.sort((a, b) => (data.exams.aiCache[a].t || 0) - (data.exams.aiCache[b].t || 0));
      keys.slice(0, keys.length - 300).forEach(k => { delete data.exams.aiCache[k]; });
    }
    save();
  }

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
  function syncDictPrimary() { data.dict.provider = data.dict.enabled[0] || data.dict.provider; }
  function setDictConfig(patch) { Object.assign(data.dict, patch || {}); syncDictPrimary(); save(); }
  function dictKey(id) { return data.dict.keys[id] || ''; }
  function setDictKey(id, key) {
    const v = String(key == null ? '' : key).trim();
    if (v) data.dict.keys[id] = v; else delete data.dict.keys[id];
    save();
  }
  function setDictEnabled(id, on) {
    const list = data.dict.enabled, i = list.indexOf(id);
    if (on && i < 0) list.push(id);
    if (!on && i >= 0) list.splice(i, 1);
    syncDictPrimary();
    save();
  }
  function moveDictSource(id, delta) {
    const list = data.dict.enabled, i = list.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return false;
    list.splice(i, 1); list.splice(j, 0, id);
    syncDictPrimary();
    save();
    return true;
  }
  function addDictSource(entry) {
    const base = String((entry && entry.base) || '').trim();
    if (!base) return null;
    let n = 1;
    while (data.dict.custom.some(c => c.id === 'custom-' + n)) n++;
    const id = 'custom-' + n;
    const src = normalizeDict({ custom: [Object.assign({}, entry, { id, base })] }).custom[0];
    data.dict.custom.push(src);
    if (entry && entry.key) setDictKey(id, entry.key);
    data.dict.enabled.push(id);
    syncDictPrimary();
    save();
    return id;
  }
  function updateDictSource(id, patch) {
    const c = data.dict.custom.find(x => x.id === id);
    if (!c) return false;
    const next = normalizeDict({ custom: [Object.assign({}, c, patch, { id })] }).custom[0];
    if (!next) return false;
    Object.assign(c, next);
    if (patch && patch.key !== undefined) setDictKey(id, patch.key);
    save();
    return true;
  }
  function removeDictSource(id) {
    const i = data.dict.custom.findIndex(x => x.id === id);
    if (i < 0) return false;
    data.dict.custom.splice(i, 1);
    const e = data.dict.enabled.indexOf(id);
    if (e >= 0) data.dict.enabled.splice(e, 1);
    delete data.dict.keys[id];
    syncDictPrimary();
    save();
    return true;
  }
  function dictEntry(word) { return data.dictCache[word] || null; }
  function saveDictEntry(word, record) { data.dictCache[word] = record; save(); }
  function deleteDictEntry(word) { delete data.dictCache[word]; save(); }
  function dictWords() { return Object.keys(data.dictCache).sort((a, b) => (data.dictCache[b].ts || 0) - (data.dictCache[a].ts || 0)); }

  // quiz: configuration, adaptive ability and per-word test history
  // mix maps keep the top 8 recorded confusion partners per word so backups stay bounded
  function cleanMix(mix) {
    if (!mix || typeof mix !== 'object' || Array.isArray(mix)) return undefined;
    const pairs = Object.keys(mix)
      .map(w => [w, Math.max(0, Math.trunc(Number(mix[w]) || 0))])
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]).slice(0, 8);
    if (!pairs.length) return undefined;
    const out = {};
    pairs.forEach(([w, n]) => { out[w] = n; });
    return out;
  }
  function setQuizConfig(patch) { Object.assign(data.quiz.config, patch || {}); save(); }
  function recordQuizResult(word, correct, difficulty, chosenWord) {
    const q = data.quiz;
    q.answered = (q.answered || 0) + 1;
    if (correct) { q.correct = (q.correct || 0) + 1; q.streak = Math.max(1, (q.streak || 0) + 1); }
    else q.streak = Math.min(-1, (q.streak || 0) - 1);
    q.ability = Math.max(0.05, Math.min(0.95, (q.ability ?? 0.5) + (correct ? 0.035 : -0.055)));
    const h = q.history[word] || (q.history[word] = { n: 0, correct: 0, wrong: 0, last: 0 });
    h.n++; if (correct) h.correct++; else h.wrong++;
    h.last = Date.now();
    if (typeof difficulty === 'number') h.diff = difficulty;
    if (!correct && typeof chosenWord === 'string' && chosenWord && chosenWord !== word) {
      const mix = h.mix || (h.mix = {});
      mix[chosenWord] = (mix[chosenWord] || 0) + 1;
      const capped = cleanMix(mix);
      if (capped) h.mix = capped; else delete h.mix;
    }
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

  function setProfile(patch) {
    const p = patch || {};
    if (!data.profile) data.profile = { nickname: '', avatar: '' };
    if (typeof p.nickname === 'string') data.profile.nickname = p.nickname.trim().slice(0, 16);
    if (typeof p.avatar === 'string') data.profile.avatar = /^data:image\/[a-z]+;base64,/i.test(p.avatar) ? p.avatar : '';
    save();
  }

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
    const ai = Object.assign({}, data.ai || {}); delete ai.key; delete ai.keyEnc;
    const dict = Object.assign({}, data.dict || {});
    delete dict.key; delete dict.keyEnc; delete dict.keys; delete dict.keysEnc;
    dict.custom = (dict.custom || []).map(c => {
      const x = Object.assign({}, c); delete x.key; delete x.keyEnc; return x;
    });
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
        space: clone(data.space || { report: {}, clinic: {}, qa: {}, tutor: {}, article: {} }),
        customBooks: clone(data.customBooks || {}),
        customThemes: clone(data.customThemes || []),
        quiz: clone(data.quiz || {}), quizExamples: clone(data.quizExamples || {}),
        exams: clone(data.exams || { progress: {}, wrong: [], aiCache: {} }),
        settings: {
          plan: clone(data.plan), activeBook: data.activeBook,
          studyPanel: clone(data.studyPanel || {}), studyPanelOrder: (data.studyPanelOrder || []).slice(), theme: data.theme || 'blue',
          rootsView: clone(data.rootsView || { sort: 'size', hideSmall: true }),
          autoSpeak: data.autoSpeak, preferAudio: data.preferAudio, ttsRate: data.ttsRate, ttsLang: data.ttsLang,
          profile: { nickname: data.profile.nickname, avatar: data.profile.avatar },
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
      const types = Array.isArray(c.types) ? c.types.filter(t => ['en2zh', 'zh2en', 'cloze', 'audio2word'].includes(t)) : [];
      if (types.length === 3 && ['en2zh', 'zh2en', 'cloze'].every(t => types.includes(t))) types.push('audio2word');
      q.config = {
        scope: ['book', 'theme', 'favorites', 'errors', 'due', 'mixed'].includes(c.scope) ? c.scope : 'mixed',
        count: [5, 10, 20].includes(c.count) ? c.count : 10,
        types: types.length ? types : DEFAULTS.quiz.config.types.slice(),
        difficulty: ['auto', 'easy', 'normal', 'hard'].includes(c.difficulty) ? c.difficulty : 'auto',
        online: c.online !== false,
        theme: typeof c.theme === 'string' ? c.theme : '',
        explore: Math.max(0, Math.min(40, Math.round(Number(c.explore ?? 20) || 0))),
        confusion: c.confusion !== false,
        curated: c.curated !== false
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
        if (!cur) q.history[w] = { n: h.n || 0, correct: h.correct || 0, wrong: h.wrong || 0, last: h.last || 0, diff: h.diff, mix: cleanMix(h.mix) };
        else {
          cur.n += h.n || 0; cur.correct += h.correct || 0; cur.wrong += h.wrong || 0;
          cur.last = Math.max(cur.last || 0, h.last || 0);
          if (typeof h.diff === 'number') cur.diff = h.diff;
          if (isObj(h.mix)) {
            const mix = cur.mix || (cur.mix = {});
            Object.keys(h.mix).forEach(o => { mix[o] = (mix[o] || 0) + Math.max(0, Math.trunc(Number(h.mix[o]) || 0)); });
            const capped = cleanMix(mix);
            if (capped) cur.mix = capped; else delete cur.mix;
          }
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
      data.history = []; data.favGroups = ['默认']; data.customThemes = []; data.aiCache = {}; data.dictCache = {};
      data.quizExamples = {};
      data.quiz = { config: clone(DEFAULTS.quiz.config), ability: 0.5, answered: 0, correct: 0, streak: 0, history: {} };
      data.exams = { progress: {}, wrong: [], aiCache: {} };
      data.space = { report: {}, clinic: {}, qa: {}, tutor: {}, article: {} };
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
      if (Array.isArray(src.customThemes)) {
        normalizeCustomThemes(src.customThemes).forEach(t => {
          const cur = data.customThemes.find(x => x.id === t.id);
          if (!cur) { data.customThemes.push(t); return; }
          t.words.forEach(w => { if (!cur.words.includes(w)) cur.words.push(w); });
          if (t.ts > cur.ts) { cur.name = t.name; cur.ts = t.ts; }
        });
      }
      if (Array.isArray(src.history)) data.history = mergeHistory(data.history, src.history);
      if (isObj(src.errors)) for (const w of Object.keys(src.errors)) {
        const e = src.errors[w]; if (!isObj(e)) continue;
        const cur = data.errors[w];
        if (!cur || (e.count || 0) > (cur.count || 0)) data.errors[w] = { count: e.count || 0, last: e.last || 0 };
        else cur.last = Math.max(cur.last || 0, e.last || 0);
      }
      if (isObj(src.aiCache)) for (const w of Object.keys(src.aiCache)) if (isObj(src.aiCache[w])) data.aiCache[w] = src.aiCache[w];
      if (isObj(src.space)) {
        const sp = normalizeSpace(src.space);
        SPACE_KINDS.forEach(kind => {
          Object.keys(sp[kind]).forEach(k => {
            const v = sp[kind][k], cur = data.space[kind][k];
            if (kind === 'qa' && cur && Array.isArray(cur.turns)) {
              const seen = new Set(cur.turns.map(x => x.q + '|' + x.t));
              const turns = cur.turns.concat(v.turns.filter(x => !seen.has(x.q + '|' + x.t))).sort((a, b) => (a.t || 0) - (b.t || 0)).slice(-40);
              data.space.qa[k] = { turns, t: Math.max(cur.t || 0, v.t || 0), provider: v.provider || cur.provider, model: v.model || cur.model };
            } else if (!cur || (v.t || 0) >= (cur.t || 0)) data.space[kind][k] = v;
          });
        });
      }
      if (isObj(src.dictCache)) for (const w of Object.keys(src.dictCache)) if (isObj(src.dictCache[w])) data.dictCache[w] = src.dictCache[w];
      if (isObj(src.customBooks)) for (const k of Object.keys(src.customBooks)) if (isObj(src.customBooks[k])) data.customBooks[k] = src.customBooks[k];
      if (isObj(src.quiz)) mergeQuiz(src.quiz, replace);
      if (isObj(src.exams)) {
        const ex = normalizeExams(src.exams);
        for (const id of Object.keys(ex.progress)) {
          const cur = data.exams.progress[id];
          if (!cur) { data.exams.progress[id] = ex.progress[id]; continue; }
          for (const no of Object.keys(ex.progress[id].a)) {
            const r = ex.progress[id].a[no];
            if (!cur.a[no] || r.t >= cur.a[no].t) cur.a[no] = r;
          }
          for (const ty of Object.keys(ex.progress[id].done)) cur.done[ty] = Math.max(cur.done[ty] || 0, ex.progress[id].done[ty]);
          cur.at = Math.max(cur.at || 0, ex.progress[id].at || 0);
        }
        ex.wrong.forEach(w => {
          if (!data.exams.wrong.some(x => x.examId === w.examId && x.no === w.no)) data.exams.wrong.push(w);
        });
        data.exams.wrong.sort((a, b) => b.t - a.t);
        if (data.exams.wrong.length > 300) data.exams.wrong.length = 300;
        for (const k of Object.keys(ex.aiCache)) {
          const v = ex.aiCache[k];
          if (!data.exams.aiCache[k] || v.t >= data.exams.aiCache[k].t) data.exams.aiCache[k] = v;
        }
      }
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
        if (isObj(s.studyPanel)) data.studyPanel = Object.assign({}, DEFAULTS.studyPanel, s.studyPanel);
        if (Array.isArray(s.studyPanelOrder) && s.studyPanelOrder.length) data.studyPanelOrder = s.studyPanelOrder.slice();
        else if (Array.isArray(s.cardOrder)) {
          const legacy = s.cardOrder.filter((id, i) => DEFAULTS.studyPanelOrder.includes(id) && s.cardOrder.indexOf(id) === i);
          data.studyPanelOrder = legacy.concat(DEFAULTS.studyPanelOrder.filter(id => !legacy.includes(id)));
        }
        if (['blue', 'green', 'yellow', 'gray', 'black', 'paper', 'sakura', 'violet'].includes(s.theme)) data.theme = s.theme;
        if (isObj(s.rootsView)) data.rootsView = { sort: s.rootsView.sort === 'alpha' ? 'alpha' : 'size', hideSmall: s.rootsView.hideSmall !== false };
        ['autoSpeak', 'preferAudio'].forEach(k => { if (typeof s[k] === 'boolean') data[k] = s[k]; });
        if (typeof s.ttsRate === 'number') data.ttsRate = s.ttsRate;
        if (typeof s.ttsLang === 'string') data.ttsLang = s.ttsLang;
        const keepAi = data.ai.key || '';
        if (isObj(s.ai)) data.ai = Object.assign({}, data.ai, s.ai, { key: keepAi });
        delete data.ai.autoExplain;
        const keepDictKeys = Object.assign({}, data.dict.keys);
        if (isObj(s.dict)) {
          data.dict = normalizeDict(Object.assign({}, s.dict, { keys: keepDictKeys }));
          // 备份不含 Key：导入的自定义词典若与本机同 id，沿用本机已存的 Key。
          data.dict.keys = keepDictKeys;
        }
        if (isObj(s.background)) {
          if (typeof s.background.veil === 'number') data.background.veil = Math.max(0, Math.min(80, s.background.veil));
          if (typeof s.background.blur === 'number') data.background.blur = Math.max(0, Math.min(16, s.background.blur));
        }
        if (isObj(s.profile)) {
          if (typeof s.profile.nickname === 'string') data.profile.nickname = s.profile.nickname.trim().slice(0, 16);
          if (typeof s.profile.avatar === 'string' && /^data:image\/[a-z]+;base64,/i.test(s.profile.avatar)) data.profile.avatar = s.profile.avatar;
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
    load, save, flush, setFlushHook, get data() { return data; },
    today, dateKey, getLog, recordGrade, planProgress, streak, mastery, trend,
    isFavorite, addFavorite, removeFavorite, favoriteWords, addFavGroup,
    customThemes, createCustomTheme, renameCustomTheme, removeCustomTheme, addWordsToCustomTheme, removeWordFromCustomTheme,
    addHistory, clearHistory, addError, clearError, errorWords,
    recordView, viewInfo, viewCount, topViews, totalViews, viewedWordCount,
    exportData, importData,
    defaultPanelOrder: () => DEFAULTS.studyPanelOrder.slice(),
    setAiConfig, aiExplanation, saveAiExplanation, deleteAiExplanation, aiWords,
    spaceGet, spaceSet, spaceDel,
    setDictConfig, dictEntry, saveDictEntry, deleteDictEntry, dictWords,
    dictKey, setDictKey, setDictEnabled, moveDictSource, addDictSource, updateDictSource, removeDictSource,
    setQuizConfig, recordQuizResult, quizExamples, saveQuizExamples, setBackground, setProfile,
    examProgress, examAnswer, examFinish, examWrong, removeExamWrong, examAi, saveExamAi
  };
})();