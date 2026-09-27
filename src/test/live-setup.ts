// Loads sandbox keys for live tests. provider_calls are recorded into TEST_DATABASE_URL when set
// (a local Postgres), so live runs never write test traffic into the shared Neon database.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // absent
  }
}
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else process.env.KITTY_RECORD_CALLS = '0';
