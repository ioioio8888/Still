import { neon } from '@neondatabase/serverless';

export function connectDatabase(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required. Connect a Neon database in Vercel Storage.');
  const sql = neon(connectionString);
  return {
    query: (text, params = []) => sql.query(text, params),
    transaction: statements => sql.transaction(statements.map(([text, params = []]) => sql.query(text, params)))
  };
}
