const { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { globalShortcut } = require('electron');


autoUpdater.on("checking-for-update", () => console.log("Checking for update..."));
autoUpdater.on("update-available", (info) => console.log("Update available:", info));
autoUpdater.on("update-not-available", (info) => console.log("No update available:", info));
autoUpdater.on("error", (err) => console.error("Update error:", err));
autoUpdater.on("download-progress", (p) => console.log(`Download progress: ${p.percent}%`));
autoUpdater.on('update-downloaded', (info) => {
  // 检测系统语言
  const locale = app.getLocale(); // 例如 'zh-CN'、'en-US'

  // 多语言提示文案
  const messages = {
    zh: {
      title: '更新完成',
      message: '新版本已下载完成，是否立即重启并安装？',
      buttons: ['立即重启', '稍后']
    },
    en: {
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart the app to install it now?',
      buttons: ['Restart Now', 'Later']
    }
  };

  // 中文环境用 zh，其余回退到 en
  const msg = locale.toLowerCase().startsWith('zh') ? messages.zh : messages.en;

  const result = dialog.showMessageBoxSync({
    type: 'info',
    buttons: msg.buttons,
    title: msg.title,
    message: msg.message
  });

  if (result === 0) { // “立即重启” / “Restart Now”
    autoUpdater.quitAndInstall();
  }
});

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

let mainWindow, overlayWindow, settingsWindow, aboutWindow;

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  // Defaults
  return {
    timerSeconds: 10,
    fontColor: '#abb2bf',
    wordColor: '#61afef',
    fontSize: 24,
    fontFamily: '-apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    autoSpeak: false,
    ttsRate: 1.0,
    ttsLang: '',
    bgOpacity: 0.9,
    lastFilePath: null
  };
}
function saveSettings(settings) {
  try { fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2)); }
  catch (error) { console.error('Failed to save settings:', error); }
}

const SEED_MAIN = 'words.tsv';
const SEED_SAMPLE = 'sample_en_zh.tsv';

function getDefaultTSVFilePath() {
  const candidates = [
    path.join(process.resourcesPath || '', SEED_MAIN),
    path.join(process.resourcesPath || '', SEED_SAMPLE),

    // 开发环境
    path.join(__dirname, 'assets', SEED_MAIN),
    path.join(__dirname, 'assets', SEED_SAMPLE)
  ];
  for (const dir of candidates) {
    try { if (fs.existsSync(dir)) return dir; } catch {}
  }
  return app.getPath('documents'); // 兜底
}

function getDefaultDialogPath() {
  const file = getDefaultTSVFilePath();
  if (file) return file; // 传文件名时 Windows 会连文件名一起预填
  // 只想指定文件夹时，可改用下面一行:
  const dir = process.resourcesPath || path.join(__dirname, 'assets');
  return fs.existsSync(dir) ? dir : app.getPath('documents');
}

// ★ 保证语言默认值
function decideDefaultLanguage() {
  const loc = (app.getLocale() || 'en').toLowerCase();
  return loc.startsWith('zh') ? 'zh' : 'en';
}
function ensureLanguageSetting() {
  const s = loadSettings();
  // 只接受 en / zh；旧版本存下的 'ko' 等值会被重置为系统默认
  if (s.language !== 'en' && s.language !== 'zh') {
    s.language = decideDefaultLanguage();
    saveSettings(s);
  }
  return s.language;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 800,
    minWidth: 360,
    minHeight: 600,
    icon: path.join(__dirname, 'assets/icons/app-icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#000000' : '#f2f2f7',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    resizable: true,
    frame: true,
    title: 'Glance',
  });

  mainWindow.loadFile(path.join('app', 'index.html'));
  mainWindow.on('closed', () => { mainWindow = null; });
}

// 旧的悬浮取词窗，作为学习主窗口的附属窗口保留
function createOverlayWindow() {
  if (overlayWindow) { overlayWindow.focus(); return; }
  overlayWindow = new BrowserWindow({
    width: 350,
    height: 200,
    icon: path.join(__dirname, 'assets/icons/app-icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    alwaysOnTop: true,
    minimizable: false,
    fullscreenable: false,
    resizable: true,
    frame: false,
    title: 'Glance Overlay',
    transparent: true,
  });

  overlayWindow.loadFile('index.html');
  overlayWindow.on('closed', () => { overlayWindow = null; });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
}

function createSettingsWindow() {
  if (settingsWindow) { settingsWindow.focus(); return; }
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 680,
    alwaysOnTop: false,
    resizable: false,
    // 🔽 macOS 下确保显示关闭/最小化/放大(红绿灯)按钮
    frame: true,
    titleBarStyle: 'default',
    fullscreenable: false,
    closable: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    title: 'Settings'
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });

  // 支持 ⌘W 关闭
  settingsWindow.webContents.on('before-input-event', (e, input) => {
    if (input.meta && input.key?.toLowerCase() === 'w') {
      e.preventDefault();
      settingsWindow.close();
    }
  });
}

function createAboutWindow() {
  if (aboutWindow) { aboutWindow.focus(); return; }
  aboutWindow = new BrowserWindow({
    width: 550,
    height: 650,
    alwaysOnTop: true,
    resizable: false,
    frame: true,
    titleBarStyle: 'default',
    fullscreenable: false,
    closable: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false },
    title: 'About Glance'
  });
  aboutWindow.loadFile('about.html');
  aboutWindow.on('closed', () => { aboutWindow = null; });

  aboutWindow.webContents.on('before-input-event', (e, input) => {
    if (input.meta && input.key?.toLowerCase() === 'w') {
      e.preventDefault();
      aboutWindow.close();
    }
  });
}

