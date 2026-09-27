/**
 * The netting report (docs/ARCHITECTURE.md §4). A pure function over ledger balances:
 * it never queries anything, so the same numbers render on the dashboard and in tests.
 */
import { minorToUsdCents } from '../fx/convert';
import type { FxSnapshot } from '../fx/types';
import { cashAccount, fxPosition, fxRounding } from '../ledger/accounts';
import { COUNTRIES, COUNTRY_CCY, COUNTRY_RAIL, CURRENCIES, type Ccy, type Country, type Line, type Rail } from '../ledger/types';

export interface ContributionFact {
  payerCountry: Country;
  recipientCountry: Country;
  /** The unit this contribution represents, in USD cents (the circle's $50). */
  unitUsdCents: bigint;
}

export interface NettingInput {
  balances: readonly Line[];
  contributions: readonly ContributionFact[];
  snapshot: FxSnapshot;
  /** The next round's payout, for pool health. */
  nextPayout?: { ccy: Ccy; amountMinor: bigint };
}

export interface PoolHealth {
  country: Country;
  rail: Rail;
  ccy: Ccy;
  cashMinor: bigint;
  nextPayoutMinor: bigint;
  ok: boolean;
}

export interface NettingReport {
  /** Everything members paid in, valued in USD. */
  movedUsdCents: bigint;
  /** What naive remittance would send: contributions from outside the recipient's country. */
  grossCrossBorderUsdCents: bigint;
  /** Σ positive fx:position balances, valued in USD. What would actually have to settle. */
  netCrossBorderUsdCents: bigint;
  /** Net as a percentage of moved, to one decimal. Display only. */
  crossedPct: number;
  /** fx:position and fx:rounding per currency, in minor units. All zero at the end of a balanced cycle. */
  residuals: Record<Ccy, { position: bigint; rounding: bigint }>;
  poolHealth: PoolHealth[];
}

export function nettingReport({ balances, contributions, snapshot, nextPayout }: NettingInput): NettingReport {
  const bal = (account: string, ccy: Ccy) =>
    balances.filter((b) => b.account === account && b.ccy === ccy).reduce((s, b) => s + b.amountMinor, 0n);

  let moved = 0n;
  let gross = 0n;
  for (const c of contributions) {
    moved += c.unitUsdCents;
    if (c.payerCountry !== c.recipientCountry) gross += c.unitUsdCents;
  }

  const residuals = {} as NettingReport['residuals'];
  let net = 0n;
  for (const ccy of CURRENCIES) {
    const position = bal(fxPosition(ccy), ccy);
    residuals[ccy] = { position, rounding: bal(fxRounding(ccy), ccy) };
    if (position > 0n) net += minorToUsdCents(position, ccy, snapshot);
  }

  const poolHealth = COUNTRIES.map((country): PoolHealth => {
    const ccy = COUNTRY_CCY[country];
    const rail = COUNTRY_RAIL[country];
    const cashMinor = bal(cashAccount(rail, ccy), ccy);
    const nextPayoutMinor = nextPayout?.ccy === ccy ? nextPayout.amountMinor : 0n;
    return { country, rail, ccy, cashMinor, nextPayoutMinor, ok: cashMinor >= nextPayoutMinor };
  });

  return {
    movedUsdCents: moved,
    grossCrossBorderUsdCents: gross,
    netCrossBorderUsdCents: net,
    crossedPct: moved === 0n ? 0 : Number((net * 1000n) / moved) / 10,
    residuals,
    poolHealth,
  };
}

/** "$1,234.50" from USD cents, without going through a float. */
export function formatUsd(cents: bigint): string {
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  const dollars = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const c = (abs % 100n).toString().padStart(2, '0');
  return `${neg ? '-' : ''}$${dollars}${c === '00' ? '' : `.${c}`}`;
}

/** The headline: "Moved $800 · Crossed a border $0 (0%)". */
export const headline = (r: NettingReport) =>
  `Moved ${formatUsd(r.movedUsdCents)} · Crossed a border ${formatUsd(r.netCrossBorderUsdCents)} (${r.crossedPct}%)`;
