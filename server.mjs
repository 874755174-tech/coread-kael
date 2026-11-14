import http from 'http';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { fileURLToPath } from 'url';
import { initDb, getDb } from './lib/db.mjs';
import { handleRequest } from './lib/routes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.COREAD_PORT || '3000');
const DB_PATH = process.env.COREAD_DB || path.join(process.cwd(), 'data', 'coread.db');

// Optional comment notifier: run an arbitrary command whenever someone comments.
// COREAD_NOTIFY_CMD  — shell command to execute (comment details passed via env vars)
// COREAD_NOTIFY_FROM — only fire for this author (default 'human'; '*' = everyone)
// Env vars available to the command:
//   COREAD_BOOK_ID, COREAD_BOOK_TITLE, COREAD_FROM, COREAD_COMMENT
const NOTIFY_CMD = process.env.COREAD_NOTIFY_CMD || '';
const NOTIFY_FROM = process.env.COREAD_NOTIFY_FROM || 'human';

function notifyComment({ book_id, from_who, content }) {
  if (!NOTIFY_CMD) return;
  if (NOTIFY_FROM !== '*' && from_who !== NOTIFY_FROM) return;
  let title = `book#${book_id}`;
  try {
    const db = getDb(true);
    title = db.prepare('SELECT title FROM books WHERE id = ?').get(book_id)?.title || title;
    db.close();
  } catch {}
  execFile('/bin/sh', ['-c', NOTIFY_CMD], {
    timeout: 15000,
    env: {
      ...process.env,
      COREAD_BOOK_ID: String(book_id),
      COREAD_BOOK_TITLE: title,
      COREAD_FROM: from_who,
      COREAD_COMMENT: content || '',
    },
  }, (err) => { if (err) console.error('notify cmd error:', err.message); });
}

initDb(DB_PATH);

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

// ─── 入口门禁 ───
// COREAD_TOKEN 设了才生效；不设 = 保持原样（本机开发不受影响）。
// 放行方式二选一：
//   x-owner-key: <token>        ← 网页端已有的机制，打开 ?owner_key=<token> 一次后浏览器会自己带上
//   Authorization: Bearer <token> ← MCP / 脚本用
// 图片（/v1/book-images/）不设门：<img> 标签带不了自定义头，且路径本身不可猜。
const TOKEN = (process.env.COREAD_TOKEN || '').trim();
const OPEN_PREFIXES = ['/v1/book-images/'];

function tokenOk(req) {
  if (!TOKEN) return true;
  const owner = String(req.headers['x-owner-key'] || '').trim();
  if (owner && owner === TOKEN) return true;
  const auth = String(req.headers['authorization'] || '');
  if (auth.startsWith('Bearer ') && auth.slice(7).trim() === TOKEN) return true;
  return false;
}

const server = http.createServer(async (req, res) => {
  const reqPath = String(req.url || '').split('?')[0];
  if (
    TOKEN &&
    req.method !== 'OPTIONS' &&
    reqPath.startsWith('/v1/') &&
    !OPEN_PREFIXES.some(p => reqPath.startsWith(p)) &&
    !tokenOk(req)
  ) {
    res.writeHead(401, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'unauthorized', message: '需要 token（x-owner-key 或 Bearer）。' }));
    return;
  }

  const handled = await handleRequest(req, res, { port: PORT, onComment: notifyComment });
  if (handled) return;

  // Serve static files from public/
  const publicDir = path.join(__dirname, 'public');
  let urlPath;
  try { urlPath = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); res.end('Bad request'); return; }
  let filePath = path.join(publicDir, urlPath === '/' ? 'index.html' : urlPath);
  if (!filePath.startsWith(publicDir + path.sep)) { res.writeHead(404); res.end('Not found'); return; }
  if (!fs.existsSync(filePath) && !path.extname(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }
  try {
    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;
    const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', ETag: etag };
    // 文件名带 hash 的构建产物可以永久缓存；index.html / service worker 必须每次校验。
    if (urlPath.startsWith('/assets/')) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
    else if (ext === '.html' || urlPath === '/service-worker.js') headers['Cache-Control'] = 'no-cache';
    else headers['Cache-Control'] = 'public, max-age=3600';
    if (req.headers['if-none-match'] === etag) {
      delete headers['Content-Type'];
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const data = fs.readFileSync(filePath);
    headers['Content-Length'] = String(data.length);
    res.writeHead(200, headers);
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, process.env.COREAD_HOST || '0.0.0.0', () => {
  console.log(`\n  📚 coread server running at http://localhost:${PORT}`);
  console.log(`  📂 Database: ${DB_PATH}`);
  console.log(`  🔐 Gate: ${TOKEN ? 'ON (COREAD_TOKEN 已设置)' : 'OFF (本机模式，未设 COREAD_TOKEN)'}`);
  console.log(`  🌐 Open http://localhost:${PORT} in your browser\n`);
});
