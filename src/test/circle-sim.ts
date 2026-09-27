/**
 * Test helper: runs a four-country circle through the ledger using the real journal builders.
 * One member per country, a $50 unit, one constant snapshot per cycle.
 */
import type { FxSnapshot } from '@/lib/fx/types';
import {
  COUNTRIES,
  COUNTRY_CCY,
  COUNTRY_RAIL,
  contributionLines,
  conversionLines,
  floatSeedLines,
  localPrice,
  makeLedger,
  memoryStore,
  payoutLines,
  potAccount,
  type Country,
  type LedgerStore,
  type PotSource,
} from '@/lib/ledger';
import type { ContributionFact } from '@/lib/netting';

export const UNIT = 5000n; // $50.00
export const CIRCLE = 'c1';
/** Kenya first, as in the demo: the first pot pays out in Nairobi. */
export const PAYOUT_ORDER: Country[] = ['KE', 'NG', 'UG', 'GH'];

export function newCircle<S extends LedgerStore = ReturnType<typeof memoryStore>>(
  snap: FxSnapshot,
  store: S = memoryStore() as unknown as S,
  seedUnits = 3n,
) {
  const ledger = makeLedger(store);
  const facts: ContributionFact[] = [];
  const seeds = new Map<Country, bigint>();

  async function seedFloats(overrides: Partial<Record<Country, bigint>> = {}) {
    for (const c of COUNTRIES) {
      const ccy = COUNTRY_CCY[c];
      // Float is sized in whole units: 3 × price($50), not price($150). Rounding makes them differ by
      // a minor unit, and Invariant 3 will (rightly) refuse a payout that is one cent short.
      const amount = overrides[c] ?? localPrice(UNIT, ccy, snap) * seedUnits;
      seeds.set(c, amount);
      await ledger.postJournal('float_seed', { type: 'pool', id: c }, floatSeedLines(COUNTRY_RAIL[c], ccy, amount));
    }
  }

  async function collect(round: number, recipient: Country) {
    const sources: PotSource[] = [];
    for (const c of COUNTRIES) {
      const ccy = COUNTRY_CCY[c];
      const amount = localPrice(UNIT, ccy, snap);
      await ledger.postJournal(
        'contribution',
        { type: 'contribution', id: `${round}:${c}` },
        contributionLines(CIRCLE, COUNTRY_RAIL[c], ccy, amount),
      );
      sources.push({ ccy, amountMinor: amount, unitUsdCents: UNIT });
      facts.push({ payerCountry: c, recipientCountry: recipient, unitUsdCents: UNIT });
    }
    const target = COUNTRY_CCY[recipient];
    await ledger.postJournal('conversion', { type: 'round', id: String(round) }, conversionLines(CIRCLE, target, sources, snap));
  }

  async function payout(round: number, recipient: Country) {
    const ccy = COUNTRY_CCY[recipient];
    const pot = -(await ledger.balance(potAccount(CIRCLE, ccy), ccy)); // the pot is a credit balance
    await ledger.postJournal('payout', { type: 'payout', id: String(round) }, payoutLines(CIRCLE, COUNTRY_RAIL[recipient], ccy, pot));
    return pot;
  }

  async function runRound(round: number) {
    const recipient = PAYOUT_ORDER[round - 1];
    await collect(round, recipient);
    return payout(round, recipient);
  }

  return { store, ledger, facts, seeds, seedFloats, collect, payout, runRound };
}
