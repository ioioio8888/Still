import { readFileSync } from 'node:fs';
import { connectDatabase } from '../lib/neon.mjs';

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
try {
  const db = connectDatabase();
  await db.transaction(schema.split('-- statement-breakpoint').map(s => s.trim()).filter(Boolean).map(s => [s]));
  console.log('PostgreSQL schema ready. Existing notes preserved.');
} catch {
  console.error('Database setup failed. Check DATABASE_URL and Neon connectivity. No credentials were logged.');
  process.exitCode = 1;
}
