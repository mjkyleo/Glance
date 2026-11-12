// Glance study app core (memorize mode). Shared by Electron + Capacitor/browser.
(function () {
  const $ = id => document.getElementById(id);
  const wordEl = $('word'), phoneticEl = $('phonetic'), morphEl = $('morphemes'),
    cardsEl = $('cards'), libNameEl = $('lib-name'),
    progressText = $('progress-text'), progressFill = $('progress-fill');
  const studyView = $('study-view'), quizView = $('quiz-view'), appFooter = $('app-footer');

  let library = null;
  let entries = [];
  let index = 0;
  let learned = new Set();
  let shuffle = false;
  let mode = 'study';
  let cardOrder = ['meaning', 'family', 'synonyms', 'antonyms', 'examples', 'collocations'];
  let settings = {};

  // ---- TTS ----
  const TTS = (() => {
    let voices = [];
    const refresh = () => { voices = window.speechSynthesis ? (speechSynthesis.getVoices() || []) : []; };
    refresh();
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = refresh;
    function detect(text) {
      if (/[぀-ヿ]/.test(text)) return 'ja-JP';
      if (/[가-힯]/.test(text)) return 'ko-KR';
      if (/[一-鿿]/.test(text)) return 'zh-CN';
      return null;
    }
    function speak(text) {
      if (!text || !window.speechSynthesis) return;
      const lang = detect(text) || settings.ttsLang || 'en-US';
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      const lc = lang.toLowerCase();
      const v = voices.find(x => (x.lang || '').toLowerCase() === lc) ||
        voices.find(x => (x.lang || '').toLowerCase().startsWith(lc.split('-')[0]));
      if (v) u.voice = v;
      u.rate = Number(settings.ttsRate ?? 1);
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    }
    return { speak };
  })();

  // ---- persistence ----
  async function persist() {
    settings.learned = Array.from(learned);
    settings.cardOrder = cardOrder;
    await Platform.saveSettings(settings);
  }

  // ---- library ----
  function applyLibrary(lib) {
    library = lib;
    const all = lib.entries;
    entries = all.filter(w => !learned.has(w.word));
    if (shuffle) entries = shuffled(entries);
    index = 0;
    libNameEl.textContent = lib.name;
    render();
  }
  function shuffled(a) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
  }
  async function loadBundled() {
    try {
      const text = await Platform.loadBundledLibrary();
      applyLibrary(Library.parse(text, '六级词库（默认）'));
    } catch (e) { console.error('bundled library failed', e); }
  }
  async function pickLibrary() {
    const r = await Platform.pickLibrary();
    if (!r) return;
    try { applyLibrary(Library.parse(r.text, r.name)); }
    catch (e) { alert('词库解析失败 / Failed to parse library: ' + e.message); }
  }

  // ---- render ----
  function render() {
    if (!entries.length) {
      wordEl.textContent = 'All Done!';
      phoneticEl.textContent = '';
      morphEl.innerHTML = '';
      cardsEl.innerHTML = '<div class="card"><div class="card-body">加载词库或重置已掌握 / Load a library or reset learned.</div></div>';
      progressText.textContent = '';
      progressFill.style.width = '0';
      if (mode === 'quiz') renderQuizPreview();
      return;
    }
    const e = entries[index];
    wordEl.textContent = e.word;
    phoneticEl.textContent = e.phonetic ? '/' + e.phonetic + '/' + (e.cefr ? '  ·  ' + e.cefr : '') : (e.cefr || '');
    renderMorphemes(e);
    renderCards(e);
    progressText.textContent = (index + 1) + ' / ' + entries.length;
    progressFill.style.width = (((index + 1) / entries.length) * 100) + '%';
    studyView.classList.remove('anim'); void studyView.offsetWidth; studyView.classList.add('anim');
    if (mode === 'quiz') renderQuizPreview();
  }

  function renderMorphemes(e) {
    morphEl.innerHTML = '';
    const chips = e.morphemes || [];
    if (!chips.length) { morphEl.style.display = 'none'; return; }
    morphEl.style.display = '';
    chips.forEach((c, i) => {
      if (i > 0) { const plus = document.createElement('span'); plus.className = 'morph-plus'; plus.textContent = '+'; morphEl.appendChild(plus); }
      const chip = document.createElement('button');
      chip.className = 'morph morph-' + c.type;
      chip.type = 'button';
      const t = document.createElement('span'); t.className = 'morph-text'; t.textContent = c.text;
      chip.appendChild(t);
      if (c.gloss) { const g = document.createElement('span'); g.className = 'morph-gloss'; g.textContent = c.gloss; chip.appendChild(g); }
      chip.addEventListener('click', () => flashFamily());
      morphEl.appendChild(chip);
    });
  }

  function flashFamily() {
    const el = cardsEl.querySelector('[data-card="family"]');
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }

  function orderedCards(e) {
    const avail = Library.buildCards(e);
    const map = new Map(avail.map(c => [c.id, c]));
    const out = [];
    for (const id of cardOrder) if (map.has(id)) { out.push(map.get(id)); map.delete(id); }
    for (const c of map.values()) out.push(c);
    return out;
  }

  function renderCards(e) {
    cardsEl.innerHTML = '';
    orderedCards(e).forEach(card => {
      const el = document.createElement('section');
      el.className = 'card';
      el.dataset.card = card.id;
      el.draggable = true;

      const head = document.createElement('div'); head.className = 'card-head';
      const grip = document.createElement('span'); grip.className = 'grip'; grip.textContent = '⠿'; grip.title = '拖动排序';
      const title = document.createElement('span'); title.className = 'card-title'; title.textContent = card.title;
      const ops = document.createElement('span'); ops.className = 'card-ops';
      const up = document.createElement('button'); up.className = 'op'; up.textContent = '↑'; up.title = '上移';
      const down = document.createElement('button'); down.className = 'op'; down.textContent = '↓'; down.title = '下移';
      up.addEventListener('click', () => moveCard(card.id, -1));
      down.addEventListener('click', () => moveCard(card.id, 1));
      ops.append(up, down);
      head.append(grip, title, ops);

      const body = document.createElement('div'); body.className = 'card-body';
      if (card.kind === 'list') {
        const ul = document.createElement('ul');
        card.items.forEach(it => { const li = document.createElement('li'); li.textContent = it; ul.appendChild(li); });
        body.appendChild(ul);
      } else {
        body.textContent = card.text;
      }
      el.append(head, body);
      wireDrag(el);
      cardsEl.appendChild(el);
    });
  }

  function moveCard(id, dir) {
    const e = entries[index]; if (!e) return;
    const ids = orderedCards(e).map(c => c.id);
    const i = ids.indexOf(id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    cardOrder = ids;
    persist();
    renderCards(e);
  }

  // drag & drop reorder
  let dragId = null;
  function wireDrag(el) {
    el.addEventListener('dragstart', ev => { dragId = el.dataset.card; el.classList.add('dragging'); ev.dataTransfer.effectAllowed = 'move'; });
    el.addEventListener('dragend', () => { dragId = null; el.classList.remove('dragging'); });
    el.addEventListener('dragover', ev => { ev.preventDefault(); });
    el.addEventListener('drop', ev => {
      ev.preventDefault();
      const target = el.dataset.card;
      if (!dragId || dragId === target) return;
      const e = entries[index]; if (!e) return;
      const ids = orderedCards(e).map(c => c.id);
      const from = ids.indexOf(dragId), to = ids.indexOf(target);
      ids.splice(from, 1); ids.splice(to, 0, dragId);
      cardOrder = ids; persist(); renderCards(e);
    });
  }

  // ---- mode switch + quiz preview (UI only, no grading) ----
  function setMode(m) {
    mode = m;
    const study = m === 'study';
    studyView.hidden = !study;
    quizView.hidden = study;
    appFooter.hidden = !study;
    $('mode-study').classList.toggle('active', study);
    $('mode-quiz').classList.toggle('active', !study);
    $('mode-study').setAttribute('aria-selected', String(study));
    $('mode-quiz').setAttribute('aria-selected', String(!study));
    if (!study) renderQuizPreview();
  }

  function renderQuizPreview() {
    const qw = $('quiz-word'), qp = $('quiz-phonetic'), qo = $('quiz-options');
    if (!entries.length) {
      qw.textContent = '—'; qp.textContent = '';
      qo.innerHTML = '<div class="card"><div class="card-body">加载词库后即可预览测试题型。</div></div>';
      return;
    }
    const e = entries[index];
    qw.textContent = e.word;
    qp.textContent = e.phonetic ? '/' + e.phonetic + '/' : '';
    const correct = e.meaning || '（暂无释义）';
    const pool = entries.filter(x => x.word !== e.word && x.meaning).map(x => x.meaning);
    const meanings = Array.from(new Set(pool)).filter(m => m !== correct);
    for (let i = meanings.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [meanings[i], meanings[j]] = [meanings[j], meanings[i]]; }
    const opts = [correct].concat(meanings.slice(0, 3));
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; }
    qo.innerHTML = '';
    const keys = ['A', 'B', 'C', 'D'];
    opts.forEach((text, i) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'quiz-option';
      const k = document.createElement('span'); k.className = 'opt-key'; k.textContent = keys[i] || '';
      const t = document.createElement('span'); t.textContent = text;
      b.append(k, t);
      b.addEventListener('click', () => {
        qo.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
        b.classList.add('selected');
      });
      qo.appendChild(b);
    });
  }

  // ---- navigation ----
  function next() { if (!entries.length) return; index = (index + 1) % entries.length; render(); }
  function prev() { if (!entries.length) return; index = (index - 1 + entries.length) % entries.length; render(); }
  function markLearned() {
    if (!entries.length) return;
    learned.add(entries[index].word);
    entries.splice(index, 1);
    if (index >= entries.length) index = 0;
    persist(); render();
  }
  function toggleShuffle() {
    shuffle = !shuffle;
    $('shuffle-button').classList.toggle('active', shuffle);
    if (!entries.length) return;
    entries = shuffle ? shuffled(entries) : entries.slice();
    index = 0; render();
  }

  // ---- init ----
  window.addEventListener('DOMContentLoaded', async () => {
    settings = (await Platform.getSettings()) || {};
    learned = new Set(settings.learned || []);
    if (Array.isArray(settings.cardOrder) && settings.cardOrder.length) cardOrder = settings.cardOrder;

    $('next-button').addEventListener('click', next);
    $('prev-button').addEventListener('click', prev);
    $('learned-button').addEventListener('click', markLearned);
    $('speak-button').addEventListener('click', () => entries.length && TTS.speak(entries[index].word));
    $('shuffle-button').addEventListener('click', toggleShuffle);
    $('lib-button').addEventListener('click', pickLibrary);
    $('mode-study').addEventListener('click', () => setMode('study'));
    $('mode-quiz').addEventListener('click', () => setMode('quiz'));
    const ob = $('overlay-button');
    if (Platform.isElectron) ob.addEventListener('click', () => Platform.openOverlay());
    else ob.style.display = 'none';

    document.addEventListener('keydown', ev => {
      if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
      const tag = (ev.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea') return;
      if (ev.key === 'ArrowRight' || ev.key === ' ') { ev.preventDefault(); next(); }
      else if (ev.key === 'ArrowLeft') { ev.preventDefault(); prev(); }
      else if (ev.key === 's' || ev.key === 'S') entries.length && TTS.speak(entries[index].word);
      else if (ev.key === 'l' || ev.key === 'L') markLearned();
    });

    await loadBundled();
  });
})();