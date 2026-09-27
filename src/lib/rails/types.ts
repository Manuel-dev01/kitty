import type { Ccy, Country, Rail } from '../ledger/types';

export type { Ccy, Country, Rail };

/** A circle member (the `members` table, docs/ARCHITECTURE.md §3). */
export interface Member {
  id: string;
  circleId: string;
  name: string;
  country: Country;
  phone: string | null;
  email: string | null;
  rail: Rail;
  payoutPosition: number | null;
  reputationScore: number;
}

export type RailStatus = 'pending' | 'succeeded' | 'failed';

/** A verified provider webhook, reduced to what the ledger needs. `eventId` is the idempotency key. */
export interface NormalizedEvent {
  provider: Rail;
  eventId: string;
  op: 'collect' | 'payout';
  providerRef: string;
  status: RailStatus;
  payload: unknown;
}

/** docs/ARCHITECTURE.md §2, verbatim. */
export interface RailAdapter {
  country: Country;
  currency: Ccy;
  collect(req: { contributionId: string; member: Member; amountMinor: bigint }):
    Promise<{ providerRef: string; nextAction?: { type: 'redirect'; url: string } | { type: 'prompt_sent' } }>;
  collectStatus(providerRef: string): Promise<'pending' | 'succeeded' | 'failed'>;
  payout(req: { payoutId: string; member: Member; amountMinor: bigint }): Promise<{ providerRef: string }>;
  payoutStatus(providerRef: string): Promise<'pending' | 'succeeded' | 'failed'>;
  parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent | null>; // verifies signature
}

export class NotImplemented extends Error {
  constructor(what: string) {
    super(`Not implemented yet: ${what}`);
    this.name = 'NotImplemented';
  }
}

/** A stub adapter whose every call throws NotImplemented. Replaced one rail at a time (Role A). */
export function stubAdapter(name: string, country: Country, currency: Ccy): RailAdapter {
  const nope = (op: string) => async (): Promise<never> => {
    throw new NotImplemented(`${name}.${op}`);
  };
  return {
    country,
    currency,
    collect: nope('collect'),
    collectStatus: nope('collectStatus'),
    payout: nope('payout'),
    payoutStatus: nope('payoutStatus'),
    parseWebhook: nope('parseWebhook'),
  };
}
