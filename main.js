const { app, BrowserWindow, ipcMain, dialog, nativeTheme, net, safeStorage, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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

const defaultDataDir = app.getPath('userData');
const dataDirPointer = path.join(defaultDataDir, 'data-dir.json');

function currentDataDir() {
  try {
    const p = JSON.parse(fs.readFileSync(dataDirPointer, 'utf-8'));
    if (p && typeof p.dir === 'string' && p.dir && fs.existsSync(p.dir)) return p.dir;
  } catch (error) { /* pointer missing or broken → default */ }
  return defaultDataDir;
}
function settingsPath() { return path.join(currentDataDir(), 'settings.json'); }

// The encryption key lives ONLY in the app-private default dir, never in the
// user-chosen data dir. Copying or syncing the data dir elsewhere therefore does
// not expose API keys: the key file stays behind on this machine.
const secretKeyPath = path.join(defaultDataDir, 'glance-secret.key');
let secretKey = null;
function loadSecretKey() {
  if (secretKey) return secretKey;
  try {
    if (fs.existsSync(secretKeyPath)) {
      const b = Buffer.from(fs.readFileSync(secretKeyPath, 'utf-8').trim(), 'base64');
      if (b.length === 32) { secretKey = b; return secretKey; }
    }
  } catch (error) { /* unreadable → regenerate below */ }
  secretKey = crypto.randomBytes(32);
  try { fs.writeFileSync(secretKeyPath, secretKey.toString('base64'), { mode: 0o600 }); }
  catch (error) { console.error('Failed to persist secret key:', error); }
  return secretKey;
}

function storageInfo() {
  const dir = currentDataDir();
  return {
    platform: 'electron', dir, defaultDir: defaultDataDir,
    settingsFile: settingsPath(), custom: dir !== defaultDataDir,
    encrypted: true
  };
}

// API keys are sealed with AES-256-GCM under a random per-install key, so the
// data file stays safe even when the user moves it to a synced or shared folder.
const ENC_PREFIX = 'g1:';
function sealKeys(s) {
  const out = JSON.parse(JSON.stringify(s));
  const key = loadSecretKey();
  for (const k of ['ai', 'dict']) {
    const sec = out[k];
    if (sec && typeof sec.key === 'string' && sec.key) {
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const ct = Buffer.concat([cipher.update(sec.key, 'utf8'), cipher.final()]);
      sec.keyEnc = ENC_PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
      delete sec.key;
    }
  }
  return out;
}
function unsealKeys(s) {
  for (const k of ['ai', 'dict']) {
    const sec = s[k];
    if (sec && typeof sec.keyEnc === 'string' && sec.keyEnc) {
      try {
        if (sec.keyEnc.startsWith(ENC_PREFIX)) {
          const raw = Buffer.from(sec.keyEnc.slice(ENC_PREFIX.length), 'base64');
          const decipher = crypto.createDecipheriv('aes-256-gcm', loadSecretKey(), raw.subarray(0, 12));
          decipher.setAuthTag(raw.subarray(12, 28));
          sec.key = Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
        } else {
          // Legacy safeStorage blob from older builds; best-effort decrypt.
          sec.key = safeStorage.decryptString(Buffer.from(sec.keyEnc, 'base64'));
        }
        delete sec.keyEnc;
      } catch (error) {
        // Keep keyEnc intact: a failed decrypt must never destroy the stored key,
        // otherwise the next empty-key flush would wipe it permanently.
        sec.key = '';
      }
    }
  }
  return s;
}

function loadSettings() {
  try {
    const p = settingsPath();
    if (fs.existsSync(p)) {
      return unsealKeys(JSON.parse(fs.readFileSync(p, 'utf-8')));
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
  try { fs.writeFileSync(settingsPath(), JSON.stringify(sealKeys(settings), null, 2)); }
  catch (error) { console.error('Failed to save settings:', error); }
}

let mainWindow;

function getDefaultDialogPath() {
  const dir = path.join(app.getPath('documents'));
  return fs.existsSync(dir) ? dir : app.getPath('home');
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

// ===== whenReady 只注册一次！ =====
app.whenReady().then(() => {
  // Create the window first so legacy safeStorage blobs (older builds) can still
  // be decrypted; current builds seal keys with a self-managed AES-256-GCM key.
  createMainWindow();
  ensureLanguageSetting();
  
  
  autoUpdater.checkForUpdatesAndNotify();

  globalShortcut.register('CommandOrControl+Shift+I', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) win.webContents.toggleDevTools();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.on('save-settings', (_e, settings) => {
  const merged = Object.assign(loadSettings(), settings);
  saveSettings(merged);
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings-updated', merged);
  }
});

// ---- storage location: default userData stays untouched; optional custom dir ----
ipcMain.handle('storage-info', () => storageInfo());

ipcMain.handle('storage-set-dir', async (_e, arg) => {
  let dir = arg && typeof arg.dir === 'string' && arg.dir ? arg.dir : null;
  if (!dir) {
    const r = await dialog.showOpenDialog({
      title: '选择数据存储目录 / Choose data folder',
      defaultPath: currentDataDir(),
      properties: ['openDirectory', 'createDirectory']
    });
    if (r.canceled || !r.filePaths.length) return null;
    dir = r.filePaths[0];
  }
  dir = path.resolve(dir);
  if (dir === currentDataDir()) return storageInfo();
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
  } catch (error) { return { error: '目录不可写：' + error.message }; }
  const from = settingsPath(), to = path.join(dir, 'settings.json');
  try {
    // Existing data in the target wins (re-adopt after reinstall); otherwise migrate current.
    // read+write (not copyFile): CopyFileW can throw EPERM on some Windows setups.
    if (!fs.existsSync(to) && fs.existsSync(from)) {
      const tmp = to + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, fs.readFileSync(from));
      fs.renameSync(tmp, to);
    }
    fs.writeFileSync(dataDirPointer, JSON.stringify({ dir }, null, 2));
  } catch (error) { return { error: '迁移失败：' + error.message }; }
  return storageInfo();
});

ipcMain.handle('storage-reset-dir', () => {
  const cur = currentDataDir();
  if (cur !== defaultDataDir) {
    try {
      const from = path.join(cur, 'settings.json'), to = path.join(defaultDataDir, 'settings.json');
      if (fs.existsSync(from)) {
        // Copy aside first: a failed copy must never leave the default file missing.
        // read+write (not copyFile): CopyFileW can throw EPERM on some Windows setups.
        const tmp = to + '.tmp-' + process.pid;
        fs.writeFileSync(tmp, fs.readFileSync(from));
        if (fs.existsSync(to)) fs.renameSync(to, to + '.prev-' + Date.now());
        fs.renameSync(tmp, to);
      }
      fs.unlinkSync(dataDirPointer);
    } catch (error) { return { error: error.message }; }
  }
  return storageInfo();
});

ipcMain.handle('storage-open-dir', () => shell.openPath(currentDataDir()));
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

// 学习主窗口：内置默认词库（主进程 __dirname 即项目根，路径无歧义）
ipcMain.handle('get-bundled-library', () =>
  fs.readFileSync(path.join(__dirname, 'app', 'data', 'cet6.json'), 'utf-8'));

// 学习主窗口：索引化数据集（考纲/词根家族/词条详情/词缀）
ipcMain.handle('get-dataset', () => {
  const dir = path.join(__dirname, 'app', 'data');
  const read = name => {
    try { return JSON.parse(fs.readFileSync(path.join(dir, name), 'utf-8')); }
    catch { return null; }
  };
  return {
    meta: read('meta.json'),
    exams: read('exams.json'),
    roots: read('roots.json'),
    roottrees: read('roottrees.json'),
    words: read('words.json'),
    affixes: read('affixes.json'),
    official: read('official.json')
  };
});

// AI 单词解释：主进程发起 HTTP（绕过浏览器 CORS），统一 OpenAI 兼容 /chat/completions。
ipcMain.handle('llm-chat', async (_e, args) => {
  const { base, key, model, messages, temperature, jsonMode, anthropic } = args || {};
  if (!base || !key || !model) return { ok: false, error: '缺少 API 配置（服务商 / Key / 模型）' };
  const url = String(base).replace(/\/+$/, '') + '/chat/completions';
  const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
  if (anthropic) headers['anthropic-dangerous-direct-browser-access'] = 'true';
  const body = { model, messages, temperature: temperature ?? 0.3, stream: false };
  if (jsonMode) body.response_format = { type: 'json_object' };
  try {
    const res = await net.fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    const text = await res.text();
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status + '：' + text.slice(0, 300) };
    let data;
    try { data = JSON.parse(text); } catch { return { ok: false, error: '返回内容不是有效 JSON' }; }
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string') return { ok: false, error: '响应中没有解释内容' };
    return { ok: true, content };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// 通用 GET + JSON：主进程发起请求，绕过浏览器 CORS（外部词典等）。
ipcMain.handle('http-get', async (_e, args) => {
  const { url, headers, timeout } = args || {};
  let target;
  try { target = new URL(String(url || '')); } catch { return { ok: false, error: '无效的 URL' }; }
  if (target.protocol !== 'http:' && target.protocol !== 'https:') return { ok: false, error: '仅支持 http/https' };
  const ms = Math.min(Math.max(Number(timeout) || 15000, 1000), 60000);
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await net.fetch(target.toString(), { method: 'GET', headers: headers || {}, signal: ctl.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = null; }
    if (!res.ok) return { ok: false, status: res.status, error: 'HTTP ' + res.status, data };
    if (data === null) return { ok: false, status: res.status, error: '返回内容不是有效 JSON' };
    return { ok: true, status: res.status, data };
  } catch (err) {
    const msg = String((err && err.message) || err);
    return { ok: false, error: /abort/i.test(msg) ? '网络超时' : msg };
  } finally { clearTimeout(to); }
});

// 导出文本文件（AI 解释等）：弹出保存对话框并写入。
ipcMain.handle('save-text-file', async (_e, args) => {
  const { name, text } = args || {};
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: '导出 / Export',
    defaultPath: path.join(app.getPath('documents'), name || 'glance-export.json'),
    filters: [{ name: 'JSON', extensions: ['json'] }, { name: 'All Files', extensions: ['*'] }]
  });
  if (canceled || !filePath) return false;
  try { fs.writeFileSync(filePath, text, 'utf-8'); return true; }
  catch (err) { console.error('Failed to save export:', err); return false; }
});