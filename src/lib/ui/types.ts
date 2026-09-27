/** GET /api/rounds/:id as the browser receives it: bigint money arrives as decimal strings. */
export type Country = 'NG' | 'KE' | 'UG' | 'GH';
export type RoundStatus = 'open' | 'collecting' | 'funded' | 'paying' | 'paid' | 'withheld';
export type StepStatus = 'unpaid' | 'pending' | 'succeeded' | 'failed';

export interface Line {
  account: string;
  ccy: string;
  amountMinor: string;
}

export interface Contribution {
  id: string;
  member: { id: string; name: string; country: Country; rail: string; reputationScore: number; payoutPosition: number };
  ccy: string;
  amountMinor: string;
  railAmountMinor: string | null;
  railCcy: string | null;
  providerRef: string | null;
  status: StepStatus;
  promisedFor: string | null;
  railNote: string | null;
  simulated: string | null;
  replay: string | null;
}

export interface RoundState {
  circle: { id: string; name: string; status: 'draft' | 'active' | 'completed'; unitUsdCents: string };
  round: {
    id: string;
    index: number;
    status: RoundStatus;
    replayAllowed: boolean;
    recipient: { id: string; name: string; country: Country; ccy: string };
    fxSnapshot: { id: string; source: string; takenAt: string; rates: Record<string, string> };
  };
  contributions: Contribution[];
  payout: { id: string; status: 'pending' | 'succeeded' | 'failed'; ccy: string; amountMinor: string; providerRef: string | null; simulated: string | null } | null;
  journals: { id: string; kind: string; ref: { type: string; id: string }; createdAt: string; lines: Line[] }[];
  netting: {
    movedUsdCents: string;
    grossCrossBorderUsdCents: string;
    netCrossBorderUsdCents: string;
    crossedPct: number;
    residuals: Record<string, { position: string; rounding: string }>;
    poolHealth: { country: Country; rail: string; ccy: string; cashMinor: string; nextPayoutMinor: string; ok: boolean }[];
    headline: string;
  };
}
