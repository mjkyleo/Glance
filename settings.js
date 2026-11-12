const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

let userDataPath = '';
let learnedWordsPath = '';

function safeParseJSON(text, fallback) {
  try { if (typeof text !== 'string' || text.trim() === '') return fallback; return JSON.parse(text); }
  catch { return fallback; }
}

window.addEventListener('DOMContentLoaded', async () => {
  // DOM
  const h1El = document.querySelector('h1');
  const sectionHeads = document.querySelectorAll('.settings-section > h2');
  const labelFontFamily = document.querySelector('label[for="font-family-input"]');
  const labelFontSize   = document.querySelector('label[for="font-size-input"]');
  const labelWordColor  = document.querySelector('label[for="word-color-input"]');
  const labelFontColor  = document.querySelector('label[for="font-color-input"]');
  const labelExampleColor = document.querySelector('label[for="example-color-input"]');
  const labelTimer      = document.querySelector('label[for="timer-input"]');
  const saveButton      = document.getElementById('save-button');
  const learnedListContainer = document.getElementById('learned-list-container');

  const languageSelect  = document.getElementById('language-select');   // ★ 新增
  const fontFamilyInput = document.getElementById('font-family-input');
  const fontSizeInput   = document.getElementById('font-size-input');
  const wordColorInput  = document.getElementById('word-color-input');
  const fontColorInput  = document.getElementById('font-color-input');
  const exampleColorInput = document.getElementById('example-color-input');
  const timerInput      = document.getElementById('timer-input');
  const autoSpeakInput  = document.getElementById('auto-speak');
  const ttsRateInput    = document.getElementById('tts-rate');
  const ttsRateValue    = document.getElementById('tts-rate-value');
  const ttslanguageSelect = document.getElementById('tts-lang');
  const voicesList       = document.getElementById('voices-list');
  const voicesNote       = document.getElementById('voices-note');
  const voicesRefreshBtn = document.getElementById('voices-refresh');

  // 语言/设置
  let settings = await ipcRenderer.invoke('get-settings');
  const sysLang = (navigator.language || 'en').toLowerCase();
  // 只接受 en / zh（旧配置里的 'ko' 会回落到系统默认）
  let lang = (settings.language === 'zh' || settings.language === 'en')
    ? settings.language
    : (sysLang.startsWith('zh') ? 'zh' : 'en');

  const trMap = {
    en: {
      pageTitle: 'Settings',
      sections: ['Language', 'Appearance', 'Behavior', 'Learned Words'],
      languageLabel: 'Interface Language',
      fontFamily: 'Font Family',
      fontSize: 'Word Font Size (px)',
      wordColor: 'Word Color',
      fontColor: 'Meaning Color',
      exampleColor: 'Example Color',
      timer: 'Word Interval (seconds)',
      autoSpeak: 'Auto Speak',
      speechRate: 'Speech Rate',
      ttsLangLabel: 'TTS Language',
      voicesHdr: 'Available Voices',
      voicesRefresh: 'Refresh',
      voicesNone: 'No voices detected yet. They usually appear a few seconds after opening this window.',
      hintMissingTpl: (code) => `No installed voice for "${code}". On Windows: Settings → Time & Language → Speech → Add voices.`,
      save: 'Save and Apply',
      noLearned: 'No words marked as learned yet.',
      errorLearned: 'Error loading learned words.',
      remove: 'Remove'
    },
    zh: {
      pageTitle: '设置',
      sections: ['语言', '外观', '行为', '已掌握单词'],
      languageLabel: '界面语言',
      fontFamily: '字体',
      fontSize: '单词字号(px)',
      wordColor: '单词颜色',
      fontColor: '释义颜色',
      exampleColor: '例句颜色',
      timer: '切换间隔(秒)',
      autoSpeak: '自动朗读',
      speechRate: '朗读语速',
      ttsLangLabel: 'TTS 语言',
      voicesHdr: '可用语音',
      voicesRefresh: '刷新',
      voicesNone: '暂未检测到语音，刚打开此窗口时可能要等几秒才会出现。',
      hintMissingTpl: (code) => `所选语言("${code}")没有安装语音。Windows: 设置 → 时间和语言 → 语音 → 添加语音。`,
      save: '保存并应用',
      noLearned: '还没有标记为已掌握的单词。',
      errorLearned: '读取已掌握单词列表失败。',
      remove: '删除'
    }
  };

  async function waitForVoicesReady(maxWait = 4000) {
  // 先调用一次，触发语音加载
  try { window.speechSynthesis.getVoices(); } catch {}
  const start = Date.now();
  return await new Promise((resolve) => {
    const tick = () => {
      const ready = (window.speechSynthesis.getVoices() || []).length > 0;
      if (ready) return resolve(true);
      if (Date.now() - start >= maxWait) return resolve(false);
      setTimeout(tick, 100);
    };
    tick();
  });
}

  function applyTexts() {
    const tr = trMap[lang];
    document.title = tr.pageTitle;
    if (h1El) h1El.textContent = tr.pageTitle;

    // 分区标题顺序: Language(新增)、Appearance、Behavior、Learned
    if (sectionHeads[0]) sectionHeads[0].textContent = tr.sections[0];
    if (sectionHeads[1]) sectionHeads[1].textContent = tr.sections[1];
    if (sectionHeads[2]) sectionHeads[2].textContent = tr.sections[2];
    if (sectionHeads[3]) sectionHeads[3].textContent = tr.sections[3];

    // 标签
    document.querySelector('label[for="language-select"]').textContent = tr.languageLabel;
    labelFontFamily.textContent = tr.fontFamily;
    labelFontSize.textContent   = tr.fontSize;
    labelWordColor.textContent  = tr.wordColor;
    labelFontColor.textContent  = tr.fontColor;
    labelExampleColor.textContent = tr.exampleColor;
    labelTimer.textContent      = tr.timer;
    document.querySelector('label[for="auto-speak"]').textContent = tr.autoSpeak;
    document.getElementById('tts-rate-label').textContent = tr.speechRate;
    document.querySelector('label[for="tts-lang"]').textContent = tr.ttsLangLabel;
    saveButton.textContent      = tr.save;
    document.getElementById('voices-title').textContent = tr.voicesHdr;
    document.getElementById('voices-refresh').textContent = tr.voicesRefresh;
  }




  // userData 路径
  try { userDataPath = await ipcRenderer.invoke('get-userData-path'); }
  catch { userDataPath = __dirname; }
  learnedWordsPath = path.join(userDataPath, 'learned.json');

  // 填充设置值
  languageSelect.value = (lang === 'zh' ? 'zh' : 'en');
  fontFamilyInput.value = settings.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  fontSizeInput.value   = Number(settings.fontSize ?? 24);
  wordColorInput.value  = settings.wordColor || '#61afef';
  fontColorInput.value  = settings.fontColor || '#abb2bf';
  exampleColorInput.value = settings.exampleColor || '#c8ccd4';
  timerInput.value      = Number(settings.timerSeconds ?? 10);
  autoSpeakInput.checked = !!settings.autoSpeak;
  ttsRateInput.value    = Number(settings.ttsRate ?? 1.0);
  ttsRateValue.textContent = `${Number(ttsRateInput.value).toFixed(1)}×`;
  ttslanguageSelect.value = settings.ttsLang || '';

  // 应用文案
  applyTexts();

  await waitForVoicesReady();
  renderVoicesList();
  updateMissingHint();

  // 加载已掌握列表
  loadLearnedWords();

  // 切换语言时立即生效(并记住)
  languageSelect.addEventListener('change', () => {
    lang = languageSelect.value === 'zh' ? 'zh' : 'en';  // 'en' | 'zh'
    applyTexts();                                        // 立即刷新当前窗口文案
    ipcRenderer.send('set-language', lang);              // 通知主进程保存并同步
  });

  // 删除已掌握单词
  learnedListContainer.addEventListener('click', (e) => {
    const btn = e.target;
    if (!btn.classList.contains('remove-learned-btn')) return;
    const w = btn.dataset.word;
    try {
      const raw = fs.existsSync(learnedWordsPath) ? fs.readFileSync(learnedWordsPath, 'utf-8') : '[]';
      const arr = safeParseJSON(raw, []);
      const set = new Set(arr);
      if (set.delete(w)) {
        fs.writeFileSync(learnedWordsPath, JSON.stringify(Array.from(set), null, 2));
        ipcRenderer.send('learned-words-updated');
        loadLearnedWords();
      }
    } catch (err) {
      console.error('Failed to remove word:', err);
    }
  });

  // 保存
  saveButton.addEventListener('click', () => {
    const newSettings = {
      fontFamily: fontFamilyInput.value,
      fontSize: parseInt(fontSizeInput.value, 10),
      wordColor: wordColorInput.value,
      fontColor: fontColorInput.value,
      exampleColor: exampleColorInput.value,
      timerSeconds: parseInt(timerInput.value, 10),
      autoSpeak: autoSpeakInput.checked,
      ttsRate: Number(ttsRateInput.value),
      ttsLang: ttslanguageSelect.value || '',
      language: lang
    };
    ipcRenderer.send('save-settings', newSettings);
    window.close();
  });

  function getVoicesSafe() {
    try { return window.speechSynthesis.getVoices() || []; }
    catch { return []; }
  }

  function renderVoicesList() {
    const tr = trMap[lang];
    const voices = getVoicesSafe();
    voicesList.innerHTML = '';

     // ✅ 还没加载完就先把提示藏起来
  if (!voices.length) {
    voicesNote.textContent = '';
    voicesNote.style.display = 'none';
    return;
  }
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.padding = '0';
    ul.style.margin = '0';

    voices.forEach(v => {
      const li = document.createElement('li');
      li.style.padding = '2px 0';
      li.textContent = `${v.name} — ${v.lang}${v.default ? ' (default)' : ''}`;
      ul.appendChild(li);
    });
    voicesList.appendChild(ul);
  }

  function updateMissingHint() {
  const tr = trMap[lang];
  const code = (ttslanguageSelect.value || 'en-US').trim();

  const voices = getVoicesSafe();
  if (!voices.length) {                // ← 未加载: 隐藏提示
    voicesNote.textContent = '';
    voicesNote.style.display = 'none';
    return;
  }

  if (!code) { voicesNote.textContent = ''; voicesNote.style.display = 'none'; return; }

  const lc = code.toLowerCase();
  const has = voices.some(v => {
    const L = (v.lang || '').toLowerCase();
    return L === lc || L.startsWith(lc.split('-')[0]);
  });

  if (has) {
    voicesNote.textContent = '';
    voicesNote.style.display = 'none';
  } else {
    voicesNote.textContent = tr.hintMissingTpl(code);
    voicesNote.style.display = '';
  }
}

  function loadLearnedWords() {
    learnedListContainer.innerHTML = '';
    const tr = trMap[lang];

    try {
      if (!fs.existsSync(learnedWordsPath)) {
        learnedListContainer.innerHTML = `<p>${tr.noLearned}</p>`;
        return;
      }
      const raw = fs.readFileSync(learnedWordsPath, 'utf-8');
      const arr = safeParseJSON(raw, []);
      const set = new Set(arr);

      if (set.size === 0) {
        learnedListContainer.innerHTML = `<p>${tr.noLearned}</p>`;
        return;
      }

      Array.from(set).sort((a, b) => a.localeCompare(b)).forEach(word => {
        const item = document.createElement('div');
        item.className = 'learned-item';
        item.innerHTML = `
          <span class="learned-term">${word}</span>
          <button class="remove-learned-btn" data-word="${word}">${tr.remove}</button>
        `;
        learnedListContainer.appendChild(item);
      });
    } catch (e) {
      console.error('Could not load or parse learned.json', e);
      learnedListContainer.innerHTML = `<p>${tr.errorLearned}</p>`;
    }
  }
  voicesRefreshBtn?.addEventListener('click', () => {
    // 某些环境下 getVoices 是延迟加载的 → 稍等再渲染一次
    renderVoicesList();
    setTimeout(() => { renderVoicesList(); updateMissingHint(); }, 300);
  });

  // ▼ TTS 语言变化时刷新提示
  ttslanguageSelect?.addEventListener('change', updateMissingHint);

  // ▼ 语速滑块实时更新数值
  ttsRateInput?.addEventListener('input', () => {
    ttsRateValue.textContent = `${Number(ttsRateInput.value).toFixed(1)}×`;
  });

  // ▼ Chromium 语音列表加载完成事件
  window.speechSynthesis?.addEventListener?.('voiceschanged', () => {
  renderVoicesList();
  updateMissingHint();
});


});

const closeBtn = document.getElementById('win-close');
if (closeBtn && process.platform !== 'darwin') closeBtn.style.display = 'none';

document.getElementById('win-close')?.addEventListener('click', () => {
  ipcRenderer.send('close-settings-window');
});