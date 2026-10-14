import { createHash, randomBytes } from 'node:crypto';
import { isIP } from 'node:net';

export function clientAddress(req, env = process.env) {
  // Only Vercel's overwritten header is trusted in cloud mode.
  const value = env.VERCEL === '1' ? req.headers['x-vercel-forwarded-for'] : req.socket?.remoteAddress;
  if (typeof value !== 'string') return null;
  const ip = value.split(',')[0].trim();
  const version = isIP(ip);
  if (!version) return null;
  return version === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
}

// In-memory admission control: no database/remote calls for rejected requests.
// This is per process, not a replacement for distributed edge/WAF protection.
export function createRequestGuard({ now = Date.now, windowMs = 60000, requests = 180, writes = 60, concurrent = 32, maxClients = 10000 } = {}) {
  const clients = new Map();
  const salt = randomBytes(32);
  let active = 0, swept = 0;
  return function admit(ip, method) {
    if (!ip) return { status: 503, retryAfter: 5 };
    const time = now();
    if (time - swept >= 10000) {
      for (const [key, entry] of clients) if (entry.expires <= time) clients.delete(key);
      swept = time;
    }
    const key = createHash('sha256').update(salt).update(ip).digest('hex');
    let entry = clients.get(key);
    if (entry?.expires <= time) { clients.delete(key); entry = null; }
    if (!entry) {
      // Do not evict active buckets: address churn must not reset their limits.
      if (clients.size >= maxClients) return { status: 503, retryAfter: Math.max(1, Math.ceil(windowMs / 1000)) };
      entry = { expires: time + windowMs, count: 0, writes: 0 };
      clients.set(key, entry);
    }
    const write = method !== 'GET';
    if (entry.count >= requests || (write && entry.writes >= writes)) {
      return { status: 429, retryAfter: Math.max(1, Math.ceil((entry.expires - time) / 1000)) };
    }
    if (active >= concurrent) return { status: 503, retryAfter: 1 };
    entry.count++;
    if (write) entry.writes++;
    active++;
    let released = false;
    return { release() { if (!released) { released = true; active--; } } };
  };
}

export function allowedApiMethod(path, method) {
  if (path === '/api/listen') return method === 'GET';
  if (path === '/api/letters') return method === 'GET' || method === 'POST';
  if (/^\/api\/letters\/[a-f0-9]{32}$/.test(path)) return method === 'DELETE';
  if (/^\/api\/letters\/[a-f0-9]{32}\/(reaction|report)$/.test(path)) return method === 'POST';
  return false;
}
