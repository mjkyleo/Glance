// Glance 真题刷题引擎：manifest/分片懒加载、按题型组卷、三级判分（答案自动 → AI 分析 → 自评）。
// schema2 语料：少数套卷含官方答案（answers map，自动判分），其余 answers:null 留位；听力无音频暂不开刷；选词填空按「短文 + A–O 词库」开刷。
(function () {
  let manifest = null;
  const shards = new Map();
  const pending = new Map();

  function init(m) {
    manifest = m && Array.isArray(m.exams) ? m : null;
    shards.clear(); pending.clear();
  }
  function list() { return manifest ? manifest.exams : []; }
  function meta(examId) { return list().find(e => e.examId === examId) || null; }

  async function load(examId) {
    if (shards.has(examId)) return shards.get(examId);
    if (pending.has(examId)) return pending.get(examId);
    const p = (async () => {
      const ex = await Platform.loadExamShard(examId);
      if (ex && ex.examId === examId) shards.set(examId, ex);
      pending.delete(examId);
      return ex || null;
    })();
    pending.set(examId, p);
    return p;
  }

  function paragraphsOf(group) {
    const out = [];
    String(group.passage || '').split('\n').forEach(line => {
      const m = line.match(/^\[([A-O])\]\s*(.*)$/);
      if (m) out.push({ letter: m[1], text: m[2] });
      else if (out.length) out[out.length - 1].text += ' ' + line;
    });
    return out;
  }

  // 可刷题型：听力（无音频）不在此开刷；选词填空需词库与空位齐全
  function availableTypes(exam) {
    const out = [];
    const secs = exam.sections || [];
    if (secs.some(s => s.type === 'reading' && s.groups.some(g => g.questions.some(q => Object.keys(q.options).length >= 2)))) out.push('reading');
    if (secs.some(s => s.type === 'matching' && s.groups.some(g => g.questions.length && paragraphsOf(g).length))) out.push('matching');
    if (secs.some(s => s.type === 'cloze' && s.groups.some(g => g.questions.length && g.bank && Object.keys(g.bank).length >= 2))) out.push('cloze');
    if (exam.writing && (exam.writing.prompt || exam.writing.directions)) out.push('writing');
    if (exam.translation && exam.translation.passage) out.push('translation');
    return out;
  }

  // 组卷：阅读按「一段材料 + 一组题」为单位，匹配整组，选词整篇，写译单题——不整卷塞满
  function sessions(exam, type) {
    const out = [];
    for (const s of exam.sections || []) {
      if (s.type !== type) continue;
      for (const g of s.groups) {
        if (type === 'reading') {
          const qs = g.questions.filter(q => Object.keys(q.options).length >= 2);
          if (qs.length) out.push({ type, passage: g.passage || '', prompt: g.prompt || '', directions: s.directions || '', questions: qs });
        } else if (type === 'matching') {
          const paras = paragraphsOf(g);
          if (g.questions.length && paras.length) out.push({ type, paragraphs: paras, directions: s.directions || '', questions: g.questions.slice() });
        } else if (type === 'cloze') {
          if (g.questions.length && g.bank && Object.keys(g.bank).length >= 2) out.push({ type, passage: g.passage || '', bank: g.bank, directions: s.directions || '', questions: g.questions.slice() });
        }
      }
    }
    if (type === 'writing' && exam.writing) out.push({ type, directions: exam.writing.directions || '', prompt: exam.writing.prompt || '' });
    if (type === 'translation' && exam.translation) out.push({ type, directions: exam.translation.directions || '', passage: exam.translation.passage || '' });
    return out;
  }

  function answerOf(exam, no) {
    if (exam.answers && typeof exam.answers === 'object') {
      const v = exam.answers[no] || exam.answers[String(no)];
      if (typeof v === 'string' && /^[A-O]$/.test(v)) return v;
    }
    return null;
  }
  // 有官方答案 → 自动判分；否则交给 UI 走 AI / 自评
  function judge(exam, q, pick) {
    const key = answerOf(exam, q.no);
    if (!key) return null;
    return { mode: 'auto', ok: String(pick).toUpperCase() === key ? 1 : 0, key };
  }

  function aiAvailable() {
    const cfg = Store.data.ai || {};
    return !!(cfg.enabled && window.AI && AI.effectiveKey(cfg));
  }
  function aiConfig() { return AI.resolveConfig(Store.data.ai || {}); }

  async function chat(system, user) {
    const rc = aiConfig();
    if (!rc.key || !rc.base || !rc.model) return { ok: false, error: 'AI 未配置（服务商 / Key / 模型）' };
    const args = { base: rc.base, key: rc.key, model: rc.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0.3, jsonMode: false, anthropic: rc.anthropic, noThink: rc.noThink };
    const res = await Platform.llmChat(args);
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, text: String(res.content || '').trim(), provider: rc.provider && rc.provider.id, model: rc.model };
  }

  const SYS_QUESTION = '你是大学英语六级真题辅导老师。该题无可验证的官方答案，用户提供真题题目、选项与他的作答。请：1) 推断最可能的正确选项并说明理由；2) 点评用户的选择；3) 讲解题干与选项中的关键语言点。明确标注「AI 推断，仅供参考」。用中文回答，不超过 300 字。';
  const SYS_WRITING = '你是大学英语六级写作与翻译辅导老师。请根据真题题目批改用户的作答：给出估计分数档（写作/翻译均按 15 分制）、指出 2-3 个主要问题、给出一版修改参考。明确标注「AI 批改，仅供参考」。用中文回答，不超过 500 字。';

  function questionCacheKey(examId, no) { return examId + ':' + no; }
  function writingCacheKey(examId, kind) { return examId + ':' + (kind === 'translation' ? 't' : 'w'); }

  async function analyzeQuestion(exam, q, pick, passage, bank) {
    const key = questionCacheKey(exam.examId, q.no);
    const cached = Store.examAi(key);
    if (cached) return { ok: true, text: cached.text, cached: true };
    const opts = Object.entries(q.options || {}).map(([L, t]) => L + '. ' + t).join('\n');
    const bankText = bank ? Object.keys(bank).sort().map(L => L + '. ' + bank[L]).join('\n') : '';
    const pickWord = bank && pick && bank[pick] ? pick + '（' + bank[pick] + '）' : (pick || '（未作答）');
    const user = [
      '题型：' + (q.type === 'reading' ? '仔细阅读' : q.type === 'matching' ? '信息匹配' : q.type === 'cloze' ? '选词填空' : q.type),
      q.type === 'matching' ? '题目：把陈述句匹配到段落（选项为段落字母）' : '',
      q.type === 'cloze' ? '题目：短文第 ' + q.no + ' 空，从词库选一词填入（每词限用一次）' : '',
      passage ? '材料节选：\n' + String(passage).slice(0, 1500) : '',
      q.type === 'cloze' ? (bankText ? '词库：\n' + bankText : '') : ('题干：' + (q.stem || '（听力/匹配题，题干见上）')),
      q.type === 'cloze' ? '' : (opts ? '选项：\n' + opts : ''),
      '用户作答：' + pickWord
    ].filter(Boolean).join('\n\n');
    const res = await chat(SYS_QUESTION, user);
    if (res.ok) Store.saveExamAi(key, res.text, res.provider, res.model);
    return res;
  }

  async function analyzeWriting(exam, kind, userText) {
    const key = writingCacheKey(exam.examId, kind);
    const cached = Store.examAi(key);
    if (cached) return { ok: true, text: cached.text, cached: true };
    const src = kind === 'translation' ? exam.translation : exam.writing;
    const user = [
      kind === 'translation' ? '题型：汉译英' : '题型：短文写作',
      '题目要求：' + ((src && (src.prompt || src.directions)) || ''),
      kind === 'translation' ? '中文原文：\n' + (src.passage || '') : '',
      '用户作答：\n' + String(userText || '').slice(0, 4000)
    ].filter(Boolean).join('\n\n');
    const res = await chat(SYS_WRITING, user);
    if (res.ok) Store.saveExamAi(key, res.text, res.provider, res.model);
    return res;
  }

  function typeStats(examId, type, questions) {
    const p = Store.examProgress(examId);
    const nos = questions.map(q => q.no);
    let answered = 0, correct = 0, wrong = 0;
    if (p) nos.forEach(no => {
      const r = p.a[no];
      if (!r) return;
      answered++;
      if (r.ok === 1) correct++;
      else if (r.ok === 0) wrong++;
    });
    return { total: nos.length, answered, correct, wrong, done: !!(p && p.done[type]) };
  }

  function wrongQuestions(exam) {
    const p = Store.examProgress(exam.examId);
    if (!p) return [];
    const out = [];
    for (const s of exam.sections || []) for (const g of s.groups) for (const q of g.questions) {
      const r = p.a[q.no];
      if (r && r.ok === 0) out.push({ group: g, section: s, q });
    }
    return out;
  }

  window.Exams = { init, list, meta, load, availableTypes, sessions, paragraphsOf, answerOf, judge, aiAvailable, analyzeQuestion, analyzeWriting, typeStats, wrongQuestions, questionCacheKey, writingCacheKey };
})();