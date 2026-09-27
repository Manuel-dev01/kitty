// Creates the MTN MoMo sandbox API user + API key for Collections and Disbursements.
// The portal only gives you subscription keys (Profile page, "Primary key" per product);
// the API user and key are generated here via MoMo's sandbox provisioning API.
//
// Usage:
//   npm run momo:provision                 prints the four MOMO_*_API_USER / _API_KEY values
//   npm run momo:provision -- --vercel     also saves them to Vercel env (production + development)
//
// Needs MOMO_COLLECTION_SUBSCRIPTION_KEY and MOMO_DISBURSEMENT_SUBSCRIPTION_KEY in the environment,
// .env.local or .env. Safe to re-run: each run creates a fresh API user.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile?.(file);
  } catch {
    // File absent: use the real environment.
  }
}

const BASE = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';
const CALLBACK_HOST = new URL(process.env.PUBLIC_BASE_URL || 'https://kitty-ebon-kappa.vercel.app').host;
const toVercel = process.argv.includes('--vercel');

const PRODUCTS = [
  { name: 'collection', env: 'MOMO_COLLECTION' },
  { name: 'disbursement', env: 'MOMO_DISBURSEMENT' },
];

async function call(method, path, subscriptionKey, headers = {}, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function provision({ name, env }) {
  const subscriptionKey = process.env[`${env}_SUBSCRIPTION_KEY`];
  if (!subscriptionKey) throw new Error(`${env}_SUBSCRIPTION_KEY is not set (MoMo portal → Profile → ${name} Primary key)`);

  const apiUser = randomUUID();
  await call('POST', '/v1_0/apiuser', subscriptionKey, { 'X-Reference-Id': apiUser }, { providerCallbackHost: CALLBACK_HOST });
  const { apiKey } = await call('POST', `/v1_0/apiuser/${apiUser}/apikey`, subscriptionKey);

  // Prove the pair works before anyone relies on it.
  const basic = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');
  const token = await call('POST', `/${name}/token/`, subscriptionKey, { Authorization: `Basic ${basic}` });
  if (!token?.access_token) throw new Error(`${name}: token request returned no access_token`);

  console.log(`✓ ${name}: API user created and a token was issued`);
  return { [`${env}_API_USER`]: apiUser, [`${env}_API_KEY`]: apiKey };
}

function saveToVercel(name, value) {
  for (const target of ['production', 'development']) {
    // `name` and `target` are fixed identifiers; the secret value only ever travels on stdin.
    spawnSync(`vercel env rm ${name} ${target} --yes`, { stdio: 'ignore', shell: true });
    const r = spawnSync(`vercel env add ${name} ${target}`, { input: value, stdio: ['pipe', 'ignore', 'pipe'], shell: true });
    if (r.status !== 0) throw new Error(`vercel env add ${name} ${target} failed: ${r.stderr}`);
  }
  console.log(`✓ saved ${name} to Vercel (production, development)`);
}

const out = {};
for (const p of PRODUCTS) Object.assign(out, await provision(p));

if (toVercel) {
  for (const [k, v] of Object.entries(out)) saveToVercel(k, v);
  console.log('\nNow run: vercel env pull .env.local');
} else {
  console.log('\nAdd these with `vercel env add <NAME>`, or re-run with -- --vercel to save them automatically:\n');
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
}
