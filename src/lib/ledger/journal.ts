import { isCashAccount, parseAccount } from './accounts';
import type { Ccy, Line } from './types';

export class UnbalancedJournal extends Error {
  constructor(readonly imbalances: Partial<Record<Ccy, bigint>>) {
    const detail = Object.entries(imbalances)
      .map(([ccy, v]) => `${ccy} ${v}`)
      .join(', ');
    super(`Journal does not balance per currency: ${detail}`);
    this.name = 'UnbalancedJournal';
  }
}

export class InsufficientPool extends Error {
  constructor(
    readonly account: string,
    readonly ccy: Ccy,
    readonly balanceMinor: bigint,
    readonly wouldBeMinor: bigint,
  ) {
    super(`Pool ${account} would go below zero: ${balanceMinor} -> ${wouldBeMinor}`);
    this.name = 'InsufficientPool';
  }
}

/** Σ amount per currency. */
export function sumByCcy(lines: readonly Line[]): Map<Ccy, bigint> {
  const sums = new Map<Ccy, bigint>();
  for (const l of lines) sums.set(l.ccy, (sums.get(l.ccy) ?? 0n) + l.amountMinor);
  return sums;
}

/**
 * Invariant 1: every journal balances per currency. Also rejects anything that isn't a bigint
 * (a float or number anywhere near an amount is a bug), zero lines, and malformed accounts.
 */
export function validateJournal(lines: readonly Line[]): void {
  if (lines.length === 0) throw new Error('Journal has no lines');
  for (const l of lines) {
    if (typeof l.amountMinor !== 'bigint') {
      throw new TypeError(`amountMinor must be a bigint, got ${typeof l.amountMinor} on ${l.account}`);
    }
    if (l.amountMinor === 0n) throw new Error(`Zero-amount line on ${l.account}`);
    const parsed = parseAccount(l.account);
    if (parsed.ccy !== l.ccy) throw new Error(`Account ${l.account} is ${parsed.ccy}, line says ${l.ccy}`);
  }
  const imbalances: Partial<Record<Ccy, bigint>> = {};
  for (const [ccy, sum] of sumByCcy(lines)) if (sum !== 0n) imbalances[ccy] = sum;
  if (Object.keys(imbalances).length > 0) throw new UnbalancedJournal(imbalances);
}

/** Cash accounts this journal takes money out of. These are the pools that need locking and checking. */
export function debitedPools(lines: readonly Line[]): { account: string; ccy: Ccy }[] {
  const net = new Map<string, { account: string; ccy: Ccy; delta: bigint }>();
  for (const l of lines) {
    if (!isCashAccount(l.account)) continue;
    const k = `${l.account}|${l.ccy}`;
    const cur = net.get(k) ?? { account: l.account, ccy: l.ccy, delta: 0n };
    cur.delta += l.amountMinor;
    net.set(k, cur);
  }
  return [...net.values()].filter((p) => p.delta < 0n).map(({ account, ccy }) => ({ account, ccy }));
}

/**
 * Invariant 3: a pool can never go below zero. `balanceOf` gives each pool's balance before the journal.
 * Throws InsufficientPool (the round becomes `withheld`) rather than overdrawing.
 */
export function checkPools(balanceOf: (account: string, ccy: Ccy) => bigint, lines: readonly Line[]): void {
  for (const { account, ccy } of debitedPools(lines)) {
    const before = balanceOf(account, ccy);
    const delta = lines
      .filter((l) => l.account === account && l.ccy === ccy)
      .reduce((s, l) => s + l.amountMinor, 0n);
    if (before + delta < 0n) throw new InsufficientPool(account, ccy, before, before + delta);
  }
}
