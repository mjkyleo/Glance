const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');


 

window.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements

  const container = document.querySelector('.container');  // ★ 新增
  const wordArea = document.getElementById('word-area');
  const wordEl = document.getElementById('word');
  const meaningEl = document.getElementById('meaning');
  const exampleEl = document.getElementById('example');
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const learnedCheckbox = document.getElementById('learned-checkbox');
  const loadButton = document.getElementById('load-button');
  const prevButton = document.getElementById('prev-button');
  const nextButton = document.getElementById('next-button');
  const modeButton = document.getElementById('mode-button');
  const editButton = document.getElementById('edit-button');
  const settingsButton = document.getElementById('settings-button');
  const helpButton = document.getElementById('help-button');
  const speakButton = document.getElementById('speak-button');
  const shuffleButton = document.getElementById('shuffle-button');
  const quizButton = document.getElementById('quiz-button');
 


  // 获取 userData 路径（主进程没有 handler 时回退到 __dirname）
  let userDataPath = __dirname;
  try {
    const p = await ipcRenderer.invoke('get-userData-path');
    if (p) userDataPath = p;
  } catch (_) { /* fallback to __dirname */ }
  const learnedWordsPath = path.join(userDataPath, 'learned.json');

  // State
  let words = [];
  let learnedWords = new Set();
  let currentFilePath = null;
  let currentIndex = 0;
  let timer = null;
  let settings = {};
  let isHovered = false;
  let shuffle = false;
  let quizMode = false;
  let revealed = false;

  
  if (speakButton) speakButton.addEventListener('click', () => {
  if (words.length > 0) TTS.speak(words[currentIndex].word);
});

  
 

  // --- SETTINGS ---

