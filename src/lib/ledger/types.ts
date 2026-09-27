export type Country = 'NG' | 'KE' | 'UG' | 'GH';
export type Ccy = 'NGN' | 'KES' | 'UGX' | 'GHS';
export type Rail = 'paystack' | 'daraja' | 'momo';

export const COUNTRIES: readonly Country[] = ['NG', 'KE', 'UG', 'GH'];
export const CURRENCIES: readonly Ccy[] = ['NGN', 'KES', 'UGX', 'GHS'];

export const COUNTRY_CCY: Record<Country, Ccy> = { NG: 'NGN', KE: 'KES', UG: 'UGX', GH: 'GHS' };
export const COUNTRY_RAIL: Record<Country, Rail> = { NG: 'paystack', KE: 'daraja', UG: 'momo', GH: 'momo' };

/** Decimal places of each currency's minor unit. The circle's unit (USD) is held in cents. */
export const MINOR_UNITS: Record<Ccy | 'USD', number> = { NGN: 2, KES: 2, UGX: 0, GHS: 2, USD: 2 };

export type JournalKind = 'contribution' | 'conversion' | 'payout' | 'float_seed' | 'fee';

/** One journal line. Positive = debit, negative = credit. Always bigint minor units. */
export interface Line {
  account: string;
  ccy: Ccy;
  amountMinor: bigint;
}

/** What a journal is about, e.g. { type: 'contribution', id: '<uuid>' }. (kind, ref) is unique. */
export interface Ref {
  type: string;
  id: string;
}