const seedName = 'words.tsv';
function ensureSeedWords() {
  const userTsv = path.join(app.getPath('userData'), seedName);
  if (fs.existsSync(userTsv)) return userTsv;

  // 打包版: 走 extraResources → process.resourcesPath/words.tsv
  // 开发环境: __dirname 下的 assets/words.tsv
  const candidates = [
    path.join(process.resourcesPath || __dirname, 'words.tsv'),
    path.join(process.resourcesPath || __dirname, 'assets', seedName),
    path.join(__dirname, 'assets', seedName),
    path.join(__dirname, seedName),
  ];
  const src = candidates.find(p => fs.existsSync(p));
  if (src) {
    try { fs.copyFileSync(src, userTsv); }
    catch (e) { console.error('Failed to copy seed words.tsv:', e); }
  }
  return fs.existsSync(userTsv) ? userTsv : null;
}

// ===== whenReady 只注册一次！ =====
app.whenReady().then(() => {
  ensureLanguageSetting();
  ensureSeedWords();
  createMainWindow();
  
  
  autoUpdater.checkForUpdatesAndNotify();

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.toggleDevTools();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('browser-window-created', (_e, win) => {
  if (win !== overlayWindow) return;
  win.on('minimize', (ev) => {
    ev.preventDefault();
    win.restore();
    win.show();
    win.setAlwaysOnTop(true, 'screen-saver');
  });
  if (process.platform !== 'darwin') {
    win.on('hide', () => {
      win.show();
      win.setAlwaysOnTop(true, 'screen-saver');
    });
  }
});

// 保险用的看门狗（提高稳定性，不需要可删掉）
if (process.platform !== 'darwin') {
  setInterval(() => {
    if (!overlayWindow) return;
    if (overlayWindow.isMinimized()) {
      overlayWindow.restore();
      overlayWindow.show();
      overlayWindow.setAlwaysOnTop(true, 'screen-saver');
    }
  }, 1000);
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC
ipcMain.on('edit-file', (event, filePath) => {
  if (!filePath) {
    dialog.showErrorBox('File Error', 'No file path is available to edit.');
    return;
  }
  try {
    if (process.platform === 'win32') {
      // 强制用记事本打开
      const child = spawn('notepad.exe', [filePath], { detached: true, stdio: 'ignore' });
      child.unref();
    } else if (process.platform === 'darwin') {
      // macOS 用 TextEdit
      spawn('open', ['-a', 'TextEdit', filePath], { detached: true, stdio: 'ignore' }).unref();
    } else {
      // Linux 等: 系统默认程序
      spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch (err) {
    console.error('Failed to open editor explicitly, fallback to shell.openPath', err);
    shell.openPath(filePath);
  }
});

ipcMain.on('open-settings-window', createSettingsWindow);
ipcMain.on('open-about-window', createAboutWindow);
ipcMain.on('open-overlay-window', createOverlayWindow);
ipcMain.on('open-external-link', (_e, url) => shell.openExternal(url));

ipcMain.handle('get-settings', () => loadSettings());
ipcMain.on('save-settings', (_e, settings) => {
  const merged = Object.assign(loadSettings(), settings);
  saveSettings(merged);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings-updated', merged);
  }
});
ipcMain.on('learned-words-updated', () => {
  if (overlayWindow) overlayWindow.webContents.send('reload-words');
});

ipcMain.handle('dialog:openFile', async () => {
  const defaultPath = getDefaultDialogPath();
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open TSV File',
    defaultPath,                             // ★ 默认路径
    properties: ['openFile'],
    filters: [{ name: 'TSV Files', extensions: ['tsv', 'txt'] }]
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

// 学习主窗口：选择自定义词库（JSON / TSV / TXT）
ipcMain.handle('dialog:openLibrary', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: '选择词库 / Open Library',
    defaultPath: getDefaultDialogPath(),
    properties: ['openFile'],
    filters: [
      { name: '词库 / Library', extensions: ['json', 'tsv', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  if (canceled || filePaths.length === 0) return null;
  const filePath = filePaths[0];
  const content = fs.readFileSync(filePath, 'utf-8');
  return { filePath, content };
});

ipcMain.on('set-language', (_e, lang) => {
  const next = (lang === 'zh') ? 'zh' : 'en';
  const s = loadSettings(); s.language = next; saveSettings(s);
  if (overlayWindow) overlayWindow.webContents.send('settings-updated', s);
});
ipcMain.on('set-last-file', (_e, filePath) => {
  const s = loadSettings();
  s.lastFilePath = filePath || null;
  saveSettings(s);
});

ipcMain.on('close-settings-window', () => { if (settingsWindow) settingsWindow.close(); });
ipcMain.on('close-about-window',    () => { if (aboutWindow)    aboutWindow.close(); });

ipcMain.handle('get-userData-path', () => app.getPath('userData'));

// 学习主窗口：内置默认词库（主进程 __dirname 即项目根，路径无歧义）
ipcMain.handle('get-bundled-library', () =>
  fs.readFileSync(path.join(__dirname, 'app', 'data', 'cet6.json'), 'utf-8'));

// 提供自动加载用的路径
ipcMain.handle('get-default-words-path', () => {
  const p = path.join(app.getPath('userData'), seedName);
  return fs.existsSync(p) ? p : null;
});