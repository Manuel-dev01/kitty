/**
 * THE PITCH. A balanced 4-country circle, 4 rounds, constant FX snapshot:
 * every fx:position ends at zero, every pool ends where it started, and $600 of naive
 * remittance turns into $0 that actually has to cross a border.
 */
import { describe, expect, it } from 'vitest';
import type { FxSnapshot } from '@/lib/fx/types';
import {
  COUNTRIES,
  COUNTRY_CCY,
  COUNTRY_RAIL,
  CURRENCIES,
  cashAccount,
  fxPosition,
  potAccount,
  sumByCcy,
} from '@/lib/ledger';
import { headline, nettingReport } from '@/lib/netting';
import { CIRCLE, newCircle, PAYOUT_ORDER } from '@/test/circle-sim';

const snap = (rates: FxSnapshot['rates']): FxSnapshot => ({ source: 'test', takenAt: '2026-09-26T00:00:00Z', rates });

/** Rates at which every $50 converts to whole minor units. */
const EXACT = snap({ NGN: '1500', KES: '130', UGX: '3700', GHS: '15' });
/** Realistic, awkward rates: nothing divides evenly. */
const REALISTIC = snap({ NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654' });

async function runCycle(s: FxSnapshot) {
  const circle = newCircle(s);
  await circle.seedFloats();
  const reports = [];
  for (let r = 1; r <= 4; r++) {
    await circle.runRound(r);
    reports.push(nettingReport({ balances: await circle.ledger.balances(), contributions: circle.facts, snapshot: s }));
  }
  return { circle, reports, final: reports[3] };
}

async function expectPitch(s: FxSnapshot) {
  const { circle, reports, final } = await runCycle(s);

  // Invariant 1: every journal the cycle posted balances per currency.
  const journals = circle.store.journals();
  expect(journals).toHaveLength(4 + 4 * (4 + 1 + 1)); // seeds + per round: 4 contributions, 1 conversion, 1 payout
  for (const j of journals) for (const sum of sumByCcy(j.lines).values()) expect(sum).toBe(0n);

  // Invariant 2: every fx:position is exactly zero after the final round.
  for (const ccy of CURRENCIES) {
    expect(await circle.ledger.balance(fxPosition(ccy), ccy), `fx:position:${ccy}`).toBe(0n);
    expect(final.residuals[ccy]).toEqual({ position: 0n, rounding: 0n });
  }

  // The money never left home: each pool is back to its float seed, and the pots are empty.
  for (const c of COUNTRIES) {
    const ccy = COUNTRY_CCY[c];
    expect(await circle.ledger.balance(cashAccount(COUNTRY_RAIL[c], ccy), ccy), `cash pool ${c}`).toBe(circle.seeds.get(c));
    expect(await circle.ledger.balance(potAccount(CIRCLE, ccy), ccy)).toBe(0n);
  }

  // The headline numbers.
  expect(final.movedUsdCents).toBe(80000n); // $800
  expect(final.grossCrossBorderUsdCents).toBe(60000n); // $600 naive remittance
  expect(final.netCrossBorderUsdCents).toBe(0n); // $0 net
  expect(headline(final)).toBe('Moved $800 · Crossed a border $0 (0%)');

  return { circle, reports, final };
}

describe('Invariant 2: a balanced circle nets to zero across borders', () => {
  it('exact snapshot: every fx:position is exactly 0 after round 4, gross $600, net $0', async () => {
    const { reports } = await expectPitch(EXACT);

    // Demo beat after round 1 (the Nairobi payout): "Moved $200 · Crossed a border $150".
    expect(reports[0].movedUsdCents).toBe(20000n);
    expect(reports[0].netCrossBorderUsdCents).toBe(15000n);
    expect(headline(reports[0])).toBe('Moved $200 · Crossed a border $150 (75%)');
  });

  it('realistic snapshot: residuals are within one minor unit per conversion (in fact exactly 0), gross $600', async () => {
    const { final } = await expectPitch(REALISTIC);
    for (const ccy of CURRENCIES) {
      const r = final.residuals[ccy].position;
      const conversionsInto = 3n; // three other members' contributions convert into each currency once per cycle
      expect(r < 0n ? -r : r).toBeLessThanOrEqual(conversionsInto);
    }
  });

  it('holds for 200 random realistic snapshots', async () => {
    let x = 0x9e3779b9;
    const next = () => {
      x ^= x << 13;
      x >>>= 0;
      x ^= x >>> 17;
      x ^= x << 5;
      x >>>= 0;
      return x;
    };
    const dec = (lo: number, hi: number, digits: number) =>
      `${lo + (next() % (hi - lo + 1))}.${String(next() % 10 ** digits).padStart(digits, '0')}`;

    for (let i = 0; i < 200; i++) {
      const s = snap({ NGN: dec(900, 2500, 6), KES: dec(100, 180, 4), UGX: dec(2800, 4800, 6), GHS: dec(8, 20, 5) });
      const { final } = await runCycle(s);
      for (const ccy of CURRENCIES) expect(final.residuals[ccy].position, `${JSON.stringify(s.rates)} ${ccy}`).toBe(0n);
      expect(final.grossCrossBorderUsdCents).toBe(60000n);
      expect(final.netCrossBorderUsdCents).toBe(0n);
    }
  });

  it('mid-cycle the float imbalance is visible and shrinks to zero', async () => {
    const { reports } = await runCycle(EXACT);
    expect(reports.map((r) => r.netCrossBorderUsdCents)).toEqual([15000n, 20000n, 15000n, 0n]);
    expect(PAYOUT_ORDER).toEqual(['KE', 'NG', 'UG', 'GH']);
  });
});
