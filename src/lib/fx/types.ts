import type { Ccy } from '../ledger/types';

/**
 * Units of each currency per 1 USD, as exact decimal strings (major units, e.g. "1532.45").
 * EUR is carried only because the MoMo sandbox settles in EUR; it never appears in the ledger.
 */
export type Rates = Record<Ccy, string> & { EUR?: string };

export interface FxSnapshot {
  id?: string;
  source: 'open.er-api' | 'fallback' | 'test';
  takenAt: string;
  rates: Rates;
}
