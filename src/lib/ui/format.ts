/** Money formatting from decimal-string minor units, with BigInt: never a float. */
import type { Country } from './types';

const DECIMALS: Record<string, number> = { NGN: 2, KES: 2, UGX: 0, GHS: 2, EUR: 2, USD: 2 };
const SYMBOL: Record<string, string> = { NGN: '₦', KES: 'KSh ', UGX: 'USh ', GHS: 'GH₵', EUR: '€', USD: '$' };

export function fmtMinor(value: string | bigint, ccy: string, opts: { sign?: boolean; dropZeroCents?: boolean } = {}): string {
  let n = BigInt(value);
  const negative = n < 0n;
  if (negative) n = -n;
  const d = DECIMALS[ccy] ?? 2;
  const p = 10n ** BigInt(d);
  const whole = (n / p).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const cents = d ? (n % p).toString().padStart(d, '0') : '';
  const frac = d && !(opts.dropZeroCents && /^0+$/.test(cents)) ? `.${cents}` : '';
  const sign = negative ? '−' : opts.sign && n > 0n ? '+' : '';
  return `${sign}${SYMBOL[ccy] ?? `${ccy} `}${whole}${frac}`;
}

export const fmtUsd = (cents: string | bigint) => fmtMinor(cents, 'USD', { dropZeroCents: true });

export const COUNTRY: Record<Country, { city: string; name: string; color: string; rail: string; lon: number; lat: number }> = {
  NG: { city: 'Lagos', name: 'Nigeria', color: 'var(--ng)', rail: 'Paystack', lon: 3.39, lat: 6.52 },
  KE: { city: 'Nairobi', name: 'Kenya', color: 'var(--ke)', rail: 'M-Pesa · Daraja', lon: 36.82, lat: -1.29 },
  UG: { city: 'Kampala', name: 'Uganda', color: 'var(--ug)', rail: 'MTN MoMo', lon: 32.58, lat: 0.35 },
  GH: { city: 'Accra', name: 'Ghana', color: 'var(--gh)', rail: 'MTN MoMo', lon: -0.19, lat: 5.6 },
};

export const shortRef = (ref: string | null) => (!ref ? '—' : ref.length > 22 ? `${ref.slice(0, 12)}…${ref.slice(-6)}` : ref);

/** Σ per currency of a journal's lines: the visible proof that it balances (Invariant 1). */
export function sumsByCcy(lines: { ccy: string; amountMinor: string }[]) {
  const m = new Map<string, bigint>();
  for (const l of lines) m.set(l.ccy, (m.get(l.ccy) ?? 0n) + BigInt(l.amountMinor));
  return [...m.entries()];
}
