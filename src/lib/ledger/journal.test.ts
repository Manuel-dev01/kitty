/** Invariant 1: every journal balances PER CURRENCY. */
import { describe, expect, it } from 'vitest';
import {
  UnbalancedJournal,
  cashAccount,
  fxPosition,
  makeLedger,
  memoryStore,
  potAccount,
  validateJournal,
  type Line,
} from '@/lib/ledger';

const ngnIn: Line[] = [
  { account: cashAccount('paystack', 'NGN'), ccy: 'NGN', amountMinor: 7_500_000n },
  { account: potAccount('c1', 'NGN'), ccy: 'NGN', amountMinor: -7_500_000n },
];

describe('Invariant 1: journals balance per currency', () => {
  it('accepts a balanced single-currency journal', () => {
    expect(() => validateJournal(ngnIn)).not.toThrow();
  });

  it('accepts a multi-currency journal where each currency balances on its own', () => {
    expect(() =>
      validateJournal([
        { account: potAccount('c1', 'NGN'), ccy: 'NGN', amountMinor: 7_500_000n },
        { account: fxPosition('NGN'), ccy: 'NGN', amountMinor: -7_500_000n },
        { account: fxPosition('KES'), ccy: 'KES', amountMinor: 650_000n },
        { account: potAccount('c1', 'KES'), ccy: 'KES', amountMinor: -650_000n },
      ]),
    ).not.toThrow();
  });

  it('rejects +100 NGN / -100 KES: zero as raw numbers, unbalanced per currency', () => {
    const lines: Line[] = [
      { account: cashAccount('paystack', 'NGN'), ccy: 'NGN', amountMinor: 100n },
      { account: cashAccount('daraja', 'KES'), ccy: 'KES', amountMinor: -100n },
    ];
    expect(() => validateJournal(lines)).toThrow(UnbalancedJournal);
    try {
      validateJournal(lines);
    } catch (e) {
      expect((e as UnbalancedJournal).imbalances).toEqual({ NGN: 100n, KES: -100n });
    }
  });

  it('rejects a one-sided journal', () => {
    expect(() => validateJournal([ngnIn[0]])).toThrow(UnbalancedJournal);
  });

  it('rejects floats and numbers anywhere near an amount', () => {
    const bad = [{ ...ngnIn[0], amountMinor: 75000.5 }, ngnIn[1]] as unknown as Line[];
    expect(() => validateJournal(bad)).toThrow(TypeError);
  });

  it('rejects zero lines, empty journals, unknown accounts and currency mismatches', () => {
    expect(() => validateJournal([])).toThrow(/no lines/);
    expect(() => validateJournal([{ ...ngnIn[0], amountMinor: 0n }])).toThrow(/Zero-amount/);
    expect(() => validateJournal([{ account: 'wallet:x', ccy: 'NGN', amountMinor: 1n }])).toThrow(/Unknown account/);
    expect(() => validateJournal([{ account: cashAccount('daraja', 'KES'), ccy: 'NGN', amountMinor: 1n }])).toThrow(
      /is KES/,
    );
  });

  it('postJournal refuses an unbalanced journal and writes nothing', async () => {
    const store = memoryStore();
    const ledger = makeLedger(store);
    await expect(ledger.postJournal('contribution', { type: 'contribution', id: 'x' }, [ngnIn[0]])).rejects.toThrow(
      UnbalancedJournal,
    );
    expect(store.journals()).toHaveLength(0);
  });

  it('the store re-checks at commit even if the app check is bypassed (mirrors the DB trigger)', async () => {
    const store = memoryStore();
    await expect(
      store.tx((t) => t.insertJournal('contribution', { type: 'contribution', id: 'raw' }, [ngnIn[0]])),
    ).rejects.toThrow(UnbalancedJournal);
    expect(store.journals()).toHaveLength(0);
  });
});
