import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createApi } from '../lib/api.mjs';

test('PostgreSQL API preserves ownership, reports, rate limits and Vercel request handling', async () => {
  const pg = new PGlite();
  const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pg.exec(schema);
  await pg.exec(schema); // A redeploy must not drop existing tables.
  const db = {
    query: async (sql, params) => (await pg.query(sql, params)).rows,
    transaction: statements => pg.transaction(async tx => {
      const results = [];
      for (const [sql, params] of statements) results.push((await tx.query(sql, params)).rows);
      return results;
    })
  };
  const env = { VERCEL: '1', RATE_LIMIT_SECRET: 'isolated-test-secret' };
  let api = createApi(db, env);
  const server = createServer((req, res) => api(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  env.PUBLIC_ORIGIN = base;
  const clients = Array.from({ length: 5 }, () => ({ cookie: '' }));
  async function call(client, path = 'letters', method = 'GET', data, headers = {}) {
    const response = await fetch(`${base}/api/handler?route=${path}`, {
      method,
      headers: { Cookie: client.cookie, 'Content-Type': 'application/json', Origin: base, 'x-vercel-forwarded-for': '192.0.2.1', ...headers },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {})
    });
    const cookie = response.headers.get('set-cookie');
    if (cookie) { assert.match(cookie, /HttpOnly; SameSite=Strict/); assert.match(cookie, /; Secure/); client.cookie = cookie.split(';')[0]; }
    assert.match(response.headers.get('cache-control'), /no-store/);
    return { status: response.status, body: await response.json() };
  }
  try {
    const [a, b, c, d] = clients;
    for (const client of clients) assert.equal((await call(client)).status, 200);
    assert.equal((await call(a, 'letters', 'POST', null)).status, 400);
    assert.equal((await call(a, 'letters', 'POST', { body: 'x'.repeat(21000) })).status, 413);
    assert.equal((await call(a, 'letters', 'POST', { body: 'hi', mood: '其他' }, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await call(a, 'letters', 'POST', { body: 'hi', mood: '其他' }, { 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await call(a, 'letters', 'POST', { body: 'p.o.l.i.t.i.c.s', mood: '其他' })).status, 422);
    assert.equal((await call(a, 'letters', 'POST', { body: 'hi', mood: 'invalid' })).status, 400);
    const created = await call(a, 'letters', 'POST', { body: 'A quiet thought', mood: '想念' });
    assert.equal(created.status, 201);
    const id = created.body.id;
    assert.equal((await call(a, 'listen')).body.letter, null);
    assert.equal((await call(b, 'listen')).body.letter.id, id);
    assert.equal((await call(b, 'listen&exclude=' + id)).body.letter, null);
    assert.equal((await call(b, `letters/${id}`, 'DELETE')).status, 403);
    assert.equal((await call(a, `letters/${id}/reaction`, 'POST', { kind: 'heard' })).status, 400);
    assert.equal((await call(b, `letters/${id}/reaction`, 'POST', { kind: 'light' })).status, 400);
    await Promise.all(Array.from({ length: 3 }, () => call(b, `letters/${id}/reaction`, 'POST', { kind: 'heard' })));
    assert.deepEqual((await call(b)).body.letters[0].reactions, ['heard']);
    assert.deepEqual((await call(b, 'listen')).body.letter.reactions, ['heard']);
    assert.equal((await call(a, 'letters&mine=1')).body.letters[0].supported, true);
    assert.equal((await call(b, 'letters&mine=1')).body.letters.length, 0);
    assert.equal((await call(b, 'letters&mood=其他')).body.letters.length, 0);
    const publicRow = (await call(b)).body.letters[0];
    assert.equal(typeof publicRow.created, 'number');
    assert.equal('owner' in publicRow, false);
    await call(b, `letters/${id}/report`, 'POST', {});
    await call(b, `letters/${id}/report`, 'POST', {});
    assert.equal((await call(b)).body.letters.length, 1);
    await Promise.all([c, d].map(client => call(client, `letters/${id}/report`, 'POST', {})));
    assert.equal((await call(b)).body.letters.length, 0);
    assert.equal((await call(b, 'listen')).body.letter, null);
    assert.equal((await call(a, 'letters&mine=1')).body.letters[0].hidden, 1);
    assert.equal((await call(b, `letters/${id}/reaction`, 'POST', { kind: 'heard' })).status, 404);
    // A fresh function instance must see the same notes and the same IP allowance.
    api = createApi(db, env);
    assert.equal((await call(a, 'letters&mine=1')).body.letters[0].id, id);
    const attempts = await Promise.all(Array.from({ length: 24 }, (_, i) => call(clients[i % clients.length], 'letters', 'POST', { body: `Quiet note ${i}`, mood: '其他' })));
    assert.equal(attempts.filter(r => r.status === 201).length, 19);
    assert.equal(attempts.filter(r => r.status === 429).length, 5);
    api = createApi(db, env);
    assert.equal((await call(b, 'letters', 'POST', { body: 'One more', mood: '其他' })).status, 429);
    const first = (await call(b)).body;
    const second = (await call(b, 'letters&page=1')).body;
    assert.equal(first.letters.length, 9); assert.equal(first.more, true);
    assert.equal(new Set([...first.letters, ...second.letters].map(l => l.id)).size, 18);
    assert.equal((await call(a, `letters/${id}`, 'DELETE')).status, 200);
    assert.equal((await db.query('SELECT * FROM reports WHERE letter = $1', [id])).length, 0);
    assert.equal((await db.query('SELECT * FROM reactions WHERE letter = $1', [id])).length, 0);
    await pg.query('UPDATE rate_limits SET started = $1', [Date.now() - 3600001]);
    assert.equal((await call(a, 'letters', 'POST', { body: 'After a rest', mood: '其他' })).status, 201);
    // Vercel supplies a parsed req.body; verify that path without a request stream.
    let status, result;
    await api({ url: '/api/handler?route=letters', method: 'POST', headers: { host: 'site.vercel.app', origin: base, 'content-type': 'application/json', 'x-vercel-forwarded-for': '192.0.2.2' }, body: { body: 'Parsed request', mood: '其他' } }, {
      setHeader() {}, writeHead(code) { status = code; }, end(body) { result = JSON.parse(body); }
    });
    assert.equal(status, 201); assert.match(result.id, /^[a-f0-9]{32}$/);
    const boundary = 'abcdefghij'.repeat(20);
    assert.equal((await call(a, 'letters', 'POST', { body: boundary, mood: '其他' })).status, 201);
    assert.equal((await call(a, 'letters', 'POST', { body: boundary + 'x', mood: '其他' })).status, 400);
    const injection = "a'); DROP TABLE letters; --";
    assert.equal((await call(a, 'letters', 'POST', { body: injection, mood: '其他' })).status, 201);
    assert.ok((await db.query('SELECT body FROM letters WHERE body = $1', [injection])).length);
    assert.equal((await call(b, 'letters&mood=' + encodeURIComponent("' OR 1=1 --"))).body.letters.length, 0);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await pg.close();
  }
});

test('200-character migration preserves legacy notes and guards direct database writes', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE letters (id TEXT PRIMARY KEY, owner TEXT NOT NULL, body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 3000), mood TEXT NOT NULL, created BIGINT NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)`);
    await pg.query('INSERT INTO letters VALUES ($1,$2,$3,$4,$5,0)', ['old', 'owner', 'x'.repeat(201), '其他', 1]);
    const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
    for (let run = 0; run < 2; run++) await pg.transaction(async tx => {
      for (const statement of schema.split('-- statement-breakpoint').filter(s => s.trim())) await tx.query(statement);
    });
    assert.equal((await pg.query('SELECT body FROM letters')).rows[0].body.length, 201);
    await pg.query('UPDATE letters SET hidden = 1 WHERE id = $1', ['old']);
    await assert.rejects(pg.query('UPDATE letters SET body = $1 WHERE id = $2', ['x'.repeat(201), 'old']), { code: '23514' });
    await pg.query('UPDATE letters SET body = $1 WHERE id = $2', ['x'.repeat(200), 'old']);
    await assert.rejects(pg.query('INSERT INTO letters VALUES ($1,$2,$3,$4,$5,0)', ['new', 'owner', 'x'.repeat(201), '其他', 2]), { code: '23514' });
  } finally { await pg.close(); }
});
