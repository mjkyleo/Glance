#!/usr/bin/env node
/**
 * 开发启动器（npm start）
 *
 * 解决两个 Windows 常见坑：
 *  1) 某些机器上 Chromium 沙箱子进程初始化失败，electron 会静默秒退（exit 0，无任何输出）。
 *     这里先按默认方式启动，若 3 秒内进程就没了，则自动改用 --no-sandbox 重试。
 *  2) Electron 的 crashpad 要求 userData 目录事先存在，否则启动即崩（0x80000003）。
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const APP_NAME = require('../package.json').name;
const electronBinary = require('electron'); // 纯 Node 环境下返回 electron.exe 的路径

function userDataDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), APP_NAME);
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', APP_NAME);
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), APP_NAME);
}

fs.mkdirSync(userDataDir(), { recursive: true });

const appArgs = ['.'].concat(process.argv.slice(2));

function run(extraFlags) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const child = spawn(electronBinary, appArgs.concat(extraFlags), { stdio: 'inherit' });
    let settled = false;

    child.on('error', reject);

    const timer = setTimeout(() => {
      settled = true;
      resolve({ child, died: false });
    }, 3000);

    child.on('exit', (code, signal) => {
      if (settled) return; // 已经判定为“正常运行中”，后续退出不用管
      settled = true;
      clearTimeout(timer);
      resolve({ child, died: true, code, signal, ms: Date.now() - startedAt });
    });
  });
}

(async () => {
  const first = await run([]);
  if (!first.died) {
    console.log('[start] Electron 已在运行（默认沙箱模式）。关闭窗口或按 Ctrl+C 退出。');
    return;
  }

  console.log(
    '[start] 默认启动在 ' + first.ms + 'ms 内退出（code=' + first.code + ', signal=' + first.signal + '），' +
    '本机 Chromium 沙箱可能不可用，改用 --no-sandbox 重试…'
  );

  const second = await run(['--no-sandbox']);
  if (second.died) {
    console.error('[start] 仍然启动失败（code=' + second.code + ', signal=' + second.signal + '）。');
    process.exitCode = second.code || 1;
    return;
  }
  console.log('[start] Electron 已在运行（--no-sandbox 模式）。关闭窗口或按 Ctrl+C 退出。');
})().catch((err) => {
  console.error('[start] 启动出错：', err && err.message ? err.message : err);
  process.exitCode = 1;
});
