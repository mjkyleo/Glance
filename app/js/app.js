// Glance study app controller. Shared by Electron + Capacitor/browser.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function shuffle(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  function fmtMs(ms) { const m = Math.round((ms || 0) / 60000); return m < 1 ? '<1' : String(m); }

  let book = null;
  let session = [];
  let sessionIdx = 0;
  let sessionMeta = { dueTotal: 0, newTotal: 0 };
  let renderTs = Date.now();
  let mode = 'study';
  let currentView = 'study';
  let rootsTab = 'roots';
  let affixFilter = 'all';
  let favGroup = '';
  let sheetWord = null;
  let sheetFamily = null;
  let sheetTheme = null;
  let cardsEntry = null;

  // quiz state
  let quiz = { items: [], idx: 0, correct: 0, answered: false, retry: false };

  const speak = (text, audio) => Platform.speak(text, { lang: Store.data.ttsLang || '', rate: Number(Store.data.ttsRate ?? 1), audio, preferAudio: Store.data.preferAudio !== false });

  // ===================== view router =====================
  function switchView(v) {
    currentView = v;
    const app = document.querySelector('.app');
    if (app) app.dataset.current = v;
    ['study', 'roots', 'themes', 'search', 'stats', 'books', 'ai'].forEach(name => {
      $('view-' + name).hidden = name !== v;
    });
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === v));
    if (v === 'study') { updatePlanBar(); updateStudyVisibility(); }
    if (v === 'roots') { rootsTab === 'roots' ? renderRoots() : renderAffixes(); }
    if (v === 'themes') renderThemes();
    if (v === 'search') renderSearchDefault();
    if (v === 'stats') renderStats();
    if (v === 'books') renderBooks();
    if (v === 'ai') renderAiLibrary();
  }

  // ===================== sheets =====================
  let openSheetEl = null;
  function openSheet(id) {
    closeSheet(true);
    const s = $(id);
    s.hidden = false;
    const bd = $('sheet-backdrop');
    bd.hidden = false;
    requestAnimationFrame(() => { s.classList.add('show'); bd.classList.add('show'); });
    openSheetEl = s;
  }
  function closeSheet(instant) {
    const bd = $('sheet-backdrop');
    if (openSheetEl) {
      const s = openSheetEl;
      s.classList.remove('show');
      bd.classList.remove('show');
      openSheetEl = null;
      if (instant) { s.hidden = true; bd.hidden = true; }
      else setTimeout(() => { s.hidden = true; if (!openSheetEl) bd.hidden = true; }, 280);
    } else { bd.hidden = true; }
  }

  // ===================== active book =====================
  function activeBook() {
    const tag = Store.data.activeBook;
    const custom = Store.data.customBooks[tag];
    if (custom) return { tag, name: tag, n: custom.entries.length, entries: custom.entries, custom: true };
    return Library.getBook(tag) || Library.getBook('六级') || { tag: '六级', name: '六级词库', n: 0, entries: [] };
  }
  function knownCount(entries) { let n = 0; for (const e of entries) if (SRS.isKnown(Store.data.srs[e.word])) n++; return n; }

  // ===================== study session =====================
  function buildSession(bonusNew) {
    book = activeBook();
    const now = Date.now();
    const prog = Store.planProgress();
    const newLeft = bonusNew ? 10 : prog.newLeft;
    const q = SRS.buildQueue(book.entries, Store.data.srs, { newLeft, reviewCap: Store.data.plan.reviewCap }, now);
    session = SRS.session(q.reviews, q.news);
    sessionMeta = q;
    sessionIdx = 0;
  }
  function studyWords(entries) {
    session = entries.filter(Boolean).map(e => ({ entry: e, kind: SRS.isNew(Store.data.srs[e.word]) ? 'new' : 'review' }));
    sessionMeta = { dueTotal: 0, newTotal: session.length };
    sessionIdx = 0;
    setMode('study');
    switchView('study');
    renderStudy();
  }
  function currentItem() { return session[sessionIdx] || null; }

  function updateStudyVisibility() {
    const inStudy = mode === 'study';
    const hasItem = inStudy && !!currentItem();
    $('study-panel').hidden = !hasItem;
    $('study-empty').hidden = !(inStudy && !currentItem());
    $('quiz-panel').hidden = inStudy;
    $('grade-footer').hidden = !hasItem;
    $('mode-study').classList.toggle('active', inStudy);
    $('mode-quiz').classList.toggle('active', !inStudy);
    $('mode-study').setAttribute('aria-selected', String(inStudy));
    $('mode-quiz').setAttribute('aria-selected', String(!inStudy));
  }

  function setMode(m) {
    mode = m;
    if (m === 'quiz') buildQuiz();
    updateStudyVisibility();
    if (m === 'quiz') renderQuiz();
    else renderStudy();
  }

  function updatePlanBar() {
    const pill = $('session-pill');
    if (!pill) return;
    pill.textContent = session.length ? (Math.min(sessionIdx + 1, session.length) + ' / ' + session.length) : '完成';
  }

  function renderStudy() {
    updateStudyVisibility();
    const item = currentItem();
    if (!item) { renderEmpty(); return; }
    const e = item.entry;
    const st = Store.data.srs[e.word];
    $('word').textContent = e.word;
    $('phonetic').textContent = e.phonetic ? '/' + e.phonetic + '/' + (e.cefr ? '  ·  ' + e.cefr : '') : (e.cefr || '');
    const badge = $('word-badge');
    if (item.kind === 'new') { badge.textContent = '新词'; badge.className = 'word-badge new'; }
    else if (SRS.isKnown(st)) { badge.textContent = '已掌握'; badge.className = 'word-badge known'; }
    else { badge.textContent = '复习'; badge.className = 'word-badge review'; }
    $('word-due').textContent = item.kind === 'new' ? '' : SRS.nextDueLabel(st, Date.now());
    renderMorphemes(e);
    const mn = $('word-mnemonic');
    const m = mnemonicText(e);
    if (m) { mn.textContent = m.text; mn.hidden = false; mn.classList.toggle('ai', m.ai); }
    else { mn.textContent = ''; mn.hidden = true; }
    $('word-meaning').textContent = e.meaning || e.zh || '';
    updatePlanBar();
    const panel = $('study-panel');
    panel.classList.remove('anim'); void panel.offsetWidth; panel.classList.add('anim');
    panel.scrollTop = 0;
    renderTs = Date.now();
    if (Store.data.autoSpeak) speak(e.word, e.audio);
  }

  function renderEmpty() {
    const p = Store.planProgress();
    const due = SRS.buildQueue(activeBook().entries, Store.data.srs, { newLeft: 0, reviewCap: 0 }, Date.now()).dueTotal;
    const planDone = p.newLeft === 0;
    $('empty-title').textContent = planDone && due === 0 ? '今日任务已完成' : '休息一下';
    $('empty-sub').textContent = planDone && due === 0
      ? '新词和到期复习都完成了。想继续可以加量学习，或去词书调整每日计划。'
      : '当前队列已清空。还有 ' + due + ' 个到期复习词，或继续学习新词。';
    const stats = $('empty-stats');
    stats.innerHTML = '';
    [['新学', p.newDone], ['复习', p.reviewDone], ['认识', p.know], ['模糊', p.fuzzy], ['忘记', p.forgot]].forEach(([k, v]) => {
      const c = el('div', 'plan-chip'); c.innerHTML = '<b>' + v + '</b> ' + k; stats.appendChild(c);
    });
    $('continue-button').textContent = planDone && due === 0 ? '加量学习' : '继续学习';
    updatePlanBar();
  }

  function grade(g) {
    const item = currentItem();
    if (!item || mode !== 'study') return;
    const elapsed = Date.now() - renderTs;
    Store.recordGrade(item.entry.word, item.kind, g, elapsed);
    const btn = g === SRS.GRADE.KNOW ? $('grade-know') : g === SRS.GRADE.FUZZY ? $('grade-fuzzy') : $('grade-forgot');
    btn.style.transform = 'scale(0.9)'; setTimeout(() => { btn.style.transform = ''; }, 130);
    sessionIdx++;
    updatePlanBar();
    if (sessionIdx >= session.length) { buildSession(); sessionIdx = 0; if (!currentItem()) { renderEmpty(); updateStudyVisibility(); return; } }
    renderStudy();
  }

  function continueStudy() {
    const p = Store.planProgress();
    const due = SRS.buildQueue(activeBook().entries, Store.data.srs, { newLeft: 0, reviewCap: 0 }, Date.now()).dueTotal;
    buildSession(p.newLeft === 0 && due === 0);
    setMode('study');
    renderStudy();
  }

  // ===================== morphemes =====================
  function renderMorphemes(e) {
    const morphEl = $('morphemes');
    morphEl.innerHTML = '';
    const chips = e.morphemes || [];
    if (!chips.length) { morphEl.style.display = 'none'; return; }
    morphEl.style.display = '';
    chips.forEach((c, i) => {
      if (i > 0) morphEl.appendChild(el('span', 'morph-plus', '+'));
      const chip = el('button', 'morph morph-' + c.type);
      chip.type = 'button';
      chip.appendChild(el('span', 'morph-text', c.text));
      if (c.gloss) chip.appendChild(el('span', 'morph-gloss', c.gloss));
      chip.title = ({ prefix: '前缀', root: '词根', suffix: '后缀' }[c.type] || '') + (c.gloss ? ' · ' + c.gloss : '');
      chip.addEventListener('click', () => {
        if (c.type === 'root' && e.root) openFamily(e.root);
        else openAffixByChip(c.text, c.type);
      });
      morphEl.appendChild(chip);
    });
    fitMorphemes();
  }

  // Shrink the decomposition font until every segment fits on a single line.
  function fitMorphemes() {
    const m = $('morphemes');
    if (!m || m.style.display === 'none' || !m.children.length) return;
    let size = 16;
    m.style.fontSize = size + 'px';
    while (m.scrollWidth > m.clientWidth + 1 && size > 10) {
      size -= 0.5;
      m.style.fontSize = size + 'px';
    }
  }

  // ===================== cards =====================
  function orderedCards(e) {
    const avail = Library.buildCards(e);
    const map = new Map(avail.map(c => [c.id, c]));
    const out = [];
    for (const id of Store.data.cardOrder) if (map.has(id)) { out.push(map.get(id)); map.delete(id); }
    for (const c of map.values()) out.push(c);
    return out;
  }
  function cardBody(card, container, interactive) {
    if (card.kind === 'list') {
      const ul = el('ul');
      card.items.forEach(it => ul.appendChild(el('li', null, it)));
      container.appendChild(ul);
    } else if (card.kind === 'senses') {
      const groups = [], byKey = new Map();
      card.senses.forEach(s => {
        const info = s.pos ? Library.posInfo(s.pos) : null;
        const key = info ? info.zh : (s.domain ? 'domain:' + s.domain : 'other');
        if (!byKey.has(key)) { const g = { info, abbr: s.pos, domain: s.domain, glosses: [] }; byKey.set(key, g); groups.push(g); }
        byKey.get(key).glosses.push(s.gloss);
      });
      groups.forEach(g => {
        const row = el('div', 'pos-group');
        const tag = el('div', 'pos-tag');
        if (g.info) {
          tag.appendChild(el('span', 'pos-zh', g.info.zh));
          if (g.abbr) tag.appendChild(el('span', 'pos-abbr', g.abbr + '.'));
          if (g.info.note) tag.appendChild(el('span', 'pos-note', g.info.note));
        } else if (g.domain) {
          tag.appendChild(el('span', 'pos-zh domain', '[' + g.domain + ']'));
          tag.appendChild(el('span', 'pos-note', '领域义项'));
        }
        row.appendChild(tag);
        row.appendChild(el('div', 'pos-gloss', g.glosses.join('；')));
        container.appendChild(row);
      });
    } else if (card.kind === 'mnemonic') {
      const box = el('div', 'mnemonic-body' + (card.ai ? ' ai' : ''));
      box.appendChild(el('span', 'mnemonic-hook', card.text));
      if (card.ai) box.appendChild(el('span', 'mnemonic-src', 'AI 巧记'));
      container.appendChild(box);
    } else if (card.id === 'family' && interactive && card.root) {
      const a = el('a', 'card-link', card.text + '  →');
      a.addEventListener('click', () => openFamily(card.root));
      container.appendChild(a);
    } else {
      container.textContent = card.text;
    }
  }
  function mnemonicText(e) {
    const ai = Store.aiExplanation(e.word);
    if (ai && ai.data && ai.data.memoryTip) return { text: ai.data.memoryTip, ai: true };
    return e.mnemonic ? { text: e.mnemonic, ai: false } : null;
  }
  function renderCards(e) {
    const cardsEl = $('cards');
    if (!cardsEl) return;
    cardsEl.innerHTML = '';
    orderedCards(e).forEach(card => {
      if (card.id === 'mnemonic') { const m = mnemonicText(e); if (m) card = Object.assign({}, card, { text: m.text, ai: m.ai }); }
      const sec = el('section', 'card');
      sec.dataset.card = card.id;
      sec.draggable = true;
      const head = el('div', 'card-head');
      head.appendChild(el('span', 'grip', '⠿'));
      head.appendChild(el('span', 'card-title', card.title));
      const ops = el('span', 'card-ops');
      const up = el('button', 'op', '↑'); up.title = '上移';
      const down = el('button', 'op', '↓'); down.title = '下移';
      up.addEventListener('click', () => moveCard(card.id, -1));
      down.addEventListener('click', () => moveCard(card.id, 1));
      ops.append(up, down); head.appendChild(ops);
      const body = el('div', 'card-body');
      cardBody(card, body, true);
      sec.append(head, body);
      wireDrag(sec);
      cardsEl.appendChild(sec);
    });
  }
  function moveCard(id, dir) {
    const e = cardsEntry; if (!e) return;
    const ids = orderedCards(e).map(c => c.id);
    const i = ids.indexOf(id), j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    Store.data.cardOrder = ids; Store.save(); renderCards(e);
  }
  let dragId = null;
  function wireDrag(sec) {
    sec.addEventListener('dragstart', ev => { dragId = sec.dataset.card; sec.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; });
    sec.addEventListener('dragend', () => { dragId = null; sec.classList.remove('dragging'); });
    sec.addEventListener('dragover', ev => ev.preventDefault());
    sec.addEventListener('drop', ev => {
      ev.preventDefault();
      const target = sec.dataset.card;
      if (!dragId || dragId === target) return;
      const e = cardsEntry; if (!e) return;
      const ids = orderedCards(e).map(c => c.id);
      const from = ids.indexOf(dragId), to = ids.indexOf(target);
      ids.splice(from, 1); ids.splice(to, 0, dragId);
      Store.data.cardOrder = ids; Store.save(); renderCards(e);
    });
  }

  // ===================== quiz =====================
  function quizPool() {
    if (quiz.retry) {
      const words = Store.errorWords();
      return words.map(w => Library.lookup(w)).filter(Boolean);
    }
    const b = activeBook();
    const now = Date.now();
    const q = SRS.buildQueue(b.entries, Store.data.srs, { newLeft: Store.planProgress().newLeft, reviewCap: Store.data.plan.reviewCap }, now);
    let items = q.reviews.concat(q.news);
    if (items.length < 4) items = b.entries.slice();
    return shuffle(items).slice(0, Math.max(10, Math.min(items.length, 20)));
  }
  function buildQuiz() {
    quiz.items = quizPool();
    quiz.idx = 0; quiz.correct = 0; quiz.answered = false;
  }
  // Root-themed distractors: prefer meanings from the same root family (easily confused
  // within one root theme), then fill with random book meanings. Dedup by meaning text
  // so no option duplicates the correct answer.
  function quizDistractors(e, correct) {
    const entries = activeBook().entries;
    const norm = m => (m || '').trim();
    const seen = new Set([norm(correct)]);
    const out = [];
    const add = m => { const t = norm(m); if (t && !seen.has(t)) { seen.add(t); out.push(t); } };
    const root = e.root || (e.rootFamily && e.rootFamily.root) || '';
    if (root) {
      const fam = shuffle(entries.filter(x => x.word !== e.word && (x.root === root || (x.rootFamily && x.rootFamily.root === root))));
      for (const x of fam) { add(x.meaning || x.zh); if (out.length >= 3) return out; }
    }
    for (const x of shuffle(entries)) { if (x.word === e.word) continue; add(x.meaning || x.zh); if (out.length >= 3) break; }
    return out;
  }
  function renderQuiz() {
    const qw = $('quiz-word'), qp = $('quiz-phonetic'), qo = $('quiz-options');
    $('quiz-score').textContent = quiz.correct + ' / ' + quiz.items.length;
    $('quiz-progress').textContent = quiz.items.length ? '第 ' + (quiz.idx + 1) + ' / ' + quiz.items.length + ' 题' : '';
    $('quiz-feedback').hidden = true;
    $('quiz-next').hidden = true;
    if (!quiz.items.length) {
      qw.textContent = '—'; qp.textContent = '';
      qo.innerHTML = '<div class="empty-hint">暂无可测试的词。先去学习一些单词，或重练错题。</div>';
      return;
    }
    const e = quiz.items[quiz.idx];
    qw.textContent = e.word;
    qp.textContent = e.phonetic ? '/' + e.phonetic + '/' : '';
    const correct = e.meaning || e.zh || '（暂无释义）';
    const meanings = quizDistractors(e, correct);
    const opts = shuffle([correct].concat(meanings));
    qo.innerHTML = '';
    const keys = ['A', 'B', 'C', 'D'];
    quiz.answered = false;
    opts.forEach((text, i) => {
      const b = el('button', 'quiz-option');
      b.type = 'button';
      b.appendChild(el('span', 'opt-key', keys[i] || ''));
      b.appendChild(el('span', null, text));
      b.addEventListener('click', () => answerQuiz(b, text === correct, e, correct));
      qo.appendChild(b);
    });
  }
  function answerQuiz(btn, isCorrect, e, correct) {
    if (quiz.answered) return;
    quiz.answered = true;
    const opts = Array.from($('quiz-options').children);
    opts.forEach(o => {
      o.disabled = true;
      const label = o.lastChild.textContent;
      if (label === correct) o.classList.add('correct');
      else if (o === btn && !isCorrect) o.classList.add('wrong');
      else o.classList.add('dim');
    });
    const fb = $('quiz-feedback');
    fb.hidden = false;
    if (isCorrect) {
      quiz.correct++;
      fb.className = 'quiz-feedback ok';
      fb.textContent = '回答正确！';
      Store.recordGrade(e.word, SRS.isNew(Store.data.srs[e.word]) ? 'new' : 'review', SRS.GRADE.KNOW, 0);
    } else {
      fb.className = 'quiz-feedback no';
      const fam = e.rootFamily;
      const hint = fam && fam.root ? ' · 词根 ' + fam.root + (fam.rootZh ? '（' + fam.rootZh.split(/[；;]/)[0] + '）' : '') : '';
      fb.textContent = '正确答案：' + correct + hint;
      Store.recordGrade(e.word, SRS.isNew(Store.data.srs[e.word]) ? 'new' : 'review', SRS.GRADE.FORGOT, 0);
      Store.addError(e.word);
      if (!Store.isFavorite(e.word)) Store.addFavorite(e.word, '错题');
      if (!Store.data.favGroups.includes('错题')) { Store.data.favGroups.push('错题'); Store.save(); }
    }
    $('quiz-score').textContent = quiz.correct + ' / ' + quiz.items.length;
    $('quiz-next').hidden = false;
    $('quiz-next').textContent = quiz.idx + 1 >= quiz.items.length ? '完成' : '下一题';
    updatePlanBar();
  }
  function nextQuiz() {
    if (quiz.idx + 1 >= quiz.items.length) {
      const fb = $('quiz-feedback');
      fb.hidden = false; fb.className = 'quiz-feedback ok';
      fb.textContent = '本轮完成：' + quiz.correct + ' / ' + quiz.items.length + ' 正确。错词已加入生词本「错题」。';
      $('quiz-next').hidden = true;
      quiz.idx = 0; quiz.correct = 0;
      setTimeout(() => { buildQuiz(); renderQuiz(); }, 1600);
      return;
    }
    quiz.idx++;
    renderQuiz();
  }

  // ===================== roots & affixes =====================
  function stateOf(word) {
    const s = Store.data.srs[word];
    if (SRS.isNew(s)) return 'new';
    if (SRS.isKnown(s)) return 'known';
    if (s.state === 'relearn') return 'relearn';
    return 'learning';
  }
  function stateDot(word) { const d = el('span', 'state-dot ' + stateOf(word)); d.title = { new: '未学', learning: '学习中', known: '已掌握', relearn: '需重学' }[stateOf(word)]; return d; }

  function renderRoots() {
    const q = $('roots-search').value.trim().toLowerCase();
    let roots = Library.listRoots();
    if (q) roots = roots.filter(r => r.root.toLowerCase().includes(q) || (r.zh || '').includes($('roots-search').value.trim()));
    const list = $('roots-list');
    list.innerHTML = '';
    if (!roots.length) { list.appendChild(el('div', 'empty-hint', '没有匹配的词根')); return; }
    const wrap = el('div', 'list-gap');
    roots.slice(0, 200).forEach(r => {
      const row = el('button', 'row'); row.type = 'button';
      const main = el('div', 'row-main');
      const title = el('div', 'row-title', r.root);
      main.appendChild(title);
      main.appendChild(el('div', 'row-sub', r.zh || r.g || ''));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge', r.size + ' 词'));
      row.appendChild(el('span', 'row-arrow', '›'));
      row.addEventListener('click', () => openFamily(r.root));
      wrap.appendChild(row);
    });
    list.appendChild(wrap);
    if (roots.length > 200) list.appendChild(el('div', 'empty-hint', '仅显示前 200 个，用搜索查找更多'));
  }

  function renderAffixes() {
    const q = $('roots-search').value.trim().toLowerCase();
    let af = Library.getAffixes().slice();
    if (affixFilter !== 'all') af = af.filter(a => a.k === affixFilter);
    if (q) af = af.filter(a => a.id.toLowerCase().includes(q) || (a.zh || '').includes($('roots-search').value.trim()));
    af.sort((a, b) => (b.count || 0) - (a.count || 0));
    const list = $('affix-list');
    list.innerHTML = '';
    if (!af.length) { list.appendChild(el('div', 'empty-hint', '没有匹配的词缀')); return; }
    const wrap = el('div', 'list-gap');
    af.slice(0, 200).forEach(a => {
      const row = el('button', 'row'); row.type = 'button';
      const main = el('div', 'row-main');
      const title = el('div', 'row-title', a.id);
      title.appendChild(el('span', 'row-badge gray', a.k === 'prefix' ? '前缀' : a.k === 'suffix' ? '后缀' : '词缀'));
      main.appendChild(title);
      main.appendChild(el('div', 'row-sub', a.zh || a.en || ''));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge', a.count || 0));
      row.appendChild(el('span', 'row-arrow', '›'));
      row.addEventListener('click', () => openAffixSheet(a));
      wrap.appendChild(row);
    });
    list.appendChild(wrap);
    if (af.length > 200) list.appendChild(el('div', 'empty-hint', '仅显示前 200 个，用搜索查找更多'));
  }

  function openFamily(root) {
    const fam = Library.getFamily(root);
    sheetFamily = root;
    $('family-title').textContent = root;
    if (!fam) {
      $('family-meta').textContent = '该词根暂无完整家族数据';
      $('family-words').innerHTML = '<div class="empty-hint">未找到家族数据</div>';
      $('family-add-all').disabled = true;
      openSheet('family-sheet');
      return;
    }
    $('family-add-all').disabled = false;
    const known = fam.family.filter(w => SRS.isKnown(Store.data.srs[w.word])).length;
    $('family-meta').textContent = (fam.zh || '') + (fam.g ? ' · ' + fam.g : '') + ' · 家族 ' + fam.size + ' 词 · 已掌握 ' + known;
    const body = $('family-words');
    body.innerHTML = '';
    const wrap = el('div', 'list-gap');
    fam.family.forEach(w => {
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(stateDot(w.word));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', w.word));
      main.appendChild(el('div', 'row-sub', w.meaning || ''));
      row.appendChild(main);
      const st = stateOf(w.word);
      row.appendChild(el('span', 'row-badge ' + (st === 'known' ? 'green' : st === 'new' ? 'gray' : ''), { new: '未学', learning: '学习中', known: '已掌握', relearn: '重学' }[st]));
      row.addEventListener('click', () => openWordSheet(w.word));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    openSheet('family-sheet');
  }

  // ===================== thematic decks =====================
  function themeStateLabel(st) { return { new: '未学', learning: '学习中', known: '已掌握', relearn: '重学' }[st] || ''; }
  function renderThemes() {
    const host = $('themes-groups');
    host.innerHTML = '';
    if (!window.Themes || !Themes.isReady()) { host.appendChild(el('div', 'empty-hint', '主题分类尚未就绪')); return; }
    Themes.groups().forEach(g => {
      const section = el('section', 'theme-group');
      section.appendChild(el('div', 'section-label', g.name));
      const grid = el('div', 'theme-grid');
      g.themes.forEach(t => {
        const card = el('button', 'theme-card'); card.type = 'button';
        const top = el('div', 'theme-card-top');
        top.appendChild(el('span', 'theme-card-name', t.name));
        top.appendChild(el('span', 'theme-card-count', t.n + ' 词'));
        card.appendChild(top);
        if (t.desc) card.appendChild(el('div', 'theme-card-desc', t.desc));
        card.addEventListener('click', () => openThemeSheet(t.id));
        grid.appendChild(card);
      });
      section.appendChild(grid);
      host.appendChild(section);
    });
  }
  function openThemeSheet(id) {
    const meta = window.Themes && Themes.get(id);
    if (!meta) return;
    sheetTheme = id;
    const words = Themes.wordsOf(id);
    const known = words.filter(w => SRS.isKnown(Store.data.srs[w])).length;
    $('theme-title').textContent = meta.name;
    $('theme-meta').textContent = meta.desc + ' · ' + words.length + ' 词 · 已掌握 ' + known;
    const body = $('theme-words');
    body.innerHTML = '';
    $('theme-study-btn').disabled = !words.length;
    if (!words.length) {
      body.appendChild(el('div', 'empty-hint', '该专题暂无词条'));
      openSheet('theme-sheet');
      return;
    }
    const wrap = el('div', 'list-gap');
    words.forEach(w => {
      const e = Library.lookup(w);
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(stateDot(w));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', w));
      main.appendChild(el('div', 'row-sub', (e && (e.meaning || e.zh)) || ''));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge ' + (stateOf(w) === 'known' ? 'green' : 'gray'), themeStateLabel(stateOf(w))));
      row.addEventListener('click', () => openWordSheet(w));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    openSheet('theme-sheet');
  }

  function openAffixByChip(text, type) {
    const id = type === 'prefix' ? text + '-' : '-' + text;
    const a = Library.getAffixes().find(x => x.id === id) || Library.getAffixes().find(x => x.id === text);
    if (a) openAffixSheet(a);
  }
  function openAffixSheet(a) {
    $('affix-title').textContent = a.id;
    $('affix-meta').textContent = (a.k === 'prefix' ? '前缀' : a.k === 'suffix' ? '后缀' : '词缀') + ' · ' + (a.zh || a.en || '') + ' · ' + (a.count || 0) + ' 词';
    const body = $('affix-body');
    body.innerHTML = '';
    (a.s || []).forEach(sense => {
      const s = el('div', 'sense');
      s.appendChild(el('div', 'sense-gloss', sense[0] || ''));
      (sense[1] || []).forEach(ex => s.appendChild(el('div', 'sense-ex', ex)));
      body.appendChild(s);
    });
    if (!(a.s || []).length) body.appendChild(el('div', 'empty-hint', '暂无释义'));
    openSheet('affix-sheet');
  }

  // ===================== word detail =====================
  function findEntry(word) {
    return activeBook().entries.find(e => e.word === word) || Library.lookup(word) || null;
  }
  function openWordSheet(word, fromSearch) {
    const e = findEntry(word);
    sheetWord = word;
    if (fromSearch) Store.addHistory(word);
    $('word-sheet-title').textContent = word;
    if (!e) {
      $('word-sheet-sub').textContent = '';
      $('word-sheet-body').innerHTML = '<div class="empty-hint">词库中暂无该词</div>';
      $('word-study-btn').disabled = true;
      openSheet('word-sheet');
      return;
    }
    $('word-study-btn').disabled = false;
    $('word-sheet-sub').textContent = (e.phonetic ? '/' + e.phonetic + '/  ' : '') + (e.cefr || '') + (e.root ? '  ·  词根 ' + e.root : '');
    const body = $('word-sheet-body');
    body.innerHTML = '';
    if (e.tags && e.tags.length) {
      const tags = el('div', 'exam-tags');
      e.tags.forEach(t => tags.appendChild(el('span', 'exam-tag', t)));
      body.appendChild(tags);
    }
    const speakRow = el('button', 'btn-ghost', '🔊 朗读');
    speakRow.addEventListener('click', () => speak(word, e.audio));
    body.appendChild(speakRow);
    body.appendChild(aiSection(e));
    const cardsWrap = el('section', 'cards'); cardsWrap.id = 'cards';
    body.appendChild(cardsWrap);
    cardsEntry = e;
    renderCards(e);
    updateFavToggle();
    openSheet('word-sheet');
  }
  function updateFavToggle() {
    const fav = Store.isFavorite(sheetWord);
    $('word-fav-toggle').textContent = fav ? '★ 已收藏' : '☆ 收藏';
  }

  // ===================== AI explanations =====================
  const AI_TYPE = { prefix: '前缀', root: '词根', suffix: '后缀' };
  function renderAiExplanation(container, data) {
    container.innerHTML = '';
    const block = (title, node) => { const s = el('div', 'ai-block'); if (title) s.appendChild(el('div', 'ai-block-title', title)); s.appendChild(node); container.appendChild(s); };
    const text = t => el('p', 'ai-text', t);
    if (Array.isArray(data.meanings) && data.meanings.length) {
      const wrap = el('div', 'ai-meanings');
      data.meanings.forEach(m => { const row = el('div', 'ai-meaning'); if (m.pos) row.appendChild(el('span', 'ai-pos', m.pos)); row.appendChild(el('span', 'ai-meaning-text', (m.zh || '') + (m.en ? '  ' + m.en : ''))); wrap.appendChild(row); });
      block('释义', wrap);
    }
    if (Array.isArray(data.morphemes) && data.morphemes.length) {
      const wrap = el('div', 'ai-morphemes');
      data.morphemes.forEach(m => { const chip = el('div', 'ai-morph'); chip.appendChild(el('span', 'ai-morph-part', m.part || '')); chip.appendChild(el('span', 'ai-morph-type', AI_TYPE[m.type] || '词素')); chip.appendChild(el('span', 'ai-morph-gloss', (m.gloss_zh || m.gloss_en || '') + (m.note ? ' · ' + m.note : ''))); wrap.appendChild(chip); });
      block('构词', wrap);
    }
    if (data.memoryTip) block('巧记', text(data.memoryTip));
    if (Array.isArray(data.examples) && data.examples.length) {
      const wrap = el('div', 'ai-examples');
      data.examples.forEach(ex => { const d = el('div', 'ai-example'); d.appendChild(el('div', 'ai-ex-en', ex.en || '')); if (ex.zh) d.appendChild(el('div', 'ai-ex-zh', ex.zh)); wrap.appendChild(d); });
      block('例句', wrap);
    }
    if (Array.isArray(data.collocations) && data.collocations.length) block('搭配', text(data.collocations.join(' · ')));
    if (Array.isArray(data.synonyms) && data.synonyms.length) block('近义词', text(data.synonyms.join(' · ')));
    if (Array.isArray(data.antonyms) && data.antonyms.length) block('反义词', text(data.antonyms.join(' · ')));
    if (Array.isArray(data.confusion) && data.confusion.length) {
      const wrap = el('div', 'ai-confusion');
      data.confusion.forEach(c => { const d = el('div', 'ai-conf'); d.appendChild(el('span', 'ai-conf-word', c.word || '')); d.appendChild(el('span', 'ai-conf-text', c.distinction_zh || '')); wrap.appendChild(d); });
      block('易混词', wrap);
    }
    if (data.etymology) block('词源', text(data.etymology));
  }

  function aiConfigPrompt(content, actions) {
    content.innerHTML = '';
    content.appendChild(el('p', 'ai-placeholder', 'AI 详解未配置。请到「设置 → AI 解释」开启并填写 API Key。'));
    actions.innerHTML = '';
    const go = el('button', 'btn-ghost', '前往设置');
    go.addEventListener('click', () => { closeSheet(); openSettings(); });
    actions.appendChild(go);
  }

  function aiSection(e) {
    const sec = el('section', 'ai-section');
    const head = el('div', 'ai-section-head');
    head.appendChild(el('span', 'ai-section-title', 'AI 详解'));
    const meta = el('span', 'ai-section-meta');
    head.appendChild(meta);
    sec.appendChild(head);
    const content = el('div', 'ai-section-body');
    sec.appendChild(content);
    const actions = el('div', 'ai-actions');
    sec.appendChild(actions);

    function refresh() {
      const cached = Store.aiExplanation(e.word);
      content.innerHTML = ''; actions.innerHTML = '';
      if (cached && cached.data) {
        renderAiExplanation(content, cached.data);
        meta.textContent = AI.getProvider(cached.provider).name + (cached.model ? ' · ' + cached.model : '');
        const regen = el('button', 'btn-ghost', '重新生成');
        regen.addEventListener('click', () => generate());
        const del = el('button', 'btn-ghost danger', '删除');
        del.addEventListener('click', () => { Store.deleteAiExplanation(e.word); refresh(); });
        actions.append(regen, del);
      } else {
        meta.textContent = '';
        content.appendChild(el('p', 'ai-placeholder', '让大模型生成详细讲解：释义、构词、例句、易混词等，结果保存在本地，可离线查看与导出。'));
        const gen = el('button', 'btn-primary', '生成 AI 解释');
        gen.addEventListener('click', () => generate(gen));
        actions.appendChild(gen);
      }
    }
    async function generate(btn) {
      const cfg = Store.data.ai;
      if (!cfg.enabled || !cfg.key) { aiConfigPrompt(content, actions); return; }
      if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
      content.innerHTML = '';
      content.appendChild(el('p', 'ai-placeholder', '正在调用 AI 生成讲解…'));
      const res = await AI.explainWord(e.word, e, cfg);
      if (res.ok) {
        Store.saveAiExplanation(e.word, { data: res.data, ts: Date.now(), provider: res.provider, model: res.model });
        refresh();
      } else {
        content.innerHTML = '';
        content.appendChild(el('p', 'ai-error', '生成失败：' + res.error));
        actions.innerHTML = '';
        const retry = el('button', 'btn-ghost', '重试');
        retry.addEventListener('click', () => generate(retry));
        actions.appendChild(retry);
      }
    }
    refresh();
    return sec;
  }

  function renderAiLibrary() {
    const list = $('ai-list');
    list.innerHTML = '';
    const words = Store.aiWords();
    $('ai-lib-hint').textContent = words.length
      ? '已保存 ' + words.length + ' 个词的 AI 讲解，可离线查看、导出。'
      : '在单词详情中点「生成 AI 解释」后，讲解会保存在这里，可离线查看、导出。';
    if (!words.length) { list.appendChild(el('div', 'empty-hint', '还没有 AI 解释。')); return; }
    words.forEach(w => {
      const rec = Store.aiExplanation(w);
      const row = el('button', 'row'); row.type = 'button';
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', w));
      const first = rec.data && rec.data.meanings && rec.data.meanings[0];
      main.appendChild(el('div', 'row-sub', first ? (first.zh || '') : AI.getProvider(rec.provider).name));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge gray', AI.getProvider(rec.provider).name));
      row.addEventListener('click', () => openWordSheet(w, false));
      list.appendChild(row);
    });
  }

  // ===================== search =====================
  function renderSearchDefault() {
    renderHistory();
    renderFavorites();
  }
  function runSearch() {
    const query = $('search-input').value.trim();
    $('search-clear').hidden = !query;
    const res = $('search-results');
    res.innerHTML = '';
    $('history-block').hidden = !!query;
    $('fav-block').hidden = !!query;
    if (!query) return;
    const r = Library.search(query, 40);
    if (r.words.length) {
      res.appendChild(el('div', 'section-label', '单词'));
      const wrap = el('div', 'list-gap');
      r.words.forEach(w => {
        const row = el('button', 'row'); row.type = 'button';
        row.appendChild(stateDot(w.word));
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', w.word));
        main.appendChild(el('div', 'row-sub', w.zh || ''));
        row.appendChild(main);
        if (w.cf) row.appendChild(el('span', 'row-badge gray', w.cf));
        row.addEventListener('click', () => openWordSheet(w.word, true));
        wrap.appendChild(row);
      });
      res.appendChild(wrap);
    }
    if (r.roots.length) {
      res.appendChild(el('div', 'section-label', '词根'));
      const wrap = el('div', 'list-gap');
      r.roots.forEach(rt => {
        const row = el('button', 'row'); row.type = 'button';
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', rt.root));
        main.appendChild(el('div', 'row-sub', rt.zh || ''));
        row.appendChild(main);
        row.appendChild(el('span', 'row-badge', rt.size + ' 词'));
        row.addEventListener('click', () => openFamily(rt.root));
        wrap.appendChild(row);
      });
      res.appendChild(wrap);
    }
    if (r.affixes.length) {
      res.appendChild(el('div', 'section-label', '词缀'));
      const wrap = el('div', 'list-gap');
      r.affixes.forEach(a => {
        const row = el('button', 'row'); row.type = 'button';
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', a.id));
        main.appendChild(el('div', 'row-sub', a.zh || ''));
        row.appendChild(main);
        row.addEventListener('click', () => openAffixSheet(a));
        wrap.appendChild(row);
      });
      res.appendChild(wrap);
    }
    if (!r.words.length && !r.roots.length && !r.affixes.length) res.appendChild(el('div', 'empty-hint', '没有匹配结果'));
  }
  function renderHistory() {
    const list = $('history-list');
    list.innerHTML = '';
    const h = Store.data.history;
    if (!h.length) { list.appendChild(el('span', 'field-hint', '查过的词会出现在这里')); return; }
    h.slice(0, 30).forEach(item => {
      const c = el('button', 'chip word-chip', item.word); c.type = 'button';
      c.addEventListener('click', () => openWordSheet(item.word, true));
      list.appendChild(c);
    });
  }
  function renderFavorites() {
    const groups = $('fav-groups');
    groups.innerHTML = '';
    const all = el('button', 'chip' + (favGroup === '' ? ' active' : ''), '全部'); all.type = 'button';
    all.addEventListener('click', () => { favGroup = ''; renderFavorites(); });
    groups.appendChild(all);
    Store.data.favGroups.forEach(g => {
      const c = el('button', 'chip' + (favGroup === g ? ' active' : ''), g); c.type = 'button';
      c.addEventListener('click', () => { favGroup = g; renderFavorites(); });
      groups.appendChild(c);
    });
    const words = Store.favoriteWords(favGroup);
    $('fav-count').textContent = Store.favoriteWords('').length;
    const list = $('fav-list');
    list.innerHTML = '';
    if (!words.length) { list.appendChild(el('div', 'empty-hint', '生词本为空。查词或测试错词会自动收录。')); return; }
    const wrap = el('div', 'list-gap');
    words.forEach(w => {
      const e = findEntry(w);
      const row = el('div', 'row');
      row.appendChild(stateDot(w));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', w));
      main.appendChild(el('div', 'row-sub', (e && (e.meaning || e.zh)) || ''));
      row.appendChild(main);
      const rm = el('button', 'op', '✕'); rm.title = '移除';
      rm.addEventListener('click', ev => { ev.stopPropagation(); Store.removeFavorite(w); renderFavorites(); });
      row.appendChild(rm);
      row.style.cursor = 'pointer';
      row.addEventListener('click', () => openWordSheet(w, true));
      wrap.appendChild(row);
    });
    list.appendChild(wrap);
  }

  // ===================== stats =====================
  function renderStats() {
    const p = Store.planProgress();
    const rate = p.graded > 0 ? Math.round((p.know / p.graded) * 100) : 0;
    const grid = $('stats-today');
    grid.innerHTML = '';
    [['今日新学', p.newDone, ''], ['今日复习', p.reviewDone, ''], ['认识率', rate, '%'], ['学习时长', fmtMs(p.ms), '分钟']].forEach(([label, val, unit]) => {
      const c = el('div', 'stat-card');
      c.appendChild(el('div', 'stat-label', label));
      const v = el('div', 'stat-value'); v.innerHTML = esc(val) + (unit ? ' <small>' + unit + '</small>' : '');
      c.appendChild(v);
      grid.appendChild(c);
    });
    const st = Store.streak();
    $('stats-streak').textContent = '连续 ' + st.count + ' 天';
    const f = Store.data.fsrs || { count: 0, w: null };
    const note = $('fsrs-note');
    if (note) {
      note.textContent = f.w
        ? '已根据你的 ' + f.count + ' 次复习校准记忆曲线，间隔越用越贴合你的遗忘节奏。'
        : '正在记录你的复习表现（' + f.count + ' 次），满 200 次后自动校准专属记忆曲线。';
    }
    renderCalendar();
    renderMastery();
    renderRetention();
    renderTrend();
    renderDayHistory();
  }
  function renderCalendar() {
    const cal = $('calendar');
    cal.innerHTML = '';
    const now = new Date();
    const start = new Date(now); start.setDate(now.getDate() - 34);
    for (let i = 0; i < 35; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = Store.dateKey(d);
      const log = Store.data.logs[key];
      const graded = log ? (log.know + log.fuzzy + log.forgot) : 0;
      const cell = el('div', 'cal-cell');
      let lvl = 0;
      if (graded > 30) lvl = 4; else if (graded > 15) lvl = 3; else if (graded > 5) lvl = 2; else if (graded > 0) lvl = 1;
      if (lvl) cell.classList.add('l' + lvl);
      if (key === Store.today()) cell.classList.add('today');
      if (d > now) cell.classList.add('future');
      cell.title = key + ' · ' + graded + ' 次';
      cal.appendChild(cell);
    }
  }
  function renderMastery() {
    const m = Store.mastery(activeBook().entries);
    $('mastery-total').textContent = m.total + ' 词';
    const box = $('mastery-chart');
    box.innerHTML = '';
    const rows = [['未学', m.counts.fresh, 'var(--fill-2)'], ['学习中', m.counts.learning, 'var(--orange)'], ['需重学', m.counts.relearn, 'var(--red)'], ['已掌握', m.counts.known, 'var(--green)']];
    rows.forEach(([label, val, color]) => {
      const row = el('div', 'mrow');
      row.appendChild(el('div', 'mlabel', label));
      const track = el('div', 'mtrack');
      const fill = el('div', 'mfill');
      fill.style.width = (m.total ? (val / m.total) * 100 : 0) + '%';
      fill.style.background = color;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('div', 'mval', val));
      box.appendChild(row);
    });
  }
  function renderRetention() {
    const m = Store.mastery(activeBook().entries);
    const box = $('retention-chart');
    box.innerHTML = '';
    const wrap = el('div', 'retention');
    const max = Math.max(1, ...m.boxes);
    m.boxes.forEach((n, i) => {
      const col = el('div', 'rcol');
      col.appendChild(el('div', 'rnum', n || ''));
      const bar = el('div', 'rbar');
      bar.style.height = (n / max) * 88 + '%';
      bar.style.background = i >= SRS.GRADUATED ? 'var(--green)' : 'var(--accent)';
      bar.title = '盒 ' + i + ' · ' + n + ' 词';
      col.appendChild(bar);
      col.appendChild(el('div', 'rlab', i));
      wrap.appendChild(col);
    });
    box.appendChild(wrap);
  }
  function renderTrend() {
    const data = Store.trend(14);
    const W = 320, H = 150, pad = 24;
    const max = Math.max(1, ...data.map(d => Math.max(d.nw, d.rv)));
    const x = i => pad + i * ((W - pad * 2) / (data.length - 1));
    const y = v => H - pad - (v / max) * (H - pad * 2);
    const line = key => data.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d[key]).toFixed(1)).join(' ');
    const dots = key => data.map((d, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(d[key]).toFixed(1) + '" r="2.5" fill="' + (key === 'nw' ? 'var(--accent)' : 'var(--green)') + '"/>').join('');
    let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">';
    svg += '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="var(--fill-2)" stroke-width="1"/>';
    svg += '<path d="' + line('rv') + '" fill="none" stroke="var(--green)" stroke-width="2"/>';
    svg += '<path d="' + line('nw') + '" fill="none" stroke="var(--accent)" stroke-width="2"/>';
    svg += dots('rv') + dots('nw');
    svg += '<text x="' + pad + '" y="' + (H - 6) + '" font-size="9" fill="var(--text-3)">' + data[0].label + '</text>';
    svg += '<text x="' + (W - pad) + '" y="' + (H - 6) + '" font-size="9" fill="var(--text-3)" text-anchor="end">' + data[data.length - 1].label + '</text>';
    svg += '<text x="' + (pad - 4) + '" y="' + y(max) + '" font-size="9" fill="var(--text-3)" text-anchor="end">' + max + '</text>';
    svg += '</svg>';
    $('trend-chart').innerHTML = '<div class="trend-wrap">' + svg + '</div>';
  }
  function renderDayHistory() {
    const box = $('stats-history');
    box.innerHTML = '';
    const keys = Object.keys(Store.data.logs).sort().reverse().slice(0, 30);
    if (!keys.length) { box.appendChild(el('div', 'empty-hint', '还没有学习记录')); return; }
    keys.forEach(key => {
      const l = Store.data.logs[key];
      const det = el('details', 'day-details');
      const sum = el('summary', 'day-row');
      sum.appendChild(el('span', 'day-date', key.slice(5)));
      sum.appendChild(el('span', 'day-detail', '新学 ' + (l.newWords || []).length + ' · 复习 ' + (l.reviewWords || []).length));
      sum.appendChild(el('span', 'day-nums', (l.know + l.fuzzy + l.forgot) + ' 次'));
      det.appendChild(sum);
      const body = el('div', 'day-words');
      if ((l.newWords || []).length) {
        body.appendChild(el('div', 'section-label', '新学'));
        const cr = el('div', 'chip-row');
        l.newWords.forEach(w => { const c = el('button', 'chip word-chip', w); c.type = 'button'; c.addEventListener('click', () => openWordSheet(w)); cr.appendChild(c); });
        body.appendChild(cr);
      }
      if ((l.reviewWords || []).length) {
        body.appendChild(el('div', 'section-label', '复习'));
        const cr = el('div', 'chip-row');
        l.reviewWords.forEach(w => { const c = el('button', 'chip word-chip', w); c.type = 'button'; c.addEventListener('click', () => openWordSheet(w)); cr.appendChild(c); });
        body.appendChild(cr);
      }
      det.appendChild(body);
      box.appendChild(det);
    });
  }

  // ===================== books =====================
  function renderBooks() {
    const b = activeBook();
    const known = knownCount(b.entries);
    const ab = $('active-book');
    ab.innerHTML = '';
    ab.appendChild(el('div', 'ab-name', b.name));
    ab.appendChild(el('div', 'ab-sub', b.n + ' 词 · 已掌握 ' + known));
    const bar = el('div', 'ab-bar'); const fill = el('div', 'ab-fill');
    fill.style.width = (b.n ? (known / b.n) * 100 : 0) + '%';
    bar.appendChild(fill); ab.appendChild(bar);
    const nums = el('div', 'ab-nums');
    nums.appendChild(el('span', null, '掌握 ' + Math.round(b.n ? (known / b.n) * 100 : 0) + '%'));
    nums.appendChild(el('span', null, '每日 ' + Store.data.plan.newPerDay + ' 新词'));
    ab.appendChild(nums);

    $('plan-new-input').value = Store.data.plan.newPerDay;
    $('plan-review-input').value = Store.data.plan.reviewCap;

    const list = $('books-list');
    list.innerHTML = '';
    const wrap = el('div', 'list-gap');
    Library.listBooks().forEach(bk => {
      const entries = (Library.getBook(bk.tag) || {}).entries || [];
      const kn = knownCount(entries);
      const row = el('button', 'row book-row' + (bk.tag === Store.data.activeBook ? ' active' : '')); row.type = 'button';
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', bk.name));
      main.appendChild(el('div', 'row-sub', bk.n + ' 词 · 已掌握 ' + kn));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge ' + (bk.tag === Store.data.activeBook ? 'green' : 'gray'), bk.tag === Store.data.activeBook ? '当前' : Math.round(bk.n ? (kn / bk.n) * 100 : 0) + '%'));
      row.addEventListener('click', () => switchBook(bk.tag));
      wrap.appendChild(row);
    });
    list.appendChild(wrap);

    const customKeys = Object.keys(Store.data.customBooks);
    $('custom-books-panel').hidden = !customKeys.length;
    const cl = $('custom-books-list');
    cl.innerHTML = '';
    if (customKeys.length) {
      const cw = el('div', 'list-gap');
      customKeys.forEach(name => {
        const cb = Store.data.customBooks[name];
        const row = el('div', 'row book-row' + (name === Store.data.activeBook ? ' active' : ''));
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', name));
        main.appendChild(el('div', 'row-sub', cb.entries.length + ' 词 · 自定义'));
        row.appendChild(main);
        const del = el('button', 'op', '✕'); del.title = '删除';
        del.addEventListener('click', ev => { ev.stopPropagation(); delete Store.data.customBooks[name]; Store.save(); if (Store.data.activeBook === name) switchBook('六级'); else renderBooks(); });
        row.appendChild(del);
        row.style.cursor = 'pointer';
        row.addEventListener('click', () => switchBook(name));
        cw.appendChild(row);
      });
      cl.appendChild(cw);
    }
  }
  function switchBook(tag) {
    Store.data.activeBook = tag; Store.save();
    book = activeBook();
    $('lib-name').textContent = book.name;
    buildSession();
    setMode('study');
    renderBooks();
    switchView('study');
    renderStudy();
  }
  async function importBook() {
    const r = await Platform.pickLibrary();
    if (!r) return;
    try {
      const parsed = Library.parse(r.text, r.name);
      if (!parsed.entries.length) { alert('词库为空 / Empty library'); return; }
      const name = parsed.name || '自定义词书';
      Store.data.customBooks[name] = { entries: parsed.entries };
      Store.save();
      switchBook(name);
    } catch (e) { alert('词库解析失败 / Failed to parse: ' + e.message); }
  }

  // ===================== settings =====================
  function openSettings() {
    $('set-new').value = Store.data.plan.newPerDay;
    $('set-review').value = Store.data.plan.reviewCap;
    $('set-rate').value = Number(Store.data.ttsRate ?? 1);
    $('set-rate-val').textContent = Number(Store.data.ttsRate ?? 1).toFixed(1);
    $('set-lang').value = Store.data.ttsLang || '';
    $('set-autospeak').checked = !!Store.data.autoSpeak;
    $('set-prefer-audio').checked = Store.data.preferAudio !== false;
    const ai = Store.data.ai;
    const sel = $('set-ai-provider');
    sel.innerHTML = '';
    AI.PROVIDERS.forEach(p => { const o = el('option', null, p.name); o.value = p.id; sel.appendChild(o); });
    sel.value = ai.provider || 'deepseek';
    $('set-ai-enabled').checked = !!ai.enabled;
    $('set-ai-model').value = ai.model || '';
    $('set-ai-base').value = ai.base || '';
    $('set-ai-key').value = ai.key || '';
    syncAiProviderUi();
    const meta = Library.getMeta();
    $('about-info').textContent = 'Glance · 词根背单词 · ' + (meta.counts ? meta.counts.words : 0) + ' 词 / ' + (meta.counts ? meta.counts.roots : 0) + ' 词根';
    openSheet('settings-sheet');
  }
  function syncAiProviderUi() {
    const p = AI.getProvider($('set-ai-provider').value);
    $('set-ai-base-wrap').hidden = !p.custom;
    $('set-ai-model').placeholder = p.model || '模型名称';
    $('set-ai-model-hint').textContent = p.model ? '留空使用默认：' + p.model : '请填写模型名称';
  }
  function applyPlan() {
    const nw = Math.max(0, Math.min(200, parseInt($('set-new').value, 10) || 0));
    const rv = Math.max(0, Math.min(500, parseInt($('set-review').value, 10) || 0));
    Store.data.plan.newPerDay = nw;
    Store.data.plan.reviewCap = rv;
    Store.save();
    $('plan-new-input').value = nw;
    $('plan-review-input').value = rv;
    buildSession();
    updatePlanBar();
    if (currentView === 'study') renderStudy();
  }

  // ===================== events =====================
  function wireEvents() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => switchView(t.dataset.view)));
    $('settings-button').addEventListener('click', openSettings);
    $('sheet-backdrop').addEventListener('click', () => closeSheet());
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet()));

    $('mode-study').addEventListener('click', () => setMode('study'));
    $('mode-quiz').addEventListener('click', () => setMode('quiz'));
    $('study-settings').addEventListener('click', openSettings);
    $('word-detail-btn').addEventListener('click', () => { const it = currentItem(); if (it) openWordSheet(it.entry.word); });
    $('speak-button').addEventListener('click', () => { const it = currentItem(); if (it) speak(it.entry.word, it.entry.audio); });
    $('grade-forgot').addEventListener('click', () => grade(SRS.GRADE.FORGOT));
    $('grade-fuzzy').addEventListener('click', () => grade(SRS.GRADE.FUZZY));
    $('grade-know').addEventListener('click', () => grade(SRS.GRADE.KNOW));
    $('continue-button').addEventListener('click', continueStudy);
    $('quiz-speak').addEventListener('click', () => { const e = quiz.items[quiz.idx]; if (e) speak(e.word, e.audio); });
    $('quiz-next').addEventListener('click', nextQuiz);
    $('quiz-retry').addEventListener('click', () => { quiz.retry = !quiz.retry; $('quiz-retry').classList.toggle('active', quiz.retry); $('quiz-retry').textContent = quiz.retry ? '返回常规' : '重练错题'; buildQuiz(); renderQuiz(); });

    $('roots-tab-roots').addEventListener('click', () => { rootsTab = 'roots'; $('roots-tab-roots').classList.add('active'); $('roots-tab-affixes').classList.remove('active'); $('roots-list').hidden = false; $('affix-panel').hidden = true; $('roots-search').placeholder = '搜索词根 / 释义'; renderRoots(); });
    $('roots-tab-affixes').addEventListener('click', () => { rootsTab = 'affixes'; $('roots-tab-affixes').classList.add('active'); $('roots-tab-roots').classList.remove('active'); $('roots-list').hidden = true; $('affix-panel').hidden = false; $('roots-search').placeholder = '搜索词缀 / 释义'; renderAffixes(); });
    $('roots-search').addEventListener('input', () => rootsTab === 'roots' ? renderRoots() : renderAffixes());
    $('affix-filter').addEventListener('click', ev => {
      const b = ev.target.closest('.chip'); if (!b) return;
      affixFilter = b.dataset.k;
      document.querySelectorAll('#affix-filter .chip').forEach(c => c.classList.toggle('active', c === b));
      renderAffixes();
    });
    $('family-add-all').addEventListener('click', () => {
      const fam = Library.getFamily(sheetFamily);
      if (!fam) return;
      const entries = fam.family.map(w => findEntry(w.word)).filter(Boolean);
      closeSheet();
      studyWords(entries);
    });

    $('theme-study-btn').addEventListener('click', () => {
      if (!sheetTheme) return;
      const entries = Themes.wordsOf(sheetTheme).map(w => Library.lookup(w)).filter(Boolean);
      closeSheet();
      if (entries.length) studyWords(entries);
    });

    $('search-input').addEventListener('input', runSearch);
    $('search-clear').addEventListener('click', () => { $('search-input').value = ''; runSearch(); $('search-input').focus(); });
    $('history-clear').addEventListener('click', () => { Store.clearHistory(); renderHistory(); });
    $('fav-add-group').addEventListener('click', () => { const name = prompt('新分组名称 / Group name'); if (name) { Store.addFavGroup(name); favGroup = name.trim(); renderFavorites(); } });
    $('word-fav-toggle').addEventListener('click', () => {
      if (!sheetWord) return;
      if (Store.isFavorite(sheetWord)) Store.removeFavorite(sheetWord);
      else Store.addFavorite(sheetWord, favGroup || Store.data.favGroups[0]);
      updateFavToggle(); renderFavorites();
    });
    $('word-study-btn').addEventListener('click', () => { const e = findEntry(sheetWord); if (e) { closeSheet(); studyWords([e]); } });

    $('plan-new-input').addEventListener('change', () => { $('set-new').value = $('plan-new-input').value; applyPlanFromBooks(); });
    $('plan-review-input').addEventListener('change', () => { $('set-review').value = $('plan-review-input').value; applyPlanFromBooks(); });
    $('import-book').addEventListener('click', importBook);

    $('set-new').addEventListener('change', applyPlan);
    $('set-review').addEventListener('change', applyPlan);
    $('set-rate').addEventListener('input', () => { Store.data.ttsRate = Number($('set-rate').value); $('set-rate-val').textContent = Number($('set-rate').value).toFixed(1); Store.save(); });
    $('set-lang').addEventListener('change', () => { Store.data.ttsLang = $('set-lang').value; Store.save(); });
    $('set-autospeak').addEventListener('change', () => { Store.data.autoSpeak = $('set-autospeak').checked; Store.save(); });
    $('set-prefer-audio').addEventListener('change', () => { Store.data.preferAudio = $('set-prefer-audio').checked; Store.save(); });
    $('set-books').addEventListener('click', () => { closeSheet(); switchView('books'); });
    $('books-back').addEventListener('click', () => switchView('study'));
    $('set-ai-enabled').addEventListener('change', () => Store.setAiConfig({ enabled: $('set-ai-enabled').checked }));
    $('set-ai-provider').addEventListener('change', () => { Store.setAiConfig({ provider: $('set-ai-provider').value }); syncAiProviderUi(); });
    $('set-ai-model').addEventListener('change', () => Store.setAiConfig({ model: $('set-ai-model').value.trim() }));
    $('set-ai-base').addEventListener('change', () => Store.setAiConfig({ base: $('set-ai-base').value.trim() }));
    $('set-ai-key').addEventListener('change', () => Store.setAiConfig({ key: $('set-ai-key').value.trim() }));
    $('set-ai-library').addEventListener('click', () => { closeSheet(); switchView('ai'); });
    $('ai-back').addEventListener('click', () => switchView('study'));
    $('ai-export').addEventListener('click', async () => {
      const btn = $('ai-export'); btn.disabled = true;
      const r = await AI.exportCache();
      btn.disabled = false;
      if (!r.ok && r.error) { btn.textContent = r.error; setTimeout(() => { btn.textContent = '导出全部'; }, 2200); }
    });
    $('set-test-speak').addEventListener('click', () => speak('hello'));
    $('set-card-reset').addEventListener('click', () => { Store.data.cardOrder = ['meaning', 'morphemes', 'family', 'synonyms', 'derivatives', 'etymology', 'inflections']; Store.save(); if (cardsEntry) renderCards(cardsEntry); });
    $('reset-progress').addEventListener('click', () => {
      if (!confirm('确定重置所有学习进度？此操作不可撤销。')) return;
      Store.data.srs = {}; Store.data.logs = {}; Store.data.errors = {};
      Store.save(); buildSession(); updatePlanBar(); renderStudy(); renderStats(); renderBooks();
      closeSheet();
    });

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { closeSheet(); return; }
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (openSheetEl) return;
      if (currentView !== 'study') return;
      if (mode === 'study') {
        if (ev.key === '1') grade(SRS.GRADE.FORGOT);
        else if (ev.key === '2') grade(SRS.GRADE.FUZZY);
        else if (ev.key === '3' || ev.key === ' ') { ev.preventDefault(); grade(SRS.GRADE.KNOW); }
        else if (ev.key === 's' || ev.key === 'S') { const it = currentItem(); if (it) speak(it.entry.word, it.entry.audio); }
      } else {
        if (ev.key === 'Enter' && !$('quiz-next').hidden) nextQuiz();
        else if (['1', '2', '3', '4'].includes(ev.key)) { const opts = $('quiz-options').children; const b = opts[Number(ev.key) - 1]; if (b) b.click(); }
        else if (ev.key === 's' || ev.key === 'S') { const e = quiz.items[quiz.idx]; if (e) speak(e.word, e.audio); }
      }
    });

    window.addEventListener('resize', () => { if (currentView === 'study' && mode === 'study') fitMorphemes(); });
    window.addEventListener('beforeunload', () => Store.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });
  }
  function applyPlanFromBooks() {
    const nw = Math.max(0, Math.min(200, parseInt($('plan-new-input').value, 10) || 0));
    const rv = Math.max(0, Math.min(500, parseInt($('plan-review-input').value, 10) || 0));
    Store.data.plan.newPerDay = nw; Store.data.plan.reviewCap = rv; Store.save();
    buildSession(); updatePlanBar();
  }

  // ===================== init =====================
  window.addEventListener('DOMContentLoaded', async () => {
    await Store.load();
    wireEvents();
    let ds = null;
    try { ds = await Platform.loadDataset(); } catch (e) { console.error('dataset load failed', e); }
    Library.init(ds || {});
    if (window.Themes && ds && ds.words) Themes.init(ds.words);
    if (!Library.hasData()) {
      $('loading').innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-3)">词库加载失败。<br>请确认 app/data 数据文件存在。</div>';
      return;
    }
    book = activeBook();
    $('lib-name').textContent = book.name;
    buildSession();
    updatePlanBar();
    renderStudy();
    renderBooks();
    const loading = $('loading');
    loading.classList.add('fade');
    setTimeout(() => { loading.hidden = true; }, 320);
    switchView('study');
  });
})();