async function initialize() {
  loadLearnedWords();
  const initialSettings = await ipcRenderer.invoke('get-settings');
  await applySettings(initialSettings);

  const lastPath = initialSettings.lastFilePath;
  if (lastPath && fs.existsSync(lastPath)) {
    try {
      const content = fs.readFileSync(lastPath, 'utf-8');
      currentFilePath = lastPath;
      loadAndFilterWords(content);
    } catch (e) {
      console.error('Auto-load last file failed:', e);
    }
  }
}


  async function applySettings(newSettings) {
    settings = newSettings || {};
    document.body.style.setProperty('--font-family', settings.fontFamily || "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif");
    document.body.style.setProperty('--font-size', `${settings.fontSize ?? 24}px`);
    document.body.style.setProperty('--word-color', settings.wordColor || '#61afef');
    document.body.style.setProperty('--font-color', settings.fontColor || '#abb2bf');
    document.body.style.setProperty('--example-color', settings.exampleColor || '#c8ccd4');
    resetTimer(); // 重置计时器
  }

  // --- DATA HANDLING ---
  function loadLearnedWords() {
    try {
      if (fs.existsSync(learnedWordsPath)) {
        learnedWords = new Set(JSON.parse(fs.readFileSync(learnedWordsPath, 'utf-8')));
      }
    } catch (error) {
      console.error('Error loading learned words:', error);
      learnedWords = new Set();
    }
  }

  function saveLearnedWords() {
    try {
      fs.writeFileSync(learnedWordsPath, JSON.stringify(Array.from(learnedWords), null, 2));
      //ipcRenderer.send('learned-words-updated');
    } catch (error) {
      console.error('Error saving learned words:', error);
    }
  }

  // --- UI & WORD DISPLAY ---
  function displayWord() {
    if (words.length === 0) {
      wordEl.textContent = 'All Done!';
      meaningEl.textContent = 'Load a new file or restart.';
      meaningEl.classList.remove('hidden-meaning');
      if (exampleEl) exampleEl.style.display = 'none';
      if (timer) clearInterval(timer);
      if (speakButton) speakButton.disabled = true;
      updateProgress();
      return;
    }
    const current = words[currentIndex];
    wordEl.textContent = current.word;

    const hideMeaning = quizMode && !revealed;
    meaningEl.textContent = hideMeaning ? '· · ·' : current.meaning;
    meaningEl.classList.toggle('hidden-meaning', hideMeaning);

    if (exampleEl) {
      if (!hideMeaning && current.example && current.example.length > 0) {
        exampleEl.textContent = current.example;
        exampleEl.style.display = '';
      } else {
        exampleEl.textContent = '';
        exampleEl.style.display = 'none';
      }
    }
    learnedCheckbox.checked = false;
    if (speakButton) speakButton.disabled = false;
    updateProgress();
    triggerFade();
  }

  function updateProgress() {
    const total = words.length;
    if (progressText) progressText.textContent = total ? `${currentIndex + 1} / ${total}` : '';
    if (progressFill) progressFill.style.width = total ? `${((currentIndex + 1) / total) * 100}%` : '0';
  }

  function triggerFade() {
    if (!wordArea) return;
    wordArea.classList.remove('animate');
    void wordArea.offsetWidth;
    wordArea.classList.add('animate');
  }

  function autoSpeak() {
    if (settings.autoSpeak && words.length > 0) TTS.speak(words[currentIndex].word);
  }

  function resetTimer() {
    if (timer) clearInterval(timer);
    const sec = Number(settings.timerSeconds || 10);
    if (words.length > 0 && sec > 0 && !isHovered) {
      timer = setInterval(showNextWord, sec * 1000);
    }
  }

  function showNextWord() {
    if (words.length === 0) return;
    currentIndex = (currentIndex + 1) % words.length;
    revealed = false;
    displayWord();
    resetTimer();
    autoSpeak();
  }

  function showPrevWord() {
    if (words.length === 0) return;
    currentIndex = (currentIndex - 1 + words.length) % words.length;
    revealed = false;
    displayWord();
    resetTimer();
    autoSpeak();
  }

  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function loadAndFilterWords(fileContent) {
    const allWords = fileContent
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map((line, order) => {
      // 单词 ↹ 释义 [↹ 例句]（第 3 列可选）
      const parts = line.split('\t');
      const word = (parts[0] || '').trim();
      const meaning = (parts[1] || '').trim();
      const example = (parts[2] || '').trim(); // 没有就是空字符串
      return { word, meaning, example, order };
    });

  loadLearnedWords();
  const filtered = allWords.filter(w => w.word && !learnedWords.has(w.word));
  words = shuffle ? shuffled(filtered) : filtered;

  editButton.disabled = false;
  revealed = false;
  if (words.length > 0) {
    currentIndex = 0;
    displayWord();
    resetTimer();
    autoSpeak();
  } else {
    wordEl.textContent = 'All learned!';
    meaningEl.textContent = 'Every word in this file is learned.';
    meaningEl.classList.remove('hidden-meaning');
    exampleEl.style.display = 'none';
    if (speakButton) speakButton.disabled = true;
    if (timer) clearInterval(timer);
    updateProgress();
  }
}

  function markCurrentLearned() {
    if (words.length === 0) return;
    const learnedWord = words[currentIndex].word;
    learnedWords.add(learnedWord);
    saveLearnedWords();

    words.splice(currentIndex, 1);
    if (currentIndex >= words.length) currentIndex = 0;

    revealed = false;
    displayWord();
    resetTimer();
  }

  function toggleShuffle() {
    shuffle = !shuffle;
    shuffleButton.classList.toggle('active', shuffle);
    if (words.length === 0) return;
    words = shuffle ? shuffled(words) : words.slice().sort((a, b) => a.order - b.order);
    currentIndex = 0;
    revealed = false;
    displayWord();
    resetTimer();
  }

  function toggleQuiz() {
    quizMode = !quizMode;
    revealed = false;
    quizButton.classList.toggle('active', quizMode);
    wordArea.classList.toggle('quiz', quizMode);
    displayWord();
  }

  function revealMeaning() {
    if (!quizMode || words.length === 0) return;
    revealed = true;
    displayWord();
  }

  // --- EVENT LISTENERS ---
  loadButton.addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('dialog:openFile');
    if (!result || !result.filePath) return;

    currentFilePath = result.filePath;
    loadAndFilterWords(result.content);

    ipcRenderer.send('set-last-file', currentFilePath);
  });

  learnedCheckbox.addEventListener('change', () => {
    if (learnedCheckbox.checked) markCurrentLearned();
  });

  prevButton.addEventListener('click', showPrevWord);
  nextButton.addEventListener('click', showNextWord);
  shuffleButton.addEventListener('click', toggleShuffle);
  quizButton.addEventListener('click', toggleQuiz);
  wordArea.addEventListener('click', revealMeaning);

  // Hide/Show: 只保留 单词/释义/Show
  modeButton.addEventListener('click', () => {
    const isHidden = document.body.classList.toggle('ui-hidden');
    modeButton.textContent = isHidden ? 'Show' : 'Hide';
  });

  editButton.addEventListener('click', () => {
    if (currentFilePath) ipcRenderer.send('edit-file', currentFilePath);
  });

  settingsButton.addEventListener('click', () => ipcRenderer.send('open-settings-window'));
  helpButton.addEventListener('click', () => ipcRenderer.send('open-about-window'));

  // 键盘快捷键: ←/→/Space 切换, S 朗读, L 已掌握, Q 测验, X 乱序, H 隐藏
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); showNextWord(); break;
      case 'ArrowLeft':  e.preventDefault(); showPrevWord(); break;
      case ' ':          e.preventDefault(); showNextWord(); break;
      case 's': case 'S': if (words.length) TTS.speak(words[currentIndex].word); break;
      case 'l': case 'L': markCurrentLearned(); break;
      case 'q': case 'Q': toggleQuiz(); break;
      case 'x': case 'X': toggleShuffle(); break;
      case 'h': case 'H': modeButton.click(); break;
    }
  });

  ipcRenderer.on('settings-updated', (_evt, newSettings) => applySettings(newSettings));
  ipcRenderer.on('reload-words', () => {
    if (currentFilePath) {
      const fileContent = fs.readFileSync(currentFilePath, 'utf-8');
      loadAndFilterWords(fileContent);
    }
  });

 // --- MOUSE HOVER HANDLING ---
