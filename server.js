#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { createEngine } = require('./lib/search.js');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml'
};

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'demo.json'), 'utf8'));
const engine = createEngine(data);

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'text/plain; charset=utf-8' });
  res.end(body);
}

function serveFile(res, filePath) {
  const abs = path.resolve(ROOT, '.' + filePath);
  if (!abs.startsWith(ROOT)) return send(res, 403, 'forbidden');

  fs.readFile(abs, (err, buf) => {
    if (err) return send(res, 404, 'not found');
    send(res, 200, buf, MIME[path.extname(abs)] || 'application/octet-stream');
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname);

  if (pathname === '/api/search') {
    const q = url.searchParams.get('q') || '';
    const flags = (url.searchParams.get('flags') || '').split(',').map(s => s.trim()).filter(Boolean);
    const result = engine.search(q, { flags });
    return send(res, 200, JSON.stringify(result, null, 2), MIME['.json']);
  }

  if (pathname === '/api/suggest') {
    const q = url.searchParams.get('q') || '';
    return send(res, 200, JSON.stringify(engine.suggest(q, 8), null, 2), MIME['.json']);
  }

  if (pathname === '/api/stats') {
    return send(res, 200, JSON.stringify(engine.stats(), null, 2), MIME['.json']);
  }

  if (pathname === '/' || pathname === '') return serveFile(res, '/index.html');
  return serveFile(res, pathname);
});

server.listen(PORT, () => {
  const s = engine.stats();
  console.log(`site-search-rules demo → http://localhost:${PORT}`);
  console.log(`索引：${s.total} 条（AI 工具 ${s.aiTool} / 站点 ${s.site} / 实用工具 ${s.util} / 问答 ${s.qa} / 文章 ${s.post}），对比对 ${s.vsPairs} 组`);
  console.log(`接口：/api/search?q=豆包&flags=free  /api/suggest?q=豆  /api/stats`);
});
