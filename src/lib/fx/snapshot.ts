import fallback from '../../../data/fx-fallback.json';
import { getSql } from '../db';
import { CURRENCIES, type Ccy } from '../ledger/types';
import { parseDecimal } from './rational';
import type { FxSnapshot, Rates } from './types';

export const FX_URL = 'https://open.er-api.com/v6/latest/USD';

/**
 * Pulls NGN/KES/UGX/GHS out of the raw response TEXT as decimal strings.
 * JSON.parse would turn them into floats first; this way a rate is never a float.
 */
export function parseRatesText(text: string): Rates {
  if (!/"result"\s*:\s*"success"/.test(text)) throw new Error('FX API did not report success');
  const rates = {} as Rates;
  for (const ccy of CURRENCIES) {
    const m = new RegExp(`"${ccy}"\\s*:\\s*([0-9.eE+-]+)`).exec(text);
    if (!m) throw new Error(`FX API response has no ${ccy} rate`);
    if (parseDecimal(m[1]).num <= 0n) throw new Error(`FX API gave a non-positive ${ccy} rate`);
    rates[ccy] = m[1];
  }
  return rates;
}

export async function fetchRates(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 5000,
): Promise<Rates> {
  const res = await fetchImpl(FX_URL, { signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
  if (!res.ok) throw new Error(`FX API HTTP ${res.status}`);
  return parseRatesText(await res.text());
}

export function fallbackSnapshot(): FxSnapshot {
  return { source: 'fallback', takenAt: fallback.takenAt, rates: fallback.rates as Record<Ccy, string> };
}

/** Live rates if the API answers in time, otherwise the labelled fallback file. Never throws. */
export async function getRates(fetchImpl: typeof fetch = fetch, timeoutMs = 5000): Promise<FxSnapshot> {
  try {
    const rates = await fetchRates(fetchImpl, timeoutMs);
    return { source: 'open.er-api', takenAt: new Date().toISOString(), rates };
  } catch {
    return fallbackSnapshot();
  }
}

/** Takes a snapshot and stores it in fx_snapshots. A round keeps using this one snapshot throughout. */
export async function takeSnapshot(fetchImpl: typeof fetch = fetch): Promise<FxSnapshot> {
  const snap = await getRates(fetchImpl);
  const sql = getSql();
  const [row] = await sql<{ id: string }[]>`
    insert into fx_snapshots (source, rates) values (${snap.source}, ${sql.json(snap.rates)}) returning id`;
  return { ...snap, id: row.id };
}
