import { getSql } from '../db';
import { checkPools, debitedPools, validateJournal } from './journal';
import { pgStore } from './pg-store';
import type { LedgerStore, LedgerTx, ProviderEvent } from './store';
import type { Ccy, JournalKind, Line, Ref } from './types';

export * from './accounts';
export * from './entries';
export { InsufficientPool, UnbalancedJournal, checkPools, sumByCcy, validateJournal } from './journal';
export { memoryStore, type LedgerStore, type PostedJournal, type ProviderEvent } from './store';
export * from './types';

export interface PostResult {
  journalId: string;
  /** False when (kind, ref) was already posted: the existing journal is returned, nothing new is written. */
  created: boolean;
}

export interface EventPostResult {
  journalId: string | null;
  created: boolean;
  /** True when this provider event was already processed. Nothing is written. */
  duplicateEvent: boolean;
}

async function postIn(t: LedgerTx, kind: JournalKind, ref: Ref, lines: readonly Line[]): Promise<PostResult> {
  validateJournal(lines); // Invariant 1, before touching storage
  const pools = debitedPools(lines);
  await t.lockPools(pools);

  const existing = await t.findJournal(kind, ref);
  if (existing) return { journalId: existing, created: false };

  const before = new Map<string, bigint>();
  for (const p of pools) before.set(`${p.account}|${p.ccy}`, await t.balance(p.account, p.ccy));
  checkPools((account, ccy) => before.get(`${account}|${ccy}`) ?? 0n, lines); // Invariant 3

  const id = await t.insertJournal(kind, ref, lines);
  if (id) return { journalId: id, created: true };
  return { journalId: (await t.findJournal(kind, ref))!, created: false };
}

export function makeLedger(store: LedgerStore) {
  return {
    /** Posts a balanced journal atomically. Idempotent on (kind, ref). */
    postJournal: (kind: JournalKind, ref: Ref, lines: readonly Line[]) => store.tx((t) => postIn(t, kind, ref, lines)),

    /** Records the provider event first, then the journal, in one transaction. A replayed event writes nothing. */
    postProviderEvent: (event: ProviderEvent, kind: JournalKind, ref: Ref, lines: readonly Line[]) =>
      store.tx<EventPostResult>(async (t) => {
        if (!(await t.claimEvent(event))) return { journalId: null, created: false, duplicateEvent: true };
        return { ...(await postIn(t, kind, ref, lines)), duplicateEvent: false };
      }),

    balance: (account: string, ccy: Ccy) => store.balance(account, ccy),
    balances: () => store.balances(),
  };
}

export type Ledger = ReturnType<typeof makeLedger>;

// The app's ledger, backed by Postgres. Created on first use so importing never needs a database.
let appLedger: Ledger | undefined;
const ledger = () => (appLedger ??= makeLedger(pgStore(getSql())));

export const postJournal: Ledger['postJournal'] = (kind, ref, lines) => ledger().postJournal(kind, ref, lines);
export const postProviderEvent: Ledger['postProviderEvent'] = (e, kind, ref, lines) =>
  ledger().postProviderEvent(e, kind, ref, lines);
export const balance: Ledger['balance'] = (account, ccy) => ledger().balance(account, ccy);
export const balances: Ledger['balances'] = () => ledger().balances();
