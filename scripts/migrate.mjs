// Applies db/migrations/*.sql in order, each in its own transaction, skipping ones already applied.
// Usage: npm run migrate   (reads the environment, then .env.local and .env, as Next does)
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import postgres from 'postgres';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile?.(file); // never overrides variables already set
  } catch {
    // File absent (CI, Vercel): use the real environment.
  }
}

// DDL goes over a direct connection, not the transaction pooler.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
console.log(`Migrating ${new URL(url).host}${new URL(url).pathname}`);

const dir = join(import.meta.dirname, '..', 'db', 'migrations');
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set((await sql`select name from schema_migrations`).map((r) => r.name));
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(dir, file), 'utf8');
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    console.log(`applied ${file}`);
    ran++;
  }
  console.log(ran ? `${ran} migration(s) applied.` : 'Up to date.');
} finally {
  await sql.end();
}
