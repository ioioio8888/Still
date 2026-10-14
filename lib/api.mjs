import { randomBytes, createHash, createHmac } from 'node:crypto';
import { moderate } from '../moderation.mjs';
import { excludedIds, RECENCY_WINDOW } from './listening.mjs';
import { createRequestGuard, clientAddress, allowedApiMethod } from './request-guard.mjs';

const moods = ['未說出口', '有點疲累', '想念', '慢慢放下', '其他'];
const hour = 3600000;
const hash = value => createHash('sha256').update(value).digest('hex');

async function readInput(req) {
  let value = req.body;
  if (value === undefined) {
    const chunks = [];
    let size = 0;
    for await (const part of req) {
      const chunk = Buffer.from(part);
      size += chunk.length;
      if (size > 20000) throw Object.assign(new Error('Body too large'), { status: 413 });
      chunks.push(chunk);
    }
    value = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (Buffer.byteLength(typeof value === 'string' ? value : JSON.stringify(value) ?? '') > 20000) {
    throw Object.assign(new Error('Body too large'), { status: 413 });
  }
  try { if (typeof value === 'string') value = JSON.parse(value); }
  catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('Invalid JSON'), { status: 400 });
  return value;
}

export function createApi(db, env = process.env) {
  const admit = createRequestGuard();
  return async function handler(req, res) {
    let release = () => {};
    const json = (status, body) => {
      res.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer'
      });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.url.length > 8192) return json(414, { error: '網址太長了。' });
      const url = new URL(req.url, 'http://localhost');
      // Vercel rewrites carry the original API suffix as a routing parameter.
      const path = url.pathname === '/api/handler' ? '/api/' + (url.searchParams.get('route') || '') : url.pathname;
      if (!allowedApiMethod(path, req.method)) return json(404, { error: '找不到這個頁面。' });
      const ip = clientAddress(req, env);
      const admission = admit(ip, req.method);
      if (admission.status) {
        res.setHeader('Retry-After', String(admission.retryAfter));
        return json(admission.status, { error: '請稍後再試。' });
      }
      release = admission.release;
      const secure = env.VERCEL === '1' || env.COOKIE_SECURE === '1';
      const origin = env.PUBLIC_ORIGIN || `${secure ? 'https' : 'http'}://${req.headers.host}`;
      if (req.method !== 'GET') {
        if ((req.headers.origin && req.headers.origin !== origin) || req.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: '請從網站內操作。' });
        if (!(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) return json(415, { error: '請使用 JSON。' });
      }
      let token = /(?:^|;\s*)visitor=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
      if (!token) {
        token = randomBytes(32).toString('hex');
        res.setHeader('Set-Cookie', `visitor=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=31536000${secure ? '; Secure' : ''}`);
      }
      const owner = hash(token);
      const input = req.method === 'POST' ? await readInput(req) : {};
      if (req.method === 'GET' && path === '/api/listen') {
        const excluded = excludedIds(url.searchParams.get('exclude') || '');
        const [row] = await db.query(`SELECT l.id, l.body, l.mood, l.created,
          EXISTS (SELECT 1 FROM reactions r WHERE r.letter = l.id AND r.owner = $1) AS reacted
          FROM letters l WHERE l.hidden = 0 AND l.owner <> $1 AND NOT (l.id = ANY($2::text[]))
          ORDER BY -ln(greatest(random(), 0.000001)) /
            (0.2 + 0.8 * exp(-greatest(0::double precision, $3::double precision - l.created::double precision) / $4::double precision))
          LIMIT 1`, [owner, excluded, Date.now(), RECENCY_WINDOW]);
        if (!row) return json(200, { letter: null });
        const { reacted, ...letter } = row;
        return json(200, { letter: { ...letter, created: Number(letter.created), reactions: reacted ? ['heard'] : [] } });
      }
      if (req.method === 'GET' && path === '/api/letters') {
        const mine = url.searchParams.get('mine') === '1';
        const mood = url.searchParams.get('mood') || '';
        const page = Math.max(0, Math.min(100000, Number.parseInt(url.searchParams.get('page') || '0') || 0));
        const rows = await db.query(`SELECT l.id, l.body, l.mood, l.created, l.hidden, l.owner = $1 AS mine,
          EXISTS (SELECT 1 FROM reactions r WHERE r.letter = l.id AND r.owner = $1) AS reacted,
          (l.owner = $1 AND EXISTS (SELECT 1 FROM reactions r WHERE r.letter = l.id)) AS supported
          FROM letters l WHERE ${mine ? 'l.owner = $1' : "l.hidden = 0 AND ($2 = '' OR l.mood = $2)"}
          ORDER BY l.created DESC, l.id DESC LIMIT 10 OFFSET $${mine ? 2 : 3}`, mine ? [owner, page * 9] : [owner, mood, page * 9]);
        return json(200, { letters: rows.slice(0, 9).map(({ reacted, ...row }) => ({ ...row, created: Number(row.created), reactions: reacted ? ['heard'] : [] })), more: rows.length > 9 });
      }
      if (req.method === 'POST' && path === '/api/letters') {
        const body = typeof input.body === 'string' ? input.body.trim() : '';
        if (!body || body.length > 200 || !moods.includes(input.mood)) return json(400, { error: '請寫低 1 至 200 字，並選擇分類。' });
        const violation = moderate(body);
        if (violation) return json(422, { code: violation, error: '內容不符合公開留言規則。' });
        // Vercel overwrites this header. Never trust forwarded IP headers in local mode.
        const secret = env.RATE_LIMIT_SECRET || env.DATABASE_URL;
        if (!secret) throw new Error('Rate limit secret unavailable');
        const key = createHmac('sha256', secret).update(ip).digest('hex');
        const now = Date.now();
        const id = randomBytes(16).toString('hex');
        // A single atomic statement shares a rolling-hour allowance across all instances.
        const [, inserted] = await db.transaction([
          ['DELETE FROM rate_limits WHERE started <= $1', [now - hour]],
          [`WITH allowance AS (
            INSERT INTO rate_limits (key, started, count) VALUES ($1, $2, 1)
            ON CONFLICT (key) DO UPDATE SET
              count = CASE WHEN rate_limits.started <= $3 THEN 1 ELSE rate_limits.count + 1 END,
              started = CASE WHEN rate_limits.started <= $3 THEN $2 ELSE rate_limits.started END
            WHERE rate_limits.started <= $3 OR rate_limits.count < 20
            RETURNING key
          ) INSERT INTO letters (id, owner, body, mood, created)
            SELECT $4, $5, $6, $7, $2 FROM allowance RETURNING id`, [key, now, now - hour, id, owner, body, input.mood]]
        ]);
        if (!inserted.length) return json(429, { error: '寫咗好多，稍後再試。' });
        return json(201, { id });
      }
      const match = /^\/api\/letters\/([a-f0-9]{32})(?:\/(reaction|report))?$/.exec(path);
      if (match) {
        const [, id, action] = match;
        const [letter] = await db.query('SELECT owner, hidden FROM letters WHERE id = $1', [id]);
        if (!letter || (letter.hidden && letter.owner !== owner)) return json(404, { error: '呢段心事已經收起了。' });
        if (req.method === 'DELETE' && !action) {
          if (letter.owner !== owner) return json(403, { error: '只可以刪除自己嘅心事。' });
          await db.query('DELETE FROM letters WHERE id = $1 AND owner = $2', [id, owner]);
          return json(200, { ok: true });
        }
        if (req.method === 'POST' && action === 'reaction') {
          if (input.kind !== 'heard' || letter.owner === owner) return json(400, { error: '將呢份支持留畀其他人吧。' });
          await db.query(`INSERT INTO reactions (letter, owner, kind)
            SELECT id, $2, 'heard' FROM letters WHERE id = $1 AND hidden = 0 AND owner <> $2
            ON CONFLICT DO NOTHING`, [id, owner]);
          return json(200, { ok: true });
        }
        if (req.method === 'POST' && action === 'report') {
          // Serialize reports for this letter so simultaneous reports cannot miss the threshold.
          await db.transaction([
            ['SELECT id FROM letters WHERE id = $1 FOR UPDATE', [id]],
            ['INSERT INTO reports (letter, owner) SELECT id, $2 FROM letters WHERE id = $1 ON CONFLICT DO NOTHING', [id, owner]],
            ['UPDATE letters SET hidden = 1 WHERE id = $1 AND (SELECT count(*) FROM reports WHERE letter = $1) >= 3', [id]]
          ]);
          return json(200, { ok: true });
        }
      }
      return json(404, { error: '找不到這個頁面。' });
    } catch (error) {
      // Do not log request bodies, database URLs or raw database errors.
      if (!error.status) console.error('API request failed', error.code || error.name);
      return json(error.status || 500, { error: error.status === 413 ? '文字太長了。' : error.status === 400 ? '資料格式有誤。' : '暫時未能完成，請稍後再試。' });
    } finally { release(); }
  };
}
