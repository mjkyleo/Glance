#!/usr/bin/env node
/**
 * Web 开发预览服务器：静态托管 app/，并把词典请求转发到目标站点。
 *
 * 纯浏览器受同源策略限制，无法直连 dict.youdao.com 等词典 API。
 * 本服务器让 Web 预览用同源 /api/dict 请求绕过 CORS；Electron/IPC 与
 * Capacitor/CapacitorHttp 不受影响，仍走各自的原生通道。
 *
 * 用法：npm run web       默认 http://localhost:8080
 *      PORT=8081 npm run web
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', 'app');
const PORT = Number(process.env.PORT || 8080);
const TIMEOUT = 20000;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};
const BLOCKED_HEADERS = new Set([
  'host', 'connection', 'origin', 'referer', 'content-length', 'accept-encoding', 'cookie',
]);

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'Bad path'); }
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.resolve(ROOT, '.' + rel);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return send(res, 403, 'Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'Not found');
    const ext = path.extname(file).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    if (ext === '.html') {
      // 让前端识别 Web 预览有代理可用；Electron/Capacitor 不注入这一标记。
      const html = buf.toString('utf8').replace('</head>',
        '<script>window.GLANCE_WEB_PROXY=true;</script></head>');
      return send(res, 200, html, type);
    }
    res.writeHead(200, { 'Content-Type': type });
    res.end(buf);
  });
}

async function handleApi(req, res, query) {
  const target = query.get('url') || '';
  let parsed;
  try { parsed = new URL(target); } catch { return send(res, 400, JSON.stringify({ error: 'invalid url' }), 'application/json'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return send(res, 400, JSON.stringify({ error: 'unsupported protocol' }), 'application/json');
  }
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1') {
    return send(res, 400, JSON.stringify({ error: 'proxy loopback blocked' }), 'application/json');
  }

  const headers = {};
  try {
    const raw = query.get('h');
    if (raw) {
      const decoded = JSON.parse(raw);
      Object.keys(decoded || {}).forEach(k => {
        if (!BLOCKED_HEADERS.has(k.toLowerCase())) headers[k] = String(decoded[k]);
      });
    }
  } catch { /* 忽略坏 header，仍尝试转发 */ }
  if (/youdao\.com$/i.test(parsed.hostname)) headers['User-Agent'] = 'Mozilla/5.0';

  try {
    const r = await fetch(target, { headers, signal: AbortSignal.timeout(TIMEOUT) });
    const text = await r.text();
    const type = r.headers.get('content-type') || 'application/json; charset=utf-8';
    res.writeHead(r.status, { 'Content-Type': type });
    res.end(text);
  } catch (e) {
    const msg = String((e && e.message) || e);
    send(res, 502, JSON.stringify({ error: 'proxy failed: ' + msg }), 'application/json; charset=utf-8');
  }
}

http.createServer((req, res) => {
  const query = new URL(req.url, 'http://localhost');
  if (query.pathname === '/api/dict') return handleApi(req, res, query.searchParams);
  return serveStatic(req, res, query.pathname);
}).listen(PORT, () => {
  console.log('[web] Glance 预览: http://localhost:' + PORT + '/');
  console.log('[web] 词典代理: /api/dict?url=... 已就绪');
});
