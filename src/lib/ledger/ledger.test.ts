import { describe, expect, it } from 'vitest';
import type { FxSnapshot } from '@/lib/fx/types';
import {
  InsufficientPool,
  cashAccount,
  checkPools,
  contributionLines,
  floatEquity,
  floatSeedLines,
  fxPosition,
  fxRounding,
  localPrice,
  makeLedger,
  memoryStore,
  parseAccount,
  payoutLines,
  potAccount,
} from '@/lib/ledger';
import { newCircle } from '@/test/circle-sim';

const EXACT: FxSnapshot = {
  source: 'test',
  takenAt: '2026-09-26T00:00:00Z',
  rates: { NGN: '1500', KES: '130', UGX: '3700', GHS: '15' },
};

describe('account naming', () => {
  it('builds the §4 accounts and parses them back', () => {
    expect(cashAccount('daraja', 'KES')).toBe('cash:daraja:KES');
    expect(potAccount('c1', 'NGN')).toBe('circle:c1:pot:NGN');
    expect(fxPosition('UGX')).toBe('fx:position:UGX');
    expect(fxRounding('GHS')).toBe('fx:rounding:GHS');
    expect(floatEquity('KES')).toBe('equity:float:KES');

    expect(parseAccount('cash:momo:UGX')).toEqual({ type: 'cash', rail: 'momo', ccy: 'UGX' });
    expect(parseAccount('circle:c1:pot:GHS')).toEqual({ type: 'pot', circleId: 'c1', ccy: 'GHS' });
    expect(parseAccount('fx:position:NGN')).toEqual({ type: 'fx:position', ccy: 'NGN' });
    expect(() => parseAccount('cash:bank:NGN')).toThrow();
    expect(() => parseAccount('fx:position:USD')).toThrow();
  });
});

describe('Invariant 3: a pool never goes below zero', () => {
  it('checkPools refuses a debit larger than the pool', () => {
    const lines = payoutLines('c1', 'daraja', 'KES', 101n);
    expect(() => checkPools(() => 100n, lines)).toThrow(InsufficientPool);
    expect(() => checkPools(() => 101n, lines)).not.toThrow(); // exactly to zero is fine
  });

  it('a payout that would overdraw Kenya’s pool is refused and nothing is written', async () => {
    const circle = newCircle(EXACT);
    // Kenya's float covers only $100; round 1 pays $200 to Nairobi with only $50 collected there.
    await circle.seedFloats({ KE: 1_300_000n });
    await circle.collect(1, 'KE');

    const before = circle.store.journals().length;
    const pool = await circle.ledger.balance(cashAccount('daraja', 'KES'), 'KES');
    expect(pool).toBe(1_950_000n); // $100 float + $50 contribution

    await expect(circle.payout(1, 'KE')).rejects.toThrow(InsufficientPool);
    expect(circle.store.journals()).toHaveLength(before);
    expect(await circle.ledger.balance(cashAccount('daraja', 'KES'), 'KES')).toBe(pool);
  });

  it('with enough float the same payout goes through', async () => {
    const circle = newCircle(EXACT);
    await circle.seedFloats();
    await circle.collect(1, 'KE');
    await expect(circle.payout(1, 'KE')).resolves.toBe(2_600_000n); // KES 26,000.00 = $200
  });

  it('catches a one-cent float shortfall: price($150) ≠ 3 × price($50) at realistic rates', async () => {
    const realistic: FxSnapshot = { ...EXACT, rates: { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654' } };
    const circle = newCircle(realistic);
    // KES 19,401.255 → 1,940,126 cents, while 3 × 646,709 = 1,940,127. The pool is one cent short.
    await circle.seedFloats({ KE: localPrice(15000n, 'KES', realistic) });
    await circle.collect(1, 'KE');
    await expect(circle.payout(1, 'KE')).rejects.toThrow(/2586835 -> -1/);
  });

  it('the store backstop refuses an overdraft even if the app check is bypassed', async () => {
    const store = memoryStore();
    await expect(
      store.tx((t) => t.insertJournal('payout', { type: 'payout', id: 'raw' }, payoutLines('c1', 'daraja', 'KES', 1n))),
    ).rejects.toThrow(InsufficientPool);
    expect(store.journals()).toHaveLength(0);
  });
});

describe('idempotency', () => {
  const event = { provider: 'paystack', eventId: 'evt_charge_success_123', payload: { reference: 'ctb_1' } };
  const lines = contributionLines('c1', 'paystack', 'NGN', 7_500_000n);
  const ref = { type: 'contribution', id: 'ctb_1' };

  it('posting the same provider event twice creates one journal', async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);

    const first = await ledger.postProviderEvent(event, 'contribution', ref, lines);
    const second = await ledger.postProviderEvent(event, 'contribution', ref, lines);

    expect(first).toMatchObject({ created: true, duplicateEvent: false });
    expect(second).toEqual({ journalId: null, created: false, duplicateEvent: true });
    expect(store.journals()).toHaveLength(1);
    expect(await ledger.balance(cashAccount('paystack', 'NGN'), 'NGN')).toBe(7_500_000n);
  });

  it('two deliveries racing each other still create one journal', async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);
    const results = await Promise.all([
      ledger.postProviderEvent(event, 'contribution', ref, lines),
      ledger.postProviderEvent(event, 'contribution', ref, lines),
    ]);
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(store.journals()).toHaveLength(1);
  });

  it('a webhook and a status poll for the same contribution (different event ids) still post once', async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);
    const viaWebhook = await ledger.postProviderEvent(event, 'contribution', ref, lines);
    const viaPoll = await ledger.postProviderEvent({ provider: 'paystack', eventId: 'poll:ctb_1' }, 'contribution', ref, lines);
    expect(viaPoll).toEqual({ journalId: viaWebhook.journalId, created: false, duplicateEvent: false });
    expect(store.journals()).toHaveLength(1);
  });

  it('postJournal is idempotent on (kind, ref)', async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);
    await ledger.postJournal('float_seed', { type: 'pool', id: 'KE' }, floatSeedLines('daraja', 'KES', 100n));
    const a = await ledger.postJournal('contribution', ref, lines);
    const b = await ledger.postJournal('contribution', ref, lines);
    expect(b).toEqual({ journalId: a.journalId, created: false });
    expect(store.journals()).toHaveLength(2);
  });
});
