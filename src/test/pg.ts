/** A throwaway, migrated Postgres schema per test (TEST_DATABASE_URL). Never touches real data. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeSql, type Sql } from '@/lib/db';

export const testDbUrl = process.env.TEST_DATABASE_URL;

export async function freshSchema(): Promise<{ sql: Sql; drop: () => Promise<void> }> {
  const schema = `kitty_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  const admin = makeSql(testDbUrl!, { max: 1 });
  await admin.unsafe(`create schema ${schema}`);
  const sql = makeSql(testDbUrl!, { max: 4, connection: { search_path: schema } });
  const dir = join(process.cwd(), 'db', 'migrations');
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) await sql.unsafe(readFileSync(join(dir, f), 'utf8'));
  return {
    sql,
    drop: async () => {
      await sql.end();
      await admin.unsafe(`drop schema if exists ${schema} cascade`).catch(() => {});
      await admin.end();
    },
  };
}
