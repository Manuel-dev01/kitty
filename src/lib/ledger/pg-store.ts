import type postgres from 'postgres';
import type { Sql } from '../db';
import type { LedgerStore, LedgerTx } from './store';
import type { Ccy, JournalKind, Line, Ref } from './types';

type Q = Sql | postgres.TransactionSql<{ bigint: bigint }>;

async function balanceOf(q: Q, account: string, ccy: Ccy): Promise<bigint> {
  const [row] = await q<{ b: bigint }[]>`
    select coalesce(sum(amount_minor), 0)::bigint as b from journal_lines where account = ${account} and ccy = ${ccy}`;
  return BigInt(row.b);
}

/** Postgres-backed ledger store. The DB triggers re-check every invariant at commit. */
export function pgStore(sql: Sql): LedgerStore {
  return {
    tx<T>(fn: (t: LedgerTx) => Promise<T>): Promise<T> {
      return sql.begin(async (q) => {
        const t: LedgerTx = {
          async claimEvent(e) {
            const rows = await q`
              insert into provider_events (provider, event_id, payload)
              values (${e.provider}, ${e.eventId}, ${e.payload === undefined ? null : q.json(e.payload as never)})
              on conflict do nothing
              returning event_id`;
            return rows.length > 0;
          },
          async findJournal(kind: JournalKind, ref: Ref) {
            const [row] = await q<{ id: string }[]>`
              select id from journals where kind = ${kind} and ref_type = ${ref.type} and ref_id = ${ref.id}`;
            return row?.id ?? null;
          },
          async lockPools(pools) {
            // Sorted so two transactions always lock in the same order (no deadlocks).
            const keys = [...new Set(pools.map((p) => `${p.account}|${p.ccy}`))].sort();
            for (const k of keys) await q`select pg_advisory_xact_lock(hashtext(${k}))`;
          },
          balance: (account, ccy) => balanceOf(q, account, ccy),
          async insertJournal(kind, ref, lines: readonly Line[]) {
            const [row] = await q<{ id: string }[]>`
              insert into journals (kind, ref_type, ref_id) values (${kind}, ${ref.type}, ${ref.id})
              on conflict (kind, ref_type, ref_id) do nothing
              returning id`;
            if (!row) return null;
            const rows = lines.map((l) => ({
              journal_id: row.id,
              account: l.account,
              ccy: l.ccy,
              amount_minor: l.amountMinor.toString(),
            }));
            await q`insert into journal_lines ${q(rows, 'journal_id', 'account', 'ccy', 'amount_minor')}`;
            return row.id;
          },
        };
        return fn(t);
      }) as Promise<T>;
    },

    balance: (account, ccy) => balanceOf(sql, account, ccy),

    async balances() {
      const rows = await sql<{ account: string; ccy: Ccy; b: bigint }[]>`
        select account, ccy, sum(amount_minor)::bigint as b from journal_lines group by account, ccy order by account, ccy`;
      return rows.map((r) => ({ account: r.account, ccy: r.ccy, amountMinor: BigInt(r.b) }));
    },
  };
}
