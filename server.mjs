import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { moderate } from './moderation.mjs';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp(dbPath = resolve(root, 'data/letters.sqlite')) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS letters (id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL, mood TEXT NOT NULL, created INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS reactions (letter TEXT, owner TEXT, kind TEXT, PRIMARY KEY(letter,owner,kind));
    CREATE TABLE IF NOT EXISTS reports (letter TEXT, owner TEXT, PRIMARY KEY(letter,owner));`);
  const limits = new Map();
  const server = http.createServer(async (req, res) => {
    const headers = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'" };
    function json(code, value) { res.writeHead(code, { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        const files = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/i18n.js': ['i18n.js','text/javascript'], '/water.js': ['water.js','text/javascript'], '/style.css': ['style.css','text/css'], '/logo.png': ['logo.png','image/png'], '/favicon.svg': ['favicon.svg','image/svg+xml'] };
        const file = files[url.pathname];
        if (!file || req.method !== 'GET') return json(404, { error: '找不到這個頁面。' });
        res.writeHead(200, { ...headers, 'Content-Type': file[1] + '; charset=utf-8' });
        return res.end(readFileSync(resolve(root, 'public', file[0])));
      }
      let token = /(?:^|; )visitor=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (!token) {
        token = randomBytes(32).toString('hex');
        res.setHeader('Set-Cookie', `visitor=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${process.env.COOKIE_SECURE === '1' ? '; Secure' : ''}`);
      }
      const owner = createHash('sha256').update(token).digest('hex');
      if (req.method !== 'GET') {
        if (req.headers.origin && req.headers.origin !== (process.env.PUBLIC_ORIGIN || `http://${req.headers.host}`)) return json(403, { error: '請從網站內操作。' });
        if (!(req.headers['content-type'] || '').startsWith('application/json')) return json(415, { error: '請使用 JSON。' });
      }
      let input = {};
      if (req.method === 'POST') {
        let raw = ''; let size = 0;
        for await (const part of req) { size += part.length; if (size > 20000) return json(413, { error: '文字太長了，請縮短至 200 字。' }); raw += part; }
        try { input = JSON.parse(raw); } catch { return json(400, { error: '資料格式有誤。' }); }
        if (!input || typeof input !== 'object' || Array.isArray(input)) return json(400, { error: '資料格式有誤。' });
      }
      if (req.method === 'GET' && url.pathname === '/api/letters') {
        const mine = url.searchParams.get('mine') === '1';
        const page = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '0') || 0));
        const mood = url.searchParams.get('mood') || '';
        const rows = db.prepare(`SELECT id, body, mood, created, hidden, owner = ? AS mine FROM letters WHERE ${mine ? 'owner = ?' : 'hidden = 0 AND (? = \'\' OR mood = ?)'} ORDER BY created DESC, id DESC LIMIT 10 OFFSET ?`).all(owner, ...(mine ? [owner] : [mood,mood]), page * 9);
        const letters = rows.slice(0,9).map(row => ({ ...row, mine: !!row.mine, reactions: db.prepare('SELECT kind FROM reactions WHERE letter = ? AND owner = ?').all(row.id,owner).map(r=>r.kind), supported: row.mine && !!db.prepare('SELECT 1 FROM reactions WHERE letter = ? LIMIT 1').get(row.id) }));
        return json(200, { letters, more: rows.length > 9 });
      }
      if (req.method === 'POST' && url.pathname === '/api/letters') {
        const body = typeof input.body === 'string' ? input.body.trim() : '';
        if (!body || body.length > 200) return json(400, { error: '請寫低 1 至 200 字嘅心事。' });
        if (!['未說出口','有點疲累','想念','慢慢放下','其他'].includes(input.mood)) return json(400, { error: '請選擇一個分類。' });
        const violation = moderate(body);
        if (violation) return json(422, { code: violation, error: '內容不符合公開留言規則。' });
        const key = req.socket.remoteAddress;
        const now = Date.now();
        if (limits.size > 10000) for (const [k,v] of limits) if (now-v.start > 3600000) limits.delete(k);
        const rate = limits.get(key);
        if (rate && now-rate.start < 3600000 && rate.count >= 20) return json(429, { error: '今日寫咗好多，稍後再試。' });
        limits.set(key, rate && now-rate.start < 3600000 ? { ...rate, count: rate.count+1 } : { start: now, count: 1 });
        const id = randomBytes(16).toString('hex');
        db.prepare('INSERT INTO letters (id,owner,body,mood,created) VALUES (?,?,?,?,?)').run(id, owner, body, input.mood, now);
        return json(201, { id });
      }
      const match = /^\/api\/letters\/([a-f0-9]{32})(?:\/(reaction|report))?$/.exec(url.pathname);
      if (match) {
        const [,id,action] = match;
        const letter = db.prepare('SELECT owner,hidden FROM letters WHERE id=?').get(id);
        if (!letter || (letter.hidden && letter.owner !== owner)) return json(404, { error: '呢段心事已經收起了。' });
        if (req.method === 'DELETE' && !action) {
          if (letter.owner !== owner) return json(403, { error: '只可以刪除自己嘅心事。' });
          db.exec('BEGIN');
          try { for (const table of ['reactions','reports']) db.prepare(`DELETE FROM ${table} WHERE letter=?`).run(id); db.prepare('DELETE FROM letters WHERE id=?').run(id); db.exec('COMMIT'); } catch(e) { db.exec('ROLLBACK'); throw e; }
          return json(200,{ ok:true });
        }
        if (req.method === 'POST' && action === 'reaction') {
          if (input.kind !== 'heard') return json(400,{error:'未知嘅回應。'});
          if (letter.owner === owner) return json(400,{error:'將呢份支持留畀其他人吧。'});
          db.prepare('INSERT OR IGNORE INTO reactions VALUES (?,?,?)').run(id,owner,input.kind);
          return json(200,{ok:true});
        }
        if (req.method === 'POST' && action === 'report') {
          db.prepare('INSERT OR IGNORE INTO reports VALUES (?,?)').run(id,owner);
          if (db.prepare('SELECT count(*) AS n FROM reports WHERE letter=?').get(id).n >= 3) db.prepare('UPDATE letters SET hidden=1 WHERE id=?').run(id);
          return json(200,{ok:true});
        }
      }
      json(404, { error: '找不到這個頁面。' });
    } catch (error) { console.error(error.message); if (!res.headersSent) json(500,{error:'暫時未能完成，請稍後再試。'}); else res.end(); }
  });
  server.on('close', () => db.close());
  return server;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createApp(process.env.DB_PATH).listen(port, process.env.HOST || '127.0.0.1', () => console.log(`暫放 · http://localhost:${port}`));
}
