import type { Ccy } from '../ledger/types';

/** Units of each currency per 1 USD, as exact decimal strings (major units, e.g. "1532.45"). */
export type Rates = Record<Ccy, string>;

export interface FxSnapshot {
  id?: string;
  source: 'open.er-api' | 'fallback' | 'test';
  takenAt: string;
  rates: Rates;
}
