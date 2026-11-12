const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', async () => {
  const langSelect = document.getElementById('lang-select-about');

  // 决定界面语言
  const sysLang = (navigator.language || 'en').toLowerCase();
  let lang = sysLang.startsWith('zh') ? 'zh' : 'en';
  try {
    const s = await ipcRenderer.invoke('get-settings');
    if (s && s.language) lang = (s.language === 'zh') ? 'zh' : 'en';
  } catch {}

  const dict = {
    en: {
      title: 'About Glance',
      appName: 'Glance',
      aboutH2: 'About the App',
      aboutP: 'Glance is a simple, overlay-style flashcard application designed to help you learn new words while you work or browse.',
      howH2: 'How to Use',
      li1: 'Click <strong>Load</strong> to open a TSV (Tab-Separated Value) file. The file should be formatted with one word and its meaning and example sentence(optional) per line, separated by a tab.',
      li2: 'Words will cycle automatically. Hover your mouse over the window to pause the timer.',
      li3: 'Use the <strong>&lt;</strong> and <strong>&gt;</strong> arrows to navigate manually.',
      li4: 'Check the <strong>Learned</strong> box to remove a word from the current session. It won\'t appear again unless you unlearn it in Settings.',
      li5: 'Click <strong>Settings</strong> to change the timer speed, font styles, and manage your learned words list.',
      langLabel: 'Language'
    },
    zh: {
      title: '关于 Glance',
      appName: 'Glance',
      aboutH2: '关于本应用',
      aboutP: 'Glance 是一款悬浮式单词卡片应用，让你在工作或上网时也能顺手记单词。',
      howH2: '使用方法',
      li1: '点击 <strong>Load</strong> 打开 TSV 文件。每行为“单词[TAB]释义[TAB]例句(可选)”格式。',
      li2: '单词会自动轮换。鼠标悬停在窗口上会暂停计时。',
      li3: '用 <strong>&lt;</strong> 和 <strong>&gt;</strong> 箭头手动切换。',
      li4: '勾选 <strong>Learned</strong> 会把当前单词从本次学习中移除，除非在设置里取消，否则不再出现。',
      li5: '在 <strong>Settings</strong> 里可以调整切换速度、字体样式，并管理已掌握的单词。',
      langLabel: '语言'
    }
  };

  function applyTexts() {
    const t = dict[lang] || dict.en;
    document.title = t.title;

    const h1 = document.querySelector('.header h1');
    if (h1) h1.textContent = t.appName;

    const sections = Array.from(document.querySelectorAll('.section'));
    const aboutSec = sections[0];
    const howSec   = sections[1];

    if (aboutSec) {
      const aboutH2 = aboutSec.querySelector('h2');
      const aboutP  = aboutSec.querySelector('p');
      if (aboutH2) aboutH2.textContent = t.aboutH2;
      if (aboutP)  aboutP.innerHTML   = t.aboutP;
    }

    if (howSec) {
      const howH2 = howSec.querySelector('h2');
      const list  = howSec.querySelector('ol');
      if (howH2) howH2.textContent = t.howH2;
      if (list) {
        list.innerHTML = `
          <li>${t.li1}</li>
          <li>${t.li2}</li>
          <li>${t.li3}</li>
          <li>${t.li4}</li>
          <li>${t.li5}</li>
        `;
      }
    }

    const label = document.querySelector('.lang-switch label');
    if (label) label.textContent = t.langLabel;
  }

  // 初始值/应用
  if (langSelect) langSelect.value = lang;
  applyTexts();

  // 切换语言
  langSelect?.addEventListener('change', () => {
    lang = (langSelect.value === 'zh') ? 'zh' : 'en';
    applyTexts();
    ipcRenderer.send('set-language', lang);
  });
});

const closeBtn = document.getElementById('win-close');
if (closeBtn && process.platform !== 'darwin') closeBtn.style.display = 'none';

document.getElementById('win-close')?.addEventListener('click', () => {
  ipcRenderer.send('close-about-window');
});