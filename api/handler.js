import { connectDatabase } from '../lib/neon.mjs';
import { createApi } from '../lib/api.mjs';

let handler;
export default async function api(req, res) {
  if (!process.env.DATABASE_URL) {
    res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ error: '暫時未能連接留言板，請稍後再試。' }));
  }
  handler ||= createApi(connectDatabase());
  return handler(req, res);
}