// --- MOUSE HOVER HANDLING (REWRITE) ---
function checkHoverState() {
  const hovered = document.body.matches(':hover');  

  if (hovered && !isHovered) {
    
    isHovered = true;
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  } else if (!hovered && isHovered) {
    
    isHovered = false;
    resetTimer();
  }
}

// 定期检测 hover 状态（每 300ms）
setInterval(checkHoverState, 300);

  // --- INITIALIZATION ---
  initialize()

  const TTS = (() => {
    let voices = [];
    function refreshVoices() { voices = window.speechSynthesis.getVoices() || []; }
    refreshVoices();
    if ('onvoiceschanged' in window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }

    function pickVoice(bcp47) {
      if (!bcp47) return null;
      const lc = bcp47.toLowerCase();
      const exact = voices.find(v => v.lang && v.lang.toLowerCase() === lc);
      if (exact) return exact;
      if (lc.startsWith('zh')) {
        const v = voices.find(v => v.name && v.name.toLowerCase().includes('chinese (simplified'));
        if (v) return v;
      }

      const pre = lc.split('-')[0];
      const loose = voices.find(v => v.lang && v.lang.toLowerCase().startsWith(pre));
      return loose || null;
    }

    function detectLang(text) {
      if (/[\u3040-\u30ff]/.test(text)) return 'ja-JP';   // 假名 → 日语
      if (/[\uac00-\ud7af]/.test(text)) return 'ko-KR';   // 谚文 → 韩语
      if (/[\u4e00-\u9fff]/.test(text)) return 'zh-CN';   // 汉字 → 中文
      if (/[\u0400-\u04ff]/.test(text)) return 'ru-RU';   // 西里尔 → 俄语
      return null;
    }

    let speaking = false;
    function speak(text, opts = {}) {
    if (!text) return;
    const lang2 = detectLang(text) || ((settings && settings.ttsLang) ? settings.ttsLang : 'en-US');
    const rate  = Number(settings?.ttsRate ?? 1.0); // 设置里没有就用 1.0
    const pitch = Number(opts.pitch ?? 1.0);
    const volume = Number(opts.volume ?? 1.0);
    const onend = opts.onend;

    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang2;
    const v = pickVoice(u.lang);
    if (v) u.voice = v;
    u.rate = rate; u.pitch = pitch; u.volume = volume;

    u.onstart = () => {
      speaking = true;
    };
    u.onend = () => { speaking = false; onend && onend();  };
    u.onerror = () => { speaking = false; onend && onend();  };

    // 连点同一个单词时避免重复朗读
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }
    function stop(){ window.speechSynthesis.cancel(); speaking = false; }
    function isSpeaking(){ return speaking; }

    return { speak, stop, isSpeaking };
  })();
});