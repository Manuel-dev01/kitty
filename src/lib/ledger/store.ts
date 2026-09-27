import { randomUUID } from 'node:crypto';
import { isCashAccount } from './accounts';
import { InsufficientPool, validateJournal } from './journal';
import type { Ccy, JournalKind, Line, Ref } from './types';

export interface ProviderEvent {
  provider: string;
  eventId: string;
  payload?: unknown;
}

export interface PostedJournal {
  id: string;
  kind: JournalKind;
  ref: Ref;
  lines: Line[];
}

/** Operations available inside one atomic ledger transaction. */
export interface LedgerTx {
  /** Records a provider event. False if it was already seen (idempotency). */
  claimEvent(event: ProviderEvent): Promise<boolean>;
  findJournal(kind: JournalKind, ref: Ref): Promise<string | null>;
  /** Serialises writers on the given pools until the transaction ends. */
  lockPools(pools: readonly { account: string; ccy: Ccy }[]): Promise<void>;
  balance(account: string, ccy: Ccy): Promise<bigint>;
  /** Inserts a journal and its lines. Null if (kind, ref) already exists. */
  insertJournal(kind: JournalKind, ref: Ref, lines: readonly Line[]): Promise<string | null>;
}

export interface LedgerStore {
  tx<T>(fn: (t: LedgerTx) => Promise<T>): Promise<T>;
  balance(account: string, ccy: Ccy): Promise<bigint>;
  /** Every (account, ccy) with its balance. */
  balances(): Promise<Line[]>;
}

const refKey = (kind: JournalKind, ref: Ref) => `${kind}|${ref.type}|${ref.id}`;

function sumBalance(journals: readonly PostedJournal[], account: string, ccy: Ccy): bigint {
  let b = 0n;
  for (const j of journals) for (const l of j.lines) if (l.account === account && l.ccy === ccy) b += l.amountMinor;
  return b;
}

/**
 * In-memory store with the same semantics as Postgres: atomic transactions, serialised writers,
 * and commit-time checks that mirror the deferred triggers in db/migrations/0002.
 * Used by unit tests and by anything that needs the ledger without a database.
 */
export function memoryStore() {
  let state = { events: new Set<string>(), journals: [] as PostedJournal[] };
  let queue: Promise<unknown> = Promise.resolve();

  const store: LedgerStore & { journals(): readonly PostedJournal[] } = {
    journals: () => state.journals,

    tx<T>(fn: (t: LedgerTx) => Promise<T>): Promise<T> {
      const run = queue.then(async () => {
        const staged = { events: new Set(state.events), journals: [...state.journals] };
        const t: LedgerTx = {
          async claimEvent(e) {
            const k = `${e.provider}|${e.eventId}`;
            if (staged.events.has(k)) return false;
            staged.events.add(k);
            return true;
          },
          async findJournal(kind, ref) {
            return staged.journals.find((j) => refKey(j.kind, j.ref) === refKey(kind, ref))?.id ?? null;
          },
          async lockPools() {
            // The queue already serialises every transaction.
          },
          async balance(account, ccy) {
            return sumBalance(staged.journals, account, ccy);
          },
          async insertJournal(kind, ref, lines) {
            if (staged.journals.some((j) => refKey(j.kind, j.ref) === refKey(kind, ref))) return null;
            const id = randomUUID();
            staged.journals.push({ id, kind, ref: { ...ref }, lines: lines.map((l) => ({ ...l })) });
            return id;
          },
        };
        const result = await fn(t);

        // Commit-time checks, as the deferred constraint triggers do.
        const added = staged.journals.slice(state.journals.length);
        for (const j of added) validateJournal(j.lines);
        for (const j of added) {
          for (const l of j.lines) {
            if (!isCashAccount(l.account)) continue;
            const b = sumBalance(staged.journals, l.account, l.ccy);
            if (b < 0n) throw new InsufficientPool(l.account, l.ccy, sumBalance(state.journals, l.account, l.ccy), b);
          }
        }
        state = staged;
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },

    async balance(account, ccy) {
      return sumBalance(state.journals, account, ccy);
    },

    async balances() {
      const m = new Map<string, Line>();
      for (const j of state.journals) {
        for (const l of j.lines) {
          const k = `${l.account}|${l.ccy}`;
          const cur = m.get(k) ?? { account: l.account, ccy: l.ccy, amountMinor: 0n };
          cur.amountMinor += l.amountMinor;
          m.set(k, cur);
        }
      }
      return [...m.values()];
    },
  };
  return store;
}
