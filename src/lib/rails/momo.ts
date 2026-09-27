// MTN MoMo (UG + GH, sandbox settles in EUR). collect = RequestToPay, payout = disbursement transfer.
// The ledger holds UGX/GHS; the adapter will send the EUR equivalent at the round's snapshot.
// Not implemented yet: see docs/ARCHITECTURE.md §2 and the Role A prompt.
import { stubAdapter, type RailAdapter } from './types';

export function makeMomo(country: 'UG' | 'GH'): RailAdapter {
  return stubAdapter(`momo:${country}`, country, country === 'UG' ? 'UGX' : 'GHS');
}

export const momoUG = makeMomo('UG');
export const momoGH = makeMomo('GH');
