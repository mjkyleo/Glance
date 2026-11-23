// Glance study app controller. Shared by Electron + Capacitor/browser.
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
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
  let rootsFilter = 'all';
  let affixCat = 'all';
  const ROOT_CATS = [['all', '全部'], ['new', '未学'], ['learning', '学习中'], ['near', '接近学完']];
  const rootsBatch = { groups: [], gi: 0, ri: 0, wrap: null, cur: null, io: null, infos: null };
  const affixBatch = { items: [], i: 0, wrap: null, io: null, infos: null };
  let favGroup = '';
  let sheetWord = null;
  let sheetFamily = null;
  let sheetTheme = null;
  let lastViewKey = null;
  let panelDirty = false;
  let subReturn = 'study';

  // quiz state: 'start' | 'session' | 'done'
  let quizScreen = 'start';
  let quizSession = null;
  let quizBuilding = false;
  let quizLastWarnings = [];

  const speak = (text, audio) => Platform.speak(text, { lang: Store.data.ttsLang || '', rate: Number(Store.data.ttsRate ?? 1), audio, preferAudio: Store.data.preferAudio !== false });

  // ===================== view router =====================
  const TOP_VIEWS = ['study', 'roots', 'themes', 'search', 'me'];
  const SUB_VIEWS = ['stats', 'books', 'ai', 'exams'];
  let navStack = [];
  function switchView(v, opts) {
    if (nestedSheetEl || openSheetEl) { closeNestedSheet(); closeSheet(true); }
    const fromBack = !!(opts && opts.fromBack);
    const prev = currentView;
    if (!fromBack && TOP_VIEWS.includes(prev) && TOP_VIEWS.includes(v) && prev !== v) {
      navStack.push(prev);
      if (navStack.length > 24) navStack.shift();
    }
    currentView = v;
    ['study', 'roots', 'themes', 'search', 'me', 'stats', 'books', 'ai', 'exams'].forEach(name => {
      $('view-' + name).hidden = name !== v;
    });
    const tabView = SUB_VIEWS.includes(v) ? (subReturn || 'study') : v;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === tabView));
    const activeTab = document.querySelector('.tab.active');
    if (activeTab && !fromBack) { activeTab.classList.remove('pop'); void activeTab.offsetWidth; activeTab.classList.add('pop'); }
    placeTabIndicator();
    if (v === 'study') { updatePlanBar(); updateStudyVisibility(); if (panelDirty && mode === 'study' && currentItem()) renderStudy(); }
    if (v === 'roots') { rootsTab === 'roots' ? renderRoots() : renderAffixes(); }
    if (v === 'themes') renderThemes();
    if (v === 'search') renderSearchDefault();
    if (v === 'me') renderMe();
    if (v === 'stats') renderStats();
    if (v === 'books') renderBooks();
    if (v === 'ai') renderAiLibrary();
    if (v === 'exams' && examPane === 'list') renderExamsList();
  }
  function openSub(v) {
    if (!SUB_VIEWS.includes(currentView)) subReturn = currentView;
    switchView(v);
  }
  function backFromSub() {
    switchView(subReturn || 'study');
  }
  // Unified back behaviour: nested sheet → sheet → sub-page → quiz→study → tab history → exit.
  // Returns true when handled internally; false means we are at the root (caller may exit).
  function handleBack() {
    if (nestedSheetEl) { closeNestedSheet(); return true; }
    if (openSheetEl) { closeSheet(); return true; }
    if (currentView === 'exams' && examPane !== 'list') { examBack(); return true; }
    if (SUB_VIEWS.includes(currentView)) { backFromSub(); return true; }
    if (currentView === 'study' && mode === 'quiz') { setMode('study'); return true; }
    if (navStack.length) { switchView(navStack.pop(), { fromBack: true }); return true; }
    return false;
  }
  function setCrumbs(id, items) {
    const nav = $(id);
    if (!nav) return;
    nav.innerHTML = '';
    if (items.length < 2) { nav.hidden = true; return; }
    nav.hidden = false;
    items.forEach((it, i) => {
      if (i) nav.appendChild(el('span', 'crumb-sep', '›'));
      if (i < items.length - 1 && it.fn) {
        const b = el('button', 'crumb-link', it.label); b.type = 'button';
        b.addEventListener('click', it.fn);
        nav.appendChild(b);
      } else nav.appendChild(el('span', 'crumb-current', it.label));
    });
  }
  const crumbMine = () => ({ label: '我的', fn: () => switchView('me') });
  function examCrumbs() {
    const paper = examCur ? examCur.year + '年' + examCur.month + '月 · 第' + examCur.set + '套' : '试卷';
    const toList = { label: '真题刷题', fn: () => { examCur = null; examShowPane('list'); renderExamsList(); } };
    if (examPane === 'list') setCrumbs('crumbs-exams', [crumbMine(), { label: '真题刷题' }]);
    else if (examPane === 'detail') setCrumbs('crumbs-exams', [crumbMine(), toList, { label: paper }]);
    else setCrumbs('crumbs-exams', [crumbMine(), toList, { label: paper, fn: () => { renderExamDetail(); examShowPane('detail'); } }, { label: examPane === 'session' ? (EXAM_TYPE_NAME[examType] || '刷题') : '练习结果' }]);
  }

  // ===================== theme =====================
  const THEME_META = {
    blue: ['#f5f7fa', '#131418'],
    green: ['#f4f7f1', '#141a16'],
    yellow: ['#faf5ee', '#1c1713'],
    gray: ['#f3f2f0', '#141516'],
    black: ['#f6f6f6', '#0b0b0c'],
    paper: ['#f7f7f5', '#191919'],
    sakura: ['#faf7f7', '#1b1517'],
    violet: ['#f4f4fb', '#15141c'],
  };
  function applyTheme(theme) {
    const t = THEME_META[theme] ? theme : 'blue';
    document.documentElement.dataset.theme = t;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas[0]) metas[0].content = THEME_META[t][0];
    if (metas[1]) metas[1].content = THEME_META[t][1];
    document.querySelectorAll('[data-theme-choice]').forEach(b => {
      const on = b.dataset.themeChoice === t;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function setTheme(theme) {
    if (!THEME_META[theme]) return;
    Store.data.theme = theme;
    Store.save();
    applyTheme(theme);
  }

  // ===================== background image =====================
  function applyBackground() {
    const bg = Store.data.background;
    const layer = $('app-bg');
    const on = !!bg.image;
    document.body.classList.toggle('has-bg', on);
    if (layer) layer.style.backgroundImage = on ? 'url("' + bg.image + '")' : '';
    document.documentElement.style.setProperty('--bg-veil', String((bg.veil ?? 38) / 100));
    document.documentElement.style.setProperty('--bg-blur', (bg.blur || 0) + 'px');
  }
  function syncBackgroundUi() {
    const bg = Store.data.background;
    const prev = $('bg-preview');
    if (prev) {
      prev.style.backgroundImage = bg.image ? 'url("' + bg.image + '")' : '';
      prev.classList.toggle('has-image', !!bg.image);
      const empty = prev.querySelector('.bg-preview-empty');
      if (empty) empty.hidden = !!bg.image;
    }
    const remove = $('bg-remove');
    if (remove) remove.hidden = !bg.image;
    $('bg-veil').value = bg.veil ?? 38;
    $('bg-veil-val').textContent = (bg.veil ?? 38) + '%';
    $('bg-blur').value = bg.blur ?? 0;
    $('bg-blur-val').textContent = (bg.blur ?? 0) + 'px';
  }
  function readBackgroundImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const bgColor = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f5f7fa';
          const draw = (w, h) => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.fillStyle = bgColor;
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            return c;
          };
          let w = img.width, h = img.height;
          const max = 1440;
          if (w > max || h > max) {
            const k = max / Math.max(w, h);
            w = Math.round(w * k); h = Math.round(h * k);
          }
          let canvas = draw(w, h);
          let q = 0.82;
          let url = canvas.toDataURL('image/jpeg', q);
          while (url.length > 480000 && q > 0.42) {
            q -= 0.08;
            url = canvas.toDataURL('image/jpeg', q);
          }
          let scale = 0.8;
          while (url.length > 480000 && scale >= 0.5) {
            canvas = draw(Math.round(w * scale), Math.round(h * scale));
            url = canvas.toDataURL('image/jpeg', 0.7);
            scale -= 0.1;
          }
          resolve(url);
        };
        img.onerror = () => reject(new Error('图片无法解码'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }
  async function chooseBackground(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { alert('请选择图片文件。'); return; }
    try {
      const url = await readBackgroundImage(file);
      Store.setBackground({ image: url });
      applyBackground();
      syncBackgroundUi();
    } catch (err) {
      alert('背景设置失败：' + ((err && err.message) || err));
    }
  }

  function readAvatarImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const size = 256;
          const side = Math.min(img.width, img.height);
          const sx = Math.round((img.width - side) / 2);
          const sy = Math.round((img.height - side) / 2);
          const c = document.createElement('canvas');
          c.width = size; c.height = size;
          const ctx = c.getContext('2d');
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          let fmt = 'image/webp';
          let url = c.toDataURL(fmt, 0.86);
          if (!/^data:image\/webp/.test(url)) { fmt = 'image/jpeg'; url = c.toDataURL(fmt, 0.86); }
          let q = 0.86;
          while (url.length > 90000 && q > 0.5) {
            q -= 0.1;
            url = c.toDataURL(fmt, q);
          }
          resolve(url);
        };
        img.onerror = () => reject(new Error('图片无法解码'));
        img.src = String(reader.result);
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsDataURL(file);
    });
  }

  // ===================== sheets =====================
  let openSheetEl = null;
  let nestedSheetEl = null;
  let nestedCloseTimer = 0;
  let profileDraft = null;
  let sheetReturnFocus = null;
  let nestedReturnFocus = null;
  function sheetDurMs() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--dur-slow').trim();
    const n = parseFloat(v);
    if (!isNaN(n) && n > 0) return /ms\s*$/.test(v) ? n : n * 1000;
    return 300;
  }
  function sheetFocusables(s) {
    return Array.from(s.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter(el => !el.disabled && el.offsetParent !== null);
  }
  function focusSheet(s) {
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-modal', 'true');
    if (!s.hasAttribute('tabindex')) s.setAttribute('tabindex', '-1');
    setTimeout(() => { try { s.focus({ preventScroll: true }); } catch {} }, 0);
  }
  function releaseSheet(s) {
    s.removeAttribute('aria-modal');
    s.removeAttribute('role');
  }
  function pagesDesktop() { return window.matchMedia('(min-width: 960px)').matches; }
  function setAppInert(on) {
    const app = document.querySelector('.app');
    if (app) app.inert = on && !pagesDesktop();
  }
  function placeTabIndicator() {
    const bar = $('tabbar'), ind = $('tab-indicator');
    if (!bar || !ind) return;
    const act = bar.querySelector('.tab.active');
    if (!act || bar.hidden) { ind.style.opacity = '0'; return; }
    ind.style.opacity = '1';
    ind.style.left = act.offsetLeft + 'px';
    ind.style.top = act.offsetTop + 'px';
    ind.style.width = act.offsetWidth + 'px';
    ind.style.height = act.offsetHeight + 'px';
  }
  function trapSheetFocus(e) {
    if (e.key !== 'Tab') return;
    const s = nestedSheetEl || openSheetEl;
    if (!s || pagesDesktop()) return;
    const f = sheetFocusables(s);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1];
    const active = document.activeElement;
    if (!s.contains(active)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }
  document.addEventListener('keydown', trapSheetFocus);
  function announce(msg) {
    const n = $('sr-status');
    if (!n) return;
    n.textContent = '';
    requestAnimationFrame(() => { n.textContent = msg; });
  }
  function openSheet(id) {
    closeNestedSheet();
    closeSheet(true);
    const s = $(id);
    sheetReturnFocus = document.activeElement;
    s.hidden = false;
    const bd = $('sheet-backdrop');
    bd.hidden = false;
    setAppInert(true);
    requestAnimationFrame(() => { s.classList.add('show'); bd.classList.add('show'); });
    openSheetEl = s;
    focusSheet(s);
  }
  function closeSheet(instant) {
    if (nestedSheetEl) closeNestedSheet();
    const bd = $('sheet-backdrop');
    if (openSheetEl) {
      const s = openSheetEl;
      s.classList.remove('show');
      bd.classList.remove('show');
      openSheetEl = null;
      releaseSheet(s);
      setAppInert(false);
      const restore = sheetReturnFocus; sheetReturnFocus = null;
      const done = () => {
        s.hidden = true; if (!openSheetEl) bd.hidden = true;
        if (restore && document.contains(restore) && !openSheetEl) { try { restore.focus({ preventScroll: true }); } catch {} }
      };
      if (instant) done();
      else setTimeout(done, sheetDurMs());
    } else { bd.hidden = true; setAppInert(false); }
  }
  function openNestedSheet(id) {
    clearTimeout(nestedCloseTimer);
    const s = $(id), bd = $('sheet-backdrop-nested');
    nestedReturnFocus = document.activeElement;
    s.hidden = false;
    bd.hidden = false;
    requestAnimationFrame(() => { s.classList.add('show'); bd.classList.add('show'); });
    nestedSheetEl = s;
    focusSheet(s);
  }
  function closeNestedSheet() {
    clearTimeout(nestedCloseTimer);
    const s = nestedSheetEl, bd = $('sheet-backdrop-nested');
    nestedSheetEl = null;
    if (!s) { bd.hidden = true; return; }
    s.classList.remove('show');
    bd.classList.remove('show');
    releaseSheet(s);
    const restore = nestedReturnFocus; nestedReturnFocus = null;
    nestedCloseTimer = setTimeout(() => {
      s.hidden = true; bd.hidden = true;
      if (restore && document.contains(restore)) { try { restore.focus({ preventScroll: true }); } catch {} }
    }, sheetDurMs());
  }

  // ===================== active book =====================
  function activeBook() {
    const tag = Store.data.activeBook;
    const custom = Store.data.customBooks[tag];
    if (custom) return Library.customBook(tag, custom);
    return Library.getBook(tag) || Library.getBook('六级') || { tag: '六级', name: '六级词库', n: 0, entries: [] };
  }
  function resolveBook(tag) {
    const custom = Store.data.customBooks[tag];
    if (custom) return Library.customBook(tag, custom);
    return Library.getBook(tag) || null;
  }
  function knownCount(entries) { let n = 0; for (const e of entries) if (SRS.isKnown(Store.data.srs[e.word])) n++; return n; }
  // Optional book filters only trim the daily study queue; the book itself and quiz scopes stay intact.
  function studyEntries(b) {
    const f = Store.data.bookFilter || {};
    let entries = b.entries;
    if (f.skipBasic !== false) {
      const basic = Library.basicWordSet();
      entries = entries.filter(e => !basic.has(e.word));
    }
    if (f.skipLower && !b.custom) {
      const lower = Library.lowerWordSet(b.tag);
      if (lower.size) entries = entries.filter(e => !lower.has(e.word));
    }
    if (f.excludeBooks && f.excludeBooks.length) {
      const ex = Library.excludeWordSet(f.excludeBooks);
      if (ex.size) entries = entries.filter(e => !ex.has(e.word));
    }
    if (f.skipKnown) entries = entries.filter(e => !SRS.isKnown(Store.data.srs[e.word]));
    return entries;
  }

  // ===================== study session =====================
  function buildSession(bonusNew) {
    book = activeBook();
    const now = Date.now();
    const prog = Store.planProgress();
    const newLeft = bonusNew ? 10 : prog.newLeft;
    const q = SRS.buildQueue(studyEntries(book), Store.data.srs, { newLeft, reviewCap: Store.data.plan.reviewCap }, now);
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
    const quizOn = mode === 'quiz';
    $('quiz-start').hidden = !(quizOn && quizScreen === 'start');
    $('quiz-session').hidden = !(quizOn && quizScreen === 'session');
    $('quiz-done').hidden = !(quizOn && quizScreen === 'done');
    $('grade-footer').hidden = !hasItem;
    $('mode-study').classList.toggle('active', inStudy);
    $('mode-quiz').classList.toggle('active', quizOn);
    $('mode-study').setAttribute('aria-selected', String(inStudy));
    $('mode-quiz').setAttribute('aria-selected', String(quizOn));
  }

  function setMode(m) {
    mode = m;
    if (m === 'quiz') {
      if (quizSession && quizSession.done) quizScreen = 'done';
      else if (quizSession) quizScreen = 'session';
      else quizScreen = 'start';
      renderQuizScreen();
    } else {
      clearQuizAuto();
      updateStudyVisibility();
      renderStudy();
    }
    updatePlanBar();
  }

  function updatePlanBar() {
    const bar = $('study-progress');
    const fill = $('study-progress-fill');
    if (!bar || !fill) return;
    let done = sessionIdx, total = session.length;
    if (mode === 'quiz') {
      const s = quizSession;
      total = s ? s.questions.length : 0;
      done = s ? s.idx + (s.answered ? 1 : 0) : 0;
    }
    const pct = total ? Math.round((Math.min(done, total) / total) * 100) : (mode === 'quiz' ? 0 : 100);
    fill.style.width = pct + '%';
    bar.setAttribute('aria-valuenow', String(pct));
    const noProgress = mode === 'quiz' && !quizSession;
    bar.hidden = noProgress;
    bar.parentElement.classList.toggle('quiz-no-progress', noProgress);
  }

  function renderStudy() {
    panelDirty = false;
    updateStudyVisibility();
    const item = currentItem();
    if (!item) { renderEmpty(); return; }
    const e = item.entry;
    const viewKey = e.word + '|' + sessionIdx + '|' + ((session[0] && session[0].entry.word) || '');
    if (viewKey !== lastViewKey) { lastViewKey = viewKey; Store.recordView(e.word); }
    const st = Store.data.srs[e.word];
    const sp = Store.data.studyPanel || {};
    $('word').textContent = e.word;
    $('speak-button').hidden = sp.phonetic === false;
    const badge = $('word-badge');
    if (item.kind === 'new') { badge.textContent = '新词'; badge.className = 'word-badge new'; }
    else if (SRS.isKnown(st)) { badge.textContent = '已掌握'; badge.className = 'word-badge known'; }
    else { badge.textContent = '复习'; badge.className = 'word-badge review'; }
    $('word-due').textContent = item.kind === 'new' ? '' : SRS.nextDueLabel(st, Date.now());
    renderWordBlocks(e, $('word-blocks'), $('word-sub'));
    updatePlanBar();
    const panel = $('study-panel');
    panel.classList.remove('anim'); void panel.offsetWidth; panel.classList.add('anim');
    panel.scrollTop = 0;
    renderTs = Date.now();
    if (Store.data.autoSpeak) speak(e.word, e.audio);
  }

  // 唯一的信息块清单：学习页与词卡弹层共用一套顺序与开关。
  const BLOCK_IDS = ['phonetic', 'morphemes', 'mnemonic', 'meaning', 'definitions', 'family', 'synonyms', 'derivatives', 'inflections', 'etymology', 'examples', 'collocations', 'freq', 'cloze', 'dict', 'ai'];

  function panelOrder() {
    const saved = Array.isArray(Store.data.studyPanelOrder) ? Store.data.studyPanelOrder : [];
    const out = saved.filter((id, i) => BLOCK_IDS.includes(id) && saved.indexOf(id) === i);
    BLOCK_IDS.forEach(id => { if (!out.includes(id)) out.push(id); });
    return out;
  }
  function mnemonicText(e) {
    const ai = Store.aiExplanation(e.word);
    if (ai && ai.data && ai.data.memoryTip) return { text: ai.data.memoryTip, ai: true };
    return e.mnemonic ? { text: e.mnemonic, ai: false } : null;
  }

  // 唯一的信息块渲染器：学习页内联与词卡弹层都走这里，顺序/开关只有一套。
  // 资源来源不同（全局词库 / 真题语料 / 外部词典 / AI 缓存），显示与配置统一。
  function renderWordBlocks(e, host, head) {
    if (!host) return;
    host.innerHTML = '';
    if (head) { head.innerHTML = ''; head.hidden = true; }
    const sp = Store.data.studyPanel || {};
    const on = k => sp[k] !== false;

    function row(label, node, meta) {
      const r = el('section', 'info-row');
      const lab = el('div', 'info-label', label);
      if (meta) lab.appendChild(el('span', 'info-label-meta', meta));
      r.appendChild(lab);
      const body = el('div', 'info-body');
      body.appendChild(node);
      r.appendChild(body);
      return r;
    }
    function linkList(items) {
      const box = el('div', 'info-links');
      items.forEach((it, i) => {
        if (i) box.appendChild(el('span', 'info-sep', '·'));
        const link = el(it.word ? 'button' : 'span', 'info-link');
        if (it.word) { link.type = 'button'; link.addEventListener('click', () => openWordSheet(it.word)); }
        link.appendChild(el('span', 'info-link-main', it.main));
        if (it.sub) link.appendChild(el('span', 'info-link-sub', it.sub));
        box.appendChild(link);
      });
      return box;
    }

    const builders = {
      phonetic() {
        if (!on('phonetic')) return null;
        const text = e.phonetic ? '/' + e.phonetic + '/' + (e.cefr ? '  ·  ' + e.cefr : '') : (e.cefr || '');
        if (!text) return null;
        const node = el('div', 'phonetic', text);
        if (head) { head.appendChild(node); head.hidden = false; return null; }
        return node;
      },
      morphemes() {
        if (!on('morphemes')) return null;
        const m = buildMorphLine(e.morphemes || [], e.root);
        if (!m) return null;
        if (head) { head.appendChild(m); head.hidden = false; return null; }
        return row('构词', m);
      },
      mnemonic() {
        if (!on('mnemonic')) return null;
        const m = mnemonicText(e);
        if (!m) return null;
        return row('巧记', el('p', 'ai-text', m.text), m.ai ? 'AI' : '');
      },
      meaning() {
        if (!on('meaning') || !e.zh) return null;
        return row('释义', el('div', 'word-meaning', e.zh));
      },
      definitions() {
        if (!on('definitions') || !(e.definitions || []).length) return null;
        const list = el('div', 'info-defs');
        e.definitions.slice(0, 4).forEach(d => {
          const r = el('div', 'info-def');
          if (d[0]) r.appendChild(el('span', 'info-def-pos', d[0] + '.'));
          r.appendChild(el('span', 'info-def-text', d[1] || ''));
          list.appendChild(r);
        });
        if (e.definitions.length > 4) list.appendChild(el('div', 'info-more', '还有 ' + (e.definitions.length - 4) + ' 条'));
        return row('英文释义', list);
      },
      family() {
        const famRoot = e.rootFamily && e.rootFamily.root;
        if (!on('family') || !famRoot) return null;
        const fam = Library.getFamily(famRoot);
        const box = el('div', 'info-family');
        const rootBtn = el('button', 'info-root');
        rootBtn.type = 'button';
        rootBtn.appendChild(el('span', 'info-root-text', famRoot));
        const gloss = e.rootFamily.rootZh || (fam && fam.zh) || '';
        if (gloss) rootBtn.appendChild(el('span', 'info-root-gloss', gloss));
        rootBtn.addEventListener('click', () => openFamily(famRoot));
        box.appendChild(rootBtn);
        const words = ((fam && fam.family) || []).filter(w => w.word !== e.word);
        if (words.length) {
          box.appendChild(linkList(words.slice(0, 8).map(w => ({ main: w.word, sub: w.zh, word: w.word }))));
          if (words.length > 8) box.appendChild(el('span', 'info-more', '+' + (words.length - 8) + ' 词'));
        }
        return row('词根家族', box);
      },
      synonyms() {
        if (!on('synonyms') || !(e.synonyms || []).length) return null;
        return row('近义词', linkList(e.synonyms.slice(0, 10).map(w => ({ main: w, word: w }))));
      },
      derivatives() {
        if (!on('derivatives') || !(e.derivatives || []).length) return null;
        return row('派生词', linkList(e.derivatives.slice(0, 8).map(d => ({
          main: d[0],
          sub: d[1] ? ({ pre: '前缀 ', suf: '后缀 ' }[d[2]] || '') + d[1] : '',
          word: d[0]
        }))));
      },
      inflections() {
        if (!on('inflections') || !(e.inflections || []).length) return null;
        return row('词形变化', linkList(e.inflections.map(w => ({ main: w }))));
      },
      etymology() {
        if (!on('etymology') || !e.etymology) return null;
        return row('词源', el('p', 'ai-text', e.etymology));
      },
      examples() {
        if (!on('examples')) return null;
        let list = e.examples || [];
        let meta = '';
        if (!list.length) {
          const ai = Store.aiExplanation(e.word);
          if (ai && ai.data && Array.isArray(ai.data.examples) && ai.data.examples.length) { list = ai.data.examples; meta = 'AI'; }
        }
        if (!list.length) return null;
        const wrap = el('div', 'ai-examples');
        list.slice(0, 3).forEach(ex => {
          const en = typeof ex === 'string' ? ex : (ex && (ex.en || ex.example)) || '';
          if (!en) return;
          const d = el('div', 'ai-example');
          d.appendChild(el('div', 'ai-ex-en', en));
          const zh = typeof ex === 'string' ? '' : (ex && (ex.zh || ex.cn)) || '';
          if (zh) d.appendChild(el('div', 'ai-ex-zh', zh));
          wrap.appendChild(d);
        });
        return wrap.childNodes.length ? row('例句', wrap, meta) : null;
      },
      collocations() {
        if (!on('collocations')) return null;
        let list = e.collocations || [];
        let meta = '';
        if (!list.length) {
          const ai = Store.aiExplanation(e.word);
          if (ai && ai.data && Array.isArray(ai.data.collocations) && ai.data.collocations.length) { list = ai.data.collocations; meta = 'AI'; }
        }
        if (!list.length) return null;
        return row('搭配', linkList(list.slice(0, 10).map(c => ({ main: c }))), meta);
      },
      freq() { return on('freq') ? freqSection(e) : null; },
      cloze() { return on('cloze') ? clozeSection(e.word) : null; },
      dict() { return on('dict') ? dictSection(e) : null; },
      ai() { return on('ai') ? aiSection(e) : null; }
    };

    panelOrder().forEach(id => {
      const node = builders[id] && builders[id]();
      if (node) host.appendChild(node);
    });
    host.hidden = !host.childNodes.length;
    const lines = [];
    if (head) head.querySelectorAll('.morph-line').forEach(l => lines.push(l));
    host.querySelectorAll('.morph-line').forEach(l => lines.push(l));
    if (lines.length) requestAnimationFrame(() => lines.forEach(fitMorphLine));
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
    announce((g === SRS.GRADE.KNOW ? '认识' : g === SRS.GRADE.FUZZY ? '模糊' : '忘记') + '：' + item.entry.word);
    Platform.haptic(g === SRS.GRADE.KNOW ? 'success' : g === SRS.GRADE.FUZZY ? 'warn' : 'error');
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
  const MORPH_TYPE = { prefix: '前缀', root: '词根', suffix: '后缀' };
  function morphGlossOf(c, rootWord) {
    if (c.gloss) return c.gloss;
    const base = String(c.text || '').replace(/^-+|-+$/g, '');
    if (c.type === 'root' && rootWord) { const f = Library.getFamily(rootWord); if (f && f.zh) return f.zh; }
    const id = c.type === 'prefix' ? base + '-' : c.type === 'suffix' ? '-' + base : base;
    const a = Library.getAffixes().find(x => x.id === id);
    if (a && (a.zh || a.en)) return a.zh || a.en;
    const r = Library.listRoots().find(x => x.root === base);
    return (r && (r.zh || r.g)) || '';
  }
  // 构词合并为一行：词素大字按类型配色，类型徽标与释义在各自列下方对齐。
  function buildMorphLine(chips, rootWord) {
    if (!chips || !chips.length) return null;
    const line = el('div', 'morph-line');
    chips.forEach((c, i) => {
      if (!c || !c.text) return;
      if (line.childNodes.length) line.appendChild(el('span', 'morph-join', '+'));
      const type = ['prefix', 'root', 'suffix'].includes(c.type) ? c.type : 'root';
      const gloss = morphGlossOf(c, rootWord);
      const col = el('div', 'morph-col morph-' + type);
      const part = el('button', 'morph-part');
      part.type = 'button';
      part.textContent = c.text;
      part.title = (MORPH_TYPE[c.type] || '词素') + (gloss ? ' · ' + gloss : '');
      part.addEventListener('click', () => {
        if (c.type === 'root' && rootWord) openFamily(rootWord);
        else openAffixByChip(c.text.replace(/^-+|-+$/g, ''), c.type);
      });
      col.appendChild(part);
      col.appendChild(el('span', 'morph-type', MORPH_TYPE[c.type] || '词素'));
      col.appendChild(el('span', 'morph-gloss', gloss));
      line.appendChild(col);
    });
    return line.childNodes.length ? line : null;
  }
  function fitMorphLine(line) {
    if (!line || !line.isConnected) return;
    const parts = line.querySelectorAll('.morph-part');
    if (!parts.length) return;
    let size = 20;
    const apply = () => {
      parts.forEach(p => { p.style.fontSize = size + 'px'; });
      line.style.setProperty('--morph-part-h', Math.round(size * 1.2) + 'px');
    };
    apply();
    while (size > 13 && line.scrollWidth > line.clientWidth + 1) { size -= 1; apply(); }
  }

  // ===================== quiz =====================
  function quizCfg() { return Store.data.quiz.config; }
  function quizUpdate(patch) {
    Store.setQuizConfig(patch);
    if (quizScreen === 'start') renderQuizStart();
    renderQuizSettings();
  }
  function quizConfigSummary() {
    const cfg = quizCfg();
    const scope = (QuizEngine.SCOPES.find(s => s.id === cfg.scope) || {}).name || '';
    const types = cfg.types.map(t => QuizEngine.TYPE_LABEL[t]).join(' / ');
    const diff = { auto: '自动难度', easy: '简单难度', normal: '普通难度', hard: '困难难度' }[cfg.difficulty] || '';
    const parts = [scope, cfg.count + ' 题', types, diff];
    if (cfg.explore > 0) parts.push('探索 ' + cfg.explore + '%');
    return parts.filter(Boolean).join(' · ');
  }
  function quizThemeOptions() {
    const list = window.Themes ? Themes.list().filter(t => t.n > 0) : [];
    return list;
  }
  function quizDiffLabel(d) {
    if (d < 0.4) return '简单';
    if (d < 0.62) return '普通';
    return '困难';
  }
  const QUIZ_SOURCE_LABEL = {
    due: '到期复习', weak: '薄弱词', confused: '易混词', curated: '收藏/分组',
    review: '已学复习', contact: '浏览关注', new: '新词探索'
  };

  function renderQuizEstimate() {
    const box = $('quiz-estimate');
    if (!box) return;
    box.innerHTML = '';
    const cfg = quizCfg();
    const info = QuizEngine.estimate(cfg);
    const line = el('div', 'quiz-est-line');
    line.appendChild(el('b', null, info.available + ' 题'));
    line.appendChild(document.createTextNode(' 可用 · 覆盖 ' + info.pool + ' 个词'));
    box.appendChild(line);
    const chipRow = el('div', 'quiz-est-types');
    QuizEngine.TYPES.forEach(t => {
      if (!cfg.types.includes(t)) return;
      chipRow.appendChild(el('span', 'quiz-est-chip', QuizEngine.TYPE_LABEL[t] + ' ' + (info.types[t] || 0)));
    });
    box.appendChild(chipRow);
    if (info.plan) {
      box.appendChild(el('p', 'quiz-est-plan',
        '本轮计划：复习 ' + info.plan.review + ' 题 · 探索 ' + info.plan.explore + ' 题（依据 ' + info.profile.recorded + ' 个有记录词）'));
    }
    if (info.onlineCloze) box.appendChild(el('p', 'quiz-est-note', '约 ' + info.onlineCloze + ' 个词需要联网补充例句，离线或失败时自动回退。'));
    if (!info.available) box.appendChild(el('p', 'quiz-est-warn', '当前范围没有可测试的词，换个范围或先学习一些单词。'));
    else if (info.available < cfg.count) box.appendChild(el('p', 'quiz-est-warn', '可用题量不足：预计 ' + info.available + ' 题，计划 ' + cfg.count + ' 题，可以缩小范围或减少题数。'));
    $('quiz-start-btn').disabled = !info.available || quizBuilding;
    return info;
  }

  function renderQuizStart() {
    const cfg = quizCfg();
    const info = QuizEngine.estimate(cfg);
    $('quiz-start-config').textContent = quizConfigSummary();
    $('quiz-start-count').textContent = info.available
      ? '可用 ' + info.available + ' 题 · 覆盖 ' + info.pool + ' 个词'
      : '当前范围没有可测试的词';
    const basis = $('quiz-start-basis');
    if (basis) {
      if (info.profile && info.profile.recorded && info.plan) {
        basis.hidden = false;
        basis.textContent = '依据你的学习记录组卷：' + info.profile.recorded + ' 个有记录词' +
          (info.profile.confused ? ' · 易混词 ' + info.profile.confused : '') +
          ' · 本轮复习 ' + info.plan.review + ' / 探索 ' + info.plan.explore;
      } else if (info.available) {
        basis.hidden = false;
        basis.textContent = '还没有学习记录，本轮以新词探索为主；开始学习后，记录会自动成为组卷与干扰项的依据。';
      } else basis.hidden = true;
    }
    const fitBox = $('quiz-fit');
    if (fitBox) {
      fitBox.innerHTML = '';
      if (info.available && info.fit) {
        fitBox.hidden = false;
        const f = info.fit, tier = QuizEngine.FIT_TIERS[f.tier];
        const head = el('div', 'quiz-fit-head');
        head.appendChild(el('span', 'quiz-fit-score', String(f.score)));
        const meta = el('div', 'quiz-fit-meta');
        meta.appendChild(el('span', 'quiz-fit-tier', tier[0]));
        meta.appendChild(el('span', 'quiz-fit-sub', '定制贴合度 · ' + tier[1]));
        head.appendChild(meta);
        fitBox.appendChild(head);
        const bars = el('div', 'quiz-fit-bars');
        [['词覆盖', f.parts.cover, 50], ['记忆深度', f.parts.depth, 30], ['学习广度', f.parts.breadth, 20]].forEach(row => {
          const r = el('div', 'quiz-fit-row');
          r.appendChild(el('span', 'quiz-fit-label', row[0] + ' · 权重 ' + row[2] + '%'));
          const track = el('span', 'quiz-fit-track');
          const fill = el('i');
          fill.style.width = Math.round(row[1] * 100) + '%';
          track.appendChild(fill);
          r.appendChild(track);
          r.appendChild(el('span', 'quiz-fit-val', String(Math.round(row[1] * 100))));
          bars.appendChild(r);
        });
        fitBox.appendChild(bars);
        const more = el('details', 'quiz-fit-more');
        more.appendChild(el('summary', '', '计算依据'));
        const i = f.inputs;
        more.appendChild(el('p', '', '贴合度 = 100 × (50% × 覆盖 + 30% × 深度 + 20% × 广度)。每个因子用 x/(x+k) 饱和：记录越多越贴合、增幅渐缓，且新增记录不会让分数下降。'));
        more.appendChild(el('p', '', '覆盖 = 当前范围有记录词占比 ' + i.recordedInPool + '/' + i.poolSize + '（k=0.10）;深度 = 累计评分 ' + i.reps + ' 次（k=600）;广度 = 活跃 ' + i.days + ' 天（k=12，占 60%）+ ' + i.kinds + '/6 类行为信号（k=3，占 40%）。'));
        fitBox.appendChild(more);
      } else fitBox.hidden = true;
    }
    const note = $('quiz-start-note');
    let noteText = '';
    if (!info.available) noteText = '换个范围或先学习一些单词；也可以点右上角设置调整范围。';
    else if (info.available < cfg.count) noteText = '可用题量不足：预计 ' + info.available + ' 题，计划 ' + cfg.count + ' 题，可减少题数或缩小范围。';
    note.textContent = noteText;
    note.hidden = !noteText;
    note.classList.remove('warn');
    const btn = $('quiz-start-btn');
    btn.disabled = !info.available || quizBuilding;
    btn.textContent = quizBuilding ? '正在准备…' : '开始';
    updateStudyVisibility();
  }

  function renderQuizSettings() {
    const cfg = quizCfg();
    const scopeBox = $('quiz-scope');
    scopeBox.innerHTML = '';
    QuizEngine.SCOPES.forEach(s => {
      const b = el('button', 'chip' + (cfg.scope === s.id ? ' active' : ''), s.name);
      b.type = 'button';
      b.addEventListener('click', () => quizUpdate({ scope: s.id }));
      scopeBox.appendChild(b);
    });

    const themes = quizThemeOptions();
    const themeWrap = $('quiz-theme-wrap');
    themeWrap.hidden = cfg.scope !== 'theme';
    if (cfg.scope === 'theme' && themes.length) {
      const sel = $('quiz-theme');
      sel.innerHTML = '';
      themes.forEach(t => {
        const o = el('option', null, t.name + '（' + t.n + '）');
        o.value = t.id;
        sel.appendChild(o);
      });
      let current = cfg.theme;
      if (!themes.some(t => t.id === current)) {
        current = themes[0].id;
        Store.setQuizConfig({ theme: current });
      }
      sel.value = current;
    }

    const countBox = $('quiz-count');
    countBox.innerHTML = '';
    [5, 10, 20].forEach(n => {
      const b = el('button', 'chip' + (cfg.count === n ? ' active' : ''), n + ' 题');
      b.type = 'button';
      b.addEventListener('click', () => quizUpdate({ count: n }));
      countBox.appendChild(b);
    });

    const typeBox = $('quiz-types');
    typeBox.innerHTML = '';
    QuizEngine.TYPES.forEach(t => {
      const on = cfg.types.includes(t);
      const b = el('button', 'chip' + (on ? ' active' : ''), QuizEngine.TYPE_LABEL[t]);
      b.type = 'button';
      b.addEventListener('click', () => {
        let types = cfg.types.slice();
        if (types.includes(t)) {
          if (types.length === 1) return;
          types = types.filter(x => x !== t);
        } else types.push(t);
        quizUpdate({ types });
      });
      typeBox.appendChild(b);
    });

    const diffBox = $('quiz-difficulty');
    diffBox.innerHTML = '';
    const DIFFS = [['auto', '自动'], ['easy', '简单'], ['normal', '普通'], ['hard', '困难']];
    DIFFS.forEach(([id, name]) => {
      const b = el('button', 'chip' + (cfg.difficulty === id ? ' active' : ''), name);
      b.type = 'button';
      b.addEventListener('click', () => quizUpdate({ difficulty: id }));
      diffBox.appendChild(b);
    });
    $('quiz-diff-hint').textContent = cfg.difficulty === 'auto'
      ? '按历史正确率动态调整（能力值 ' + Math.round(QuizEngine.ability() * 100) + '%）'
      : '';

    $('quiz-online').checked = cfg.online;

    const ex = $('quiz-explore');
    ex.value = cfg.explore;
    $('quiz-explore-val').textContent = cfg.explore + '%';
    ex.oninput = () => { $('quiz-explore-val').textContent = ex.value + '%'; };
    ex.onchange = () => quizUpdate({ explore: Number(ex.value) });
    const conf = $('quiz-confusion');
    conf.checked = cfg.confusion;
    conf.onchange = () => quizUpdate({ confusion: conf.checked });
    const cur = $('quiz-curated');
    cur.checked = cfg.curated;
    cur.onchange = () => quizUpdate({ curated: cur.checked });

    const info = renderQuizEstimate();
    const st = info.profile;
    $('quiz-profile-line').textContent = st.recorded
      ? '已记录 ' + st.recorded + ' 词 · 易混 ' + st.confused + ' · 到期 ' + st.due + ' · 收藏/分组 ' + st.curated + ' · 近 14 天活跃 ' + st.days + ' 天'
      : '暂无学习记录：本轮以新词探索为主，学习、查词、收藏与答错记录都会自动成为组卷依据。';
  }

  async function startQuiz(override) {
    if (quizBuilding) return;
    const cfg = QuizEngine.buildConfig(Object.assign({}, quizCfg(), override || {}));
    const btn = $('quiz-start-btn');
    quizBuilding = true;
    btn.disabled = true;
    btn.textContent = '正在准备…';
    let failure = '';
    try {
      const res = await QuizEngine.buildSession(cfg, {
        onProgress: (done, total) => { btn.textContent = '获取例句 ' + done + '/' + total; }
      });
      quizLastWarnings = res.warnings || [];
      if (!res.questions.length) {
        failure = res.warnings && res.warnings[0] ? res.warnings[0] : '没有生成题目，请调整设置。';
      } else {
        quizSession = {
          questions: res.questions, idx: 0, correct: 0,
          answered: false, answeredCount: 0, wrong: [], done: false, startedAt: Date.now(),
          composition: res.composition || null, recordDistractors: res.recordDistractors || 0,
          profileStats: res.profile || null
        };
        quizScreen = 'session';
        renderQuizScreen();
        if (mode !== 'quiz') setMode('quiz');
      }
    } catch (err) {
      quizLastWarnings = ['生成测试失败：' + String((err && err.message) || err)];
      failure = quizLastWarnings[0];
    } finally {
      quizBuilding = false;
      if (failure) {
        quizScreen = 'start';
        renderQuizStart();
        const note = $('quiz-start-note');
        note.hidden = false;
        note.textContent = failure;
        note.classList.add('warn');
      } else if (quizScreen === 'start') {
        renderQuizStart();
      }
    }
  }

  function renderQuizScreen() {
    updateStudyVisibility();
    updatePlanBar();
    if (quizScreen === 'start') renderQuizStart();
    else if (quizScreen === 'session') renderQuizQuestion();
    else renderQuizDone();
  }

  function renderQuizQuestion() {
    const s = quizSession;
    if (!s) { quizScreen = 'start'; renderQuizScreen(); return; }
    const q = s.questions[s.idx];
    if (!q) { finishQuiz(); return; }
    clearQuizAuto();
    $('quiz-score').textContent = s.correct + ' / ' + s.questions.length;
    $('quiz-progress').textContent = '第 ' + (s.idx + 1) + ' / ' + s.questions.length + ' 题';
    $('quiz-type-badge').textContent = QuizEngine.TYPE_LABEL[q.type] || '';
    const diff = $('quiz-diff-badge');
    diff.textContent = quizDiffLabel(q.difficulty);
    diff.dataset.level = q.difficulty < 0.4 ? 'easy' : q.difficulty < 0.62 ? 'normal' : 'hard';
    const src = $('quiz-source-badge');
    const srcLabel = QUIZ_SOURCE_LABEL[q.source] || '';
    src.hidden = !srcLabel;
    src.textContent = srcLabel;
    src.dataset.source = q.source || '';

    const prev = s.idx > 0 ? s.questions[s.idx - 1] : null;
    const lastEl = $('quiz-last');
    lastEl.innerHTML = '';
    lastEl.hidden = !prev;
    if (prev) {
      lastEl.dataset.word = prev.word;
      lastEl.appendChild(el('span', 'quiz-last-label', '上一题'));
      lastEl.appendChild(el('b', null, prev.word));
      lastEl.appendChild(el('span', 'quiz-last-gloss', QuizEngine.primaryGloss(prev.entry)));
    } else {
      lastEl.dataset.word = '';
    }

    const wordRow = document.querySelector('#quiz-session .word-row');
    const big = $('quiz-word');
    const ph = $('quiz-phonetic');
    const speakBtn = $('quiz-speak');
    const listen = $('quiz-listen');
    const cloze = $('quiz-cloze');
    const clozeZh = $('quiz-cloze-zh');
    big.classList.toggle('quiz-prompt-zh', q.type === 'zh2en');
    listen.hidden = q.type !== 'audio2word';
    if (q.type === 'cloze') {
      wordRow.hidden = true;
      big.hidden = true;
      ph.hidden = true;
      ph.textContent = '';
      speakBtn.hidden = true;
    } else if (q.type === 'audio2word') {
      wordRow.hidden = true;
      big.hidden = true;
      ph.hidden = true;
      ph.textContent = '';
      speakBtn.hidden = true;
    } else {
      wordRow.hidden = false;
      big.hidden = false;
      big.textContent = q.type === 'zh2en' ? q.display.word : q.word;
      const phonetic = q.type === 'en2zh' ? q.display.phonetic : '';
      ph.hidden = !phonetic;
      ph.textContent = phonetic ? '/' + phonetic + '/' : '';
      speakBtn.hidden = q.type !== 'en2zh';
    }
    $('quiz-question').textContent = q.display.question || '';
    if (q.type === 'cloze') {
      cloze.hidden = false;
      cloze.innerHTML = '';
      cloze.appendChild(document.createTextNode(q.display.sentence.before + ' '));
      cloze.appendChild(el('span', 'quiz-blank', '____'));
      cloze.appendChild(document.createTextNode(' ' + q.display.sentence.after));
      clozeZh.hidden = !q.display.sentence.zh;
      clozeZh.textContent = q.display.sentence.zh || '';
    } else {
      cloze.hidden = true;
      cloze.innerHTML = '';
      clozeZh.hidden = true;
      clozeZh.textContent = '';
    }

    const box = $('quiz-options');
    box.innerHTML = '';
    q.options.forEach((text, i) => {
      const b = el('button', 'quiz-option');
      b.type = 'button';
      b.appendChild(el('span', 'opt-key', ['A', 'B', 'C', 'D'][i] || String(i + 1)));
      const body = el('span', 'quiz-opt-body');
      body.appendChild(el('span', 'quiz-opt-text', text));
      b.appendChild(body);
      const word = q.optionWords && q.optionWords[i];
      if (word) b.dataset.word = word;
      b.addEventListener('click', () => {
        const cur = quizSession;
        if (!cur) return;
        if (!cur.answered) answerQuiz(i);
        else if (b.dataset.word) openWordSheet(b.dataset.word);
      });
      box.appendChild(b);
    });
    $('quiz-feedback').hidden = true;
    $('quiz-reveal').hidden = true;
    $('quiz-reveal').innerHTML = '';
    $('quiz-actions').hidden = true;
    $('quiz-next').hidden = true;
    s.answered = false;
    $('quiz-session').scrollTop = 0;
    if (q.type === 'audio2word') {
      setTimeout(() => {
        if (quizSession && quizSession.questions[quizSession.idx] === q && !quizSession.answered) speak(q.word, q.entry.audio);
      }, 180);
    }
    updatePlanBar();
  }

  function answerQuiz(choice) {
    const s = quizSession;
    if (!s || s.answered) return;
    const q = s.questions[s.idx];
    if (!q) return;
    const isCorrect = choice === q.correctIndex;
    Platform.haptic(isCorrect ? 'success' : 'error');
    s.answered = true;
    s.answeredCount++;
    if (isCorrect) s.correct++;
    Array.from($('quiz-options').children).forEach((b, i) => {
      if (i === q.correctIndex) b.classList.add('correct');
      else if (i === choice) b.classList.add('wrong');
      else b.classList.add('dim');
      if (!isCorrect && b.dataset.word) {
        b.classList.add('tap');
        b.title = '查看 ' + b.dataset.word + ' 的学习卡';
        const gloss = q.optionGloss && q.optionGloss[i];
        const body = b.querySelector('.quiz-opt-body');
        if (gloss && body) body.appendChild(el('span', 'quiz-opt-hint', gloss));
        b.appendChild(el('span', 'quiz-opt-open', '›'));
      } else {
        b.disabled = true;
      }
    });
    const e = q.entry;
    const chosenWord = !isCorrect && q.optionWords ? (q.optionWords[choice] || '') : '';
    Store.recordGrade(e.word, SRS.isNew(Store.data.srs[e.word]) ? 'new' : 'review', isCorrect ? SRS.GRADE.KNOW : SRS.GRADE.FORGOT, 0);
    Store.recordQuizResult(e.word, isCorrect, q.difficulty, chosenWord);
    const fb = $('quiz-feedback');
    fb.hidden = false;
    if (isCorrect) {
      fb.className = 'quiz-feedback ok';
      fb.textContent = q.type === 'cloze' || q.type === 'audio2word' ? '回答正确 · ' + q.correct : '回答正确';
      announce('回答正确' + (q.type === 'cloze' || q.type === 'audio2word' ? '：' + q.correct : ''));
      scheduleQuizAutoNext();
    } else {
      s.wrong.push({ word: e.word, correct: q.correct, type: q.type, chosen: chosenWord });
      fb.hidden = true;
      announce('回答错误，正确答案：' + q.correct);
      Store.addError(e.word);
      if (!Store.isFavorite(e.word)) Store.addFavorite(e.word, '错题');
      if (!Store.data.favGroups.includes('错题')) { Store.data.favGroups.push('错题'); Store.save(); }
      renderQuizReveal(q);
      $('quiz-actions').hidden = false;
      $('quiz-next').hidden = false;
      $('quiz-next').textContent = s.idx + 1 >= s.questions.length ? '查看结果' : '继续';
    }
    if (q.type === 'cloze' || q.type === 'audio2word') {
      document.querySelector('#quiz-session .word-row').hidden = false;
      $('quiz-word').hidden = false;
      $('quiz-word').textContent = q.word;
      $('quiz-listen').hidden = true;
    }
    if (q.type !== 'en2zh') {
      const ph = $('quiz-phonetic');
      if (e.phonetic) { ph.hidden = false; ph.textContent = '/' + e.phonetic + '/'; }
      $('quiz-speak').hidden = false;
    }
    $('quiz-score').textContent = s.correct + ' / ' + s.questions.length;
    updatePlanBar();
    if (!isCorrect) {
      requestAnimationFrame(() => {
        const session = $('quiz-session');
        const reveal = $('quiz-reveal');
        const footer = session.querySelector('.quiz-actions');
        if (!reveal || reveal.hidden || !footer) return;
        const delta = reveal.getBoundingClientRect().bottom - footer.getBoundingClientRect().top + 8;
        if (delta > 0) session.scrollTo({ top: session.scrollTop + delta, behavior: 'smooth' });
      });
    }
  }

  function renderQuizReveal(q) {
    const box = $('quiz-reveal');
    box.innerHTML = '';
    box.hidden = false;
    const e = q.entry;
    const card = el('button', 'quiz-reveal-card');
    card.type = 'button';
    const head = el('div', 'quiz-reveal-head');
    head.appendChild(el('span', 'quiz-reveal-tag', '答错'));
    head.appendChild(el('b', null, e.word));
    if (e.phonetic) head.appendChild(el('span', 'quiz-reveal-ph', '/' + e.phonetic + '/'));
    if (q.root && q.root.toLowerCase() !== e.word.toLowerCase()) head.appendChild(el('span', 'quiz-reveal-root', '词根 ' + q.root));
    head.appendChild(el('span', 'quiz-reveal-open', '学习卡 ›'));
    card.appendChild(head);
    const senses = e.senses && e.senses.length ? e.senses : [{ pos: '', domain: '', gloss: e.zh || '' }];
    const list = el('div', 'quiz-reveal-senses');
    senses.forEach(s => {
      const row = el('div', 'quiz-sense');
      const info = window.Library && Library.posInfo ? Library.posInfo(s.pos) : null;
      if (info) row.appendChild(el('span', 'quiz-sense-pos', info.zh));
      else if (s.pos) row.appendChild(el('span', 'quiz-sense-pos', s.pos));
      row.appendChild(el('span', 'quiz-sense-gloss', (s.domain ? '[' + s.domain + '] ' : '') + s.gloss));
      list.appendChild(row);
    });
    card.appendChild(list);
    card.addEventListener('click', () => openWordSheet(e.word));
    box.appendChild(card);
  }

  let quizAutoTimer = null;
  function clearQuizAuto() {
    if (quizAutoTimer) { clearTimeout(quizAutoTimer); quizAutoTimer = null; }
  }
  function scheduleQuizAutoNext() {
    clearQuizAuto();
    quizAutoTimer = setTimeout(() => {
      quizAutoTimer = null;
      if (quizSession && quizSession.answered) nextQuiz();
    }, 1100);
  }

  function nextQuiz() {
    const s = quizSession;
    if (!s || !s.answered) return;
    clearQuizAuto();
    if (s.idx + 1 >= s.questions.length) { finishQuiz(); return; }
    s.idx++;
    s.answered = false;
    renderQuizQuestion();
    updatePlanBar();
  }

  function finishQuiz() {
    clearQuizAuto();
    const s = quizSession;
    if (!s) { quizScreen = 'start'; renderQuizScreen(); return; }
    s.done = true;
    quizScreen = 'done';
    renderQuizDone();
  }

  function renderQuizDone() {
    const s = quizSession;
    if (!s) { quizScreen = 'start'; renderQuizStart(); return; }
    const total = Math.max(1, s.answeredCount || s.questions.length);
    const pct = Math.round((s.correct / total) * 100);
    $('quiz-done-ring').style.setProperty('--pct', pct);
    $('quiz-done-pct').textContent = pct + '%';
    $('quiz-done-title').textContent = pct >= 90 ? '表现出色' : pct >= 70 ? '测试完成' : '继续加油';
    const secs = Math.max(0, Math.round((Date.now() - s.startedAt) / 1000));
    $('quiz-done-sub').textContent = '答对 ' + s.correct + ' / ' + total + ' 题 · 用时 ' + fmtMs(secs * 1000) + ' 分钟' +
      (s.wrong.length ? ' · 错词已加入「错题」' : '');

    let warnEl = $('quiz-done-warn');
    if (!warnEl) {
      warnEl = el('p', 'quiz-est-warn');
      warnEl.id = 'quiz-done-warn';
      document.querySelector('.quiz-done-hero').appendChild(warnEl);
    }
    warnEl.hidden = !quizLastWarnings.length;
    warnEl.textContent = quizLastWarnings[0] || '';

    const mixPanel = $('quiz-mix-panel');
    const comp = s.composition;
    if (mixPanel) {
      if (comp && s.questions.length) {
        mixPanel.hidden = false;
        const ORDER = [['due', '到期复习'], ['weak', '薄弱词'], ['confused', '易混词'], ['curated', '收藏/分组'], ['review', '已学复习'], ['contact', '浏览关注'], ['new', '新词探索']];
        const bar = $('quiz-mix-bar');
        const legend = $('quiz-mix-legend');
        bar.innerHTML = '';
        legend.innerHTML = '';
        const parts = [];
        ORDER.forEach(([k, label]) => {
          const n = comp[k] || 0;
          if (!n) return;
          const seg = el('span', 'quiz-mix-seg');
          seg.dataset.source = k;
          seg.style.flexGrow = n;
          seg.title = label + ' ' + n + ' 题';
          bar.appendChild(seg);
          const item = el('span', 'quiz-mix-item');
          item.dataset.source = k;
          item.appendChild(el('i', 'quiz-mix-dot'));
          item.appendChild(document.createTextNode(label + ' ' + n));
          legend.appendChild(item);
          parts.push(label + ' ' + n + ' 题');
        });
        bar.setAttribute('aria-label', '本轮构成：' + parts.join('，'));
        $('quiz-mix-sub').textContent = s.questions.length + ' 题';
        const st = s.profileStats;
        $('quiz-mix-note').textContent =
          (st && st.recorded ? '依据 ' + st.recorded + ' 个词的学习记录组卷' : '本轮以新词探索为主') +
          (s.recordDistractors ? ' · ' + s.recordDistractors + ' 个干扰项来自你的易混/共学/收藏记录' : '') + '。';
      } else mixPanel.hidden = true;
    }

    const list = $('quiz-wrong-list');
    list.innerHTML = '';
    if (s.wrong.length) {
      $('quiz-wrong-panel').hidden = false;
      $('quiz-wrong-count').textContent = s.wrong.length + ' 个';
      s.wrong.forEach(w => {
        const row = el('button', 'quiz-wrong-row');
        row.type = 'button';
        const main = el('span', 'quiz-wrong-main');
        main.appendChild(el('b', null, w.word));
        main.appendChild(el('span', 'quiz-wrong-sub', w.correct + ' · ' + (QuizEngine.TYPE_LABEL[w.type] || '') + (w.chosen ? ' · 误选 ' + w.chosen : '')));
        row.appendChild(main);
        row.appendChild(el('span', 'row-arrow', '›'));
        row.addEventListener('click', () => openWordSheet(w.word));
        list.appendChild(row);
      });
    } else {
      $('quiz-wrong-panel').hidden = true;
    }
    updateStudyVisibility();
    updatePlanBar();
  }

  function quitQuiz() {
    clearQuizAuto();
    const s = quizSession;
    if (!s || !s.answeredCount) {
      quizSession = null;
      quizScreen = 'start';
      renderQuizScreen();
      return;
    }
    if (!confirm('结束本轮测试并查看结果？')) return;
    finishQuiz();
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

  let affixWordsCache = { tag: '', map: null };
  function affixWordsMap() {
    const tag = Store.data.activeBook;
    if (affixWordsCache.tag === tag) return affixWordsCache.map;
    const map = new Map();
    (activeBook().entries || []).forEach(e => {
      (e.morphemes || []).forEach(m => {
        if (m.type !== 'prefix' && m.type !== 'suffix') return;
        const id = m.type === 'prefix' ? m.text + '-' : '-' + m.text;
        let set = map.get(id);
        if (!set) { set = new Set(); map.set(id, set); }
        set.add(e.word);
      });
    });
    affixWordsCache = { tag, map };
    return map;
  }
  function learnProgress(words) {
    const list = words || [];
    let learned = 0;
    list.forEach(w => { const s = Store.data.srs[w]; if (s && !SRS.isNew(s)) learned++; });
    return { learned, total: list.length, ratio: list.length ? learned / list.length : 0 };
  }
  function attachRowProgress(row, main, info) {
    if (!Store.data.progressBars || !info || !info.total) return false;
    const compact = row.classList.contains('compact');
    const track = el('div', 'row-progress' + (compact ? ' row-progress-abs' : ''));
    const fill = el('span', 'row-progress-fill');
    fill.style.width = Math.round(info.ratio * 100) + '%';
    track.appendChild(fill);
    (compact ? row : main).appendChild(track);
    const done = info.ratio >= 0.85;
    row.classList.toggle('row-learned', done);
    row.title = '已学 ' + info.learned + ' / ' + info.total + ' 个词';
    return done;
  }

  function renderRoots() {
    const rv = Store.data.rootsView || { sort: 'size', hideSmall: true };
    const raw = $('roots-search').value.trim();
    const q = raw.toLowerCase();
    let base = Library.listRoots();
    if (q) base = base.filter(r => r.root.toLowerCase().includes(q) || (r.zh || '').includes(raw));
    else if (rv.hideSmall) base = base.filter(r => (r.size || 0) >= 3);
    const opts = $('roots-opts');
    opts.innerHTML = '';
    [['sort-size', '词数降序', rv.sort === 'size'], ['sort-alpha', '字母序', rv.sort === 'alpha'], ['small', rv.hideSmall ? '已隐藏 <3 词家族' : '显示全部家族', rv.hideSmall]].forEach(([act, label, active]) => {
      const b = el('button', 'chip' + (active ? ' active' : ''), label);
      b.type = 'button';
      b.dataset.rootsOpt = act;
      opts.appendChild(b);
    });
    const infos = new Map();
    base.forEach(r => infos.set(r.root, rootInfo(r)));
    buildCatChips(base, r => infos.get(r.root), rootsFilter);
    let roots = rootsFilter === 'all' ? base : base.filter(r => catOf(infos.get(r.root)) === rootsFilter);
    roots = roots.slice().sort((a, b) => {
      if (rv.sort === 'size') return (b.size || 0) - (a.size || 0) || a.root.localeCompare(b.root);
      const na = /[a-z]/i.test(a.root[0] || '') ? 0 : 1, nb = /[a-z]/i.test(b.root[0] || '') ? 0 : 1;
      return na - nb || a.root.localeCompare(b.root);
    });
    const list = $('roots-list');
    if (rootsBatch.io) { rootsBatch.io.disconnect(); rootsBatch.io = null; }
    list.innerHTML = '';
    list.scrollTop = 0;
    const rail = $('roots-rail');
    rail.innerHTML = '';
    rail.hidden = rv.sort === 'size';
    if (!roots.length) { list.appendChild(el('div', 'empty-hint', '没有匹配的词根')); return; }
    const groups = [];
    if (rv.sort === 'size') {
      groups.push({ letter: '', items: roots });
    } else {
      roots.forEach(r => {
        const ch = (r.root[0] || '#').toUpperCase();
        const letter = /[A-Z]/.test(ch) ? ch : '#';
        let g = groups[groups.length - 1];
        if (!g || g.letter !== letter) { g = { letter, items: [] }; groups.push(g); }
        g.items.push(r);
      });
    }
    const wrap = el('div', 'list-gap compact-gap');
    list.appendChild(wrap);
    groups.forEach(g => {
      if (!g.letter) return;
      const b = el('button', null, g.letter);
      b.type = 'button';
      b.dataset.letter = g.letter;
      rail.appendChild(b);
    });
    Object.assign(rootsBatch, { groups, gi: 0, ri: 0, wrap, infos });
    loadRootsBatch();
    rootsBatch.io = makeSentinel(list, loadRootsBatch);
  }
  function loadRootsBatch() {
    const b = rootsBatch;
    let added = 0;
    while (added < 80 && b.gi < b.groups.length) {
      const g = b.groups[b.gi];
      if (b.ri === 0) {
        b.cur = el('div', 'letter-group');
        if (g.letter) {
          const h = el('div', 'letter-head', g.letter);
          h.dataset.letter = g.letter;
          b.cur.appendChild(h);
        }
        b.wrap.appendChild(b.cur);
      }
      b.cur.appendChild(rootRow(g.items[b.ri], b.infos.get(g.items[b.ri].root)));
      b.ri++; added++;
      if (b.ri >= g.items.length) { b.gi++; b.ri = 0; }
    }
    if (b.gi >= b.groups.length && b.io) { b.io.disconnect(); b.io = null; }
  }
  function rootRow(r, info) {
    const row = el('button', 'row compact'); row.type = 'button';
    const main = el('div', 'row-main');
    main.appendChild(el('div', 'row-title', r.root));
    main.appendChild(el('div', 'row-sub', r.zh || r.g || ''));
    const done = attachRowProgress(row, main, info);
    row.appendChild(main);
    const sizeMode = (Store.data.rootsView || {}).sort === 'size';
    if (!sizeMode && info && Store.data.progressBars && info.total) {
      row.appendChild(el('span', 'row-badge' + (done ? ' green' : ''), info.learned + '/' + info.total));
    } else {
      row.appendChild(el('span', 'row-badge', r.size + ' 词'));
    }
    row.appendChild(el('span', 'row-arrow', '›'));
    row.addEventListener('click', () => openFamily(r.root));
    return row;
  }

  function renderAffixes() {
    const raw = $('roots-search').value.trim();
    const q = raw.toLowerCase();
    let af = Library.getAffixes().slice();
    if (affixFilter !== 'all') af = af.filter(a => a.k === affixFilter);
    if (q) af = af.filter(a => a.id.toLowerCase().includes(q) || (a.zh || '').includes(raw));
    const awm = affixWordsMap();
    const infos = new Map();
    af.forEach(a => { const w = awm.get(a.id); infos.set(a.id, w && w.size ? learnProgress(Array.from(w)) : null); });
    buildCatChips(af, a => infos.get(a.id), affixCat);
    if (affixCat !== 'all') af = af.filter(a => catOf(infos.get(a.id)) === affixCat);
    af.sort((a, b) => (b.count || 0) - (a.count || 0));
    const list = $('affix-list');
    if (affixBatch.io) { affixBatch.io.disconnect(); affixBatch.io = null; }
    list.innerHTML = '';
    if (!af.length) { list.appendChild(el('div', 'empty-hint', '没有匹配的词缀')); return; }
    const wrap = el('div', 'list-gap compact-gap');
    list.appendChild(wrap);
    Object.assign(affixBatch, { items: af, i: 0, wrap, infos });
    loadAffixBatch();
    affixBatch.io = makeSentinel(list, loadAffixBatch);
  }
  function loadAffixBatch() {
    const b = affixBatch;
    const end = Math.min(b.items.length, b.i + 80);
    for (; b.i < end; b.i++) {
      const a = b.items[b.i];
      const row = el('button', 'row compact'); row.type = 'button';
      const main = el('div', 'row-main');
      const title = el('div', 'row-title', a.id);
      title.appendChild(el('span', 'row-badge gray', a.k === 'prefix' ? '前缀' : a.k === 'suffix' ? '后缀' : '词缀'));
      main.appendChild(title);
      main.appendChild(el('div', 'row-sub', a.zh || a.en || ''));
      const info = b.infos.get(a.id);
      const done = attachRowProgress(row, main, info);
      row.appendChild(main);
      if (info && Store.data.progressBars) {
        row.appendChild(el('span', 'row-badge' + (done ? ' green' : ''), info.learned + '/' + info.total));
      } else {
        row.appendChild(el('span', 'row-badge', a.count || 0));
      }
      row.appendChild(el('span', 'row-arrow', '›'));
      row.addEventListener('click', () => openAffixSheet(a));
      b.wrap.appendChild(row);
    }
    if (b.i >= b.items.length && b.io) { b.io.disconnect(); b.io = null; }
  }
  function rootInfo(r) {
    const fam = Library.getFamily(r.root);
    return fam ? learnProgress(fam.family.map(w => w.word)) : null;
  }
  function catOf(info) {
    if (!info || !info.total || !info.learned) return 'new';
    return info.ratio >= 0.85 ? 'near' : 'learning';
  }
  // The status chip row is shared by both tabs: counts come from the tab's own base list.
  function buildCatChips(items, infoOf, active) {
    const host = $('roots-cats');
    host.innerHTML = '';
    ROOT_CATS.forEach(([id, label]) => {
      const n = id === 'all' ? items.length : items.filter(x => catOf(infoOf(x)) === id).length;
      const b = el('button', 'chip' + (active === id ? ' active' : ''), id === 'all' ? label : label + ' ' + n);
      b.type = 'button';
      b.dataset.cat = id;
      host.appendChild(b);
    });
  }
  function makeSentinel(list, load) {
    const sen = el('div', 'load-sentinel');
    list.appendChild(sen);
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) load(); }, { root: list, rootMargin: '320px 0px' });
    io.observe(sen);
    return io;
  }

  function openFamily(root) {
    const fam = Library.getFamily(root);
    sheetFamily = root;
    setCrumbs('crumbs-family', [{ label: '词根', fn: () => closeSheet() }, { label: root }]);
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
      main.appendChild(el('div', 'row-sub', w.zh || ''));
      row.appendChild(main);
      const st = stateOf(w.word);
      row.appendChild(el('span', 'row-badge ' + (st === 'known' ? 'green' : st === 'new' ? 'gray' : ''), { new: '未学', learning: '学习中', known: '已掌握', relearn: '重学' }[st]));
      row.addEventListener('click', () => openWordSheet(w.word, false, [
        { label: '词根', fn: () => { closeSheet(); switchView('roots'); } },
        { label: root, fn: () => openFamily(root) }
      ]));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    openSheet('family-sheet');
  }

  // ===================== thematic decks =====================
  function themeStateLabel(st) { return { new: '未学', learning: '学习中', known: '已掌握', relearn: '重学' }[st] || ''; }
  function themeCard(t) {
    const card = el('button', 'theme-card' + (t.cloze ? ' cloze' : '') + (t.custom ? ' custom' : '')); card.type = 'button';
    if (POS_ORDER.includes(t.cloze)) card.dataset.pos = t.cloze;
    const top = el('div', 'theme-card-top');
    top.appendChild(el('span', 'theme-card-name', t.name));
    top.appendChild(el('span', 'theme-card-count', t.n + ' 词'));
    card.appendChild(top);
    const ws = Themes.wordsOf(t.id);
    const known = ws.filter(w => SRS.isKnown(Store.data.srs[w])).length;
    const prow = el('div', 'theme-card-progress-row');
    const track = el('div', 'theme-card-progress');
    const fill = el('span', 'theme-card-progress-fill');
    fill.style.width = (ws.length ? Math.round(known / ws.length * 100) : 0) + '%';
    track.appendChild(fill);
    prow.appendChild(track);
    const master = el('span', 'theme-card-master', '已掌握 ' + known + '/' + ws.length);
    master.title = '已掌握 ' + known + ' / ' + ws.length + ' 词';
    prow.appendChild(master);
    card.appendChild(prow);
    if (t.desc) card.appendChild(el('div', 'theme-card-desc', t.desc));
    if (t.cloze || t.custom) {
      const foot = el('div', 'theme-card-foot');
      if (t.cloze) {
        foot.appendChild(el('span', 'cloze-pill', POS_ORDER.includes(t.cloze) ? Library.clozePosName(t.cloze) : '真题'));
        const hits = ws.reduce((s, w) => { const c = Library.clozeOf(w); return s + (c ? c.n : 0); }, 0);
        foot.appendChild(el('span', 'theme-card-hits', hits + ' 次出现'));
      } else {
        foot.appendChild(el('span', 'cloze-pill', '自定义'));
      }
      card.appendChild(foot);
    }
    card.addEventListener('click', () => openThemeSheet(t.id));
    return card;
  }
  function themeGrid(themes) {
    const grid = el('div', 'theme-grid');
    themes.forEach(t => grid.appendChild(themeCard(t)));
    return grid;
  }
  function renderThemes() {
    const host = $('themes-groups');
    host.innerHTML = '';
    if (!window.Themes || !Themes.isReady()) { host.appendChild(el('div', 'empty-hint', '主题分类尚未就绪')); return; }
    const custom = Store.customThemes();
    const mine = el('section', 'theme-group');
    const head = el('div', 'theme-group-head');
    head.appendChild(el('div', 'section-label', '我的分组'));
    const addBtn = el('button', 'link-btn', '＋ 创建分组'); addBtn.type = 'button';
    addBtn.addEventListener('click', createCustomThemeFlow);
    head.appendChild(addBtn);
    mine.appendChild(head);
    if (!custom.length) {
      mine.appendChild(el('div', 'empty-hint', '创建自己的词组：在词卡或主题详情里把词收进来，组成专属牌组专项学习。'));
    } else {
      mine.appendChild(themeGrid(custom.map(t => Themes.get(t.id)).filter(Boolean)));
    }
    host.appendChild(mine);
    Themes.groups().forEach(g => {
      const section = el('section', 'theme-group');
      section.appendChild(el('div', 'section-label', g.name));
      if (g.id === 'exam') {
        const hero = clozeHero(); if (hero) section.appendChild(hero);
        section.appendChild(el('div', 'section-sublabel', '选词填空真题牌组'));
        section.appendChild(themeGrid(g.themes.filter(t => t.cloze)));
        section.appendChild(el('div', 'section-sublabel', '翻译与作文话题'));
        section.appendChild(themeGrid(g.themes.filter(t => !t.cloze)));
        section.appendChild(el('div', 'section-sublabel', '真题翻译与写作材料'));
        section.appendChild(studyMaterialEntries());
        if (!Library.studyReady()) Library.studyInit().then(() => { if (!$('view-themes').hidden) renderThemes(); });
      } else {
        section.appendChild(themeGrid(g.themes));
      }
      host.appendChild(section);
    });
  }
  function clozeHero() {
    const m = Library.clozeMeta();
    if (!m) return null;
    const hero = el('div', 'cloze-hero');
    const main = el('div', 'cloze-hero-main');
    main.appendChild(el('div', 'cloze-hero-kicker', 'CET-6 · ' + m.section + ' · ' + m.range));
    main.appendChild(el('div', 'cloze-hero-title', '选词填空真题选项库'));
    main.appendChild(el('div', 'cloze-hero-meta', m.setCount + ' 套真题 · ' + m.slotCount + ' 个选项位 · ' + m.wordCount + ' 个去重选项词'));
    hero.appendChild(main);
    const btn = el('button', 'cloze-hero-btn', '浏览真题卷'); btn.type = 'button';
    btn.addEventListener('click', () => openClozeSheet());
    hero.appendChild(btn);
    return hero;
  }

  function studyMaterialEntries() {
    const c = Library.studyCounts();
    const wrap = el('div', 'list-gap');
    [
      ['translation', '六级翻译', c ? c.translations + ' 篇' : '加载中', '原文 · 参考译文 · 背诵清单 · 语法 · 迁移练习'],
      ['writing6', '六级写作', c ? (c.writings - c.cet4Writings) + ' 篇' : '加载中', '题目 · 英文原文 · 中文理解 · 润色版 · 结构思路'],
      ['writing4', '四级写作', c ? c.cet4Writings + ' 篇' : '加载中', 'C4-001–C4-012 · 审题逻辑 · 学习示例'],
      ['misc', '积累素材', c ? Library.studyMisc().length + ' 块' : '加载中', '重点词汇 · 万能句型 · 通用表达 · 个人错题']
    ].forEach(([kind, name, count, desc]) => {
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(el('span', 'set-tile', kind === 'misc' ? '积' : kind === 'translation' ? '译' : '写'));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', name));
      main.appendChild(el('div', 'row-sub', desc));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge', count));
      row.addEventListener('click', () => openStudySheet(kind));
      wrap.appendChild(row);
    });
    return wrap;
  }

  // Deck word list state: the POS filter and the sort are live controls over the
  // same deck, and 专项学习 studies exactly what is on screen.
  let themePos = '';
  let themeSort = 'exam';
  let themeShown = [];
  const POS_ORDER = ['n', 'v', 'adj', 'adv'];
  function themeDeckWords(id) {
    const meta = Themes.get(id);
    let words = Themes.wordsOf(id);
    if (!meta || !meta.cloze) return words;
    if (themePos) words = words.filter(w => { const c = Library.clozeOf(w); return c && (c.posAll || []).includes(themePos); });
    if (themeSort === 'freq') {
      words = words.slice().sort((a, b) => { const x = Library.clozeOf(a), y = Library.clozeOf(b); return (y ? y.ff : 0) - (x ? x.ff : 0) || a.localeCompare(b); });
    } else if (themeSort === 'alpha') words = words.slice().sort((a, b) => a.localeCompare(b));
    return words;
  }
  function posChips(words) {
    const counts = {};
    words.forEach(w => { const c = Library.clozeOf(w); if (c) (c.posAll || []).forEach(p => { counts[p] = (counts[p] || 0) + 1; }); });
    const kinds = POS_ORDER.filter(p => counts[p]);
    if (kinds.length < 2) return null;
    const row = el('div', 'chip-row');
    const add = (id, label) => {
      const c = el('button', 'chip' + (themePos === id ? ' active' : ''), label); c.type = 'button';
      c.addEventListener('click', () => { themePos = id; renderThemeSheet(); });
      row.appendChild(c);
    };
    add('', '全部 ' + words.length);
    kinds.forEach(p => add(p, Library.clozePosName(p) + ' ' + counts[p]));
    return row;
  }
  function sortChips() {
    const row = el('div', 'chip-row');
    [['exam', '真题次数'], ['freq', '语料词频'], ['alpha', '字母']].forEach(([id, label]) => {
      const c = el('button', 'chip' + (themeSort === id ? ' active' : ''), label); c.type = 'button';
      c.addEventListener('click', () => { themeSort = id; renderThemeSheet(); });
      row.appendChild(c);
    });
    return row;
  }
  function openThemeSheet(id) {
    const meta = window.Themes && Themes.get(id);
    if (!meta) return;
    sheetTheme = id;
    themePos = '';
    themeSort = 'exam';
    themeManage = false;
    renderThemeSheet();
  }
  function renderThemeSheet() {
    const meta = Themes.get(sheetTheme);
    if (!meta) return;
    const all = Themes.wordsOf(sheetTheme);
    const words = themeDeckWords(sheetTheme);
    themeShown = words;
    const known = words.filter(w => SRS.isKnown(Store.data.srs[w])).length;
    $('theme-title').textContent = meta.name;
    $('theme-meta').textContent = (meta.custom ? '自定义分组' : meta.desc) + ' · ' + words.length + ' 词 · 已掌握 ' + known;
    $('theme-collect-btn').hidden = meta.custom || !words.length;
    $('theme-manage-btn').hidden = !meta.custom;
    $('theme-rename-btn').hidden = !meta.custom;
    $('theme-delete-btn').hidden = !meta.custom;
    $('theme-manage-btn').textContent = themeManage ? '完成管理' : '管理删词';
    const body = $('theme-words');
    body.innerHTML = '';
    $('theme-study-btn').disabled = !words.length;
    if (meta.cloze) {
      const chips = posChips(all);
      if (chips) body.appendChild(chips);
      body.appendChild(sortChips());
    }
    if (!words.length) {
      body.appendChild(el('div', 'empty-hint', meta.custom
        ? '还没有词。打开任意词卡点「＋ 分组」，或在其他主题详情点「全部收入分组」。'
        : (all.length ? '当前筛选下没有词条' : '该专题暂无词条')));
      if ($('theme-sheet').hidden) openSheet('theme-sheet');
      return;
    }
    if (meta.custom && themeManage) body.appendChild(el('div', 'field-hint', '管理模式：点击词条将其移出分组。'));
    const wrap = el('div', 'list-gap');
    words.forEach(w => {
      const e = Library.lookup(w);
      const c = meta.cloze ? Library.clozeOf(w) : null;
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(stateDot(w));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', w));
      main.appendChild(el('div', 'row-sub', (e && e.zh) || ''));
      row.appendChild(main);
      if (c) {
        const tail = el('div', 'row-tail');
        const pos = el('div', 'pos-chips');
        (c.posAll || []).forEach(p => pos.appendChild(el('span', 'pos-chip ' + p, Library.clozePosName(p))));
        tail.appendChild(pos);
        tail.appendChild(el('span', 'hit-chip' + (c.n >= 2 ? ' hot' : ''), '×' + c.n + ' 套'));
        row.appendChild(tail);
      }
      if (meta.custom && themeManage) {
        row.appendChild(el('span', 'row-badge gray', '移除'));
        row.addEventListener('click', () => {
          Store.removeWordFromCustomTheme(sheetTheme, w);
          refreshCustomThemes();
          announce('已移出 ' + w);
        });
      } else {
        row.appendChild(el('span', 'row-badge ' + (stateOf(w) === 'known' ? 'green' : 'gray'), themeStateLabel(stateOf(w))));
        row.addEventListener('click', () => openWordSheet(w));
      }
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    if ($('theme-sheet').hidden) openSheet('theme-sheet');
  }

  // ===================== 自定义专项词组 =====================
  let themeManage = false;
  let pickerPayload = null;
  function refreshCustomThemes() {
    Themes.setCustom(Store.customThemes());
    renderThemes();
    if (sheetTheme && !$('theme-sheet').hidden) renderThemeSheet();
    if (pickerPayload && !$('group-picker-sheet').hidden) renderGroupPicker();
  }
  function createCustomThemeFlow(afterCreate) {
    const name = prompt('新分组名称（20 字以内）');
    if (name === null) return null;
    const r = Store.createCustomTheme(name);
    if (!r.ok) { alert(r.error); return null; }
    refreshCustomThemes();
    announce('已创建分组 ' + r.theme.name);
    if (typeof afterCreate === 'function') afterCreate(r.theme);
    return r.theme;
  }
  // payload: { word } 单词收词 / { words, label } 批量收词
  function openGroupPicker(payload) {
    pickerPayload = payload;
    renderGroupPicker();
    openNestedSheet('group-picker-sheet');
  }
  function renderGroupPicker() {
    const p = pickerPayload;
    if (!p) return;
    const batch = Array.isArray(p.words);
    $('group-picker-title').textContent = batch ? '收入分组' : '加入分组';
    $('group-picker-sub').textContent = batch ? (p.label || '') + ' · ' + p.words.length + ' 词' : p.word;
    const list = $('group-picker-list');
    list.innerHTML = '';
    const custom = Store.customThemes();
    if (!custom.length) {
      list.appendChild(el('div', 'empty-hint', '还没有自定义分组，点下方「＋ 新建分组」创建第一个。'));
    }
    const wrap = el('div', 'list-gap');
    custom.forEach(t => {
      const row = el('button', 'row'); row.type = 'button';
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', t.name));
      main.appendChild(el('div', 'row-sub', t.words.length + ' 词'));
      row.appendChild(main);
      const has = batch ? p.words.every(w => t.words.includes(w)) : t.words.includes(p.word);
      row.appendChild(el('span', 'row-badge ' + (has ? 'green' : 'gray'), has ? '已收入' : '收入'));
      row.addEventListener('click', () => {
        if (batch) {
          const n = Store.addWordsToCustomTheme(t.id, p.words);
          announce(n ? '已收入 ' + n + ' 词到 ' + t.name : '这些词已在 ' + t.name + ' 中');
        } else if (has) {
          Store.removeWordFromCustomTheme(t.id, p.word);
          announce('已从 ' + t.name + ' 移出 ' + p.word);
        } else {
          Store.addWordsToCustomTheme(t.id, p.word);
          announce('已加入 ' + t.name);
        }
        refreshCustomThemes();
      });
      wrap.appendChild(row);
    });
    list.appendChild(wrap);
  }

  // ===================== 选词填空真题卷 =====================
  let clozeFilter = 'all';
  let clozeSetId = '';
  function setLabel(s) { return s.year + '·' + s.month + ' 第' + Number(s.paper) + '套'; }
  function openClozeSheet(setId) {
    clozeSetId = setId || '';
    renderClozeSheet();
  }
  function renderClozeSheet() {
    const m = Library.clozeMeta();
    if (!m) return;
    const body = $('cloze-body');
    body.innerHTML = '';
    const foot = $('cloze-foot');
    if (clozeSetId) { renderClozeSet(body, foot, m); openSheet('cloze-sheet'); return; }
    foot.hidden = true;
    $('cloze-title').textContent = '六级选词填空真题';
    $('cloze-meta').textContent = m.shape + ' · ' + m.range + ' · ' + m.setCount + ' 套 · ' + m.wordCount + ' 词';
    const stats = el('div', 'stat-row');
    [[m.setCount, '真题卷'], [m.slotCount, '选项位'], [m.wordCount, '选项词'], [m.recentSetCount, '近五年卷']].forEach(([v, k]) => {
      const t = el('div', 'stat-tile');
      t.appendChild(el('div', 'stat-num', String(v)));
      t.appendChild(el('div', 'stat-key', k));
      stats.appendChild(t);
    });
    body.appendChild(stats);
    const chips = el('div', 'chip-row');
    const sets = Library.clozeSets();
    [['all', '全部 ' + sets.length], ['recent', '近五年 ' + sets.filter(s => s.recent).length], ['older', '2016–2020 ' + sets.filter(s => !s.recent).length]].forEach(([id, label]) => {
      const c = el('button', 'chip' + (clozeFilter === id ? ' active' : ''), label); c.type = 'button';
      c.addEventListener('click', () => { clozeFilter = id; renderClozeSheet(); });
      chips.appendChild(c);
    });
    body.appendChild(chips);
    const shown = sets.filter(s => clozeFilter === 'all' || (clozeFilter === 'recent' ? s.recent : !s.recent));
    const head = el('div', 'block-head');
    head.appendChild(el('span', null, '真题卷'));
    head.appendChild(el('span', 'count-pill', shown.length + ' 套'));
    body.appendChild(head);
    const wrap = el('div', 'list-gap');
    shown.forEach(s => {
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(el('span', 'set-tile' + (s.recent ? ' recent' : ''), s.year + '.' + s.month));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', '第' + Number(s.paper) + '套 · 15 选 10'));
      main.appendChild(el('div', 'row-sub', s.lead || s.file));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge gray', '选项 →'));
      row.addEventListener('click', () => openClozeSheet(s.id));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    if (m.missing.length) {
      const mh = el('div', 'block-head');
      mh.appendChild(el('span', null, '仅有记录·仓库缺原文'));
      mh.appendChild(el('span', 'count-pill', m.missing.length + ' 套'));
      body.appendChild(mh);
      const mw = el('div', 'list-gap');
      m.missing.forEach(x => {
        const row = el('div', 'row static');
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', x.exam));
        main.appendChild(el('div', 'row-sub', x.file || '无来源文件'));
        row.appendChild(main);
        row.appendChild(el('span', 'row-badge gray', '缺失'));
        mw.appendChild(row);
      });
      body.appendChild(mw);
    }
    if (m.notes.length) {
      const nh = el('div', 'block-head');
      nh.appendChild(el('span', null, '数据清洗记录'));
      nh.appendChild(el('span', 'count-pill', m.notes.length + ' 条'));
      body.appendChild(nh);
      const nw = el('div', 'cloze-notes');
      m.notes.forEach(t => nw.appendChild(el('div', 'cloze-note', t)));
      body.appendChild(nw);
    }
    body.appendChild(el('div', 'field-hint', '数据来源：' + m.sourceFile + ' · 构建于 ' + m.built));
    openSheet('cloze-sheet');
  }
  function renderClozeSet(body, foot, m) {
    const s = Library.clozeSet(clozeSetId);
    if (!s) { clozeSetId = ''; renderClozeSheet(); return; }
    $('cloze-title').textContent = s.exam;
    $('cloze-meta').textContent = m.shape + ' · 题号 ' + m.range + ' · 15 个选项';
    const back = el('button', 'btn-ghost cloze-back', '← 全部真题卷'); back.type = 'button';
    back.addEventListener('click', () => openClozeSheet());
    body.appendChild(back);
    if (s.lead) {
      const lead = el('div', 'cloze-lead');
      lead.appendChild(el('div', 'cloze-lead-key', '篇目开头 · 原文摘录'));
      lead.appendChild(el('div', 'cloze-lead-text', /[.!?…]$/.test(s.lead) ? s.lead : s.lead + ' …'));
      body.appendChild(lead);
    }
    const counts = {};
    s.options.forEach(([, w]) => { const c = Library.clozeOf(w); if (c) (c.posAll || []).forEach(p => { counts[p] = (counts[p] || 0) + 1; }); });
    const legend = el('div', 'pos-chips legend');
    legend.appendChild(el('span', 'legend-key', '可填词性 · 一词可多类'));
    POS_ORDER.filter(p => counts[p]).forEach(p => legend.appendChild(el('span', 'pos-chip ' + p, Library.clozePosName(p) + ' ' + counts[p])));
    body.appendChild(legend);
    const wrap = el('div', 'list-gap');
    s.options.forEach(([letter, word]) => {
      const c = Library.clozeOf(word);
      const e = Library.lookup(word);
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(el('span', 'letter-tile', letter));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', word));
      main.appendChild(el('div', 'row-sub', (e && e.zh) || ''));
      row.appendChild(main);
      const tail = el('div', 'row-tail');
      const pos = el('div', 'pos-chips');
      if (c) (c.posAll || []).forEach(p => pos.appendChild(el('span', 'pos-chip ' + p, Library.clozePosName(p))));
      tail.appendChild(pos);
      if (c && c.n >= 2) tail.appendChild(el('span', 'hit-chip hot', '×' + c.n + ' 套'));
      row.appendChild(tail);
      row.addEventListener('click', () => openWordSheet(word));
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    body.appendChild(el('div', 'field-hint', '来源文件：' + (s.file || '—') + ' · 词性按选项自身形态判定，一个词可属于多个词性组'));
    foot.hidden = false;
    $('cloze-study-btn').textContent = '学习本卷 15 个选项';
  }

  // ===================== 翻译与写作材料（study.json 单源懒加载） =====================
  let studyKind = 'translation';
  let studyItemId = '';
  let studyRecite = false;
  let studyRevealed = new Set();
  let studyMiscOpen = new Set();
  const STUDY_MATCH_NAME = { text: '原文对齐', label: '卷标对齐', 'label-only': '仅卷标' };
  function studyTabItems(kind) {
    if (kind === 'translation') return Library.studyList('translation');
    if (kind === 'writing4') return Library.studyList('writing', 'CET4');
    if (kind === 'misc') return Library.studyMisc();
    return Library.studyList('writing', 'CET6');
  }
  function studyKindOfItem(it) {
    if (!it) return 'translation';
    if (it.kind === 'translation') return 'translation';
    return it.level === 'CET4' ? 'writing4' : 'writing6';
  }
  function openStudySheet(kind, itemId) {
    studyItemId = itemId || '';
    if (studyItemId && Library.studyReady()) studyKind = studyKindOfItem(Library.studyItem(studyItemId));
    else if (kind) studyKind = kind;
    studyRevealed = new Set();
    if (!Library.studyReady()) {
      Library.studyInit().then(() => {
        if (openSheetEl && openSheetEl.id === 'study-sheet') {
          if (studyItemId) studyKind = studyKindOfItem(Library.studyItem(studyItemId));
          renderStudySheet();
        }
      });
    }
    renderStudySheet();
  }
  function renderStudySheet() {
    const body = $('study-body');
    body.innerHTML = '';
    if (!Library.studyReady()) {
      $('study-title').textContent = '翻译与写作';
      $('study-meta').textContent = '单源 study.json · 按需加载';
      body.appendChild(el('div', 'empty-hint', '学习材料加载中…'));
      if (!openSheetEl || openSheetEl.id !== 'study-sheet') openSheet('study-sheet');
      return;
    }
    if (studyItemId) { renderStudyItem(body); if (!openSheetEl || openSheetEl.id !== 'study-sheet') openSheet('study-sheet'); return; }
    const c = Library.studyCounts() || {};
    $('study-title').textContent = '翻译与写作材料';
    $('study-meta').textContent = (c.sections || 0) + ' 个学习小节 · ' + (c.linked || 0) + ' 条真题对齐 · 覆盖 ' + (c.textVerified || 0) + ' 套原文核对';
    const stats = el('div', 'stat-row');
    [[c.translations || 0, '翻译篇目'], [c.writings || 0, '写作篇目'], [c.sections || 0, '学习小节'], [c.linked || 0, '真题对齐']].forEach(([v, k]) => {
      const t = el('div', 'stat-tile');
      t.appendChild(el('div', 'stat-num', String(v)));
      t.appendChild(el('div', 'stat-key', k));
      stats.appendChild(t);
    });
    body.appendChild(stats);
    const chips = el('div', 'chip-row wrap');
    [['translation', '六级翻译'], ['writing6', '六级写作'], ['writing4', '四级写作'], ['misc', '积累素材']].forEach(([id, label]) => {
      const n = studyTabItems(id).length;
      const ch = el('button', 'chip' + (studyKind === id ? ' active' : ''), label + ' ' + n); ch.type = 'button';
      ch.addEventListener('click', () => { studyKind = id; renderStudySheet(); });
      chips.appendChild(ch);
    });
    body.appendChild(chips);
    if (studyKind === 'misc') { renderStudyMisc(body); if (!openSheetEl || openSheetEl.id !== 'study-sheet') openSheet('study-sheet'); return; }
    const items = studyTabItems(studyKind);
    const head = el('div', 'block-head');
    head.appendChild(el('span', null, studyKind === 'translation' ? '真题翻译 · 原文 + 参考译文 + 背诵清单' : '真题写作 · 题目 + 原文 + 润色 + 迁移练习'));
    head.appendChild(el('span', 'count-pill', items.length + ' 篇'));
    body.appendChild(head);
    const wrap = el('div', 'list-gap');
    items.forEach(it => {
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(el('span', 'set-tile', String(it.seq).padStart(2, '0')));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', it.topic || it.title));
      main.appendChild(el('div', 'row-sub', (it.exam ? it.exam.label : '未对齐真题') + (it.date ? ' · 整理 ' + it.date : '') + ' · ' + (it.sections || []).length + ' 小节'));
      row.appendChild(main);
      const match = it.link && it.link.match;
      row.appendChild(el('span', 'row-badge' + (match === 'text' ? ' green' : match ? '' : ' gray'), match ? STUDY_MATCH_NAME[match] || match : '素材'));
      row.addEventListener('click', () => { studyItemId = it.id; studyRevealed = new Set(); renderStudySheet(); });
      wrap.appendChild(row);
    });
    body.appendChild(wrap);
    body.appendChild(el('div', 'field-hint', '正文只存一份于 study.json，真题卷内仅保留 id 反向引用；对齐方式：原文对齐 = 逐字核对，卷标对齐 = 按卷面标签匹配。'));
    if (!openSheetEl || openSheetEl.id !== 'study-sheet') openSheet('study-sheet');
  }
  function renderStudyMisc(body) {
    const misc = Library.studyMisc();
    const byFile = new Map();
    misc.forEach(m => { if (!byFile.has(m.file)) byFile.set(m.file, []); byFile.get(m.file).push(m); });
    byFile.forEach((blocks, file) => {
      const head = el('div', 'block-head');
      head.appendChild(el('span', null, file));
      head.appendChild(el('span', 'count-pill', blocks.length + ' 块'));
      body.appendChild(head);
      const wrap = el('div', 'list-gap');
      blocks.forEach(m => {
        const key = m.file + ':' + m.heading;
        const row = el('button', 'row'); row.type = 'button';
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', m.heading));
        main.appendChild(el('div', 'row-sub', m.text.slice(0, 42).replace(/\n/g, ' ') + '…'));
        row.appendChild(main);
        row.appendChild(el('span', 'row-badge gray', studyMiscOpen.has(key) ? '收起' : '展开'));
        row.addEventListener('click', () => {
          const badge = row.querySelector('.row-badge');
          if (studyMiscOpen.has(key)) {
            studyMiscOpen.delete(key);
            if (row.nextElementSibling && row.nextElementSibling.classList.contains('study-text')) row.nextElementSibling.remove();
            if (badge) badge.textContent = '展开';
          } else {
            studyMiscOpen.add(key);
            row.after(studyTextBlock(m.text));
            if (badge) badge.textContent = '收起';
          }
        });
        wrap.appendChild(row);
        if (studyMiscOpen.has(key)) wrap.appendChild(studyTextBlock(m.text));
      });
      body.appendChild(wrap);
    });
  }
  function studyTextBlock(text) {
    const box = el('div', 'study-text');
    box.textContent = text;
    return box;
  }
  function renderStudyItem(body) {
    const it = Library.studyItem(studyItemId);
    if (!it) { studyItemId = ''; renderStudySheet(); return; }
    studyKind = studyKindOfItem(it);
    $('study-title').textContent = it.topic || it.title;
    $('study-meta').textContent = (it.level === 'CET4' ? '四级' : '六级') + (it.kind === 'translation' ? '翻译' : '写作') + (it.exam ? ' · ' + it.exam.label : '') + (it.date ? ' · 整理 ' + it.date : '');
    const back = el('button', 'btn-ghost cloze-back', '← 返回材料列表'); back.type = 'button';
    back.addEventListener('click', () => { studyItemId = ''; renderStudySheet(); });
    body.appendChild(back);
    const bar = el('div', 'chip-row wrap');
    const hideRe = it.kind === 'translation' ? /参考译文|迁移练习/ : /英文原文|润色版/;
    const recite = el('button', 'chip' + (studyRecite ? ' active' : ''), studyRecite ? '背诵模式：开' : '背诵模式：关'); recite.type = 'button';
    recite.addEventListener('click', () => { studyRecite = !studyRecite; studyRevealed = new Set(); renderStudySheet(); });
    bar.appendChild(recite);
    if (it.exam) bar.appendChild(el('span', 'chip static', it.exam.label + ' · ' + (STUDY_MATCH_NAME[(it.link || {}).match] || '已对齐')));
    body.appendChild(bar);
    if (studyRecite) body.appendChild(el('div', 'field-hint', it.kind === 'translation' ? '背诵模式：参考译文与迁移练习答案已隐藏，先自译再逐块揭示对照。' : '背诵模式：英文原文与润色版已隐藏，先看中文理解自写再揭示对照。'));
    const secs = (it.sections && it.sections.length) ? it.sections : Object.keys(it.fields || {}).map(k => ({ heading: k, text: it.fields[k] }));
    const nav = el('div', 'chip-row wrap');
    secs.forEach((s, i) => {
      const ch = el('button', 'chip', s.heading.length > 12 ? s.heading.slice(0, 12) + '…' : s.heading); ch.type = 'button';
      ch.addEventListener('click', () => {
        const t = document.getElementById('study-sec-' + i);
        if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(ch);
    });
    body.appendChild(nav);
    secs.forEach((s, i) => {
      const box = el('section', 'data-block study-sec');
      box.id = 'study-sec-' + i;
      const head = el('div', 'data-block-head');
      head.appendChild(el('span', 'data-block-title', s.heading));
      box.appendChild(head);
      if (studyRecite && hideRe.test(s.heading) && !studyRevealed.has(i)) {
        const reveal = el('button', 'study-reveal', '背诵模式 · 点击揭示「' + s.heading + '」'); reveal.type = 'button';
        reveal.addEventListener('click', () => { studyRevealed.add(i); reveal.replaceWith(studyTextBlock(s.text)); });
        box.appendChild(reveal);
      } else {
        box.appendChild(studyTextBlock(s.text));
      }
      body.appendChild(box);
    });
    if (it.meta) body.appendChild(el('div', 'field-hint', it.meta));
    body.appendChild(el('div', 'field-hint', '来源：' + ((it.source || {}).file || 'study.json') + ' · 编号 ' + it.id));
  }

  // ===================== 真题词频 / 真题出处 =====================
  function freqSection(e) {
    const f = e && e.examFreq;
    const m = Library.freqMeta();
    if (!f || !m) return null;
    const box = el('section', 'data-block');
    const head = el('div', 'data-block-head');
    head.appendChild(el('span', 'data-block-title', '六级真题词频'));
    head.appendChild(el('span', 'data-block-meta', '语料第 ' + f.rank + ' / ' + m.headwords));
    box.appendChild(head);
    const stats = el('div', 'stat-row');
    [[f.rank, '词频排名', 'rank'], [f.freq, '语料出现次数', ''], [f.forms, '归并词形数', '']].forEach(([v, k, cls]) => {
      const t = el('div', 'stat-tile' + (cls ? ' ' + cls : ''));
      t.appendChild(el('div', 'stat-num', cls === 'rank' ? '#' + v : String(v)));
      t.appendChild(el('div', 'stat-key', k));
      stats.appendChild(t);
    });
    box.appendChild(stats);
    const pct = Math.max(1, Math.round(100 * (1 - (f.rank - 1) / m.headwords)));
    const meter = el('div', 'freq-meter');
    const mh = el('div', 'freq-meter-head');
    mh.appendChild(el('span', 'stat-key', '词频分位'));
    mh.appendChild(el('span', 'freq-meter-val', f.rank === 1 ? '语料最高频' : '高于 ' + pct + '% 的词'));
    meter.appendChild(mh);
    const bar = el('div', 'freq-bar');
    const fill = el('div', 'freq-bar-fill');
    fill.style.width = pct + '%';
    bar.appendChild(fill);
    meter.appendChild(bar);
    box.appendChild(meter);
    box.appendChild(el('div', 'field-hint', f.forms === 1
      ? '全部 ' + f.freq + ' 次来自本词形自身（语料第 ' + f.exactRank + '）'
      : (f.exactFreq
        ? '本词形自身 ' + f.exactFreq + ' 次（语料第 ' + f.exactRank + '），其余来自 ' + (f.forms - 1) + ' 个屈折/派生词形归并'
        : '该词头本身未单独出现，' + f.freq + ' 次全部来自 ' + f.forms + ' 个屈折/派生词形归并')));
    return box;
  }
  function clozeSection(word) {
    const c = Library.clozeOf(word);
    if (!c) return null;
    const box = el('section', 'data-block');
    const head = el('div', 'data-block-head');
    head.appendChild(el('span', 'data-block-title', '选词填空真题'));
    head.appendChild(el('span', 'data-block-meta', '出现 ' + c.n + ' 套真题'));
    box.appendChild(head);
    const pos = el('div', 'pos-chips');
    (c.posAll || []).forEach(p => pos.appendChild(el('span', 'pos-chip ' + p, Library.clozePosName(p))));
    if (c.n >= 2) pos.appendChild(el('span', 'hit-chip hot', '重复考过'));
    box.appendChild(pos);
    const gloss = el('div', 'cloze-lead');
    const globalZh = ((Library.lookup(c.lemma) || {}).zh) || '';
    gloss.appendChild(el('div', 'cloze-lead-key', '全局释义'));
    gloss.appendChild(el('div', 'cloze-lead-text', globalZh));
    box.appendChild(gloss);
    const chips = el('div', 'chip-row wrap');
    c.letters.forEach((ref, i) => {
      const [sid, letter] = ref.split(':');
      const s = Library.clozeSet(sid);
      const chip = el('button', 'chip', (s ? setLabel(s) : sid) + ' · ' + letter); chip.type = 'button';
      chip.addEventListener('click', () => openClozeSheet(sid));
      chips.appendChild(chip);
    });
    box.appendChild(chips);
    if (c.lemma && c.lemma !== c.word.toLowerCase()) box.appendChild(el('div', 'field-hint', '词库词头：' + c.lemma + ' · 归并方式 ' + c.how));
    return box;
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
  function openWordSheet(word, fromSearch, trail, nested) {
    const e = findEntry(word);
    sheetWord = word;
    setCrumbs('crumbs-word', (trail || []).concat([{ label: word }]));
    if (fromSearch) Store.addHistory(word);
    Store.recordView(word);
    $('word-sheet-title').textContent = word;
    if (!e) {
      $('word-sheet-sub').textContent = '';
      $('word-sheet-sub').hidden = true;
      const body = $('word-sheet-body');
      body.innerHTML = '<div class="empty-hint">词库中暂无该词，可尝试外部词典查询。</div>';
      if (window.Dictionary) {
        const blocks = el('div', 'study-info word-blocks');
        blocks.appendChild(dictSection({ word }));
        body.appendChild(blocks);
      }
      $('word-study-btn').disabled = true;
      if (nested) openNestedSheet('word-sheet'); else openSheet('word-sheet');
      return;
    }
    $('word-study-btn').disabled = false;
    const subBits = [];
    if ((Store.data.studyPanel || {}).phonetic === false && e.cefr) subBits.push(e.cefr);
    if (e.root) subBits.push('词根 ' + e.root);
    $('word-sheet-sub').textContent = subBits.join(' · ');
    $('word-sheet-sub').hidden = !subBits.length;
    const body = $('word-sheet-body');
    body.innerHTML = '';
    const metaRow = el('div', 'exam-tags');
    if (e.tags && e.tags.length) e.tags.forEach(t => metaRow.appendChild(el('span', 'exam-tag', t)));
    const vn = Store.viewCount(word);
    if (vn) metaRow.appendChild(el('span', 'view-chip', '已看 ' + vn + ' 次'));
    if (metaRow.childNodes.length) body.appendChild(metaRow);
    const speakRow = el('button', 'btn-ghost', '🔊 朗读');
    speakRow.addEventListener('click', () => speak(word, e.audio));
    body.appendChild(speakRow);
    const head = el('div', 'word-sub');
    body.appendChild(head);
    const blocks = el('div', 'study-info word-blocks');
    renderWordBlocks(e, blocks, head);
    body.appendChild(blocks);
    updateFavToggle();
    if (nested) openNestedSheet('word-sheet'); else openSheet('word-sheet');
  }
  function updateFavToggle() {
    const fav = Store.isFavorite(sheetWord);
    $('word-fav-toggle').textContent = fav ? '★ 已收藏' : '☆ 收藏';
  }

  // ===================== AI explanations =====================
  function renderAiExplanation(container, data) {
    container.innerHTML = '';
    const block = (title, node) => { const s = el('div', 'ai-block'); if (title) s.appendChild(el('div', 'ai-block-title', title)); s.appendChild(node); container.appendChild(s); };
    const text = t => el('p', 'ai-text', t);
    if (Array.isArray(data.meanings) && data.meanings.length) {
      const wrap = el('div', 'ai-meanings');
      data.meanings.forEach(m => { const row = el('div', 'ai-meaning'); if (m.pos) row.appendChild(el('span', 'ai-pos', m.pos)); row.appendChild(el('span', 'ai-meaning-text', m.zh || '')); if (m.en) row.appendChild(el('span', 'ai-meaning-en', m.en)); wrap.appendChild(row); });
      block('释义', wrap);
    }
    if (Array.isArray(data.morphemes) && data.morphemes.length) {
      const chips = data.morphemes.map(m => ({ text: m.part || '', type: m.type, gloss: (m.gloss_zh || m.gloss_en || '') + (m.note ? ' · ' + m.note : '') }));
      const line = buildMorphLine(chips, null);
      if (line) block('构词', line);
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
    requestAnimationFrame(() => container.querySelectorAll('.morph-line').forEach(fitMorphLine));
  }

  function aiConfigPrompt(content, actions) {
    content.innerHTML = '';
    content.appendChild(el('p', 'ai-placeholder', 'AI 详解未配置。请到「我的 → AI 解释」开启并填写 API Key。'));
    actions.innerHTML = '';
    const go = el('button', 'btn-ghost', '前往设置');
    go.addEventListener('click', () => { closeSheet(); openSettings('dict'); });
    actions.appendChild(go);
  }

  function dictSection(e) {
    const sec = el('section', 'ai-section dict-section');
    const head = el('div', 'ai-section-head');
    const titleWrap = el('div', 'ai-section-titlewrap');
    titleWrap.appendChild(el('span', 'ai-section-title', '词典'));
    const meta = el('span', 'ai-section-meta');
    titleWrap.appendChild(meta);
    head.appendChild(titleWrap);
    const tools = el('div', 'dict-tools');
    const refresh = el('button', 'icon-action');
    refresh.type = 'button'; refresh.title = '刷新词典'; refresh.setAttribute('aria-label', '刷新词典');
    refresh.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.35 5.65" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 4.8V11h-6.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const del = el('button', 'icon-action danger');
    del.type = 'button'; del.title = '删除词典缓存'; del.setAttribute('aria-label', '删除词典缓存');
    del.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 6.5h15M9.5 6.5V4.8c0-.45.35-.8.8-.8h3.4c.45 0 .8.35.8.8v1.7M6.5 6.5l.8 12.1c.05.75.65 1.4 1.4 1.4h6.6c.75 0 1.35-.65 1.4-1.4l.8-12.1M10 10.5v6M14 10.5v6" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    tools.append(refresh, del);
    head.appendChild(tools);
    sec.appendChild(head);
    const content = el('div', 'ai-section-body');
    sec.appendChild(content);
    const actions = el('div', 'ai-actions');
    sec.appendChild(actions);

    let loading = false;
    let viewRecord = null, viewCached = false, viewErrors = [], viewSource = '', viewStale = false;
    function providerName(id) { return Dictionary.getProvider(id, Store.data.dict).name; }
    function providerMark(id) { return dictMark(Dictionary.getProvider(id, Store.data.dict)); }
    function enabledSummary() {
      const names = Dictionary.enabledProviders(Store.data.dict).map(p => p.name);
      return names.length ? names.join(' + ') : '未启用词典';
    }
    function syncTools(hasRecord) {
      refresh.disabled = loading;
      refresh.classList.toggle('spinning', loading);
      del.hidden = !hasRecord;
    }

    function renderBody(r, merged) {
      if (r.ipa) {
        const ipaText = r.ipaUk && r.ipaUk !== r.ipa
          ? '美 /' + r.ipa + '/ · 英 /' + r.ipaUk + '/'
          : '/' + r.ipa + '/';
        content.appendChild(el('p', 'dict-ipa', ipaText));
      }
      const ownTags = new Set((e && e.tags) || []);
      const exam = ownTags.size ? [] : (r.exam || []);
      if (exam.length) {
        const tags = el('div', 'exam-tags dict-exam');
        exam.forEach(t => tags.appendChild(el('span', 'exam-tag', t)));
        content.appendChild(tags);
      }
      if (r.mnemonic) content.appendChild(el('p', 'dict-mnemonic', '助记：' + r.mnemonic));
      (r.meanings || []).forEach(m => {
        const block = el('div', 'dict-mean');
        if (m.pos) block.appendChild(el('div', 'dict-pos', m.pos));
        (m.defs || []).forEach((d, i) => {
          const row = el('div', 'dict-def');
          row.appendChild(el('span', 'dict-num', String(i + 1)));
          const txt = el('div', 'dict-def-text');
          const line = el('div', 'dict-def-line');
          line.appendChild(el('span', 'dict-def-en', d.zh || d.en || ''));
          if (merged && d.src && d.src.length) {
            line.appendChild(el('span', 'dict-def-src', d.src.map(providerMark).join('·')));
          }
          txt.appendChild(line);
          if (d.zh && d.en) txt.appendChild(el('div', 'dict-def-en2', d.en));
          if (d.example) txt.appendChild(el('div', 'dict-def-ex', d.example));
          const syn = (d.synonyms || []).join(' · ');
          if (syn) txt.appendChild(el('div', 'dict-def-syn', '近义：' + syn));
          row.appendChild(txt);
          block.appendChild(row);
        });
        content.appendChild(block);
      });
      if (r.wordForms && r.wordForms.length) {
        const wf = el('div', 'dict-mean');
        wf.appendChild(el('div', 'dict-pos', '词形变化'));
        const row = el('div', 'dict-def');
        const txt = el('div', 'dict-def-text');
        txt.appendChild(el('span', 'dict-def-en', r.wordForms.map(f => f.name + ' ' + f.value).join(' · ')));
        row.appendChild(txt); wf.appendChild(row); content.appendChild(wf);
      }
      if (r.phrases && r.phrases.length) {
        const ph = el('div', 'dict-mean');
        ph.appendChild(el('div', 'dict-pos', '常见词组'));
        r.phrases.forEach(p => {
          const row = el('div', 'dict-def');
          const txt = el('div', 'dict-def-text');
          txt.appendChild(el('span', 'dict-def-en', p.phrase));
          if (p.meaning) txt.appendChild(el('div', 'dict-def-en2', p.meaning));
          row.appendChild(txt); ph.appendChild(row);
        });
        content.appendChild(ph);
      }
    }

    function render(record, cached, errors, stale) {
      viewRecord = record || null;
      viewCached = !!cached;
      viewErrors = errors || [];
      viewStale = !!stale;
      const sources = (record && record.sources) || [];
      if (viewSource && !sources.some(s => s.provider === viewSource)) viewSource = '';
      content.innerHTML = ''; actions.innerHTML = '';
      syncTools(!!record);
      if (!record) {
        meta.textContent = enabledSummary();
        content.appendChild(el('p', 'ai-placeholder', '暂无本地缓存；点「查询词典」联网查询并缓存到本机，之后离线可看。'));
        const query = el('button', 'btn-primary', '查询词典');
        query.addEventListener('click', () => run(false));
        actions.appendChild(query);
        return;
      }
      const multi = sources.length > 1;
      meta.textContent = (viewSource ? providerName(viewSource) + ' · 单源' : (multi ? sources.length + ' 个词典合并' : providerName(record.provider))) +
        (cached ? ' · 本地缓存' : '') +
        (viewStale ? '（按旧词典配置生成）' : '') +
        (record.fallbackFrom ? ' · 已从' + providerName(record.fallbackFrom) + '回退' : '');
      if (viewStale) {
        const requpdate = el('button', 'btn-ghost', '按当前配置重查');
        requpdate.addEventListener('click', () => run(true));
        actions.appendChild(requpdate);
      }
      if (multi) {
        const chips = el('div', 'dict-source-chips');
        const all = el('button', 'dict-source-chip' + (viewSource ? '' : ' active'), '全部');
        all.type = 'button';
        all.addEventListener('click', () => { viewSource = ''; render(viewRecord, viewCached, viewErrors, viewStale); });
        chips.appendChild(all);
        sources.forEach(s => {
          const chip = el('button', 'dict-source-chip' + (viewSource === s.provider ? ' active' : ''), providerName(s.provider));
          chip.type = 'button';
          chip.addEventListener('click', () => { viewSource = s.provider; render(viewRecord, viewCached, viewErrors, viewStale); });
          chips.appendChild(chip);
        });
        content.appendChild(chips);
      }
      const shown = viewSource ? sources.find(s => s.provider === viewSource) : record;
      renderBody(shown || record, multi && !viewSource);
      if (viewErrors.length) {
        content.appendChild(el('p', 'dict-source-errors',
          '未返回：' + viewErrors.map(x => providerName(x.provider) + '（' + x.error + '）').join('；')));
      }
    }

    async function run(force) {
      if (loading) return;
      loading = true;
      syncTools(!!Store.dictEntry(e.word));
      content.innerHTML = ''; actions.innerHTML = '';
      meta.textContent = enabledSummary();
      const names = Dictionary.enabledProviders(Store.data.dict).map(p => p.name);
      content.appendChild(el('p', 'ai-placeholder', names.length > 1 ? '正在并行查询 ' + names.length + ' 个词典…' : '正在查询外部词典…'));
      const res = await Dictionary.lookup(e.word, Store.data.dict, force ? { force: true } : undefined);
      loading = false;
      if (res.ok) { viewSource = ''; render(res.record, res.cached, res.errors); return; }
      syncTools(!!Store.dictEntry(e.word));
      content.innerHTML = '';
      content.appendChild(el('p', 'ai-error', '查询失败：' + res.error));
      if (res.errors && res.errors.length > 1) {
        content.appendChild(el('p', 'dict-source-errors',
          res.errors.map(x => providerName(x.provider) + '：' + x.error).join('；')));
      }
      const retry = el('button', 'btn-ghost', '重试');
      retry.addEventListener('click', () => run(true));
      actions.appendChild(retry);
      const cfg = el('button', 'btn-ghost', '词典设置');
      cfg.addEventListener('click', () => { closeSheet(); openSettings('dict'); });
      actions.appendChild(cfg);
    }

    refresh.addEventListener('click', () => run(true));
    del.addEventListener('click', () => { Store.deleteDictEntry(e.word); viewSource = ''; render(null, false); });

    const cachedRecord = Store.dictEntry(e.word);
    const fresh = cachedRecord && (cachedRecord.sig || '') === Dictionary.signature(Store.data.dict);
    if (fresh) render(cachedRecord, true);
    else render(cachedRecord || null, !!cachedRecord, [], !!cachedRecord);
    return sec;
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

    let generating = false;

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
      if (generating) return;
      const cfg = Store.data.ai;
      if (!cfg.enabled || !AI.effectiveKey(cfg)) { aiConfigPrompt(content, actions); return; }
      generating = true;
      if (btn) { btn.disabled = true; btn.textContent = '生成中…'; }
      content.innerHTML = '';
      content.appendChild(el('p', 'ai-placeholder', '正在调用 AI 生成讲解…'));
      const res = await AI.explainWord(e.word, e, cfg);
      generating = false;
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
    setCrumbs('crumbs-ai', [crumbMine(), { label: 'AI 解释缓存' }]);
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
    const exact = r.words.some(w => w.word.toLowerCase() === query.toLowerCase());
    if (!exact) {
      res.appendChild(el('div', 'section-label', '在线词典'));
      const wrap = el('div', 'list-gap');
      const online = el('button', 'row online-lookup-row'); online.type = 'button';
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', '在线查词：' + query));
      main.appendChild(el('div', 'row-sub', '本地词库未收录，点击联网查询并缓存到本机'));
      online.appendChild(main);
      online.appendChild(el('span', 'row-badge', '词典'));
      online.addEventListener('click', () => { Platform.haptic('tap'); openWordSheet(query, true); });
      wrap.appendChild(online);
      res.appendChild(wrap);
    }
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
    if (!res.childNodes.length) res.appendChild(el('div', 'empty-hint', '没有匹配结果'));
  }
  function renderHistory() {
    const list = $('history-list');
    list.innerHTML = '';
    const h = Store.data.history.filter(item => item && typeof item.word === 'string' && item.word.trim() && item.word !== 'undefined' && item.word !== 'null');
    if (!h.length) { list.appendChild(el('span', 'field-hint', '查过的词会出现在这里')); return; }
    const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const groups = [];
    h.forEach(item => {
      const d = new Date(item.ts || Date.now());
      const key = dayKey(d);
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) { g = { key, date: d, items: [] }; groups.push(g); }
      g.items.push(item);
    });
    const now = new Date();
    const todayK = dayKey(now), yestK = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    groups.forEach((g, i) => {
      const wrap = el('div', 'hist-group');
      const head = el('button', 'hist-head'); head.type = 'button';
      const label = g.key === todayK ? '今天' : g.key === yestK ? '昨天'
        : (g.date.getFullYear() !== now.getFullYear() ? g.date.getFullYear() + '年' : '') + (g.date.getMonth() + 1) + '月' + g.date.getDate() + '日';
      head.appendChild(el('span', 'hist-title', label));
      head.appendChild(el('span', 'hist-count', g.items.length + ' 词'));
      head.appendChild(el('span', 'cmp-caret', '▾'));
      const body = el('div', 'hist-body');
      const cr = el('div', 'chip-row');
      g.items.forEach(item => {
        const c = el('button', 'chip word-chip', item.word); c.type = 'button';
        c.addEventListener('click', () => openWordSheet(item.word, true));
        cr.appendChild(c);
      });
      body.appendChild(cr);
      const open = i === 0;
      body.hidden = !open;
      head.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
      head.addEventListener('click', () => {
        body.hidden = !body.hidden;
        head.classList.toggle('open', !body.hidden);
        head.setAttribute('aria-expanded', String(!body.hidden));
      });
      wrap.appendChild(head); wrap.appendChild(body);
      list.appendChild(wrap);
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
      main.appendChild(el('div', 'row-sub', (e && e.zh) || ''));
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

  // ===================== me =====================
  function renderMeProfile() {
    const p = Store.data.profile || { nickname: '', avatar: '' };
    $('me-name').textContent = p.nickname || '我的';
    const img = $('me-avatar-img');
    const fb = $('me-avatar-fallback');
    if (p.avatar) {
      img.src = p.avatar; img.hidden = false; fb.hidden = true;
    } else {
      img.removeAttribute('src'); img.hidden = true; fb.hidden = false;
    }
    $('me-avatar-btn').title = p.avatar ? '更换头像' : '设置头像';
  }
  function syncProfileSheet() {
    const d = profileDraft || { nickname: '', avatar: '' };
    $('profile-nickname').value = d.nickname;
    $('profile-preview-name').textContent = d.nickname.trim() || '我的';
    const img = $('profile-avatar-img');
    const icon = $('profile-avatar-icon');
    const remove = $('profile-remove');
    if (d.avatar) { img.src = d.avatar; img.hidden = false; icon.hidden = true; }
    else { img.removeAttribute('src'); img.hidden = true; icon.hidden = false; }
    remove.hidden = !d.avatar;
  }
  function openProfileSheet() {
    const p = Store.data.profile || {};
    profileDraft = { nickname: p.nickname || '', avatar: p.avatar || '' };
    syncProfileSheet();
    openSheet('profile-sheet');
  }
  async function chooseAvatar(file) {
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { alert('请选择图片文件。'); return; }
    try {
      const url = await readAvatarImage(file);
      if (!profileDraft) profileDraft = { nickname: Store.data.profile.nickname || '', avatar: '' };
      profileDraft.avatar = url;
      syncProfileSheet();
    } catch (err) {
      alert('头像设置失败：' + ((err && err.message) || err));
    }
  }
  function saveProfile() {
    const nickname = $('profile-nickname').value;
    Store.setProfile({ nickname, avatar: (profileDraft && profileDraft.avatar) || '' });
    renderMeProfile();
    closeSheet();
  }
  function renderMe() {
    renderMeProfile();
    const p = Store.planProgress();
    const b = book || activeBook();
    $('me-book').textContent = b.name + ' · 词根背单词';
    $('me-streak').textContent = '连续 ' + Store.streak().count + ' 天';
    const known = knownCount(b.entries || []);
    const host = $('me-stats');
    host.innerHTML = '';
    [['今日新学', p.newDone], ['今日复习', p.reviewDone], ['已掌握', known], ['累计接触', Store.totalViews()]].forEach(([label, val]) => {
      const c = el('div', 'me-stat');
      c.appendChild(el('div', 'me-stat-value', String(val)));
      c.appendChild(el('div', 'me-stat-label', label));
      host.appendChild(c);
    });
    $('me-foot').textContent = 'Glance · 词根背单词 · ' + b.name;
  }

  // ===================== stats =====================
  function renderStats() {
    setCrumbs('crumbs-stats', [crumbMine(), { label: '学习统计' }]);
    const p = Store.planProgress();
    const rate = p.graded > 0 ? Math.round((p.know / p.graded) * 100) : 0;
    const grid = $('stats-today');
    grid.innerHTML = '';
    [['今日新学', p.newDone, ''], ['今日复习', p.reviewDone, ''], ['认识率', rate, '%'], ['学习时长', fmtMs(p.ms), '分钟'], ['累计接触', Store.totalViews(), '次'], ['接触词数', Store.viewedWordCount(), '词']].forEach(([label, val, unit]) => {
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
    renderTopViews();
    renderDayHistory();
  }
  function renderTopViews() {
    const host = $('views-top');
    if (!host) return;
    host.innerHTML = '';
    const top = Store.topViews(12);
    $('views-total').textContent = '累计 ' + Store.totalViews() + ' 次';
    if (!top.length) { host.appendChild(el('div', 'empty-hint', '学习或查词后，这里会显示你接触最多的词')); return; }
    const wrap = el('div', 'list-gap');
    top.forEach((x, i) => {
      const st = stateOf(x.word);
      const row = el('button', 'row'); row.type = 'button';
      row.appendChild(el('span', 'view-rank', String(i + 1)));
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', x.word));
      main.appendChild(el('div', 'row-sub', themeStateLabel(st) + ' · 最近 ' + Store.dateKey(new Date(x.last))));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge ' + (st === 'known' ? 'green' : 'gray'), x.n + ' 次'));
      row.addEventListener('click', () => openWordSheet(x.word));
      wrap.appendChild(row);
    });
    host.appendChild(wrap);
  }
  function renderCalendar() {
    const cal = $('calendar');
    cal.innerHTML = '';
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const rangeStart = new Date(today); rangeStart.setDate(today.getDate() - 34);
    const start = new Date(rangeStart);
    start.setDate(rangeStart.getDate() - ((rangeStart.getDay() + 6) % 7));
    const end = new Date(today);
    end.setDate(today.getDate() + (6 - ((today.getDay() + 6) % 7)));
    const head = el('div', 'cal-weekdays');
    ['一', '二', '三', '四', '五', '六', '日'].forEach(d => head.appendChild(el('span', null, d)));
    cal.appendChild(head);
    const cursor = new Date(start);
    let monthShown = -1;
    while (cursor <= end) {
      const m = cursor.getMonth();
      if (m !== monthShown) {
        monthShown = m;
        cal.appendChild(el('div', 'cal-month', cursor.getFullYear() + '年' + (m + 1) + '月'));
      }
      const week = el('div', 'cal-week');
      for (let i = 0; i < 7; i++) {
        const d = new Date(cursor); d.setDate(cursor.getDate() + i);
        const key = Store.dateKey(d);
        const log = Store.data.logs[key];
        const graded = log ? (log.know + log.fuzzy + log.forgot) : 0;
        const cell = el('div', 'cal-cell');
        let lvl = 0;
        if (graded > 30) lvl = 4; else if (graded > 15) lvl = 3; else if (graded > 5) lvl = 2; else if (graded > 0) lvl = 1;
        if (lvl) cell.classList.add('l' + lvl);
        if (key === Store.today()) cell.classList.add('today');
        if (d > today) cell.classList.add('future');
        cell.title = key + ' · ' + graded + ' 次';
        cell.appendChild(el('span', 'cal-num', String(d.getDate())));
        week.appendChild(cell);
      }
      cal.appendChild(week);
      cursor.setDate(cursor.getDate() + 7);
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
    const keys = Object.keys(Store.data.logs).sort().reverse();
    if (!keys.length) { box.appendChild(el('div', 'empty-hint', '还没有学习记录')); return; }
    const tl = el('div', 'timeline');
    box.appendChild(tl);
    const now = new Date();
    const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const todayK = dayKey(now), yestK = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
    const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    let rendered = 0;
    const BATCH = 30;
    const more = el('button', 'cmp-more tl-more'); more.type = 'button';
    const load = () => {
      const end = Math.min(keys.length, rendered + BATCH);
      for (; rendered < end; rendered++) {
        const key = keys[rendered];
        const l = Store.data.logs[key];
        const d = new Date(key + 'T00:00:00');
        const day = el('div', 'tl-day' + (key === todayK ? ' today' : ''));
        const card = el('div', 'tl-card');
        const head = el('button', 'tl-head'); head.type = 'button';
        const label = key === todayK ? '今天' : key === yestK ? '昨天'
          : (d.getFullYear() !== now.getFullYear() ? d.getFullYear() + '年' : '') + (d.getMonth() + 1) + '月' + d.getDate() + '日';
        head.appendChild(el('span', 'tl-date', label));
        head.appendChild(el('span', 'tl-week', WEEK[d.getDay()]));
        const graded = (l.know || 0) + (l.fuzzy || 0) + (l.forgot || 0);
        head.appendChild(el('span', 'tl-stats', '新学 ' + (l.newWords || []).length + ' · 复习 ' + (l.reviewWords || []).length + ' · ' + graded + ' 次 · ' + fmtMs(l.ms || 0) + ' 分钟'));
        head.appendChild(el('span', 'cmp-caret', '▾'));
        const body = el('div', 'tl-body');
        const grades = el('div', 'tl-grades');
        [['认识', l.know || 0, 'green'], ['模糊', l.fuzzy || 0, 'amber'], ['忘记', l.forgot || 0, 'red']].forEach(([name, n, color]) => {
          grades.appendChild(el('span', 'tl-grade ' + color, name + ' ' + n));
        });
        body.appendChild(grades);
        [['新学', l.newWords], ['复习', l.reviewWords]].forEach(([name, words]) => {
          if (!(words || []).length) return;
          body.appendChild(el('div', 'section-label', name));
          const cr = el('div', 'chip-row');
          words.forEach(w => { const c = el('button', 'chip word-chip', w); c.type = 'button'; c.addEventListener('click', () => openWordSheet(w)); cr.appendChild(c); });
          body.appendChild(cr);
        });
        const open = rendered === 0;
        body.hidden = !open;
        head.classList.toggle('open', open);
        head.setAttribute('aria-expanded', String(open));
        head.addEventListener('click', () => {
          body.hidden = !body.hidden;
          head.classList.toggle('open', !body.hidden);
          head.setAttribute('aria-expanded', String(!body.hidden));
        });
        card.appendChild(head); card.appendChild(body);
        day.appendChild(card);
        tl.appendChild(day);
      }
      more.hidden = rendered >= keys.length;
      more.textContent = '再往前 ' + Math.min(BATCH, keys.length - rendered) + ' 天';
    };
    more.addEventListener('click', load);
    load();
    box.appendChild(more);
  }

  // ===================== books =====================
  // ===================== official syllabus comparison =====================
  function cmpSourceOptions() {
    const opts = [];
    Library.listBooks().forEach(b => opts.push({ tag: b.tag, name: b.name }));
    Object.keys(Store.data.customBooks).forEach(name => opts.push({ tag: name, name: name + '（自定义）' }));
    return opts;
  }
  function cmpSection(title, words, color, desc) {
    const wrap = el('div', 'cmp-section');
    const head = el('button', 'cmp-head'); head.type = 'button';
    head.appendChild(el('span', 'cmp-title', title + '（' + words.length + '）'));
    head.appendChild(el('span', 'cmp-caret', '▾'));
    const body = el('div', 'cmp-body'); body.hidden = true;
    body.appendChild(el('div', 'cmp-desc', desc));
    const chips = el('div', 'cmp-chips');
    body.appendChild(chips);
    const more = el('button', 'cmp-more'); more.type = 'button'; more.hidden = true;
    body.appendChild(more);
    const BATCH = 120;
    let rendered = 0;
    const load = () => {
      const end = Math.min(words.length, rendered + BATCH);
      for (; rendered < end; rendered++) chips.appendChild(el('span', 'cmp-chip ' + color, words[rendered]));
      more.hidden = rendered >= words.length;
      more.textContent = '加载更多（剩余 ' + (words.length - rendered) + ' 词）';
    };
    more.addEventListener('click', load);
    head.addEventListener('click', () => {
      body.hidden = !body.hidden;
      head.classList.toggle('open', !body.hidden);
      head.setAttribute('aria-expanded', String(!body.hidden));
      if (!body.hidden && !rendered) load();
    });
    wrap.appendChild(head); wrap.appendChild(body);
    return wrap;
  }
  function renderCompare() {
    const srcSel = $('cmp-source'), lvlSel = $('cmp-level'), box = $('cmp-result');
    if (!srcSel || !lvlSel || !box) return;
    const prev = srcSel.value;
    const opts = cmpSourceOptions();
    srcSel.innerHTML = '';
    opts.forEach(o => { const op = el('option', null, o.name); op.value = o.tag; srcSel.appendChild(op); });
    const want = opts.some(o => o.tag === prev) ? prev : (Store.data.activeBook || (opts[0] && opts[0].tag));
    if (want) srcSel.value = want;
    const level = lvlSel.value || 'cet4';
    const b = resolveBook(srcSel.value);
    box.innerHTML = '';
    if (!b || !b.entries.length) { box.appendChild(el('div', 'empty-hint', '请选择一本有单词的词书。')); return; }
    const r = Library.compareToOfficial(b.entries, level);
    const lvlName = level === 'cet6' ? '六级（B组·★）' : '四级（A组·无★）';
    const sum = el('div', 'cmp-summary');
    sum.appendChild(el('div', 'cmp-line', '本书 ' + r.total + ' 词 · 考纲内 ' + r.covered + ' · 超纲 ' + r.beyond));
    sum.appendChild(el('div', 'cmp-line', '官方' + lvlName + ' ' + r.offTotal + ' 词 · 本书覆盖 ' + (r.offTotal - r.missing) + ' · 缺失 ' + r.missing));
    const bar = el('div', 'cmp-bar'); const fill = el('div', 'cmp-fill');
    fill.style.width = Math.round(r.coverageBook * 100) + '%';
    bar.appendChild(fill); sum.appendChild(bar);
    sum.appendChild(el('div', 'cmp-pct', '本书考纲内占比 ' + Math.round(r.coverageBook * 100) + '% · 考纲覆盖率 ' + Math.round(r.coverageOfficial * 100) + '%'));
    box.appendChild(sum);
    box.appendChild(cmpSection('考纲内', r.coveredWords, 'green', '本书中属于官方考纲的词'));
    box.appendChild(cmpSection('超纲', r.beyondWords, 'amber', '本书中超出官方考纲的词'));
    box.appendChild(cmpSection('考纲缺失', r.missingWords, 'gray', '官方考纲有、本书未收录的词'));
  }

  function renderBooks() {
    setCrumbs('crumbs-books', [crumbMine(), { label: '词书与计划' }]);
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

    const f = Store.data.bookFilter || {};
    $('book-skip-lower').checked = !!f.skipLower;
    $('book-skip-known').checked = !!f.skipKnown;
    $('book-skip-basic').checked = f.skipBasic !== false;
    renderExcludeChips(b);
    const hint = $('book-filter-hint');
    const basic = f.skipBasic !== false ? Library.basicWordSet() : null;
    const lower = f.skipLower && !b.custom ? Library.lowerWordSet(b.tag) : null;
    const ex = (f.excludeBooks && f.excludeBooks.length) ? Library.excludeWordSet(f.excludeBooks) : null;
    let dBasic = 0, dLower = 0, dEx = 0, dKnown = 0;
    for (const e of b.entries) {
      if (basic && basic.has(e.word)) { dBasic++; continue; }
      if (lower && lower.has(e.word)) { dLower++; continue; }
      if (ex && ex.has(e.word)) { dEx++; continue; }
      if (f.skipKnown && SRS.isKnown(Store.data.srs[e.word])) dKnown++;
    }
    const total = dBasic + dLower + dEx + dKnown;
    if (!total) {
      hint.textContent = '当前不裁剪词书;过滤只影响每日学习队列，测试范围不受影响。';
    } else {
      const parts = [];
      if (dBasic) parts.push('基础词 ' + dBasic);
      if (dLower) parts.push('低阶重复 ' + dLower);
      if (dEx) parts.push('词书重复 ' + dEx);
      if (dKnown) parts.push('已掌握 ' + dKnown);
      hint.textContent = '过滤后剩 ' + (b.n - total) + ' 词（' + parts.join(' · ') + '）。';
    }

    const list = $('books-list');
    list.innerHTML = '';
    const wrap = el('div', 'list-gap');
    Library.listBooks().forEach(bk => {
      const entries = (Library.getBook(bk.tag) || {}).entries || [];
      const kn = knownCount(entries);
      const row = el('button', 'row book-row' + (bk.tag === Store.data.activeBook ? ' active' : '')); row.type = 'button';
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', bk.name));
      main.appendChild(el('div', 'row-sub', bk.n + ' 词 · 已掌握 ' + kn + (bk.official ? ' · 官方考纲' : '') + (bk.frequency ? ' · 按真题出现次数排序' : '')));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge ' + (bk.tag === Store.data.activeBook ? 'green' : 'gray'), bk.tag === Store.data.activeBook ? '当前' : Math.round(bk.n ? (kn / bk.n) * 100 : 0) + '%'));
      row.addEventListener('click', () => switchBook(bk.tag));
      wrap.appendChild(row);
    });
    list.appendChild(wrap);
    renderCompare();

    const customKeys = Object.keys(Store.data.customBooks);
    const cl = $('custom-books-list');
    cl.innerHTML = '';
    if (!customKeys.length) {
      cl.appendChild(el('div', 'empty-hint', '还没有自定义词书，可从下方导入。'));
      return;
    }
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
  function renderExcludeChips(b) {
    const wrap = $('book-exclude-chips');
    wrap.innerHTML = '';
    const sel = new Set((Store.data.bookFilter || {}).excludeBooks || []);
    const opts = Library.listBooks().map(x => ({ tag: x.tag, name: x.name }));
    Object.keys(Store.data.customBooks).forEach(n => opts.push({ tag: n, name: n }));
    const avail = opts.filter(o => o.tag !== b.tag);
    if (!avail.length) { wrap.appendChild(el('span', 'field-hint', '暂无其它词书可作过滤。')); return; }
    avail.forEach(o => {
      const chip = el('button', 'filter-chip' + (sel.has(o.tag) ? ' on' : ''), o.name);
      chip.type = 'button';
      chip.setAttribute('aria-pressed', String(sel.has(o.tag)));
      chip.addEventListener('click', () => {
        const cur = new Set(Store.data.bookFilter.excludeBooks || []);
        if (cur.has(o.tag)) cur.delete(o.tag); else cur.add(o.tag);
        Store.data.bookFilter.excludeBooks = Array.from(cur);
        Store.save();
        buildSession();
        renderBooks();
        updatePlanBar();
        Platform.haptic('tap');
      });
      wrap.appendChild(chip);
    });
  }
  function switchBook(tag) {
    Platform.haptic('tap');
    Store.data.activeBook = tag; Store.save();
    book = activeBook();
    buildSession();
    renderBooks();
    updatePlanBar();
  }
  function bookNameFromFile(fileName) {
    const base = String(fileName || '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').trim();
    return Array.from(base).slice(0, 24).join('') || '自定义词书';
  }
  function uniqueBookName(base) {
    const taken = new Set(Object.keys(Store.data.customBooks));
    Library.listBooks().forEach(b => { taken.add(b.tag); taken.add(b.name); });
    if (!taken.has(base)) return base;
    let i = 2;
    while (taken.has(base + '（' + i + '）')) i++;
    return base + '（' + i + '）';
  }
  async function importBook() {
    let r;
    try { r = await Platform.pickLibrary(); }
    catch (e) { alert('无法打开文件选择器：' + ((e && e.message) || e)); return; }
    if (!r) return;
    try {
      const parsed = Library.parse(r.text, r.name);
      if (!parsed.entries.length) {
        alert('没有识别到单词。请确认每行是「单词 + 释义」，或使用 JSON / TSV / CSV 格式。');
        return;
      }
      const name = uniqueBookName(bookNameFromFile(r.name));
      Store.data.customBooks[name] = { entries: parsed.entries };
      Store.save();
      switchBook(name);
    } catch (e) {
      alert('词库解析失败：' + ((e && e.message) || e) + '\n支持 JSON、TSV、CSV、TXT。');
    }
  }

  // ===================== settings =====================
  const SETTINGS_PANES = {
    learn: ['学习与测试', '每日计划 · 测试 · 词根词缀 · 学习面板'],
    appearance: ['外观与发音', '主题风格 · 背景 · 朗读语速与口音'],
    dict: ['词典与 AI', '词典源与缓存 · AI 模型与 Key'],
    data: ['数据与存储', '存储位置 · 备份导入与重置'],
  };
  function renderPanelOrderUi() {
    const list = document.querySelector('.panel-order');
    if (!list) return;
    const rows = new Map(Array.from(list.querySelectorAll('[data-panel-row]')).map(r => [r.dataset.panelRow, r]));
    panelOrder().forEach(id => { const row = rows.get(id); if (row) list.appendChild(row); });
  }
  function refreshPanelViews() {
    if (currentView === 'study' && mode === 'study') renderStudy(); else panelDirty = true;
    const sh = $('word-sheet');
    if (sh && !sh.hidden && sheetWord) {
      const se = findEntry(sheetWord);
      if (se) renderWordBlocks(se, sh.querySelector('.word-blocks'), sh.querySelector('.word-sub'));
    }
  }
  function savePanelOrder(ids) {
    Store.data.studyPanelOrder = ids;
    Store.save();
    renderPanelOrderUi();
    refreshPanelViews();
  }
  function movePanelRow(id, dir) {
    const order = panelOrder();
    const i = order.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    savePanelOrder(order);
  }
  function wirePanelOrder() {
    let dragId = null;
    document.querySelectorAll('[data-panel-row]').forEach(row => {
      row.draggable = true;
      row.querySelectorAll('[data-move]').forEach(btn => {
        btn.addEventListener('click', () => movePanelRow(row.dataset.panelRow, Number(btn.dataset.move)));
      });
      row.addEventListener('dragstart', ev => {
        dragId = row.dataset.panelRow;
        row.classList.add('dragging');
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', () => { dragId = null; row.classList.remove('dragging'); });
      row.addEventListener('dragover', ev => ev.preventDefault());
      row.addEventListener('drop', ev => {
        ev.preventDefault();
        const target = row.dataset.panelRow;
        if (!dragId || dragId === target) return;
        const order = panelOrder();
        order.splice(order.indexOf(dragId), 1);
        order.splice(order.indexOf(target), 0, dragId);
        savePanelOrder(order);
      });
    });
  }

  // ---- storage location & uninstall-proof shared mirror ----
  let mirrorTimer = 0;
  async function mirrorNow() {
    if (!Platform.isNative) return false;
    try {
      const r = await Platform.storageWriteMirror(JSON.stringify(Store.exportData()));
      return !!(r && r.ts);
    } catch (e) { console.warn('mirror write failed', e); return false; }
  }
  function scheduleMirror() {
    if (!Platform.isNative || mirrorTimer) return;
    mirrorTimer = setTimeout(() => { mirrorTimer = 0; mirrorNow(); }, 60000);
  }
  async function restoreFromMirror() {
    const r = await Platform.storageReadMirror().catch(() => null);
    if (!r || !r.found) { alert('共享目录中没有找到学习数据备份。'); return; }
    let payload;
    try { payload = JSON.parse(r.json); } catch (e) { alert('备份文件损坏，无法恢复。'); return; }
    const when = r.ts ? new Date(r.ts).toLocaleString() : '未知时间';
    if (!confirm('找到共享备份（' + (r.path || '共享目录') + '，更新于 ' + when + '）。\n恢复将覆盖当前学习进度，确定继续？')) return;
    try { Store.importData(payload, 'replace'); location.reload(); }
    catch (e) { alert('恢复失败：' + e.message); }
  }
  async function renderStorageUi() {
    let info = null;
    try { info = await Platform.storageInfo(); } catch (e) { return; }
    if (!info) return;
    const path = $('storage-path'), note = $('storage-note'), sec = $('storage-security');
    const mirrorRow = $('storage-mirror-row');
    if (info.platform === 'electron') {
      path.textContent = info.settingsFile;
      note.textContent = info.custom
        ? '自定义数据目录。卸载应用不会删除该目录；重装后重新选择该目录即可找回数据。'
        : '默认数据目录（路径固定）。可改到任意目录长期保存；卸载应用通常不会删除它。';
      sec.textContent = info.encrypted
        ? 'API Key 以 AES-256 加密落盘，解密密钥只留在本机私有目录；数据文件即使被拷走或同步到别处也无法读出 Key。'
        : '当前系统不支持静态加密；API Key 仅存本机数据文件，请勿把数据目录放在公共共享盘。';
      $('storage-change').hidden = false;
      $('storage-reset').hidden = !info.custom;
      $('storage-open').hidden = false;
      mirrorRow.hidden = true;
    } else if (info.platform === 'browser') {
      path.textContent = 'localStorage · ' + info.key;
      note.textContent = '浏览器本地存储；清除站点数据会丢失，请定期导出备份。';
      sec.textContent = 'API Key 仅存本机 localStorage，不上传。';
      $('storage-change').hidden = true;
      $('storage-reset').hidden = true;
      $('storage-open').hidden = true;
      mirrorRow.hidden = true;
    } else {
      path.textContent = info.hasCustom ? ('自定义目录 · ' + info.custom) : ('共享目录 · ' + info.defaultPath);
      const ts = info.hasCustom ? info.customTs : info.defaultTs;
      note.textContent = '主存储为应用私有 localStorage；共享目录中的备份卸载后仍保留，重装后可恢复。'
        + (ts ? ' 最近备份：' + new Date(ts).toLocaleString() + '。' : ' 尚未备份。');
      sec.textContent = '共享备份不含 API Key（Key 只留在应用私有存储）；重装后需重新填写 Key。';
      $('storage-change').hidden = false;
      $('storage-reset').hidden = !info.hasCustom;
      $('storage-open').hidden = true;
      mirrorRow.hidden = false;
    }
  }

  function showSettingsPane(key) {
    const meta = SETTINGS_PANES[key];
    if (!meta) return;
    document.querySelectorAll('.settings-pane').forEach(p => { p.hidden = p.id !== 'pane-' + key; });
    $('settings-title').textContent = meta[0];
    $('settings-sub').textContent = meta[1];
    setCrumbs('crumbs-settings', [crumbMine(), { label: '设置 · ' + meta[0] }]);
    const body = document.querySelector('#settings-sheet .sheet-body');
    if (body) body.scrollTop = 0;
  }
  function openSettings(pane) {
    pane = SETTINGS_PANES[pane] ? pane : 'learn';
    $('set-new').value = Store.data.plan.newPerDay;
    $('set-review').value = Store.data.plan.reviewCap;
    $('set-rate').value = Number(Store.data.ttsRate ?? 1);
    $('set-rate-val').textContent = Number(Store.data.ttsRate ?? 1).toFixed(1);
    $('set-lang').value = Store.data.ttsLang || '';
    $('set-autospeak').checked = !!Store.data.autoSpeak;
    $('set-prefer-audio').checked = Store.data.preferAudio !== false;
    $('set-progress-bars').checked = Store.data.progressBars !== false;
    const panel = Store.data.studyPanel || {};
    document.querySelectorAll('[data-panel]').forEach(cb => { cb.checked = panel[cb.dataset.panel] !== false; });
    renderPanelOrderUi();
    applyTheme(Store.data.theme);
    syncBackgroundUi();
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
    $('set-dict-merge').checked = Store.data.dict.merge !== false;
    renderDictSources();
    const meta = Library.getMeta();
    $('about-info').textContent = 'Glance · 词根背单词 · ' + (meta.counts ? meta.counts.words : 0) + ' 词 / ' + (meta.counts ? meta.counts.roots : 0) + ' 词根';
    if (pane === 'data') renderStorageUi();
    showSettingsPane(pane);
    openSheet('settings-sheet');
  }
  function syncAiProviderUi() {
    const p = AI.getProvider($('set-ai-provider').value);
    $('set-ai-base-wrap').hidden = !p.custom;
    const modelInput = $('set-ai-model');
    const modelSelect = $('set-ai-model-select');
    const hint = $('set-ai-model-hint');
    if (p.models && p.models.length) {
      modelSelect.innerHTML = '';
      p.models.forEach(m => { const o = el('option', null, m); o.value = m; modelSelect.appendChild(o); });
      const cur = (Store.data.ai.model || '').trim();
      modelSelect.value = p.models.indexOf(cur) >= 0 ? cur : p.model;
      modelSelect.hidden = false;
      modelInput.hidden = true;
      hint.textContent = p.models.length + ' 个模型可选，默认 ' + p.model;
    } else {
      modelSelect.hidden = true;
      modelInput.hidden = false;
      modelInput.placeholder = p.model || '模型名称';
      hint.textContent = p.model ? '留空使用默认：' + p.model : '请填写模型名称';
    }
    $('set-ai-key').placeholder = '仅保存在本机';
    const testOut = $('set-ai-test-result');
    if (testOut) { testOut.textContent = ''; testOut.className = 'ai-test-result'; }
  }
  const DICT_PROVIDER_BLURB = {
    freezh: '中文释义、双音标、双语例句与考试标签',
    uapis: '中英双释义、英美发音、词形/词组/近义与双语例句',
    free: '英文词典，含音标、词性、多义项与例句',
    mw: '韦氏大学词典，需自行申请 API Key'
  };
  const DICT_MARKS = { freezh: '中', uapis: 'U', free: 'EN', mw: 'MW' };
  const DICT_FORMAT_NAME = { auto: '自动识别', youdao: '有道格式', uapis: 'UAPI 格式', free: 'dictionaryapi.dev 格式', mw: '韦氏格式' };
  function dictProviderBadge(p) {
    if (p.custom) return { text: '自定义', accent: false };
    if (p.id === 'freezh') return { text: '推荐', accent: true };
    return { text: p.needKey ? '需 Key' : '免 Key', accent: false };
  }
  function dictSourceHint(p) {
    if (!p.custom) return DICT_PROVIDER_BLURB[p.id] || p.hint || '';
    return (DICT_FORMAT_NAME[p.format] || '自动识别') + ' · ' + p.base;
  }
  function dictMark(p) { return DICT_MARKS[p.id] || (p.name || '?').trim().charAt(0).toUpperCase(); }

  function renderDictSources() {
    const cfg = Store.data.dict;
    const enabled = cfg.enabled || [];
    const all = Dictionary.allProviders(cfg);
    const ordered = enabled.map(id => all.find(p => p.id === id)).filter(Boolean)
      .concat(all.filter(p => !enabled.includes(p.id)));
    const list = $('dict-source-list');
    list.innerHTML = '';
    ordered.forEach(p => {
      const on = enabled.includes(p.id);
      const row = el('div', 'dict-source' + (on ? ' on' : ''));
      const head = el('div', 'dict-source-head');
      head.appendChild(el('span', 'provider-mark', dictMark(p)));
      const main = el('div', 'provider-main');
      const nameRow = el('div', 'provider-name-row');
      nameRow.appendChild(el('span', 'provider-name', p.name));
      const badge = dictProviderBadge(p);
      nameRow.appendChild(el('span', 'provider-badge' + (badge.accent ? ' accent' : ''), badge.text));
      if (on) nameRow.appendChild(el('span', 'provider-badge accent', '优先级 ' + (enabled.indexOf(p.id) + 1)));
      if (p.needKey && !Dictionary.keyFor(p, cfg)) nameRow.appendChild(el('span', 'provider-badge warn', '未填 Key'));
      main.appendChild(nameRow);
      main.appendChild(el('span', 'provider-hint', dictSourceHint(p)));
      head.appendChild(main);
      const sw = el('label', 'switch');
      const cb = el('input');
      cb.type = 'checkbox'; cb.checked = on;
      cb.setAttribute('aria-label', '启用 ' + p.name);
      cb.addEventListener('change', () => {
        Platform.haptic('tap');
        Store.setDictEnabled(p.id, cb.checked);
        renderDictSources();
      });
      sw.appendChild(cb); sw.appendChild(el('span', 'slider'));
      head.appendChild(sw);
      row.appendChild(head);

      if (on || p.custom || p.needKey) {
        const ops = el('div', 'dict-source-ops');
        const up = el('button', 'op', '↑');
        up.type = 'button'; up.title = '上移（提高优先级）'; up.setAttribute('aria-label', p.name + ' 上移');
        up.disabled = !on || enabled.indexOf(p.id) === 0;
        up.addEventListener('click', () => { Store.moveDictSource(p.id, -1); renderDictSources(); });
        const down = el('button', 'op', '↓');
        down.type = 'button'; down.title = '下移（降低优先级）'; down.setAttribute('aria-label', p.name + ' 下移');
        down.disabled = !on || enabled.indexOf(p.id) === enabled.length - 1;
        down.addEventListener('click', () => { Store.moveDictSource(p.id, 1); renderDictSources(); });
        ops.append(up, down);
        if (p.custom || p.needKey) {
          const edit = el('button', 'link-btn', p.custom ? '编辑' : '填写 Key');
          edit.type = 'button';
          edit.addEventListener('click', () => openDictEdit(p.id));
          ops.appendChild(edit);
        }
        if (p.custom) {
          const del = el('button', 'link-btn danger', '删除');
          del.type = 'button';
          del.addEventListener('click', () => {
            if (!confirm('删除词典「' + p.name + '」？已缓存的释义会保留。')) return;
            Store.removeDictSource(p.id);
            renderDictSources();
          });
          ops.appendChild(del);
        }
        row.appendChild(ops);
      }
      list.appendChild(row);
    });
    const names = enabled.map(id => (all.find(p => p.id === id) || {}).name).filter(Boolean);
    const missing = ordered.filter(p => enabled.includes(p.id) && Dictionary.configError(p, cfg)).length;
    $('set-dict-summary').textContent = names.length
      ? '已开启 ' + names.length + ' 个：' + names.join(' → ') + (missing ? '（其中 ' + missing + ' 个配置不完整，将被跳过）' : '')
      : '尚未开启任何词典，查词会提示先开启。';
    $('dict-cache-count').textContent = Store.dictWords().length + ' 个词的释义存于本机，离线可看';
  }

  let dictEditing = null;
  function syncDictEditAuth() { $('dict-edit-header-wrap').hidden = $('dict-edit-auth').value !== 'header'; }
  function openDictEdit(id) {
    dictEditing = id || null;
    setCrumbs('crumbs-dict-edit', [{ label: '设置', fn: () => closeNestedSheet() }, { label: id ? '编辑词典源' : '添加词典源' }]);
    const cfg = Store.data.dict;
    const p = id ? Dictionary.getProvider(id, cfg) : null;
    const isCustom = !p || p.custom;
    $('dict-edit-title').textContent = !p ? '添加词典' : (isCustom ? '编辑词典' : p.name);
    $('dict-edit-sub').textContent = !p ? '接入任意返回 JSON 的词典 API' : (isCustom ? '修改端点、格式与鉴权' : '填写该词典的 API Key');
    $('dict-edit-name-wrap').hidden = !isCustom;
    $('dict-edit-base-wrap').hidden = !isCustom;
    $('dict-edit-format-wrap').hidden = !isCustom;
    $('dict-edit-auth-wrap').hidden = !isCustom;
    $('dict-edit-name').value = isCustom && p ? p.name : '';
    $('dict-edit-base').value = isCustom && p ? p.base : '';
    $('dict-edit-format').value = isCustom && p ? p.format : 'auto';
    $('dict-edit-auth').value = isCustom && p ? p.auth : 'bearer';
    $('dict-edit-header').value = isCustom && p ? p.headerName : '';
    $('dict-edit-key').value = p ? Dictionary.keyFor(p, cfg) : '';
    $('dict-edit-save').textContent = p ? '保存修改' : '添加并启用';
    $('dict-edit-hint').textContent = isCustom
      ? 'URL 里的 {word} 会被替换为查询词；不写占位符时自动追加 ?word=。桌面与安卓端由主进程发请求，不受浏览器跨域限制。'
      : (p.hint || '');
    syncDictEditAuth();
    const out = $('dict-edit-test-result');
    out.textContent = ''; out.className = 'ai-test-result';
    openNestedSheet('dict-edit-sheet');
  }
  function dictEditDraft() {
    const cfg = Store.data.dict;
    const custom = !$('dict-edit-base-wrap').hidden;
    const p = custom
      ? {
        id: dictEditing || 'draft', custom: true, needKey: false,
        name: $('dict-edit-name').value.trim() || '自定义词典',
        base: $('dict-edit-base').value.trim(),
        format: $('dict-edit-format').value,
        auth: $('dict-edit-auth').value,
        headerName: $('dict-edit-header').value.trim()
      }
      : Dictionary.getProvider(dictEditing, cfg);
    const keys = Object.assign({}, cfg.keys);
    keys[p.id] = $('dict-edit-key').value.trim();
    return { p, custom, cfg: Object.assign({}, cfg, { keys }) };
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
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { Platform.haptic('tap'); switchView(t.dataset.view); }));
    const AppPlugin = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (Platform.isNative && AppPlugin && AppPlugin.addListener) {
      AppPlugin.addListener('backButton', () => { if (!handleBack()) AppPlugin.exitApp(); });
    }
    $('sheet-backdrop').addEventListener('click', () => closeSheet());
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => {
      if (nestedSheetEl && b.closest('.sheet') === nestedSheetEl) closeNestedSheet();
      else closeSheet();
    }));

    document.querySelectorAll('[data-settings-pane]').forEach(b => b.addEventListener('click', () => openSettings(b.dataset.settingsPane)));
    document.querySelectorAll('[data-theme-choice]').forEach(b => b.addEventListener('click', () => setTheme(b.dataset.themeChoice)));
    $('bg-choose').addEventListener('click', () => $('bg-file').click());
    $('bg-file').addEventListener('change', () => {
      const f = $('bg-file').files && $('bg-file').files[0];
      chooseBackground(f);
      $('bg-file').value = '';
    });
    $('bg-remove').addEventListener('click', () => {
      Store.setBackground({ image: '' });
      applyBackground();
      syncBackgroundUi();
    });
    $('bg-veil').addEventListener('input', () => {
      const v = Number($('bg-veil').value);
      $('bg-veil-val').textContent = v + '%';
      document.documentElement.style.setProperty('--bg-veil', String(v / 100));
    });
    $('bg-veil').addEventListener('change', () => Store.setBackground({ veil: Number($('bg-veil').value) }));
    $('bg-blur').addEventListener('input', () => {
      const v = Number($('bg-blur').value);
      $('bg-blur-val').textContent = v + 'px';
      document.documentElement.style.setProperty('--bg-blur', v + 'px');
    });
    $('bg-blur').addEventListener('change', () => Store.setBackground({ blur: Number($('bg-blur').value) }));
    $('me-avatar-btn').addEventListener('click', openProfileSheet);
    $('me-profile-btn').addEventListener('click', openProfileSheet);
    $('profile-avatar-btn').addEventListener('click', () => $('profile-file').click());
    $('profile-file').addEventListener('change', () => {
      const f = $('profile-file').files && $('profile-file').files[0];
      chooseAvatar(f);
      $('profile-file').value = '';
    });
    $('profile-remove').addEventListener('click', () => {
      if (profileDraft) profileDraft.avatar = '';
      syncProfileSheet();
    });
    $('profile-nickname').addEventListener('input', () => {
      const v = $('profile-nickname').value;
      if (profileDraft) profileDraft.nickname = v;
      $('profile-preview-name').textContent = v.trim() || '我的';
    });
    $('profile-nickname').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); saveProfile(); }
    });
    $('profile-save').addEventListener('click', saveProfile);
    wirePanelOrder();

    $('me-stats-link').addEventListener('click', () => openSub('stats'));
    $('me-books-link').addEventListener('click', () => openSub('books'));
    $('me-ai-link').addEventListener('click', () => openSub('ai'));
    $('stats-back').addEventListener('click', backFromSub);
    $('exams-back').addEventListener('click', examBack);
    $('exams-entry').addEventListener('click', () => openSub('exams'));
    ['exams-list-pane', 'exams-detail-pane', 'exams-session-pane', 'exams-result-pane'].forEach(id => $(id).addEventListener('click', examClick));

    $('mode-study').addEventListener('click', () => { Platform.haptic('tap'); setMode('study'); });
    $('mode-quiz').addEventListener('click', () => { Platform.haptic('tap'); setMode('quiz'); });
    $('mode-ai').addEventListener('click', () => { Platform.haptic('tap'); openAiSpace(); });
    $('ai-settings-btn').addEventListener('click', () => openSettings('dict'));
    $('ai-space-body').addEventListener('click', aiSpaceClick);
    $('ai-space-body').addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id === 'ai-ask-input') { e.preventDefault(); aiAsk(); }
    });
    $('speak-button').addEventListener('click', () => { const it = currentItem(); if (it) speak(it.entry.word, it.entry.audio); });
    $('grade-forgot').addEventListener('click', () => grade(SRS.GRADE.FORGOT));
    $('grade-fuzzy').addEventListener('click', () => grade(SRS.GRADE.FUZZY));
    $('grade-know').addEventListener('click', () => grade(SRS.GRADE.KNOW));
    $('continue-button').addEventListener('click', continueStudy);
    $('quiz-speak').addEventListener('click', () => {
      const s = quizSession;
      const q = s && s.questions[s.idx];
      if (q) speak(q.entry.word, q.entry.audio);
    });
    $('quiz-listen').addEventListener('click', () => {
      const s = quizSession;
      const q = s && s.questions[s.idx];
      if (q) speak(q.entry.word, q.entry.audio);
    });
    $('quiz-next').addEventListener('click', nextQuiz);
    $('quiz-quit').addEventListener('click', quitQuiz);
    $('quiz-start-btn').addEventListener('click', startQuiz);
    $('quiz-again').addEventListener('click', () => { quizSession = null; quizScreen = 'start'; startQuiz(); });
    $('quiz-adjust').addEventListener('click', () => {
      quizSession = null; quizScreen = 'start'; renderQuizScreen();
      renderQuizSettings(); openSheet('quiz-settings-sheet');
    });
    $('quiz-settings-btn').addEventListener('click', () => { renderQuizSettings(); openSheet('quiz-settings-sheet'); });
    $('quiz-last').addEventListener('click', () => { const w = $('quiz-last').dataset.word; if (w) openWordSheet(w); });
    $('quiz-theme').addEventListener('change', () => quizUpdate({ theme: $('quiz-theme').value }));
    $('quiz-online').addEventListener('change', () => quizUpdate({ online: $('quiz-online').checked }));
    $('set-open-quiz').addEventListener('click', () => {
      switchView('study');
      if (quizSession && quizSession.done) quizSession = null;
      setMode('quiz');
      renderQuizSettings();
      openSheet('quiz-settings-sheet');
    });

    $('roots-tab-roots').addEventListener('click', () => { rootsTab = 'roots'; $('roots-tab-roots').classList.add('active'); $('roots-tab-affixes').classList.remove('active'); $('roots-list').hidden = false; $('affix-panel').hidden = true; $('roots-cats').hidden = false; $('roots-opts').hidden = false; $('roots-search').placeholder = '搜索词根 / 释义'; renderRoots(); });
    $('roots-tab-affixes').addEventListener('click', () => { rootsTab = 'affixes'; $('roots-tab-affixes').classList.add('active'); $('roots-tab-roots').classList.remove('active'); $('roots-list').hidden = true; $('affix-panel').hidden = false; $('roots-cats').hidden = false; $('roots-opts').hidden = true; $('roots-rail').hidden = true; $('roots-search').placeholder = '搜索词缀 / 释义'; renderAffixes(); });
    $('roots-search').addEventListener('input', () => rootsTab === 'roots' ? renderRoots() : renderAffixes());
    $('roots-opts').addEventListener('click', ev => {
      const b = ev.target.closest('[data-roots-opt]'); if (!b) return;
      const rv = Store.data.rootsView;
      const act = b.dataset.rootsOpt;
      if (act === 'sort-size') rv.sort = 'size';
      else if (act === 'sort-alpha') rv.sort = 'alpha';
      else if (act === 'small') rv.hideSmall = !rv.hideSmall;
      Store.save();
      renderRoots();
    });
    $('roots-cats').addEventListener('click', ev => {
      const b = ev.target.closest('.chip'); if (!b) return;
      if (rootsTab === 'roots') { rootsFilter = b.dataset.cat; renderRoots(); }
      else { affixCat = b.dataset.cat; renderAffixes(); }
    });
    $('roots-rail').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      const sel = '#roots-list .letter-head[data-letter="' + b.dataset.letter + '"]';
      let h = document.querySelector(sel), guard = 0;
      while (!h && rootsBatch.gi < rootsBatch.groups.length && guard++ < 200) { loadRootsBatch(); h = document.querySelector(sel); }
      // sticky heads make scrollIntoView land short; scroll the group box instead.
      if (h) {
        const l = $('roots-list');
        const g = h.closest('.letter-group') || h;
        const want = l.scrollTop + g.getBoundingClientRect().top - l.getBoundingClientRect().top;
        let ahead = 0;
        while (l.scrollHeight < want + l.clientHeight && rootsBatch.gi < rootsBatch.groups.length && ahead++ < 200) loadRootsBatch();
        l.scrollTop = want;
      }
    });
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
      const entries = themeShown.map(w => Library.lookup(w)).filter(Boolean);
      closeSheet();
      if (entries.length) studyWords(entries);
    });
    $('theme-collect-btn').addEventListener('click', () => {
      if (!sheetTheme || !themeShown.length) return;
      const meta = Themes.get(sheetTheme);
      openGroupPicker({ words: themeShown.slice(), label: meta ? meta.name : '' });
    });
    $('theme-manage-btn').addEventListener('click', () => { themeManage = !themeManage; renderThemeSheet(); });
    $('theme-rename-btn').addEventListener('click', () => {
      const t = Store.customThemes().find(x => x.id === sheetTheme);
      if (!t) return;
      const name = prompt('重命名分组（20 字以内）', t.name);
      if (name === null) return;
      if (!Store.renameCustomTheme(t.id, name)) { alert('名称为空或已有同名分组'); return; }
      refreshCustomThemes();
    });
    $('theme-delete-btn').addEventListener('click', () => {
      const t = Store.customThemes().find(x => x.id === sheetTheme);
      if (!t) return;
      if (!confirm('删除分组「' + t.name + '」？组内 ' + t.words.length + ' 词的学习进度不受影响。')) return;
      Store.removeCustomTheme(t.id);
      closeSheet();
      sheetTheme = '';
      refreshCustomThemes();
    });
    $('word-group-btn').addEventListener('click', () => { if (sheetWord) openGroupPicker({ word: sheetWord }); });
    $('group-picker-close').addEventListener('click', closeNestedSheet);
    $('group-picker-create').addEventListener('click', () => {
      createCustomThemeFlow(t => {
        if (!pickerPayload) return;
        if (Array.isArray(pickerPayload.words)) Store.addWordsToCustomTheme(t.id, pickerPayload.words);
        else Store.addWordsToCustomTheme(t.id, pickerPayload.word);
        refreshCustomThemes();
      });
    });

    $('cloze-study-btn').addEventListener('click', () => {
      const s = Library.clozeSet(clozeSetId);
      if (!s) return;
      const entries = s.options.map(([, w]) => Library.lookup(w)).filter(Boolean);
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
    const onBookFilter = () => {
      const prev = Store.data.bookFilter || {};
      Store.data.bookFilter = {
        skipLower: $('book-skip-lower').checked,
        skipKnown: $('book-skip-known').checked,
        skipBasic: $('book-skip-basic').checked,
        excludeBooks: prev.excludeBooks || []
      };
      Store.save();
      buildSession();
      renderBooks();
      updatePlanBar();
      if (mode === 'study') renderStudy();
      Platform.haptic('tap');
    };
    $('book-skip-lower').addEventListener('change', onBookFilter);
    $('book-skip-known').addEventListener('change', onBookFilter);
    $('book-skip-basic').addEventListener('change', onBookFilter);
    $('import-book').addEventListener('click', importBook);
    $('cmp-source').addEventListener('change', renderCompare);
    $('cmp-level').addEventListener('change', renderCompare);
    $('cmp-toggle').addEventListener('click', () => {
      const w = $('cmp-wrap');
      w.hidden = !w.hidden;
      $('cmp-toggle').textContent = w.hidden ? '展开' : '收起';
    });

    $('set-new').addEventListener('change', applyPlan);
    $('set-review').addEventListener('change', applyPlan);
    $('set-rate').addEventListener('input', () => { Store.data.ttsRate = Number($('set-rate').value); $('set-rate-val').textContent = Number($('set-rate').value).toFixed(1); Store.save(); });
    $('set-lang').addEventListener('change', () => { Store.data.ttsLang = $('set-lang').value; Store.save(); });
    $('set-autospeak').addEventListener('change', () => { Store.data.autoSpeak = $('set-autospeak').checked; Store.save(); });
    $('set-prefer-audio').addEventListener('change', () => { Store.data.preferAudio = $('set-prefer-audio').checked; Store.save(); });
    $('set-progress-bars').addEventListener('change', () => {
      Store.data.progressBars = $('set-progress-bars').checked;
      Store.save();
      if (currentView === 'roots') { if (rootsTab === 'roots') renderRoots(); else renderAffixes(); }
    });
    document.querySelectorAll('[data-panel]').forEach(cb => cb.addEventListener('change', () => {
      Store.data.studyPanel[cb.dataset.panel] = cb.checked;
      Store.save();
      refreshPanelViews();
    }));
    $('books-back').addEventListener('click', backFromSub);
    $('set-ai-enabled').addEventListener('change', () => Store.setAiConfig({ enabled: $('set-ai-enabled').checked }));
    $('set-ai-provider').addEventListener('change', () => {
      Store.setAiConfig({ provider: $('set-ai-provider').value });
      syncAiProviderUi();
      const p = AI.getProvider($('set-ai-provider').value);
      if (p.models && p.models.length) Store.setAiConfig({ model: $('set-ai-model-select').value });
    });
    $('set-ai-model-select').addEventListener('change', () => Store.setAiConfig({ model: $('set-ai-model-select').value }));
    $('set-ai-model').addEventListener('change', () => Store.setAiConfig({ model: $('set-ai-model').value.trim() }));
    $('set-ai-base').addEventListener('change', () => Store.setAiConfig({ base: $('set-ai-base').value.trim() }));
    $('set-ai-key').addEventListener('change', () => Store.setAiConfig({ key: $('set-ai-key').value.trim() }));
    $('set-ai-test').addEventListener('click', async () => {
      const btn = $('set-ai-test'); const out = $('set-ai-test-result');
      const rc = AI.resolveConfig(Store.data.ai);
      out.className = 'ai-test-result';
      if (!rc.base || !rc.model) { out.textContent = '请先填写 API 地址与模型名称'; out.className = 'ai-test-result bad'; return; }
      if (!rc.key) { out.textContent = '请先填写 API Key'; out.className = 'ai-test-result bad'; return; }
      btn.disabled = true; out.textContent = '测试中…（端点较慢时可能需数十秒）';
      const t0 = Date.now();
      const res = await Platform.llmChat({ base: rc.base, key: rc.key, model: rc.model, messages: [{ role: 'user', content: 'ping' }], temperature: 0, jsonMode: false, anthropic: rc.anthropic });
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      btn.disabled = false;
      if (res.ok) { out.textContent = '✓ 连通正常 · ' + rc.model + ' · ' + secs + 's'; out.className = 'ai-test-result ok'; }
      else { out.textContent = '✗ ' + res.error; out.className = 'ai-test-result bad'; }
    });
    $('set-ai-library').addEventListener('click', () => { closeSheet(); openSub('ai'); });
    $('set-dict-merge').addEventListener('change', () => {
      Store.setDictConfig({ merge: $('set-dict-merge').checked });
      renderDictSources();
    });
    $('dict-add').addEventListener('click', () => openDictEdit(null));
    $('dict-enable-all').addEventListener('click', () => {
      Store.setDictConfig({ enabled: Dictionary.allProviders(Store.data.dict).map(p => p.id) });
      renderDictSources();
    });
    $('dict-disable-all').addEventListener('click', () => { Store.setDictConfig({ enabled: [] }); renderDictSources(); });
    $('dict-cache-clear').addEventListener('click', () => {
      const words = Store.dictWords();
      if (!words.length) return;
      if (!confirm('清空 ' + words.length + ' 个词的词典缓存？下次查词会重新联网获取。')) return;
      words.forEach(w => Store.deleteDictEntry(w));
      renderDictSources();
    });
    $('sheet-backdrop-nested').addEventListener('click', closeNestedSheet);
    $('dict-edit-close').addEventListener('click', closeNestedSheet);
    $('dict-edit-cancel').addEventListener('click', closeNestedSheet);
    $('dict-edit-auth').addEventListener('change', syncDictEditAuth);
    $('dict-edit-test').addEventListener('click', async () => {
      const btn = $('dict-edit-test'), out = $('dict-edit-test-result');
      const { p, cfg } = dictEditDraft();
      out.className = 'ai-test-result';
      const err = Dictionary.configError(p, cfg);
      if (err) { out.textContent = '✗ ' + err; out.className = 'ai-test-result bad'; return; }
      btn.disabled = true; out.textContent = '测试中…';
      const res = await Dictionary.testProvider(p, cfg, $('dict-edit-test-word').value.trim() || 'hello');
      btn.disabled = false;
      if (res.ok) {
        const first = res.sample ? (res.sample.zh || res.sample.en || '') : '';
        out.textContent = '✓ 连通正常 · ' + res.count + ' 条释义 · ' + (res.ms / 1000).toFixed(1) + 's' +
          (res.ipa ? ' · /' + res.ipa + '/' : '') + (first ? ' · ' + first.slice(0, 40) : '');
        out.className = 'ai-test-result ok';
      } else {
        out.textContent = '✗ ' + res.error;
        out.className = 'ai-test-result bad';
      }
    });
    $('dict-edit-save').addEventListener('click', () => {
      const { p, custom, cfg } = dictEditDraft();
      const out = $('dict-edit-test-result');
      const key = $('dict-edit-key').value.trim();
      if (custom) {
        const err = Dictionary.configError(p, cfg);
        if (err) { out.textContent = '✗ ' + err; out.className = 'ai-test-result bad'; return; }
        const entry = { name: p.name, base: p.base, format: p.format, auth: p.auth, headerName: p.headerName, key };
        if (dictEditing) Store.updateDictSource(dictEditing, entry);
        else Store.addDictSource(entry);
      } else {
        Store.setDictKey(dictEditing, key);
      }
      Platform.haptic('tap');
      closeNestedSheet();
      renderDictSources();
    });
    $('ai-back').addEventListener('click', backFromSub);
    $('ai-export').addEventListener('click', async () => {
      const btn = $('ai-export'); btn.disabled = true;
      const r = await AI.exportCache();
      btn.disabled = false;
      if (!r.ok && r.error) { btn.textContent = r.error; setTimeout(() => { btn.textContent = '导出全部'; }, 2200); }
    });
    $('set-test-speak').addEventListener('click', () => speak('hello'));
    $('set-panel-reset').addEventListener('click', () => savePanelOrder(Store.defaultPanelOrder()));
    $('reset-progress').addEventListener('click', () => {
      if (!confirm('确定重置所有学习进度？此操作不可撤销。')) return;
      Store.data.srs = {}; Store.data.logs = {}; Store.data.errors = {}; Store.data.views = {};
      Store.save(); buildSession(); updatePlanBar(); renderStudy(); renderStats(); renderBooks();
      closeSheet();
    });
    $('export-data').addEventListener('click', async () => {
      const payload = Store.exportData();
      const name = 'glance-learning-' + Store.today() + '.json';
      const ok = await Platform.saveTextFile(name, JSON.stringify(payload, null, 2));
      if (!ok) alert('导出失败，请重试。');
    });
    $('import-data').addEventListener('click', async () => {
      const file = await Platform.pickLibrary();
      if (!file) return;
      let payload;
      try { payload = JSON.parse(file.text); } catch (e) { alert('文件不是有效的 JSON'); return; }
      const merge = confirm('合并导入：保留现有进度并叠加文件内容。\n\n点击「取消」可选择覆盖恢复。');
      let mode = 'merge';
      if (!merge) {
        if (!confirm('覆盖恢复会清空当前学习进度并用文件内容替换，确定继续？')) return;
        mode = 'replace';
      }
      try {
        const r = Store.importData(payload, mode);
        Store.flush();
        alert('导入完成（' + (mode === 'replace' ? '覆盖' : '合并') + '）：' + r.words + ' 个学习词、' + r.views + ' 条接触记录、' + r.favorites + ' 个生词。');
        location.reload();
      } catch (e) { alert('导入失败：' + e.message); }
    });
    $('storage-change').addEventListener('click', async () => {
      if (Platform.isElectron) {
        const r = await Platform.storageSetDir();
        if (r && r.error) alert(r.error);
      } else {
        const r = await Platform.storagePickFolder();
        if (!r || r.canceled) return;
        await mirrorNow();
      }
      renderStorageUi();
    });
    $('storage-reset').addEventListener('click', async () => {
      if (!confirm('恢复默认存储位置？当前数据会迁回默认目录。')) return;
      const r = await Platform.storageResetDir();
      if (r && r.error) alert(r.error);
      renderStorageUi();
    });
    $('storage-open').addEventListener('click', () => Platform.storageOpenDir());
    $('storage-mirror-now').addEventListener('click', async () => {
      const ok = await mirrorNow();
      alert(ok ? '已备份到共享目录，卸载应用后数据仍保留。' : '备份失败，请检查存储权限或目录可用性。');
      renderStorageUi();
    });
    $('storage-restore').addEventListener('click', restoreFromMirror);

    document.addEventListener('keydown', ev => {
      if (ev.key === 'Escape') { if (nestedSheetEl) closeNestedSheet(); else closeSheet(); return; }
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
      } else if (quizScreen === 'start') {
        if (ev.key === 'Enter') startQuiz();
      } else if (quizScreen === 'done') {
        if (ev.key === 'Enter') { quizSession = null; quizScreen = 'start'; startQuiz(); }
      } else {
        if (ev.key === 'Enter' && !$('quiz-next').hidden) nextQuiz();
        else if (['1', '2', '3', '4'].includes(ev.key)) {
          const b = $('quiz-options').children[Number(ev.key) - 1];
          if (b && !quizSession.answered) b.click();
        } else if (ev.key === 's' || ev.key === 'S') {
          const q = quizSession && quizSession.questions[quizSession.idx];
          if (q) speak(q.entry.word, q.entry.audio);
        }
      }
    });

    window.addEventListener('resize', () => { placeTabIndicator(); document.querySelectorAll('.morph-line').forEach(fitMorphLine); });
    window.matchMedia('(min-width: 960px)').addEventListener('change', () => {
      if (openSheetEl || nestedSheetEl) setAppInert(true);
      placeTabIndicator();
    });
    if (window.ResizeObserver) new ResizeObserver(() => placeTabIndicator()).observe($('tabbar'));
    document.addEventListener('pointerdown', ev => {
      const t = ev.target.closest('.tab, .grade-btn');
      if (!t) return;
      const r = t.getBoundingClientRect();
      const sp = el('span', 'ripple');
      sp.style.left = (ev.clientX - r.left) + 'px';
      sp.style.top = (ev.clientY - r.top) + 'px';
      t.appendChild(sp);
      sp.addEventListener('animationend', () => sp.remove());
    });
    window.addEventListener('beforeunload', () => Store.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) Store.flush(); });
  }
  function applyPlanFromBooks() {
    const nw = Math.max(0, Math.min(200, parseInt($('plan-new-input').value, 10) || 0));
    const rv = Math.max(0, Math.min(500, parseInt($('plan-review-input').value, 10) || 0));
    Store.data.plan.newPerDay = nw; Store.data.plan.reviewCap = rv; Store.save();
    buildSession(); updatePlanBar();
  }

  // ===================== exam practice（真题刷题） =====================
  const EXAM_TYPE_NAME = { reading: '仔细阅读', matching: '信息匹配', writing: '短文写作', translation: '汉译英', cloze: '选词填空', listening: '听力理解' };
  const EXAM_WRITING_NO = 56, EXAM_TRANSLATION_NO = 57;
  let examPane = 'list';
  let examCur = null;
  let examType = '';
  let examSessions = [];
  let examSIdx = 0;
  let examQIdx = 0;
  let examPick = null;
  let examMarked = false;
  let examDraft = '';
  let examRunQuestions = [];
  let examRetryMode = false;
  let examRestoreKey = '';
  const examOpenYears = new Set();

  function examShowPane(name) {
    examPane = name;
    ['list', 'detail', 'session', 'result'].forEach(p => { $('exams-' + p + '-pane').hidden = p !== name; });
    $('exams-scroll').scrollTop = 0;
    $('exams-title').textContent = name === 'list' ? '真题刷题' : name === 'detail' && examCur ? examCur.year + '年' + examCur.month + '月 · 第' + examCur.set + '套' : name === 'session' ? (EXAM_TYPE_NAME[examType] || '刷题') : '练习结果';
    examCrumbs();
  }
  function examBack() {
    if (examPane === 'session' || examPane === 'result') { renderExamDetail(); examShowPane('detail'); }
    else if (examPane === 'detail') { examCur = null; examShowPane('list'); renderExamsList(); }
    else backFromSub();
  }
  function examNoOf(q) { return q.type === 'writing' ? EXAM_WRITING_NO : q.type === 'translation' ? EXAM_TRANSLATION_NO : q.no; }
  function examTypeQuestions(type) {
    const out = [];
    Exams.sessions(examCur, type).forEach(s => (s.questions || []).forEach(q => out.push(q)));
    if (type === 'writing') out.push({ no: EXAM_WRITING_NO, type: 'writing', stem: '', options: {} });
    if (type === 'translation') out.push({ no: EXAM_TRANSLATION_NO, type: 'translation', stem: '', options: {} });
    return out;
  }

  function renderExamsList() {
    const box = $('exams-list');
    box.innerHTML = '';
    const exams = Exams.list();
    if (!exams.length) { box.appendChild(el('p', 'field-hint', '真题数据未加载（app/data/exams/manifest.json）。')); return; }
    const years = [];
    exams.forEach(m => {
      let y = years[years.length - 1];
      if (!y || y.year !== m.year) { y = { year: m.year, items: [] }; years.push(y); }
      y.items.push(m);
    });
    years.forEach(y => {
      const group = el('div', 'exam-year-group');
      const head = el('button', 'exam-year-head'); head.type = 'button';
      head.appendChild(el('span', 'exam-year', y.year + ' 年'));
      let answered = 0, total = 0;
      y.items.forEach(m => {
        total += m.questionCount || 0;
        const p = Store.examProgress(m.examId);
        answered += p ? Object.keys(p.a).length : 0;
      });
      head.appendChild(el('span', 'exam-year-count', y.items.length + ' 套' + (answered ? ' · 已练 ' + answered + '/' + total + ' 题' : '')));
      head.appendChild(el('span', 'cmp-caret', '▾'));
      const body = el('div', 'exam-year-body');
      const grid = el('div', 'exam-grid');
      y.items.forEach(m => {
        const p = Store.examProgress(m.examId);
        const answeredN = p ? Object.keys(p.a).length : 0;
        const card = el('button', 'exam-card');
        card.type = 'button';
        card.dataset.exam = m.examId;
        const top = el('div', 'exam-card-top');
        top.appendChild(el('span', 'exam-card-title', m.month + '月 · 第' + m.set + '套'));
        if (m.hasAnswers) top.appendChild(el('span', 'exam-badge green', m.answersComplete ? '含答案' : '答案 ' + Math.round((m.answersCoverage || 0) * 100) + '%'));
        if (m.needsReview) top.appendChild(el('span', 'exam-badge amber', '残缺'));
        card.appendChild(top);
        const types = (m.types || []).filter(t => ['reading', 'matching', 'cloze'].includes(t)).map(t => EXAM_TYPE_NAME[t]);
        if (m.writing) types.push('写作');
        if (m.translation) types.push('翻译');
        card.appendChild(el('div', 'exam-card-sub', m.questionCount + ' 题 · ' + (types.join(' / ') || '写作 / 翻译')));
        const bar = el('div', 'exam-card-bar');
        const fill = el('span', 'exam-card-fill');
        fill.style.width = (m.questionCount ? Math.min(100, Math.round(answeredN / m.questionCount * 100)) : 0) + '%';
        bar.appendChild(fill);
        card.appendChild(bar);
        card.appendChild(el('div', 'exam-card-foot', answeredN ? '已练 ' + answeredN + ' / ' + m.questionCount + ' 题' : '未开始'));
        grid.appendChild(card);
      });
      body.appendChild(grid);
      const open = examOpenYears.has(y.year);
      body.hidden = !open;
      head.classList.toggle('open', open);
      head.setAttribute('aria-expanded', String(open));
      head.addEventListener('click', () => {
        body.hidden = !body.hidden;
        head.classList.toggle('open', !body.hidden);
        head.setAttribute('aria-expanded', String(!body.hidden));
        if (body.hidden) examOpenYears.delete(y.year); else examOpenYears.add(y.year);
      });
      group.appendChild(head); group.appendChild(body);
      box.appendChild(group);
    });
  }

  async function openExam(examId) {
    const m = Exams.meta(examId);
    if (m) examOpenYears.add(m.year);
    examShowPane('detail');
    $('exams-detail-pane').innerHTML = '<p class="field-hint">正在加载试卷…</p>';
    const ex = await Exams.load(examId);
    if (!ex) { $('exams-detail-pane').innerHTML = '<p class="field-hint">加载失败，请返回重试。</p>'; return; }
    examCur = ex;
    renderExamDetail();
  }

  function renderExamDetail() {
    examCrumbs();
    const ex = examCur;
    if (ex) $('exams-title').textContent = ex.year + '年' + ex.month + '月 · 第' + ex.set + '套';
    const pane = $('exams-detail-pane');
    pane.innerHTML = '';
    if (ex.quality && ex.quality.needsReview) {
      const banner = el('div', 'exam-banner');
      banner.textContent = '本套为抓取文本，OCR 不完整：缺 ' + (ex.quality.gaps || []).length + ' 题、' + (ex.quality.optionsIncomplete || []).length + ' 题缺选项。已如实保留，可练其中完整题目。';
      pane.appendChild(banner);
    }
    const avail = Exams.availableTypes(ex);
    avail.forEach(type => {
      const qs = examTypeQuestions(type);
      const st = Exams.typeStats(ex.examId, type, qs);
      const card = el('div', 'exam-type-card');
      const desc = type === 'reading' ? '一段材料 + 一组选择题，逐题推进' : type === 'matching' ? '段落 ↔ 陈述句匹配' : type === 'cloze' ? '一篇短文十个空，从 A–O 词库选词，每词限用一次' : type === 'writing' ? '真题作文题，写作后可 AI 批改或自评' : '真题汉译英，完成后 AI 批改或自评';
      card.innerHTML =
        '<div class="exam-type-head"><span class="exam-type-name">' + EXAM_TYPE_NAME[type] + '</span>' +
        '<span class="exam-type-stat">' + (st.answered ? '已练 ' + st.answered + '/' + st.total + (st.correct ? ' · 对 ' + st.correct : '') : st.total + ' 题') + (st.done ? ' · 已完成' : '') + '</span></div>' +
        '<p class="exam-type-desc">' + desc + '</p>';
      const btn = el('button', 'btn-primary exam-start', st.answered && !st.done ? '继续练习' : '开始练习');
      btn.type = 'button';
      btn.dataset.start = type;
      card.appendChild(btn);
      pane.appendChild(card);
    });
    const wrong = Exams.wrongQuestions(ex);
    if (wrong.length) {
      const card = el('div', 'exam-type-card');
      card.innerHTML = '<div class="exam-type-head"><span class="exam-type-name">错题重练</span><span class="exam-type-stat">' + wrong.length + ' 题</span></div><p class="exam-type-desc">只刷本套答错过的题</p>';
      const btn = el('button', 'btn-ghost exam-start', '重练错题');
      btn.type = 'button';
      btn.dataset.retry = '1';
      card.appendChild(btn);
      pane.appendChild(card);
    }
    [['listening', '暂无音频与听力原文，数据已入库，开刷待后续']].forEach(([type, note]) => {
      if (!(ex.sections || []).some(s => s.type === type)) return;
      const card = el('div', 'exam-type-card exam-type-disabled');
      card.innerHTML = '<div class="exam-type-head"><span class="exam-type-name">' + EXAM_TYPE_NAME[type] + '</span><span class="exam-type-stat">暂不开刷</span></div><p class="exam-type-desc">' + note + '</p>';
      pane.appendChild(card);
    });
    const refs = Library.studyReady() ? Library.studyForExam(ex.examId) : [];
    if (refs.length) {
      const card = el('div', 'exam-type-card');
      card.innerHTML = '<div class="exam-type-head"><span class="exam-type-name">参考资料 · 翻译与写作</span><span class="exam-type-stat">' + refs.length + ' 篇</span></div><p class="exam-type-desc">本套真题对应的学习材料：原文、参考译文/润色版、背诵清单与迁移练习</p>';
      const wrap = el('div', 'list-gap');
      refs.forEach(({ item, match }) => {
        const row = el('button', 'row compact'); row.type = 'button';
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', (item.kind === 'translation' ? '翻译 ' : '写作 ') + (item.topic || item.title)));
        main.appendChild(el('div', 'row-sub', item.id + ' · ' + (item.sections || []).length + ' 小节'));
        row.appendChild(main);
        row.appendChild(el('span', 'row-badge' + (match === 'text' ? ' green' : ' gray'), STUDY_MATCH_NAME[match] || '对齐'));
        row.dataset.study = item.id;
        wrap.appendChild(row);
      });
      card.appendChild(wrap);
      pane.appendChild(card);
    } else if (!Library.studyReady()) {
      Library.studyInit().then(() => { if (examCur === ex && examPane === 'detail') renderExamDetail(); });
    }
    const back = el('button', 'link-btn', '‹ 返回真题列表');
    back.type = 'button';
    back.dataset.backList = '1';
    pane.appendChild(back);
  }

  function startExamType(type) {
    examType = type;
    examRetryMode = false;
    examSessions = Exams.sessions(examCur, type);
    examSIdx = 0; examQIdx = 0;
    examRunQuestions = [];
    examSessions.forEach(s => (s.questions || []).forEach(q => examRunQuestions.push(q)));
    if (type === 'writing') examRunQuestions.push({ no: EXAM_WRITING_NO, type: 'writing', stem: '', options: {} });
    if (type === 'translation') examRunQuestions.push({ no: EXAM_TRANSLATION_NO, type: 'translation', stem: '', options: {} });
    examDraft = '';
    examRestoreKey = '';
    renderExamSession();
    examShowPane('session');
  }
  function startExamRetry() {
    const wrong = Exams.wrongQuestions(examCur);
    if (!wrong.length) return;
    examType = 'reading';
    examRetryMode = true;
    const byGroup = new Map();
    wrong.forEach(w => {
      const key = w.section.type + '|' + (w.group.range || '') + '|' + w.group.passage.slice(0, 40);
      if (!byGroup.has(key)) byGroup.set(key, { type: w.section.type, passage: w.group.passage || '', prompt: w.group.prompt || '', paragraphs: w.section.type === 'matching' ? Exams.paragraphsOf(w.group) : undefined, bank: w.section.type === 'cloze' ? w.group.bank : undefined, questions: [] });
      byGroup.get(key).questions.push(w.q);
    });
    examSessions = [...byGroup.values()].filter(s => s.type === 'reading' || s.type === 'matching' || s.type === 'cloze');
    const wt = wrong.filter(w => w.q.type === 'writing' || w.q.type === 'translation');
    wt.forEach(w => examSessions.push({ type: w.q.type, directions: (w.q.type === 'writing' ? examCur.writing : examCur.translation).directions || '', prompt: (examCur.writing || {}).prompt || '', passage: (examCur.translation || {}).passage || '' }));
    examSIdx = 0; examQIdx = 0;
    examRunQuestions = wrong.map(w => w.q);
    examDraft = '';
    examRestoreKey = '';
    renderExamSession();
    examShowPane('session');
  }

  function examCurSession() { return examSessions[examSIdx] || null; }
  function examCurQuestion() {
    const s = examCurSession();
    if (!s) return null;
    if (s.type === 'writing') return { no: EXAM_WRITING_NO, type: 'writing', stem: '', options: {} };
    if (s.type === 'translation') return { no: EXAM_TRANSLATION_NO, type: 'translation', stem: '', options: {} };
    return s.questions[examQIdx] || null;
  }
  function examRestoreState() {
    const q = examCurQuestion();
    const key = examCur ? examCur.examId + ':' + examType + ':' + examSIdx + ':' + examQIdx : '';
    if (key === examRestoreKey) return;
    examRestoreKey = key;
    examPick = null; examMarked = false;
    if (!q) return;
    const p = Store.examProgress(examCur.examId);
    const r = p && p.a[examNoOf(q)];
    if (r) { examPick = r.p || null; examMarked = r.ok !== -1; }
    if ((q.type === 'writing' || q.type === 'translation') && !examDraft && r && r.p) examDraft = r.p;
  }

  function examFeedbackHtml() {
    const q = examCurQuestion();
    if (!q) return '';
    const isWriting = q.type === 'writing' || q.type === 'translation';
    if (isWriting ? !examDraft.trim() : !examPick) return '';
    const auto = Exams.judge(examCur, q, examPick);
    if (auto) {
      const s = examCurSession();
      const word = q.type === 'cloze' && s && s.bank && s.bank[auto.key] ? ' · ' + esc(s.bank[auto.key]) : '';
      return '<div class="exam-feedback ' + (auto.ok ? 'ok' : 'bad') + '">' + (auto.ok ? '回答正确' : '回答错误，正确答案：' + esc(auto.key) + word) + '（官方答案）</div>';
    }
    if (!examMarked) return '';
    const p = Store.examProgress(examCur.examId);
    const r = p && p.a[examNoOf(q)];
    const ok = r && r.ok === 1;
    return '<div class="exam-feedback ' + (ok ? 'ok' : 'bad') + '">已自评：' + (ok ? (isWriting ? '完成' : '答对') : (isWriting ? '待改进' : '答错')) + '</div>';
  }

  function examActionBarHtml() {
    const q = examCurQuestion();
    if (!q || !examPick) return '';
    if (Exams.judge(examCur, q, examPick)) return '';
    let h = '<div class="exam-actions">';
    if (Exams.aiAvailable()) h += '<button class="btn-ghost" type="button" data-ai="1">AI 分析</button>';
    h += '<button class="btn-ghost exam-mark-ok" type="button" data-mark="1">自评：答对</button>' +
         '<button class="btn-ghost exam-mark-bad" type="button" data-mark="0">自评：答错</button></div>';
    return h;
  }

  function examNavHtml() {
    const s = examCurSession();
    const total = s && s.questions ? s.questions.length : 1;
    const last = examQIdx >= total - 1;
    const lastSession = examSIdx >= examSessions.length - 1;
    let h = '<div class="exam-nav">';
    if (examQIdx > 0) h += '<button class="btn-ghost" type="button" data-prev="1">‹ 上一题</button>';
    h += '<button class="btn-primary" type="button" data-next="1">' + (last ? (lastSession ? '完成练习' : '下一组 ›') : '下一题 ›') + '</button></div>';
    return h;
  }

  function renderExamSession() {
    const s = examCurSession();
    const pane = $('exams-session-pane');
    if (!s) { renderExamResult(); examShowPane('result'); return; }
    examRestoreState();
    const q = examCurQuestion();
    const total = s.questions ? s.questions.length : 1;
    const idx = s.questions ? examQIdx : 0;
    let h = '<div class="exam-session-head"><span>' + esc(EXAM_TYPE_NAME[s.type] || '') + (examRetryMode ? ' · 错题重练' : '') + ' · 第' + (examSIdx + 1) + '/' + examSessions.length + '组</span><span>' + (idx + 1) + ' / ' + total + '</span></div>';
    h += '<div class="exam-progress"><i style="width:' + Math.round(((idx + (examPick ? 1 : 0)) / total) * 100) + '%"></i></div>';
    if (s.directions) h += '<p class="exam-directions">' + esc(s.directions) + '</p>';
    if (s.type === 'reading') {
      if (s.passage) h += '<div class="exam-passage" tabindex="0" aria-label="阅读材料">' + esc(s.passage).replace(/\n/g, '<br>') + '</div>';
      if (s.prompt) h += '<p class="exam-prompt-hint">' + esc(s.prompt) + '</p>';
      h += examQuestionCardHtml(q);
    } else if (s.type === 'matching') {
      h += '<div class="exam-passage exam-paras" tabindex="0" aria-label="匹配段落">' + s.paragraphs.map(p => '<div class="exam-para"><span class="exam-para-letter">' + esc(p.letter) + '</span><span>' + esc(p.text) + '</span></div>').join('') + '</div>';
      h += examQuestionCardHtml(q, true);
    } else if (s.type === 'cloze') {
      h += examClozePassageHtml(s);
      h += examClozeStripHtml(s);
      h += '<div class="exam-qcard"><div class="exam-qno">Q' + q.no + ' · 从词库选一词填入本空</div>';
      h += examBankHtml(s);
      h += '<div id="exam-ai-box"></div>';
      h += examFeedbackHtml() + examActionBarHtml() + examNavHtml() + '</div>';
    } else {
      if (s.type === 'writing') h += '<div class="exam-passage">' + esc(s.prompt || s.directions || '（本套写作题干缺失）') + '</div>';
      if (s.type === 'translation' && s.passage) h += '<div class="exam-passage">' + esc(s.passage).replace(/\n/g, '<br>') + '</div>';
      h += '<textarea class="exam-textarea" id="exam-writing-input" rows="8" placeholder="' + (s.type === 'writing' ? '在此写下你的作文（150–200 词）…' : '在此写下你的译文…') + '">' + esc(examDraft) + '</textarea>';
      h += '<div class="exam-count" id="exam-count">' + examDraft.length + ' 字符</div>';
      h += '<div id="exam-ai-box"></div>';
      h += examWritingActionsHtml();
      h += examFeedbackHtml();
      h += '<div class="exam-nav"><button class="btn-primary" type="button" data-next="1">' + (examSIdx >= examSessions.length - 1 ? '完成练习' : '下一组 ›') + '</button></div>';
    }
    pane.innerHTML = h;
    const ta = $('exam-writing-input');
    if (ta) ta.addEventListener('input', () => { examDraft = ta.value; $('exam-count').textContent = examDraft.length + ' 字符'; });
    const cached = q && Store.examAi(s.type === 'writing' || s.type === 'translation' ? Exams.writingCacheKey(examCur.examId, s.type) : Exams.questionCacheKey(examCur.examId, q.no));
    if (cached && (s.type === 'writing' || s.type === 'translation')) examRenderAiBox(cached.text, true);
  }

  function examQuestionCardHtml(q, matching) {
    if (!q) return '';
    let h = '<div class="exam-qcard"><div class="exam-qno">Q' + q.no + '</div>';
    if (q.stem) h += '<p class="exam-stem">' + esc(q.stem) + '</p>';
    else if (!matching) h += '<p class="exam-stem exam-stem-empty">（本题为题干缺失的听力式排版，请根据选项作答）</p>';
    if (matching) {
      const letters = (examCurSession().paragraphs || []).map(p => p.letter);
      h += '<div class="exam-letters">' + letters.map(L => '<button class="exam-letter' + (examPick === L ? ' selected' : '') + '" type="button" data-opt="' + L + '" aria-label="段落 ' + L + '">' + L + '</button>').join('') + '</div>';
    } else {
      h += '<div class="exam-opts">' + Object.entries(q.options).map(([L, t]) =>
        '<button class="exam-opt' + (examPick === L ? ' selected' : '') + '" type="button" data-opt="' + L + '"><span class="exam-opt-letter">' + L + '</span><span>' + esc(t) + '</span></button>'
      ).join('') + '</div>';
      if ((q.missingOptions || []).length) h += '<p class="exam-missing-note">源文本缺选项 ' + esc(q.missingOptions.join('、')) + '（OCR 残缺，如实标注）</p>';
    }
    h += '<div id="exam-ai-box"></div>';
    h += examFeedbackHtml() + examActionBarHtml() + examNavHtml() + '</div>';
    return h;
  }

  function examClozeState(s) {
    const p = Store.examProgress(examCur.examId);
    const map = {};
    (s.questions || []).forEach(q => { const r = p && p.a[q.no]; if (r && r.p) map[q.no] = { letter: r.p, ok: r.ok }; });
    const cur = examCurQuestion();
    if (cur && examPick) {
      const auto = Exams.judge(examCur, cur, examPick);
      const r = p && p.a[cur.no];
      map[cur.no] = { letter: examPick, ok: auto ? auto.ok : (examMarked && r ? r.ok : -1) };
    }
    return map;
  }
  function examClozeBlankHtml(s, no, state) {
    const cur = examCurQuestion();
    const st = state[no];
    const cls = 'exam-blank' + (cur && cur.no === no ? ' current' : '') + (st ? ' filled' : '') + (st && st.ok === 1 ? ' ok' : st && st.ok === 0 ? ' bad' : '');
    return '<button class="' + cls + '" type="button" data-blank="' + no + '" aria-label="第' + no + '空">' + (st ? esc(st.letter) : no) + '</button>';
  }
  function examClozePassageHtml(s) {
    const state = examClozeState(s);
    const nos = new Set((s.questions || []).map(q => q.no));
    const html = esc(s.passage || '').replace(/__(\d+)__|\b(\d+)\b/g, (m, a, b) => {
      const n = +(a || b);
      return nos.has(n) ? examClozeBlankHtml(s, n, state) : m;
    });
    return '<div class="exam-passage exam-cloze-passage" tabindex="0" aria-label="选词填空短文">' + html.replace(/\n/g, '<br>') + '</div>';
  }
  function examClozeStripHtml(s) {
    const state = examClozeState(s);
    const cur = examCurQuestion();
    return '<div class="exam-blanks" role="group" aria-label="空位导航">' + (s.questions || []).map(q => {
      const st = state[q.no];
      const cls = 'exam-blank-chip' + (cur && cur.no === q.no ? ' current' : '') + (st && st.ok === 1 ? ' ok' : st && st.ok === 0 ? ' bad' : '');
      return '<button class="' + cls + '" type="button" data-blank="' + q.no + '"><i>' + q.no + '</i>' + (st ? esc(st.letter) : '–') + '</button>';
    }).join('') + '</div>';
  }
  function examBankHtml(s) {
    const state = examClozeState(s);
    const cur = examCurQuestion();
    const used = {};
    Object.keys(state).forEach(no => { const st = state[no]; if (st && (!cur || +no !== cur.no)) used[st.letter] = no; });
    const letters = Object.keys(s.bank || {}).sort();
    return '<div class="exam-bank" role="group" aria-label="词库">' + letters.map(L => {
      const cls = 'exam-bank-item' + (examPick === L ? ' selected' : '') + (used[L] ? ' used' : '');
      return '<button class="' + cls + '" type="button" data-opt="' + L + '"' + (used[L] ? ' title="已用于 Q' + used[L] + '"' : '') + '><span class="exam-opt-letter">' + L + '</span><span class="exam-bank-word">' + esc(s.bank[L]) + '</span>' + (used[L] ? '<sup class="exam-bank-used">Q' + used[L] + '</sup>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function examWritingActionsHtml() {
    let h = '<div class="exam-actions">';
    if (Exams.aiAvailable()) h += '<button class="btn-ghost" type="button" data-ai="1">AI 批改</button>';
    h += '<button class="btn-ghost exam-mark-ok" type="button" data-mark="1">自评：完成</button>' +
         '<button class="btn-ghost exam-mark-bad" type="button" data-mark="0">自评：待改进</button></div>';
    return h;
  }

  function examRenderAiBox(text, cached) {
    const box = $('exam-ai-box');
    if (!box) return;
    box.innerHTML = '<div class="exam-ai-note">' + (cached ? 'AI 分析（已缓存）' : 'AI 分析') + ' · 仅供参考，非官方答案</div><div class="exam-ai-text">' + esc(text).replace(/\n/g, '<br>') + '</div>';
  }

  function examRecord(ok, mode) {
    const q = examCurQuestion();
    if (!q) return;
    const pick = (q.type === 'writing' || q.type === 'translation') ? examDraft.slice(0, 200) : examPick;
    Store.examAnswer(examCur.examId, examNoOf(q), q.type, pick, ok, mode);
    examMarked = ok !== -1;
  }

  async function examAiAnalyze(btn) {
    const s = examCurSession();
    const q = examCurQuestion();
    if (!s || !q) return;
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '分析中…';
    let res;
    if (s.type === 'writing' || s.type === 'translation') {
      if (!examDraft.trim()) { btn.disabled = false; btn.textContent = old; announce('请先写下你的作答'); return; }
      res = await Exams.analyzeWriting(examCur, s.type, examDraft);
    } else {
      if (!examPick) { btn.disabled = false; btn.textContent = old; announce('请先选择一个选项'); return; }
      res = await Exams.analyzeQuestion(examCur, q, examPick, s.passage || (s.paragraphs || []).map(p => '[' + p.letter + '] ' + p.text).join('\n'), s.bank);
    }
    btn.disabled = false;
    btn.textContent = old;
    if (res.ok) { examRenderAiBox(res.text, res.cached); announce('AI 分析已生成，仅供参考'); }
    else {
      const box = $('exam-ai-box');
      if (box) box.innerHTML = '<div class="exam-feedback bad">AI 分析失败：' + esc(res.error || '未知错误') + '</div>';
    }
  }

  function examNext() {
    const s = examCurSession();
    const q = examCurQuestion();
    if (q && examPick && !examMarked) examRecord(-1, 'self');
    if (q && (s.type === 'writing' || s.type === 'translation') && examDraft.trim() && !examMarked) examRecord(-1, 'self');
    const total = s && s.questions ? s.questions.length : 1;
    if (examQIdx < total - 1) { examQIdx++; examDraft = ''; renderExamSession(); return; }
    if (!examRetryMode && s) Store.examFinish(examCur.examId, s.type);
    if (examSIdx < examSessions.length - 1) {
      examSIdx++; examQIdx = 0; examDraft = '';
      announce('进入下一组');
      renderExamSession();
      return;
    }
    renderExamResult();
    examShowPane('result');
    announce('练习完成');
  }

  function renderExamResult() {
    const pane = $('exams-result-pane');
    let answered = 0, correct = 0, wrong = 0;
    const wrongList = [];
    const p = Store.examProgress(examCur.examId);
    examRunQuestions.forEach(q => {
      const r = p && p.a[examNoOf(q)];
      if (!r) return;
      answered++;
      if (r.ok === 1) correct++;
      else if (r.ok === 0) { wrong++; wrongList.push(q); }
    });
    const unjudged = answered - correct - wrong;
    let h = '<div class="exam-result-hero"><div class="exam-result-score">' + (answered ? Math.round(correct / answered * 100) : 0) + '%</div><div class="exam-result-sub">正确率（含自评）</div></div>';
    h += '<div class="exam-result-grid">' +
      '<div class="exam-result-cell"><b>' + answered + '</b><span>已答</span></div>' +
      '<div class="exam-result-cell ok"><b>' + correct + '</b><span>答对</span></div>' +
      '<div class="exam-result-cell bad"><b>' + wrong + '</b><span>答错</span></div>' +
      '<div class="exam-result-cell"><b>' + unjudged + '</b><span>未判</span></div></div>';
    if (!Exams.aiAvailable() && !examCur.answers) h += '<p class="field-hint">本套无官方答案，正确率来自你的自评；接入 AI 后可获得逐题分析。</p>';
    if (wrongList.length) {
      h += '<h3 class="exam-year">本组错题</h3>';
      wrongList.slice(0, 20).forEach(q => {
        h += '<div class="exam-wrong-row"><span class="exam-qno">Q' + examNoOf(q) + '</span><span>' + esc((q.stem || EXAM_TYPE_NAME[q.type] || '').slice(0, 60)) + '</span></div>';
      });
    }
    h += '<div class="exam-nav">';
    if (wrongList.length) h += '<button class="btn-ghost" type="button" data-retry="1">重练错题</button>';
    h += '<button class="btn-ghost" type="button" data-detail="1">返回本套</button>' +
         '<button class="btn-primary" type="button" data-list="1">真题列表</button></div>';
    pane.innerHTML = h;
  }

  function examClick(e) {
    const t = e.target.closest('[data-exam],[data-start],[data-retry],[data-back-list],[data-opt],[data-blank],[data-mark],[data-ai],[data-next],[data-prev],[data-detail],[data-list],[data-study]');
    if (!t) return;
    if (t.dataset.study) { openStudySheet(null, t.dataset.study); return; }
    if (t.dataset.exam) { openExam(t.dataset.exam); return; }
    if (t.dataset.start) { startExamType(t.dataset.start); return; }
    if (t.dataset.retry) { startExamRetry(); return; }
    if (t.dataset.backList) { examCur = null; examShowPane('list'); renderExamsList(); return; }
    if (t.dataset.detail) { renderExamDetail(); examShowPane('detail'); return; }
    if (t.dataset.list) { examCur = null; examShowPane('list'); renderExamsList(); return; }
    if (t.dataset.blank) {
      const s = examCurSession();
      if (s && s.questions) {
        const i = s.questions.findIndex(q => String(q.no) === t.dataset.blank);
        if (i >= 0 && i !== examQIdx) { examQIdx = i; examDraft = ''; renderExamSession(); }
      }
      return;
    }
    if (t.dataset.opt) {
      examPick = t.dataset.opt;
      const q = examCurQuestion();
      const auto = q && Exams.judge(examCur, q, examPick);
      if (auto) { examRecord(auto.ok, 'auto'); announce(auto.ok ? '回答正确' : '回答错误，正确答案 ' + auto.key); Platform.haptic('light'); }
      renderExamSession();
      return;
    }
    if (t.dataset.mark) {
      const ok = t.dataset.mark === '1' ? 1 : 0;
      const s = examCurSession();
      if (s && (s.type === 'writing' || s.type === 'translation') && !examDraft.trim()) { announce('请先写下你的作答再自评'); return; }
      if (!examPick && s && (s.type === 'reading' || s.type === 'matching' || s.type === 'cloze')) { announce('请先选择一个选项'); return; }
      examRecord(ok, 'self');
      announce(ok ? '已记录：答对' : '已记录：答错，已加入错题');
      renderExamSession();
      return;
    }
    if (t.dataset.ai) { examAiAnalyze(t); return; }
    if (t.dataset.next) { examNext(); return; }
    if (t.dataset.prev) { if (examQIdx > 0) { examQIdx--; examDraft = ''; renderExamSession(); } return; }
  }

  // ===================== AI 学习空间（全屏导学：确认 → 导学 → 完成后日报） =====================
  let aiStage = 'confirm';
  let aiBusy = '';
  let aiTeachErr = '';
  let aiReportDate = '';
  let aiSession = null;
  let aiCheck = null;

  const AI_FOCUS_NAME = { auto: '智能混合', due: '到期复习', errors: '错题门诊', study: '翻译与写作' };
  const AI_STRATEGY_NAME = { teach: '讲练结合', guide: '提问引导', recite: '背诵检查' };
  const AI_STRATEGY_SYS = {
    teach: '教学策略「讲练结合」：先讲清楚再让用户做检查。逐词给核心义、词根/联想记忆钩子和一句短例句；材料则给关键表达与翻译/写作要点。',
    guide: '教学策略「提问引导」：先围绕词或材料提出 1–2 个引导性问题，再给提示与讲解，最后留一个思考题让用户在下方输入框作答。',
    recite: '教学策略「背诵检查」：先给中文释义与语境，请用户自己回忆英文表达，再给记忆线索；不要直接给出完整例句。'
  };

  function aiReady() { const cfg = Store.data.ai || {}; return !!(cfg.enabled && window.AI && AI.effectiveKey(cfg)); }
  async function aiSpaceChat(system, user, opts) {
    const rc = AI.resolveConfig(Store.data.ai || {});
    if (!rc.key || !rc.base || !rc.model) return { ok: false, error: 'AI 未配置（服务商 / Key / 模型）' };
    const res = await Platform.llmChat({ base: rc.base, key: rc.key, model: rc.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: opts && opts.temperature != null ? opts.temperature : 0.4, jsonMode: !!(opts && opts.jsonMode), anthropic: rc.anthropic, noThink: rc.noThink });
    if (!res.ok) return { ok: false, error: res.error };
    return { ok: true, text: String(res.content || '').trim(), provider: rc.provider && rc.provider.id, model: rc.model };
  }
  function aiNoteHtml(rec) { return '<p class="ai-note">AI 生成 · 仅供参考' + (rec && rec.provider ? ' · ' + esc(rec.provider) : '') + '</p>'; }
  function aiOffHtml() { return '<div class="ai-off"><p>尚未接入 AI 服务。接入后即可开启全屏导学：先确认学习计划，再按教学策略逐步讲解，完成学习后生成每日报告。</p><button class="btn-primary" type="button" data-ai-act="settings">去接入 AI</button></div>'; }
  function aiFailHtml(err) { return '<div class="exam-feedback bad">生成失败：' + esc(err || '未知错误') + '</div>'; }

  function aiCfg() {
    const p = Store.spaceGet('tutor', 'plan');
    return { minutes: p ? p.minutes : 15, focus: p ? p.focus : 'auto', strategy: p ? p.strategy : 'teach' };
  }
  function aiSaveCfg(patch) { Store.spaceSet('tutor', 'plan', Object.assign(aiCfg(), patch, { t: Date.now() })); }
  function aiDueWords(n) {
    const now = Date.now();
    return ((book && book.entries) || []).filter(e => SRS.isDue(Store.data.srs[e.word], now)).slice(0, n).map(e => e.word);
  }
  function aiNewWords(n) { return ((book && book.entries) || []).filter(e => !Store.data.srs[e.word]).slice(0, n).map(e => e.word); }
  function aiStudyStep(id) {
    const it = Library.studyItem(id);
    return { kind: 'study', words: [], studyId: id, title: '翻译精读 · ' + (it ? (it.topic || it.title) : id) };
  }
  function aiBuildSteps(cfg) {
    const steps = [];
    const due = aiDueWords(12), errs = Store.errorWords();
    const m = cfg.minutes;
    const reviewN = m <= 10 ? 4 : m <= 15 ? 6 : m <= 20 ? 8 : 10;
    const clinicN = m <= 10 ? 2 : m <= 15 ? 3 : 4;
    const studyN = m >= 30 ? 2 : m >= 20 ? 1 : 0;
    const chunk = (arr, size, kind, name) => {
      for (let i = 0; i < arr.length; i += size) steps.push({ kind, words: arr.slice(i, i + size), studyId: '', title: name + ' · ' + Math.min(size, arr.length - i) + ' 词' });
    };
    const addStudy = n => {
      if (!Library.studyReady()) return;
      Library.studyList('translation').slice(0, n).forEach(it => steps.push(aiStudyStep(it.id)));
    };
    if (cfg.focus === 'due') {
      chunk(due.length ? due : aiNewWords(reviewN), 5, 'review', due.length ? '到期复习' : '新词预览');
    } else if (cfg.focus === 'errors') {
      chunk(errs.slice(0, clinicN + 3), 3, 'clinic', '错题门诊');
      if (due.length) chunk(due.slice(0, 4), 4, 'review', '到期复习');
    } else if (cfg.focus === 'study') {
      addStudy(studyN || 1);
      if (due.length) chunk(due.slice(0, 4), 4, 'review', '到期复习');
    } else {
      if (due.length) chunk(due.slice(0, reviewN), 5, 'review', '到期复习');
      if (errs.length) chunk(errs.slice(0, clinicN), 3, 'clinic', '错题门诊');
      addStudy(studyN);
    }
    if (!steps.length) {
      const w = due.length ? due.slice(0, 4) : aiNewWords(4);
      if (w.length) chunk(w, 4, 'review', '新词预览');
      else if (Library.studyReady()) { const it = Library.studyList('translation')[0]; if (it) steps.push(aiStudyStep(it.id)); }
    }
    return steps.slice(0, 8);
  }

  function openAiSpace() {
    const saved = Store.spaceGet('tutor', 'session');
    if (saved && saved.date === Store.today() && !saved.done && saved.steps.length) {
      aiSession = saved; aiStage = 'session'; aiEnterStep();
    } else { aiSession = null; aiStage = 'confirm'; }
    if (!Library.studyReady()) Library.studyInit().then(() => {
      if (openSheetEl && openSheetEl.id === 'ai-space-sheet') {
        renderAiSpace();
        const s = aiCurStep();
        if (aiStage === 'session' && s && s.kind === 'study') aiFetchTeach();
      }
    });
    renderAiSpace();
    const s = aiCurStep();
    if (aiStage === 'session' && s && (s.kind !== 'study' || Library.studyReady())) aiFetchTeach();
  }
  function aiSaveSession() { if (!aiSession) return; aiSession.t = Date.now(); Store.spaceSet('tutor', 'session', aiSession); }
  function aiCurStep() { return aiSession ? aiSession.steps[aiSession.idx] || null : null; }
  function aiShuffle(a) { return a.slice().sort(() => Math.random() - 0.5); }
  function aiGloss(w) { const e = Library.lookup(w) || {}; return String(e.zh || '').split(/[;；\n]/)[0].slice(0, 24) || w; }
  function aiEnterStep() {
    aiCheck = null; aiTeachErr = '';
    const s = aiCurStep();
    if (!s || s.kind === 'study') return;
    const zh2en = aiCfg().strategy === 'recite';
    const pool = ((book && book.entries) || []).map(e => e.word).filter(w => w);
    aiCheck = s.words.map(w => {
      const gloss = aiGloss(w);
      let prompt, answer, options;
      if (zh2en) {
        prompt = gloss; answer = w;
        options = aiShuffle(pool.filter(x => x !== w)).slice(0, 3);
      } else {
        prompt = w; answer = gloss;
        const others = aiShuffle(s.words.filter(x => x !== w).concat(aiShuffle(pool).slice(0, 8))).filter(x => x !== w);
        options = [];
        for (const x of others) { const g = aiGloss(x); if (g !== answer && !options.includes(g)) options.push(g); if (options.length >= 3) break; }
      }
      while (options.length < 3) options.push('（无匹配释义）');
      return { word: w, prompt, answer, options: aiShuffle([answer].concat(options.slice(0, 3))) };
    });
  }
  function aiPickKey(w) { return aiSession.idx + ':' + w; }
  function aiStepComplete() {
    const s = aiCurStep();
    if (!s || !aiSession) return false;
    if (s.kind === 'study') return !!aiSession.revealed[aiSession.idx];
    return s.words.every(w => aiSession.picks[aiPickKey(w)] != null);
  }
  function aiTeachKey(s) { return 'teach:' + aiSession.date + ':' + aiSession.idx + ':' + s.kind + ':' + (s.words.join('-') || s.studyId); }
  async function aiFetchTeach() {
    const s = aiCurStep();
    if (!s || aiBusy || !aiReady() || Store.spaceGet('tutor', aiTeachKey(s))) return;
    if (s.kind === 'study' && !Library.studyReady()) { Library.studyInit().then(() => aiFetchTeach()); return; }
    aiBusy = 'teach'; renderAiSpace();
    const system = '你是大学英语六级学习教练，正在全屏学习空间里按步骤导学。' + AI_STRATEGY_SYS[aiCfg().strategy] + '用中文回答，不用 markdown 标题，不超过 320 字。';
    let user;
    if (s.kind === 'study') {
      const it = Library.studyItem(s.studyId) || {};
      const src = String((it.fields || {}).sourceText || '').slice(0, 400);
      user = ['学习材料：' + (it.title || s.studyId), '中文原文摘录：', src, '任务：给出本篇 3 个关键表达（英文 + 中文）与 1 条翻译要点。'].join('\n');
    } else {
      const lines = s.words.map(w => {
        const mix = Object.keys((Store.data.quiz.history[w] || {}).mix || {}).slice(0, 3);
        return w + ' — ' + (aiGloss(w) || '（词库无释义）') + (mix.length ? '（用户易混：' + mix.join('、') + '）' : '');
      });
      user = [s.kind === 'clinic' ? '这些是用户测试答错的词，请讲透：' : '本步学习词：', lines.join('\n')].join('\n');
    }
    const res = await aiSpaceChat(system, user);
    aiBusy = '';
    if (res.ok) Store.spaceSet('tutor', aiTeachKey(s), { text: res.text, t: Date.now(), provider: res.provider, model: res.model });
    else aiTeachErr = res.error;
    if (openSheetEl && openSheetEl.id === 'ai-space-sheet') renderAiSpace();
  }

  function renderAiSpace() {
    $('ai-space-sub').textContent = aiReady() ? '确认计划 → 逐步导学 → 完成后生成日报' : '未接入 AI · 点右上齿轮配置';
    const body = $('ai-space-body');
    const sc = body.scrollTop;
    body.innerHTML = '';
    if (aiStage === 'confirm') renderAiConfirm(body);
    else if (aiStage === 'session') renderAiSession(body);
    else if (aiStage === 'done') renderAiDone(body);
    else renderAiReportView(body);
    if (!openSheetEl || openSheetEl.id !== 'ai-space-sheet') openSheet('ai-space-sheet');
    body.scrollTop = (aiStage === 'session' || aiBusy) ? sc : 0;
  }

  function aiStatRow(pairs) {
    const stats = el('div', 'stat-row');
    pairs.forEach(([v, k]) => {
      const t = el('div', 'stat-tile');
      t.appendChild(el('div', 'stat-num', String(v)));
      t.appendChild(el('div', 'stat-key', k));
      stats.appendChild(t);
    });
    return stats;
  }
  function aiCfgChips(label, act, options, cur) {
    const box = el('div', 'ai-cfg');
    box.appendChild(el('div', 'ai-cfg-label', label));
    const row = el('div', 'chip-row wrap');
    options.forEach(([v, name]) => {
      const c = el('button', 'chip' + (cur === v ? ' active' : ''), name); c.type = 'button';
      c.dataset.aiAct = act; c.dataset.v = v;
      row.appendChild(c);
    });
    box.appendChild(row);
    return box;
  }
  function renderAiConfirm(body) {
    const cfg = aiCfg();
    const today = Store.today();
    const log = Store.data.logs[today] || {};
    const due = aiDueWords(999).length;
    const errs = Store.errorWords().length;
    const sc = Library.studyCounts();
    if (!aiReady()) body.appendChild(el('div', 'ai-card')).innerHTML = aiOffHtml();
    const hero = el('div', 'ai-card');
    hero.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">开始前，先确认今日计划</span></div>' +
      '<p class="field-hint">根据你的学习记录与目标，AI 按所选教学策略逐步讲解；完成全部步骤后才生成每日报告。</p>';
    hero.appendChild(aiStatRow([[due, '到期复习'], [errs, '错词'], [(log.newWords || []).length + ' / ' + (log.reviewWords || []).length, '今日新学/复习'], [sc ? sc.translations : '…', '翻译材料']]));
    hero.appendChild(aiCfgChips('学习时长', 'cfg-min', [[10, '10 分钟'], [15, '15 分钟'], [20, '20 分钟'], [30, '30 分钟']], cfg.minutes));
    hero.appendChild(aiCfgChips('学习重点', 'cfg-focus', Object.keys(AI_FOCUS_NAME).map(k => [k, AI_FOCUS_NAME[k]]), cfg.focus));
    hero.appendChild(aiCfgChips('教学策略', 'cfg-strategy', Object.keys(AI_STRATEGY_NAME).map(k => [k, AI_STRATEGY_NAME[k]]), cfg.strategy));
    const steps = aiBuildSteps(cfg);
    const plan = el('div', 'ai-plan');
    plan.appendChild(el('div', 'ai-cfg-label', '计划预览 · ' + steps.length + ' 步'));
    if (!steps.length) plan.appendChild(el('p', 'field-hint', '暂无可学内容：先去学习页学几个词，或完成一次测试。'));
    steps.forEach((s, i) => {
      const row = el('div', 'ai-plan-row');
      row.appendChild(el('span', 'ai-plan-no', String(i + 1)));
      row.appendChild(el('span', 'ai-plan-title', s.title));
      row.appendChild(el('span', 'row-badge gray', s.kind === 'study' ? '精读' : s.kind === 'clinic' ? '讲透+检查' : '讲解+检查'));
      plan.appendChild(row);
    });
    hero.appendChild(plan);
    const start = el('button', 'btn-primary ai-start', '确认，开始学习'); start.type = 'button';
    start.dataset.aiAct = 'start';
    start.disabled = !aiReady() || !steps.length;
    hero.appendChild(start);
    if (!aiReady()) hero.appendChild(el('p', 'field-hint', '接入 AI 后即可开始；计划与进度会保存在本机。'));
    body.appendChild(hero);
    aiArticleCard(body);
    const reports = Object.keys(Store.data.space.report || {}).sort().reverse();
    const card = el('div', 'ai-card');
    card.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">每日报告</span><span class="exam-badge gray">' + reports.length + ' 份</span></div>' +
      '<p class="field-hint">报告只在完成一次导学后生成，按天缓存。</p>';
    if (!reports.length) card.appendChild(el('p', 'field-hint', '还没有报告。完成今天的导学后，这里会出现第一份。'));
    const wrap = el('div', 'list-gap');
    reports.forEach(d => {
      const rec = Store.spaceGet('report', d);
      const row = el('button', 'row compact'); row.type = 'button';
      const main = el('div', 'row-main');
      main.appendChild(el('div', 'row-title', d + (d === today ? ' · 今天' : '')));
      main.appendChild(el('div', 'row-sub', String(rec.text || '').slice(0, 36).replace(/\n/g, ' ') + '…'));
      row.appendChild(main);
      row.appendChild(el('span', 'row-badge' + (d === today ? ' green' : ' gray'), '查看'));
      row.dataset.aiAct = 'report-view'; row.dataset.date = d;
      wrap.appendChild(row);
    });
    card.appendChild(wrap);
    body.appendChild(card);
  }

  function renderAiSession(body) {
    const s = aiCurStep();
    if (!s) { aiStage = 'confirm'; renderAiConfirm(body); return; }
    const cfg = aiCfg();
    const head = el('div', 'ai-card');
    const mins = Math.max(0, Math.round((Date.now() - (aiSession.startedAt || Date.now())) / 60000));
    head.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">第 ' + (aiSession.idx + 1) + ' / ' + aiSession.steps.length + ' 步 · ' + esc(s.title) + '</span>' +
      '<span class="exam-badge">' + esc(AI_STRATEGY_NAME[cfg.strategy]) + '</span><span class="exam-badge gray">' + mins + ' 分钟</span></div>';
    const bar = el('div', 'freq-bar');
    const fill = el('div', 'freq-bar-fill');
    fill.style.width = Math.round(100 * aiSession.idx / aiSession.steps.length) + '%';
    bar.appendChild(fill);
    head.appendChild(bar);
    body.appendChild(head);

    const teach = el('div', 'ai-card');
    teach.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">AI 讲解</span></div>';
    const rec = Store.spaceGet('tutor', aiTeachKey(s));
    if (rec) teach.innerHTML += '<div class="ai-text">' + esc(rec.text).replace(/\n/g, '<br>') + '</div>' + aiNoteHtml(rec);
    else if (!aiReady()) teach.innerHTML += '<p class="field-hint">未接入 AI，本步可自学词表并完成检查；接入后 AI 会按策略讲解。</p>';
    else if (aiBusy === 'teach') teach.innerHTML += '<p class="ai-placeholder ai-thinking">AI 正在准备本步讲解…</p>';
    else if (aiTeachErr) { teach.innerHTML += aiFailHtml(aiTeachErr); const r = el('button', 'btn-ghost', '重试讲解'); r.type = 'button'; r.dataset.aiAct = 'teach-retry'; teach.appendChild(r); }
    else { teach.innerHTML += '<p class="ai-placeholder">讲解尚未生成。</p>'; const g = el('button', 'btn-ghost', '生成讲解'); g.type = 'button'; g.dataset.aiAct = 'teach-retry'; teach.appendChild(g); }
    body.appendChild(teach);

    if (s.kind === 'study') {
      const it = Library.studyItem(s.studyId) || {};
      const card = el('div', 'ai-card');
      card.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">' + esc(it.title || s.studyId) + '</span>' + (it.exam ? '<span class="exam-badge gray">' + esc(it.exam.label) + '</span>' : '') + '</div>';
      const src = el('div', 'study-text');
      src.textContent = String((it.fields || {}).sourceText || '（原文缺失）');
      card.appendChild(src);
      if (aiSession.revealed[aiSession.idx]) {
        card.appendChild(el('div', 'ai-cfg-label', '参考译文'));
        const ref = el('div', 'study-text');
        ref.textContent = String((it.fields || {}).reference || '（译文缺失）');
        card.appendChild(ref);
      } else {
        const rv = el('button', 'study-reveal', '先自己译一遍 · 点击揭示参考译文'); rv.type = 'button';
        rv.dataset.aiAct = 'reveal';
        card.appendChild(rv);
      }
      body.appendChild(card);
    } else {
      const card = el('div', 'ai-card');
      card.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">' + (s.kind === 'clinic' ? '错词讲透' : '本步词表') + '</span><span class="exam-badge gray">' + s.words.length + ' 词</span></div>';
      const wrap = el('div', 'list-gap');
      s.words.forEach(w => {
        const row = el('div', 'row static compact');
        const main = el('div', 'row-main');
        main.appendChild(el('div', 'row-title', w));
        main.appendChild(el('div', 'row-sub', aiGloss(w)));
        row.appendChild(main);
        if (s.kind === 'clinic') {
          const err = Store.data.errors[w] || {};
          row.appendChild(el('span', 'row-badge gray', '错 ' + (err.count || 1)));
        }
        wrap.appendChild(row);
      });
      card.appendChild(wrap);
      body.appendChild(card);

      const check = el('div', 'ai-card');
      check.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">即时检查</span><span class="exam-badge gray">' + (cfg.strategy === 'recite' ? '看中文选英文' : '看英文选释义') + '</span></div>';
      (aiCheck || []).forEach(q => {
        const box = el('div', 'ai-check-q');
        box.appendChild(el('div', 'ai-check-prompt', q.prompt));
        const picked = aiSession.picks[aiPickKey(q.word)];
        const opts = el('div', 'ai-check-opts');
        q.options.forEach(op => {
          const b = el('button', 'ai-opt', op); b.type = 'button';
          b.dataset.aiAct = 'pick'; b.dataset.word = q.word; b.dataset.opt = op;
          if (picked != null) {
            b.disabled = true;
            if (op === q.answer) b.classList.add('right');
            else if (op === picked) b.classList.add('wrong');
          }
          opts.appendChild(b);
        });
        box.appendChild(opts);
        if (picked != null) box.appendChild(el('div', 'ai-check-verdict' + (picked === q.answer ? ' ok' : ' bad'), picked === q.answer ? '答对了' : '正确答案：' + q.answer));
        check.appendChild(box);
      });
      body.appendChild(check);
    }

    const ask = el('div', 'ai-card');
    ask.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">随步提问</span></div>';
    if (aiSession.qa.length) {
      const thread = el('div', 'ai-qa-thread');
      aiSession.qa.forEach(t => {
        thread.appendChild(el('div', 'ai-qa-q', t.q));
        const a = el('div', 'ai-qa-a'); a.textContent = t.a;
        thread.appendChild(a);
      });
      ask.appendChild(thread);
    }
    const row = el('div', 'ai-qa-input');
    const inp = document.createElement('input');
    inp.type = 'text'; inp.id = 'ai-ask-input'; inp.placeholder = '对本步的词或材料有疑问？直接问'; inp.autocomplete = 'off';
    row.appendChild(inp);
    const send = el('button', 'btn-primary', aiBusy === 'ask' ? '思考中…' : '提问'); send.type = 'button';
    send.dataset.aiAct = 'ask'; send.disabled = aiBusy === 'ask' || !aiReady();
    row.appendChild(send);
    ask.appendChild(row);
    body.appendChild(ask);

    const foot = el('div', 'exam-actions ai-session-foot');
    const skip = el('button', 'btn-ghost', '跳过本步'); skip.type = 'button';
    skip.dataset.aiAct = 'skip';
    foot.appendChild(skip);
    const next = el('button', 'btn-primary', aiSession.idx + 1 >= aiSession.steps.length ? '完成学习，生成日报' : '下一步'); next.type = 'button';
    next.dataset.aiAct = 'next';
    next.disabled = !aiStepComplete();
    foot.appendChild(next);
    if (!aiStepComplete()) foot.appendChild(el('span', 'field-hint', s.kind === 'study' ? '揭示译文后进入下一步' : '答完全部检查进入下一步'));
    body.appendChild(foot);
  }

  function renderAiDone(body) {
    const s = aiSession || { steps: [], correct: 0, total: 0, wrong: [], startedAt: Date.now() };
    const mins = Math.max(1, Math.round((Date.now() - (s.startedAt || Date.now())) / 60000));
    const card = el('div', 'ai-card');
    card.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">本次导学完成</span><span class="exam-badge green">' + esc(Store.today()) + '</span></div>';
    card.appendChild(aiStatRow([[s.steps.length, '完成步骤'], [s.correct + ' / ' + s.total, '检查答对'], [mins + ' 分钟', '学习时长']]));
    if (s.wrong.length) {
      card.appendChild(el('div', 'ai-cfg-label', '本次仍错的词'));
      const chips = el('div', 'chip-row wrap');
      s.wrong.forEach(w => chips.appendChild(el('span', 'chip static', w)));
      card.appendChild(chips);
    }
    body.appendChild(card);
    const rep = el('div', 'ai-card');
    rep.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">今日报告</span></div>';
    const rec = Store.spaceGet('report', Store.today());
    if (aiBusy === 'report') rep.innerHTML += '<p class="ai-placeholder ai-thinking">正在汇总今日学习，生成日报…</p>';
    else if (rec) rep.innerHTML += '<div class="ai-text">' + esc(rec.text).replace(/\n/g, '<br>') + '</div>' + aiNoteHtml(rec);
    else if (aiTeachErr) rep.innerHTML += aiFailHtml(aiTeachErr);
    else rep.innerHTML += '<p class="field-hint">报告生成中…</p>';
    const acts = el('div', 'exam-actions');
    const regen = el('button', 'btn-ghost', '重新生成'); regen.type = 'button';
    regen.dataset.aiAct = 'report-gen'; regen.disabled = aiBusy === 'report' || !aiReady();
    acts.appendChild(regen);
    const back = el('button', 'btn-primary', '返回学习'); back.type = 'button';
    back.dataset.aiAct = 'close';
    acts.appendChild(back);
    rep.appendChild(acts);
    body.appendChild(rep);
    aiArticleCard(body);
    const more = el('button', 'link-btn', '查看历史报告'); more.type = 'button';
    more.dataset.aiAct = 'to-confirm';
    body.appendChild(more);
  }

  function renderAiReportView(body) {
    const back = el('button', 'btn-ghost cloze-back', '← 返回计划页'); back.type = 'button';
    back.dataset.aiAct = 'to-confirm';
    body.appendChild(back);
    const rec = Store.spaceGet('report', aiReportDate);
    const card = el('div', 'ai-card');
    card.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">每日报告 · ' + esc(aiReportDate) + '</span></div>';
    card.innerHTML += rec ? '<div class="ai-text">' + esc(rec.text).replace(/\n/g, '<br>') + '</div>' + aiNoteHtml(rec) : '<p class="field-hint">该日报告不存在。</p>';
    body.appendChild(card);
  }

  const AI_SYS_REPORT = '你是大学英语六级词汇学习教练。用户刚完成一次全屏导学。根据当日学习数据与本次导学结果写一份中文日报：1) 今日概览（新学/复习/评分/时长/导学步骤与检查正确率）；2) 薄弱信号（错词与易混点）；3) 明日建议（2-3 条可执行）。不得编造未提供的数据；数据为空就如实说并给鼓励。不超过 350 字，可分段，不用 markdown 标题。';
  function aiReportContext() {
    const today = Store.today();
    const log = Store.data.logs[today] || {};
    const errs = Store.errorWords().slice(0, 8);
    const now = Date.now();
    const due = ((book && book.entries) || []).filter(e => SRS.isDue(Store.data.srs[e.word], now)).length;
    const views = Object.keys(Store.data.views || {}).sort((a, b) => (Store.data.views[b].n || 0) - (Store.data.views[a].n || 0)).slice(0, 5);
    const lines = [
      '日期：' + today,
      '今日日志：新学 ' + ((log.newWords || []).length) + ' 词、复习 ' + ((log.reviewWords || []).length) + ' 词；评分 知道 ' + (log.know || 0) + ' / 模糊 ' + (log.fuzzy || 0) + ' / 忘记 ' + (log.forgot || 0) + '；学习时长 ' + Math.round((log.ms || 0) / 60000) + ' 分钟',
      '当前到期复习：' + due + ' 词',
      '错题本最近错词：' + (errs.join('、') || '无'),
      '最近查看最多：' + (views.join('、') || '无')
    ];
    if (aiSession && aiSession.done) {
      const mins = Math.max(1, Math.round((Date.now() - (aiSession.startedAt || Date.now())) / 60000));
      lines.push('本次导学：' + aiSession.steps.length + ' 步（' + aiSession.steps.map(s => s.title).join('；') + '），检查答对 ' + aiSession.correct + '/' + aiSession.total + '，用时 ' + mins + ' 分钟，仍错词：' + (aiSession.wrong.join('、') || '无') + '，策略：' + AI_STRATEGY_NAME[aiCfg().strategy]);
    }
    return lines.join('\n');
  }
  async function aiGenReport() {
    if (aiBusy || !aiReady()) return;
    aiBusy = 'report'; aiTeachErr = ''; renderAiSpace();
    const res = await aiSpaceChat(AI_SYS_REPORT, aiReportContext());
    aiBusy = '';
    if (res.ok) { Store.spaceSet('report', Store.today(), { text: res.text, t: Date.now(), provider: res.provider, model: res.model }); announce('今日报告已生成'); }
    else aiTeachErr = res.error;
    if (openSheetEl && openSheetEl.id === 'ai-space-sheet') renderAiSpace();
  }

  // ---- 印象文章：把学过的词串成短文，按天 + 字数范围缓存 ----
  const AI_ARTICLE_RANGES = { s: [60, 100], m: [120, 180], l: [250, 350] };
  const AI_ARTICLE_NAME = { s: '短篇 60–100 词', m: '中篇 120–180 词', l: '长篇 250–350 词' };
  function aiArticleRange() {
    const p = Store.spaceGet('article', 'prefs');
    return p && AI_ARTICLE_RANGES[p.range] ? p.range : 'm';
  }
  function aiArticleWords() {
    const set = new Set();
    if (aiSession) aiSession.steps.forEach(s => (s.words || []).forEach(w => set.add(w)));
    const log = Store.data.logs[Store.today()] || {};
    (log.newWords || []).concat(log.reviewWords || []).forEach(w => set.add(w));
    if (!set.size) aiDueWords(8).forEach(w => set.add(w));
    if (!set.size) aiNewWords(8).forEach(w => set.add(w));
    return Array.from(set).slice(0, 12);
  }
  function aiArticleCard(body) {
    const words = aiArticleWords();
    const range = aiArticleRange();
    const rec = Store.spaceGet('article', Store.today() + ':' + range);
    const shown = rec && rec.words.length ? rec.words : words;
    const card = el('div', 'ai-card');
    card.innerHTML = '<div class="ai-card-head"><span class="ai-card-title">印象文章</span><span class="exam-badge gray">' + shown.length + ' 词</span></div>' +
      '<p class="field-hint">把今天学过的词串成一篇英文短文，在语境里再过一遍。目标词高亮，点词看详解；中文译文在每段下方。</p>';
    if (shown.length) {
      const chips = el('div', 'chip-row wrap art-words');
      shown.forEach(w => chips.appendChild(el('span', 'chip static', w)));
      card.appendChild(chips);
    }
    card.appendChild(aiCfgChips('文章字数', 'art-range', Object.keys(AI_ARTICLE_RANGES).map(k => [k, AI_ARTICLE_NAME[k]]), range));
    if (!words.length) {
      card.appendChild(el('p', 'field-hint', '今天还没有学习记录。先去学习页学几个词，再来生成文章。'));
    } else if (aiBusy === 'article') {
      card.appendChild(el('p', 'ai-placeholder ai-thinking', 'AI 正在把今天的词写进文章…'));
    } else if (rec) {
      const art = el('div', 'art-body');
      const re = rec.words.length ? new RegExp('\\b(' + rec.words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?:s|es|ed|ing|d)?\\b', 'gi') : null;
      rec.paras.forEach(p => {
        const d = el('div', 'art-p');
        const en = el('div', 'art-en');
        const safe = esc(p.en);
        en.innerHTML = re ? safe.replace(re, (m, base) => '<button class="art-word" type="button" data-w="' + esc(String(base).toLowerCase()) + '">' + m + '</button>') : safe;
        d.appendChild(en);
        if (p.zh) d.appendChild(el('div', 'art-zh', p.zh));
        art.appendChild(d);
      });
      card.appendChild(art);
      card.insertAdjacentHTML('beforeend', aiNoteHtml(rec));
    } else if (aiTeachErr) {
      card.insertAdjacentHTML('beforeend', aiFailHtml(aiTeachErr));
    }
    const acts = el('div', 'exam-actions');
    const gen = el('button', 'btn-primary', rec ? '重新生成' : '生成文章'); gen.type = 'button';
    gen.dataset.aiAct = 'art-gen';
    gen.disabled = aiBusy === 'article' || !aiReady() || !words.length;
    acts.appendChild(gen);
    if (rec) {
      const del = el('button', 'btn-ghost', '删除本篇'); del.type = 'button';
      del.dataset.aiAct = 'art-del'; del.disabled = aiBusy === 'article';
      acts.appendChild(del);
    }
    card.appendChild(acts);
    if (!aiReady()) card.appendChild(el('p', 'field-hint', '接入 AI 后即可生成；文章按天与字数缓存，导出备份会一并带上。'));
    body.appendChild(card);
  }
  const AI_SYS_ARTICLE = '你是大学英语六级词汇教练。把用户给出的目标词全部自然嵌入一篇连贯有趣的英文短文（校园、科技或生活题材），每个目标词至少出现一次，允许时态/复数变形。难度适中，帮助记忆。只输出 JSON，格式 {"paras":[{"en":"英文段落","zh":"对应中文翻译"}]}，2–4 段，不要输出 JSON 以外的任何内容。';
  async function aiGenArticle() {
    if (aiBusy || !aiReady()) return;
    const words = aiArticleWords();
    if (!words.length) return;
    const range = aiArticleRange();
    const lo = AI_ARTICLE_RANGES[range][0], hi = AI_ARTICLE_RANGES[range][1];
    aiBusy = 'article'; aiTeachErr = ''; renderAiSpace();
    const user = '目标词（括号内为释义，供把握语义）：' + words.map(w => w + '（' + aiGloss(w) + '）').join('、') +
      '\n文章长度：' + lo + '–' + hi + ' 个英文单词。请输出 JSON。';
    const res = await aiSpaceChat(AI_SYS_ARTICLE, user, { jsonMode: true, temperature: 0.7 });
    aiBusy = '';
    if (res.ok) {
      const txt = res.text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      let obj = null;
      try { obj = JSON.parse(txt); } catch (e) { /* fallthrough */ }
      const paras = obj && Array.isArray(obj.paras)
        ? obj.paras.filter(p => p && typeof p.en === 'string' && p.en.trim()).slice(0, 4).map(p => ({ en: p.en.trim(), zh: String(p.zh || '').trim() }))
        : [];
      if (paras.length) {
        Store.spaceSet('article', Store.today() + ':' + range, { paras, words, range, t: Date.now(), provider: res.provider, model: res.model });
        announce('印象文章已生成');
      } else aiTeachErr = 'AI 返回格式异常，请重试';
    } else aiTeachErr = res.error;
    if (openSheetEl && openSheetEl.id === 'ai-space-sheet') renderAiSpace();
  }

  function aiStart() {
    const steps = aiBuildSteps(aiCfg());
    if (!steps.length || !aiReady()) return;
    aiSession = { date: Store.today(), steps, idx: 0, picks: {}, revealed: {}, qa: [], wrong: [], correct: 0, total: 0, startedAt: Date.now(), done: false, t: Date.now() };
    aiStage = 'session';
    aiEnterStep();
    aiSaveSession();
    renderAiSpace();
    aiFetchTeach();
  }
  function aiPick(word, opt) {
    const s = aiCurStep();
    if (!s || !aiCheck || aiSession.picks[aiPickKey(word)] != null) return;
    const q = aiCheck.find(x => x.word === word);
    if (!q || !q.options.includes(opt)) return;
    aiSession.picks[aiPickKey(word)] = opt;
    aiSession.total++;
    if (opt === q.answer) aiSession.correct++;
    else if (!aiSession.wrong.includes(word)) aiSession.wrong.push(word);
    Platform.haptic(opt === q.answer ? 'tap' : 'warn');
    aiSaveSession();
    renderAiSpace();
  }
  function aiAdvance(skip) {
    if (!aiSession) return;
    if (!skip && !aiStepComplete()) return;
    aiSession.idx++;
    if (aiSession.idx >= aiSession.steps.length) {
      aiSession.done = true;
      aiSaveSession();
      aiStage = 'done';
      renderAiSpace();
      aiGenReport();
      return;
    }
    aiEnterStep();
    aiSaveSession();
    renderAiSpace();
    aiFetchTeach();
  }
  const AI_SYS_ASK = '你是大学英语六级学习教练。用户在全屏导学的某一步中提问。用中文准确简洁回答，不超过 200 字，不用 markdown 标题；围绕当前步骤的词或材料，无关问题礼貌引回。';
  async function aiAsk() {
    const inp = $('ai-ask-input');
    const q = String((inp && inp.value) || '').trim();
    if (!q || aiBusy || !aiReady() || !aiSession) return;
    aiBusy = 'ask'; renderAiSpace();
    const s = aiCurStep() || {};
    const ctx = s.kind === 'study'
      ? '当前步骤：翻译精读 ' + (s.studyId || '')
      : '当前步骤词：' + (s.words || []).join('、');
    const prev = aiSession.qa.slice(-3).map(t => '问：' + t.q + '\n答：' + t.a).join('\n');
    const res = await aiSpaceChat(AI_SYS_ASK, [ctx, prev ? '此前问答：\n' + prev : '', '当前问题：' + q].filter(Boolean).join('\n\n'));
    aiBusy = '';
    if (res.ok) {
      aiSession.qa = aiSession.qa.concat([{ q, a: res.text, t: Date.now() }]).slice(-40);
      aiSaveSession();
      announce('回答已生成');
    } else announce('提问失败：' + res.error);
    if (openSheetEl && openSheetEl.id === 'ai-space-sheet') renderAiSpace();
  }

  function aiSpaceClick(e) {
    const aw = e.target.closest('.art-word');
    if (aw) { openWordSheet(aw.dataset.w, false, [], true); return; }
    const t = e.target.closest('[data-ai-act]');
    if (!t) return;
    const act = t.dataset.aiAct;
    if (act === 'settings') openSettings('dict');
    else if (act === 'cfg-min') { aiSaveCfg({ minutes: +t.dataset.v }); renderAiSpace(); }
    else if (act === 'cfg-focus') { aiSaveCfg({ focus: t.dataset.v }); renderAiSpace(); }
    else if (act === 'cfg-strategy') { aiSaveCfg({ strategy: t.dataset.v }); renderAiSpace(); }
    else if (act === 'art-range') { Store.spaceSet('article', 'prefs', { range: t.dataset.v, t: Date.now() }); renderAiSpace(); }
    else if (act === 'art-gen') aiGenArticle();
    else if (act === 'art-del') { Store.spaceDel('article', Store.today() + ':' + aiArticleRange()); renderAiSpace(); }
    else if (act === 'start') aiStart();
    else if (act === 'teach-retry') { aiTeachErr = ''; aiFetchTeach(); }
    else if (act === 'pick') aiPick(t.dataset.word, t.dataset.opt);
    else if (act === 'reveal') { if (aiSession) { aiSession.revealed[aiSession.idx] = true; aiSaveSession(); renderAiSpace(); } }
    else if (act === 'skip') aiAdvance(true);
    else if (act === 'next') aiAdvance(false);
    else if (act === 'ask') aiAsk();
    else if (act === 'report-view') { aiReportDate = t.dataset.date; aiStage = 'report'; renderAiSpace(); }
    else if (act === 'to-confirm') { aiStage = 'confirm'; renderAiSpace(); }
    else if (act === 'report-gen') aiGenReport();
    else if (act === 'close') closeSheet();
  }
  // ===================== init =====================
  window.addEventListener('DOMContentLoaded', async () => {
    await Store.load();
    Store.setFlushHook(scheduleMirror);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') mirrorNow(); });
    if (Platform.isNative) {
      const d = Store.data;
      const empty = !Object.keys(d.srs || {}).length && !Object.keys(d.logs || {}).length &&
        !Object.keys(d.customBooks || {}).length && !Object.keys(d.favorites || {}).length;
      if (empty) {
        const r = await Platform.storageReadMirror().catch(() => null);
        if (r && r.found) {
          try {
            const payload = JSON.parse(r.json);
            const when = r.ts ? new Date(r.ts).toLocaleString() : '';
            if (confirm('检测到卸载前的学习数据备份（' + (r.path || '共享目录') + (when ? '，更新于 ' + when : '') + '）。是否恢复？')) {
              Store.importData(payload, 'replace');
            }
          } catch (e) { console.warn('mirror restore skipped', e); }
        }
      }
    }
    applyTheme(Store.data.theme);
    applyBackground();
    wireEvents();
    $('load-retry').addEventListener('click', () => location.reload());
    const bootT0 = performance.now();
    let ds = null;
    try { ds = await Platform.loadDataset(); } catch (e) { console.error('dataset load failed', e); }
    Library.init(ds || {});
    if (Library.migrateCustomBooks(Store.data.customBooks)) Store.save();
    if (window.Themes && ds && ds.words) {
      Themes.init(ds.words, ds.cloze);
      Themes.setCustom(Store.customThemes());
    }
    if (window.Exams) {
      Exams.init(ds && ds.examManifest);
      const n = Exams.list().length;
      if (n) $('exams-entry-sub').textContent = n + ' 套六级真题 · 阅读 / 选词 / 匹配 / 写译';
    }
    if (!Library.hasData()) {
      $('load-core').hidden = true;
      $('load-fail').hidden = false;
      return;
    }
    book = activeBook();
    buildSession();
    updatePlanBar();
    renderStudy();
    renderBooks();
    const loading = $('loading');
    const firstBoot = !sessionStorage.getItem('glance.boot');
    const enter = () => {
      sessionStorage.setItem('glance.boot', '1');
      loading.classList.add('done');
      const v = $('view-study');
      v.classList.add('view-enter');
      setTimeout(() => { loading.hidden = true; }, 620);
      setTimeout(() => v.classList.remove('view-enter'), 1300);
    };
    setTimeout(enter, Math.max(0, (firstBoot ? 1250 : 400) - (performance.now() - bootT0)));
    switchView('study');
  });
})();