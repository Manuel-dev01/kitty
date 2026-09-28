/** JSON responses where bigint money becomes a decimal string (never a float, never a crash). */
export function json(data: unknown, init?: ResponseInit): Response {
  const body = JSON.stringify(data, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
  return new Response(body, { ...init, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...init?.headers } });
}

/** Maps known errors to HTTP statuses; everything else is a 500 with the message (sandbox app, no secrets in errors). */
export function errorJson(e: unknown): Response {
  const err = e as Error & { httpStatus?: number };
  const status = err.httpStatus ?? (err.name === 'ProviderError' ? 502 : 500);
  if (status >= 500) console.error(err);
  return json({ error: err.message ?? String(e) }, { status });
}

/** Route ids are uuids; anything else is simply "not found" (not a 500 from Postgres' uuid parser). */
export const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
export const notFound = (what = 'Not found') => json({ error: what }, { status: 404 });
