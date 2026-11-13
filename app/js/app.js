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
  let favGroup = '';
  let sheetWord = null;
  let sheetFamily = null;
  let sheetTheme = null;
  let lastViewKey = null;
  let cardsEntry = null;
  let subReturn = 'study';

  // quiz state: 'start' | 'session' | 'done'
  let quizScreen = 'start';
  let quizSession = null;
  let quizBuilding = false;
  let quizLastWarnings = [];

  const speak = (text, audio) => Platform.speak(text, { lang: Store.data.ttsLang || '', rate: Number(Store.data.ttsRate ?? 1), audio, preferAudio: Store.data.preferAudio !== false });

  // ===================== view router =====================
  function switchView(v) {
    currentView = v;
    const app = document.querySelector('.app');
    if (app) app.dataset.current = v;
    ['study', 'roots', 'themes', 'search', 'me', 'stats', 'books', 'ai'].forEach(name => {
      $('view-' + name).hidden = name !== v;
    });
    const tabView = (v === 'stats' || v === 'books' || v === 'ai') ? (subReturn || 'study') : v;
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === tabView));
    if (v === 'study') { updatePlanBar(); updateStudyVisibility(); }
    if (v === 'roots') { rootsTab === 'roots' ? renderRoots() : renderAffixes(); }
    if (v === 'themes') renderThemes();
    if (v === 'search') renderSearchDefault();
    if (v === 'me') renderMe();
    if (v === 'stats') renderStats();
    if (v === 'books') renderBooks();
    if (v === 'ai') renderAiLibrary();
  }
  function openSub(v) {
    if (currentView !== 'books' && currentView !== 'ai' && currentView !== 'stats') subReturn = currentView;
    switchView(v);
  }
  function backFromSub() {
    switchView(subReturn || 'study');
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
  let profileDraft = null;
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
    const quizOn = !inStudy;
    $('quiz-start').hidden = !(quizOn && quizScreen === 'start');
    $('quiz-session').hidden = !(quizOn && quizScreen === 'session');
    $('quiz-done').hidden = !(quizOn && quizScreen === 'done');
    $('grade-footer').hidden = !hasItem;
    $('mode-study').classList.toggle('active', inStudy);
    $('mode-quiz').classList.toggle('active', !inStudy);
    $('mode-study').setAttribute('aria-selected', String(inStudy));
    $('mode-quiz').setAttribute('aria-selected', String(!inStudy));
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
    updateStudyVisibility();
    const item = currentItem();
    if (!item) { renderEmpty(); return; }
    const e = item.entry;
    const viewKey = e.word + '|' + sessionIdx + '|' + ((session[0] && session[0].entry.word) || '');
    if (viewKey !== lastViewKey) { lastViewKey = viewKey; Store.recordView(e.word); }
    const st = Store.data.srs[e.word];
    const sp = Store.data.studyPanel || {};
    $('word').textContent = e.word;
    $('phonetic').textContent = e.phonetic ? '/' + e.phonetic + '/' + (e.cefr ? '  ·  ' + e.cefr : '') : (e.cefr || '');
    $('phonetic').hidden = sp.phonetic === false;
    $('speak-button').hidden = sp.phonetic === false;
    const badge = $('word-badge');
    if (item.kind === 'new') { badge.textContent = '新词'; badge.className = 'word-badge new'; }
    else if (SRS.isKnown(st)) { badge.textContent = '已掌握'; badge.className = 'word-badge known'; }
    else { badge.textContent = '复习'; badge.className = 'word-badge review'; }
    $('word-due').textContent = item.kind === 'new' ? '' : SRS.nextDueLabel(st, Date.now());
    renderMorphemes(e);
    const mn = $('word-mnemonic');
    const m = sp.mnemonic === false ? null : mnemonicText(e);
    if (m) { mn.textContent = m.text; mn.hidden = false; mn.classList.toggle('ai', m.ai); }
    else { mn.textContent = ''; mn.hidden = true; }
    const wm = $('word-meaning');
    wm.textContent = e.meaning || e.zh || '';
    wm.hidden = sp.meaning === false;
    renderStudyInfo(e);
    applyHeadOrder();
    updatePlanBar();
    const panel = $('study-panel');
    panel.classList.remove('anim'); void panel.offsetWidth; panel.classList.add('anim');
    panel.scrollTop = 0;
    renderTs = Date.now();
    if (Store.data.autoSpeak) speak(e.word, e.audio);
  }

  const PANEL_HEAD_IDS = ['phonetic', 'morphemes', 'mnemonic', 'meaning'];
  const PANEL_DETAIL_IDS = ['definitions', 'family', 'synonyms', 'derivatives', 'inflections', 'etymology', 'examples'];
  const PANEL_IDS = PANEL_HEAD_IDS.concat(PANEL_DETAIL_IDS);

  function panelOrder() {
    const saved = Array.isArray(Store.data.studyPanelOrder) ? Store.data.studyPanelOrder : [];
    const out = saved.filter((id, i) => PANEL_IDS.includes(id) && saved.indexOf(id) === i);
    PANEL_IDS.forEach(id => { if (!out.includes(id)) out.push(id); });
    return out;
  }
  function applyHeadOrder() {
    const block = document.querySelector('.word-block');
    const end = $('word-detail-btn');
    if (!block || !end) return;
    const nodes = { phonetic: $('phonetic'), morphemes: $('morphemes'), mnemonic: $('word-mnemonic'), meaning: $('word-meaning') };
    panelOrder().forEach(id => { if (nodes[id]) block.insertBefore(nodes[id], end); });
  }

  function renderStudyInfo(e) {
    const wrap = $('study-info');
    if (!wrap) return;
    wrap.innerHTML = '';
    const sp = Store.data.studyPanel || {};
    const on = k => sp[k] !== false;

    function addRow(label, node) {
      const row = el('section', 'info-row');
      row.appendChild(el('div', 'info-label', label));
      const body = el('div', 'info-body');
      body.appendChild(node);
      row.appendChild(body);
      wrap.appendChild(row);
    }
    function chipList(items) {
      const box = el('div', 'info-chips');
      items.forEach(it => {
        const chip = el(it.word ? 'button' : 'span', 'info-chip');
        if (it.word) { chip.type = 'button'; chip.addEventListener('click', () => openWordSheet(it.word)); }
        chip.appendChild(el('span', 'info-chip-main', it.main));
        if (it.sub) chip.appendChild(el('span', 'info-chip-sub', it.sub));
        box.appendChild(chip);
      });
      return box;
    }

    const builders = {
      definitions() {
        if (!on('definitions') || !(e.definitions || []).length) return;
        const list = el('div', 'info-defs');
        e.definitions.slice(0, 4).forEach(d => {
          const row = el('div', 'info-def');
          if (d[0]) row.appendChild(el('span', 'info-def-pos', d[0] + '.'));
          row.appendChild(el('span', 'info-def-text', d[1] || ''));
          list.appendChild(row);
        });
        if (e.definitions.length > 4) list.appendChild(el('div', 'info-more', '还有 ' + (e.definitions.length - 4) + ' 条'));
        addRow('英文释义', list);
      },
      family() {
        const famRoot = e.rootFamily && e.rootFamily.root;
        if (!on('family') || !famRoot) return;
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
          box.appendChild(chipList(words.slice(0, 8).map(w => ({ main: w.word, sub: w.meaning, word: w.word }))));
          if (words.length > 8) box.appendChild(el('span', 'info-more', '+' + (words.length - 8) + ' 词'));
        }
        addRow('词根家族', box);
      },
      synonyms() {
        if (!on('synonyms') || !(e.synonyms || []).length) return;
        addRow('近义词', chipList(e.synonyms.slice(0, 10).map(w => ({ main: w, word: w }))));
      },
      derivatives() {
        if (!on('derivatives') || !(e.derivatives || []).length) return;
        addRow('派生词', chipList(e.derivatives.slice(0, 8).map(d => ({
          main: d[0],
          sub: d[1] ? ({ pre: '前缀 ', suf: '后缀 ' }[d[2]] || '') + d[1] : '',
          word: d[0]
        }))));
      },
      inflections() {
        if (!on('inflections') || !(e.inflections || []).length) return;
        addRow('词形变化', chipList(e.inflections.map(w => ({ main: w }))));
      },
      etymology() {
        if (!on('etymology') || !e.etymology) return;
        addRow('词源', el('p', 'info-etymology', e.etymology));
      },
      examples() {
        if (!on('examples') || !(e.examples || []).length) return;
        const list = el('div', 'info-examples');
        e.examples.slice(0, 3).forEach(ex => {
          const line = typeof ex === 'string' ? ex : (ex && (ex.en || ex.example)) || '';
          if (line) list.appendChild(el('p', 'info-example', line));
        });
        if (list.childNodes.length) addRow('例句', list);
      }
    };

    panelOrder().forEach(id => { if (builders[id]) builders[id](); });
    wrap.hidden = !wrap.childNodes.length;
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
    const hidden = (Store.data.studyPanel || {}).morphemes === false;
    const chips = hidden ? [] : (e.morphemes || []);
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
    } else if (card.id === 'family' && card.root) {
      const a = el(interactive ? 'a' : 'div', 'card-link', card.text + (interactive ? '  →' : ''));
      if (interactive) a.addEventListener('click', () => openFamily(card.root));
      container.appendChild(a);
      if (card.etymology) container.appendChild(el('p', 'card-etymology', card.etymology));
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
    return [scope, cfg.count + ' 题', types, diff].filter(Boolean).join(' · ');
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
    ['en2zh', 'zh2en', 'cloze'].forEach(t => {
      if (!cfg.types.includes(t)) return;
      chipRow.appendChild(el('span', 'quiz-est-chip', QuizEngine.TYPE_LABEL[t] + ' ' + (info.types[t] || 0)));
    });
    box.appendChild(chipRow);
    if (info.onlineCloze) box.appendChild(el('p', 'quiz-est-note', '约 ' + info.onlineCloze + ' 个词需要联网补充例句，离线或失败时自动回退。'));
    if (!info.available) box.appendChild(el('p', 'quiz-est-warn', '当前范围没有可测试的词，换个范围或先学习一些单词。'));
    else if (info.available < cfg.count) box.appendChild(el('p', 'quiz-est-warn', '可用题量不足：预计 ' + info.available + ' 题，计划 ' + cfg.count + ' 题，可以缩小范围或减少题数。'));
    $('quiz-start-btn').disabled = !info.available || quizBuilding;
  }

  function renderQuizStart() {
    const cfg = quizCfg();
    const info = QuizEngine.estimate(cfg);
    $('quiz-start-config').textContent = quizConfigSummary();
    $('quiz-start-count').textContent = info.available
      ? '可用 ' + info.available + ' 题 · 覆盖 ' + info.pool + ' 个词'
      : '当前范围没有可测试的词';
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
    renderQuizEstimate();
  }

  async function startQuiz() {
    if (quizBuilding) return;
    const cfg = QuizEngine.buildConfig(quizCfg());
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
          answered: false, answeredCount: 0, wrong: [], done: false, startedAt: Date.now()
        };
        quizScreen = 'session';
        renderQuizScreen();
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
    const cloze = $('quiz-cloze');
    const clozeZh = $('quiz-cloze-zh');
    big.classList.toggle('quiz-prompt-zh', q.type === 'zh2en');
    if (q.type === 'cloze') {
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
    $('quiz-next').hidden = true;
    s.answered = false;
    $('quiz-session').scrollTop = 0;
    updatePlanBar();
  }

  function answerQuiz(choice) {
    const s = quizSession;
    if (!s || s.answered) return;
    const q = s.questions[s.idx];
    if (!q) return;
    const isCorrect = choice === q.correctIndex;
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
    Store.recordGrade(e.word, SRS.isNew(Store.data.srs[e.word]) ? 'new' : 'review', isCorrect ? SRS.GRADE.KNOW : SRS.GRADE.FORGOT, 0);
    Store.recordQuizResult(e.word, isCorrect, q.difficulty);
    const fb = $('quiz-feedback');
    fb.hidden = false;
    if (isCorrect) {
      fb.className = 'quiz-feedback ok';
      fb.textContent = q.type === 'cloze' ? '回答正确 · ' + q.correct : '回答正确';
      scheduleQuizAutoNext();
    } else {
      s.wrong.push({ word: e.word, correct: q.correct, type: q.type });
      fb.hidden = true;
      Store.addError(e.word);
      if (!Store.isFavorite(e.word)) Store.addFavorite(e.word, '错题');
      if (!Store.data.favGroups.includes('错题')) { Store.data.favGroups.push('错题'); Store.save(); }
      renderQuizReveal(q);
      $('quiz-next').hidden = false;
      $('quiz-next').textContent = s.idx + 1 >= s.questions.length ? '查看结果' : '继续';
    }
    if (q.type === 'cloze') {
      document.querySelector('#quiz-session .word-row').hidden = false;
      $('quiz-word').hidden = false;
      $('quiz-word').textContent = q.word;
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
    const senses = e.senses && e.senses.length ? e.senses : [{ pos: '', domain: '', gloss: e.meaning || e.zh || '' }];
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
        main.appendChild(el('span', 'quiz-wrong-sub', w.correct + ' · ' + (QuizEngine.TYPE_LABEL[w.type] || '')));
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
    Store.recordView(word);
    $('word-sheet-title').textContent = word;
    if (!e) {
      $('word-sheet-sub').textContent = '';
      const body = $('word-sheet-body');
      body.innerHTML = '<div class="empty-hint">词库中暂无该词，可尝试外部词典查询。</div>';
      if (window.Dictionary) body.appendChild(dictSection({ word }, { auto: true }));
      $('word-study-btn').disabled = true;
      openSheet('word-sheet');
      return;
    }
    $('word-study-btn').disabled = false;
    $('word-sheet-sub').textContent = (e.phonetic ? '/' + e.phonetic + '/  ' : '') + (e.cefr || '') + (e.root ? '  ·  词根 ' + e.root : '');
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
    if (window.Dictionary) body.appendChild(dictSection(e, { auto: true }));
    body.appendChild(aiSection(e, { auto: true }));
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
    content.appendChild(el('p', 'ai-placeholder', 'AI 详解未配置。请到「我的 → AI 解释」开启并填写 API Key。'));
    actions.innerHTML = '';
    const go = el('button', 'btn-ghost', '前往设置');
    go.addEventListener('click', () => { closeSheet(); openSettings('ai'); });
    actions.appendChild(go);
  }

  function dictSection(e, opts) {
    const auto = !opts || opts.auto !== false;
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
    function providerName(id) { return Dictionary.getProvider(id).name; }
    function syncTools(hasRecord) {
      refresh.disabled = loading;
      refresh.classList.toggle('spinning', loading);
      del.hidden = !hasRecord;
    }

    function render(record, cached) {
      content.innerHTML = ''; actions.innerHTML = '';
      syncTools(!!record);
      if (!record) {
        meta.textContent = providerName(Store.data.dict.provider);
        content.appendChild(el('p', 'ai-placeholder', '暂无本地缓存，点击右上角刷新图标查询词典。'));
        return;
      }
      meta.textContent = providerName(record.provider) + (cached ? ' · 本地缓存' : '') +
        (record.fallbackFrom ? ' · 有道不可用已回退' : '');
      if (record.ipa) {
        const ipaText = record.ipaUk && record.ipaUk !== record.ipa
          ? '美 /' + record.ipa + '/ · 英 /' + record.ipaUk + '/'
          : '/' + record.ipa + '/';
        content.appendChild(el('p', 'dict-ipa', ipaText));
      }
      const ownTags = new Set((e && e.tags) || []);
      const exam = ownTags.size ? [] : (record.exam || []);
      if (exam.length) {
        const tags = el('div', 'exam-tags dict-exam');
        exam.forEach(t => tags.appendChild(el('span', 'exam-tag', t)));
        content.appendChild(tags);
      }
      if (record.mnemonic) content.appendChild(el('p', 'dict-mnemonic', '助记：' + record.mnemonic));
      (record.meanings || []).forEach(m => {
        const block = el('div', 'dict-mean');
        if (m.pos) block.appendChild(el('div', 'dict-pos', m.pos));
        (m.defs || []).forEach((d, i) => {
          const row = el('div', 'dict-def');
          row.appendChild(el('span', 'dict-num', String(i + 1)));
          const txt = el('div', 'dict-def-text');
          txt.appendChild(el('span', 'dict-def-en', d.zh || d.en || ''));
          if (d.zh && d.en) txt.appendChild(el('div', 'dict-def-en2', d.en));
          if (d.example) txt.appendChild(el('div', 'dict-def-ex', d.example));
          const syn = (d.synonyms || []).join(' · ');
          if (syn) txt.appendChild(el('div', 'dict-def-syn', '近义：' + syn));
          row.appendChild(txt);
          block.appendChild(row);
        });
        content.appendChild(block);
      });
    }

    async function run(force) {
      if (loading) return;
      loading = true;
      syncTools(!!Store.dictEntry(e.word));
      content.innerHTML = ''; actions.innerHTML = '';
      meta.textContent = providerName(Store.data.dict.provider);
      content.appendChild(el('p', 'ai-placeholder', '正在查询外部词典…'));
      const res = await Dictionary.lookup(e.word, Store.data.dict, force ? { force: true } : undefined);
      loading = false;
      if (res.ok) { render(res.record, res.cached); return; }
      syncTools(!!Store.dictEntry(e.word));
      content.innerHTML = '';
      content.appendChild(el('p', 'ai-error', '查询失败：' + res.error));
      const retry = el('button', 'btn-ghost', '重试');
      retry.addEventListener('click', () => run(false));
      actions.appendChild(retry);
    }

    refresh.addEventListener('click', () => run(true));
    del.addEventListener('click', () => { Store.deleteDictEntry(e.word); render(null, false); });

    const cachedRecord = Store.dictEntry(e.word);
    if (cachedRecord) render(cachedRecord, true);
    else if (auto) run(false);
    else render(null, false);
    return sec;
  }

  function aiSection(e, opts) {
    const auto = !opts || opts.auto !== false;
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
    let autoStarted = false;

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
        const cfg = Store.data.ai;
        if (auto && !autoStarted && cfg.autoExplain && cfg.enabled && cfg.key) {
          autoStarted = true;
          generate();
          return;
        }
        const gen = el('button', 'btn-primary', '生成 AI 解释');
        gen.addEventListener('click', () => generate(gen));
        actions.appendChild(gen);
      }
    }
    async function generate(btn) {
      if (generating) return;
      const cfg = Store.data.ai;
      if (!cfg.enabled || !cfg.key) { aiConfigPrompt(content, actions); return; }
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
  const SETTINGS_PANES = {
    learn: ['学习', '每日计划与学习面板'],
    appearance: ['外观', '主题风格与学习卡片'],
    audio: ['发音', '朗读、语速与口音'],
    dict: ['词典', '外部词典与查询缓存'],
    ai: ['AI 解释', '模型、Key 与解释库'],
    data: ['数据', '导出、导入与重置'],
  };
  function renderPanelOrderUi() {
    const order = panelOrder();
    document.querySelectorAll('[data-panel-group]').forEach(box => {
      const list = box.querySelector('.panel-order');
      if (!list) return;
      const rows = new Map(Array.from(list.querySelectorAll('[data-panel-row]')).map(r => [r.dataset.panelRow, r]));
      order.forEach(id => { const row = rows.get(id); if (row) list.appendChild(row); });
    });
  }
  function savePanelOrder(ids) {
    Store.data.studyPanelOrder = ids;
    Store.save();
    renderPanelOrderUi();
    if (currentView === 'study' && mode === 'study') renderStudy();
  }
  function movePanelRow(id, dir) {
    const order = panelOrder();
    const group = PANEL_HEAD_IDS.includes(id) ? PANEL_HEAD_IDS : PANEL_DETAIL_IDS;
    const ids = order.filter(x => group.includes(x));
    const i = ids.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    const a = order.indexOf(id), b = order.indexOf(ids[j]);
    order[a] = ids[j]; order[b] = id;
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
        if (PANEL_HEAD_IDS.includes(dragId) !== PANEL_HEAD_IDS.includes(target)) return;
        const order = panelOrder();
        order.splice(order.indexOf(dragId), 1);
        order.splice(order.indexOf(target), 0, dragId);
        savePanelOrder(order);
      });
    });
  }

  function showSettingsPane(key) {
    const meta = SETTINGS_PANES[key];
    if (!meta) return;
    document.querySelectorAll('.settings-pane').forEach(p => { p.hidden = p.id !== 'pane-' + key; });
    $('settings-title').textContent = meta[0];
    $('settings-sub').textContent = meta[1];
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
    $('set-ai-auto').checked = !!ai.autoExplain;
    $('set-ai-model').value = ai.model || '';
    $('set-ai-base').value = ai.base || '';
    $('set-ai-key').value = ai.key || '';
    syncAiProviderUi();
    const dict = Store.data.dict;
    const dsel = $('set-dict-provider');
    dsel.innerHTML = '';
    Dictionary.PROVIDERS.forEach(p => { const o = el('option', null, p.name); o.value = p.id; dsel.appendChild(o); });
    dsel.value = dict.provider || 'freezh';
    $('set-dict-key').value = dict.key || '';
    $('set-dict-base').value = dict.base || '';
    syncDictProviderUi();
    const meta = Library.getMeta();
    $('about-info').textContent = 'Glance · 词根背单词 · ' + (meta.counts ? meta.counts.words : 0) + ' 词 / ' + (meta.counts ? meta.counts.roots : 0) + ' 词根';
    showSettingsPane(pane);
    openSheet('settings-sheet');
  }
  function syncAiProviderUi() {
    const p = AI.getProvider($('set-ai-provider').value);
    $('set-ai-base-wrap').hidden = !p.custom;
    $('set-ai-model').placeholder = p.model || '模型名称';
    $('set-ai-model-hint').textContent = p.model ? '留空使用默认：' + p.model : '请填写模型名称';
  }
  function syncDictProviderUi() {
    const p = Dictionary.getProvider($('set-dict-provider').value);
    $('set-dict-key-wrap').hidden = !(p.needKey || p.custom);
    $('set-dict-base-wrap').hidden = !p.custom;
    $('set-dict-hint').textContent = p.hint;
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
    $('sheet-backdrop').addEventListener('click', () => closeSheet());
    document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeSheet()));

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

    $('mode-study').addEventListener('click', () => setMode('study'));
    $('mode-quiz').addEventListener('click', () => setMode('quiz'));
    $('word-detail-btn').addEventListener('click', () => { const it = currentItem(); if (it) openWordSheet(it.entry.word); });
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
    document.querySelectorAll('[data-panel]').forEach(cb => cb.addEventListener('change', () => {
      Store.data.studyPanel[cb.dataset.panel] = cb.checked;
      Store.save();
      if (currentView === 'study' && mode === 'study') renderStudy();
    }));
    $('books-back').addEventListener('click', backFromSub);
    $('set-ai-enabled').addEventListener('change', () => Store.setAiConfig({ enabled: $('set-ai-enabled').checked }));
    $('set-ai-auto').addEventListener('change', () => Store.setAiConfig({ autoExplain: $('set-ai-auto').checked }));
    $('set-ai-provider').addEventListener('change', () => { Store.setAiConfig({ provider: $('set-ai-provider').value }); syncAiProviderUi(); });
    $('set-ai-model').addEventListener('change', () => Store.setAiConfig({ model: $('set-ai-model').value.trim() }));
    $('set-ai-base').addEventListener('change', () => Store.setAiConfig({ base: $('set-ai-base').value.trim() }));
    $('set-ai-key').addEventListener('change', () => Store.setAiConfig({ key: $('set-ai-key').value.trim() }));
    $('set-ai-library').addEventListener('click', () => { closeSheet(); openSub('ai'); });
    $('set-dict-provider').addEventListener('change', () => { Store.setDictConfig({ provider: $('set-dict-provider').value }); syncDictProviderUi(); });
    $('set-dict-key').addEventListener('change', () => Store.setDictConfig({ key: $('set-dict-key').value.trim() }));
    $('set-dict-base').addEventListener('change', () => Store.setDictConfig({ base: $('set-dict-base').value.trim() }));
    $('ai-back').addEventListener('click', backFromSub);
    $('ai-export').addEventListener('click', async () => {
      const btn = $('ai-export'); btn.disabled = true;
      const r = await AI.exportCache();
      btn.disabled = false;
      if (!r.ok && r.error) { btn.textContent = r.error; setTimeout(() => { btn.textContent = '导出全部'; }, 2200); }
    });
    $('set-test-speak').addEventListener('click', () => speak('hello'));
    $('set-card-reset').addEventListener('click', () => { Store.data.cardOrder = Store.defaultCardOrder(); Store.save(); if (cardsEntry) renderCards(cardsEntry); });
    $('set-panel-reset').addEventListener('click', () => savePanelOrder(PANEL_IDS.slice()));
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
    applyTheme(Store.data.theme);
    applyBackground();
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