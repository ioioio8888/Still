import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequestGuard, clientAddress } from '../lib/request-guard.mjs';
import { createApi } from '../lib/api.mjs';

test('request and write allowances recover after expiry without blocking other IPs', () => {
  let time = 0;
  const admit = createRequestGuard({ now: () => time, requests: 3, writes: 1 });
  admit('a', 'POST').release();
  assert.deepEqual(admit('a', 'POST'), { status: 429, retryAfter: 60 });
  admit('a', 'GET').release(); admit('a', 'GET').release();
  assert.equal(admit('a', 'GET').status, 429);
  admit('b', 'GET').release();
  time = 60000;
  admit('a', 'POST').release();
});

test('capacity bounds do not evict live limits and admission slots release only once', () => {
  let time = 0;
  const admit = createRequestGuard({ now: () => time, maxClients: 2, concurrent: 1, requests: 2 });
  const first = admit('a', 'GET');
  assert.equal(admit('b', 'GET').status, 503);
  first.release(); first.release();
  const second = admit('b', 'GET');
  assert.equal(admit('a', 'GET').status, 503);
  second.release();
  assert.equal(admit('c', 'GET').status, 503);
  admit('a', 'GET').release();
  assert.equal(admit('a', 'GET').status, 429);
  time = 60000;
  admit('c', 'GET').release();
});

test('trusted IP selection ignores spoofed local proxy headers and canonicalizes IPv6', () => {
  const req = { headers: { 'x-forwarded-for': '203.0.113.9', 'x-vercel-forwarded-for': '2001:0db8:0:0:0:0:0:1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientAddress(req, {}), '127.0.0.1');
  assert.equal(clientAddress(req, { VERCEL: '1' }), '[2001:db8::1]');
  req.headers['x-vercel-forwarded-for'] = 'invalid';
  assert.equal(clientAddress(req, { VERCEL: '1' }), null);
});

function request(api, overrides = {}) {
  const response = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, writeHead(status) { this.status = status; }, end(body) { this.body = JSON.parse(body); } };
  const req = { url: '/api/handler?route=listen', method: 'GET', headers: { host: 'test.vercel.app', 'x-vercel-forwarded-for': '192.0.2.1' }, ...overrides };
  return api(req, response).then(() => response);
}

test('cloud API blocks excess reads before database access despite changing cookies and spoofed headers', async () => {
  let queries = 0;
  const api = createApi({ query: async () => { queries++; return []; } }, { VERCEL: '1' });
  for (let i = 0; i < 180; i++) assert.equal((await request(api)).status, 200);
  const blocked = await request(api, { headers: { host: 'test.vercel.app', 'x-vercel-forwarded-for': '192.0.2.1', 'x-forwarded-for': '192.0.2.2', cookie: 'visitor=' + 'a'.repeat(64) } });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers['Retry-After']) > 0);
  assert.equal(queries, 180);
  assert.equal((await request(api, { headers: { host: 'test.vercel.app', 'x-vercel-forwarded-for': '192.0.2.2' } })).status, 200);
  assert.equal((await request(api, { url: '/api/handler?route=unknown' })).status, 404);
  assert.equal((await request(api, { method: 'POST' })).status, 404);
  assert.equal((await request(api, { url: '/api/handler?' + 'x'.repeat(8192) })).status, 414);
  assert.equal(queries, 181);
});

test('cloud admission caps simultaneous database work and resumes after completion', async () => {
  const pending = [];
  const api = createApi({ query: () => new Promise(resolve => pending.push(resolve)) }, { VERCEL: '1' });
  const calls = Array.from({ length: 32 }, () => request(api));
  assert.equal((await request(api)).status, 503);
  assert.equal(pending.length, 32);
  for (const resolve of pending.splice(0)) resolve([]);
  await Promise.all(calls);
  const resumed = request(api);
  assert.equal(pending.length, 1); pending[0]([]);
  assert.equal((await resumed).status, 200);
});
