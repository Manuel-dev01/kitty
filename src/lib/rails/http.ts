/**
 * Every provider call goes through here. Each one is recorded in `provider_calls` (request, response,
 * status, latency) with secrets scrubbed. That table is the audit trail and the source of replay fixtures.
 */
import { timingSafeEqual } from 'node:crypto';
import { getSql } from '../db';

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly op: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(`${provider}.${op} failed: HTTP ${status} ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    this.name = 'ProviderError';
  }
}

export interface ProviderRequest {
  provider: string;
  op: string;
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  /** JSON body. Amounts must already be strings or safe integers: bigint never reaches JSON. */
  body?: unknown;
  timeoutMs?: number;
  /** Extra facts to store with the request, e.g. both the ledger amount and the rail amount. */
  note?: Record<string, unknown>;
}

const SECRET_KEY = /^(authorization|password|passkey|securitycredential|secret|client_secret|access_token|refresh_token|token|api_?key)$/i;

/** Scrubs secrets from anything we store: sensitive keys, and any occurrence of known secret values. */
export function redact(value: unknown): unknown {
  const secrets = [process.env.KITTY_WEBHOOK_SECRET, process.env.PAYSTACK_SECRET_KEY, process.env.DARAJA_PASSKEY].filter(
    (s): s is string => !!s && s.length >= 8,
  );
  const scrub = (v: unknown): unknown => {
    if (typeof v === 'string') return secrets.reduce((s, secret) => s.split(secret).join('[redacted]'), v);
    if (Array.isArray(v)) return v.map(scrub);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) && typeof x !== 'object' ? '[redacted]' : scrub(x)]),
      );
    }
    return v;
  };
  return scrub(value);
}

async function record(row: { provider: string; op: string; request: unknown; response: unknown; status: number; ms: number }) {
  if (process.env.KITTY_RECORD_CALLS === '0' || !process.env.DATABASE_URL) return;
  try {
    const sql = getSql();
    await sql`
      insert into provider_calls (provider, op, request, response, status_code, ms)
      values (${row.provider}, ${row.op}, ${sql.json(redact(row.request) as never)}, ${sql.json(redact(row.response) as never)},
              ${row.status}, ${row.ms})`;
  } catch (e) {
    // Recording must never break a payment call.
    console.warn(`provider_calls not recorded for ${row.provider}.${row.op}: ${(e as Error).message}`);
  }
}

export async function providerFetch<T = unknown>(req: ProviderRequest): Promise<{ status: number; data: T }> {
  const t0 = performance.now();
  let status = 0;
  let data: unknown = null;
  let failure: unknown;
  try {
    const res = await fetch(req.url, {
      method: req.method,
      headers: { Accept: 'application/json', ...(req.body !== undefined && { 'Content-Type': 'application/json' }), ...req.headers },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(req.timeoutMs ?? 20_000),
      cache: 'no-store',
    });
    status = res.status;
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
  } catch (e) {
    failure = e;
  }
  const ms = Math.round(performance.now() - t0);
  await record({
    provider: req.provider,
    op: req.op,
    request: { method: req.method, url: req.url, body: req.body ?? null, ...req.note },
    response: failure ? { error: String(failure) } : data,
    status,
    ms,
  });
  if (failure) throw new ProviderError(req.provider, req.op, 0, String(failure));
  if (status >= 400) throw new ProviderError(req.provider, req.op, status, data);
  return { status, data: data as T };
}

/** Our public callback URL for a provider, carrying the shared secret (Daraja and MoMo can't sign callbacks). */
export function callbackUrl(path: string, opts: { tokenInPath?: boolean } = {}): string {
  const base = process.env.PUBLIC_BASE_URL;
  const secret = process.env.KITTY_WEBHOOK_SECRET;
  if (!base || !secret) throw new Error('PUBLIC_BASE_URL and KITTY_WEBHOOK_SECRET must be set');
  const root = `${base.replace(/\/$/, '')}${path}`;
  // tokenInPath: Daraja's sandbox delivered STK callbacks but no B2C results to a URL with a query string.
  return opts.tokenInPath ? `${root}/${encodeURIComponent(secret)}` : `${root}?t=${encodeURIComponent(secret)}`;
}

/**
 * Checks the `t` secret on an incoming Daraja/MoMo callback URL (timing-safe). A valid token only
 * lets the callback *nudge* reconciliation: the status is always re-read from the provider's API.
 */
export function hasValidCallbackToken(requestUrl: string): boolean {
  const secret = process.env.KITTY_WEBHOOK_SECRET;
  const url = new URL(requestUrl);
  const given = url.searchParams.get('t') ?? decodeURIComponent(url.pathname.split('/').pop() ?? ''); // query, or last path segment
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) throw new Error(`${name} is not set`);
  return v.trim();
}
