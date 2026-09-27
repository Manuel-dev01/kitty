/**
 * Postgres integration tests: the invariants hold in the database itself, not only in app code.
 * Runs only when TEST_DATABASE_URL is set (CI provides a Postgres service). Each test gets a
 * throwaway schema, so it never touches real data.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeSql, type Sql } from '@/lib/db';
import type { FxSnapshot } from '@/lib/fx/types';
import {
  COUNTRIES,
  COUNTRY_CCY,
  COUNTRY_RAIL,
  CURRENCIES,
  InsufficientPool,
  cashAccount,
  contributionLines,
  fxPosition,
  makeLedger,
  payoutLines,
} from '@/lib/ledger';
import { pgStore } from '@/lib/ledger/pg-store';
import { newCircle } from '@/test/circle-sim';

const url = process.env.TEST_DATABASE_URL;
const MIGRATIONS = join(process.cwd(), 'db', 'migrations');

describe.skipIf(!url)('ledger invariants in Postgres', () => {
  let admin: Sql;
  let sql: Sql;
  let schema: string;

  beforeEach(async () => {
    schema = `kitty_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    admin = makeSql(url!, { max: 1 });
    await admin.unsafe(`create schema ${schema}`);
    sql = makeSql(url!, { max: 4, connection: { search_path: schema } });
    for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()) {
      await sql.unsafe(readFileSync(join(MIGRATIONS, f), 'utf8'));
    }
  });

  afterEach(async () => {
    await sql.end();
    await admin.unsafe(`drop schema ${schema} cascade`);
    await admin.end();
  });

  const rawJournal = (lines: [string, string, bigint][]) =>
    sql.begin(async (q) => {
      const [j] = await q<{ id: string }[]>`insert into journals (kind, ref_type, ref_id) values ('fee', 'test', ${String(Math.random())}) returning id`;
      for (const [account, ccy, amount] of lines) {
        await q`insert into journal_lines (journal_id, account, ccy, amount_minor) values (${j.id}, ${account}, ${ccy}, ${amount.toString()})`;
      }
      return j.id;
    });

  it('Invariant 1: the trigger rejects a raw journal that is unbalanced per currency', async () => {
    await expect(
      rawJournal([
        ['fx:position:NGN', 'NGN', 100n],
        ['fx:position:KES', 'KES', -100n],
      ]),
    ).rejects.toThrow(/does not balance per currency/);
    expect(await sql`select 1 from journals`).toHaveLength(0);
  });

  it('Invariant 1: a balanced raw journal commits; a journal with no lines does not', async () => {
    await expect(
      rawJournal([
        ['fx:position:NGN', 'NGN', 100n],
        ['fx:rounding:NGN', 'NGN', -100n],
      ]),
    ).resolves.toBeTypeOf('string');
    await expect(rawJournal([])).rejects.toThrow(/has no lines/);
  });

  it('journal lines are append-only', async () => {
    await rawJournal([
      ['fx:position:NGN', 'NGN', 100n],
      ['fx:rounding:NGN', 'NGN', -100n],
    ]);
    await expect(sql`update journal_lines set amount_minor = 5`).rejects.toThrow(/append-only/);
    await expect(sql`delete from journal_lines`).rejects.toThrow(/append-only/);
  });

  it('Invariant 3: the backstop rejects a raw overdraft; the ledger refuses one with InsufficientPool', async () => {
    await expect(
      rawJournal([
        [cashAccount('daraja', 'KES'), 'KES', -1n],
        ['circle:c1:pot:KES', 'KES', 1n],
      ]),
    ).rejects.toThrow(/below zero/);

    const ledger = makeLedger(pgStore(sql));
    await expect(ledger.postJournal('payout', { type: 'payout', id: 'p1' }, payoutLines('c1', 'daraja', 'KES', 1n))).rejects.toThrow(
      InsufficientPool,
    );
    expect(await sql`select 1 from journals`).toHaveLength(0);
  });

  it('idempotency: the same provider event, delivered twice and concurrently, creates one journal', async () => {
    const ledger = makeLedger(pgStore(sql));
    const event = { provider: 'paystack', eventId: 'evt_1', payload: { reference: 'ctb_1' } };
    const lines = contributionLines('c1', 'paystack', 'NGN', 7_500_000n);
    const ref = { type: 'contribution', id: 'ctb_1' };

    const results = await Promise.all([
      ledger.postProviderEvent(event, 'contribution', ref, lines),
      ledger.postProviderEvent(event, 'contribution', ref, lines),
    ]);
    const again = await ledger.postProviderEvent(event, 'contribution', ref, lines);

    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(again.duplicateEvent).toBe(true);
    expect(await sql`select 1 from journals`).toHaveLength(1);
    expect(await sql`select 1 from provider_events`).toHaveLength(1);
    expect(await ledger.balance(cashAccount('paystack', 'NGN'), 'NGN')).toBe(7_500_000n);
  });

  it('Invariant 2 in Postgres: a full 4-round cycle leaves every fx:position at 0 and every pool at its seed', async () => {
    const snap: FxSnapshot = {
      source: 'test',
      takenAt: '2026-09-26T00:00:00Z',
      rates: { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654' },
    };
    const circle = newCircle(snap, pgStore(sql));
    await circle.seedFloats();
    for (let r = 1; r <= 4; r++) await circle.runRound(r);

    for (const ccy of CURRENCIES) expect(await circle.ledger.balance(fxPosition(ccy), ccy)).toBe(0n);
    for (const c of COUNTRIES) {
      const ccy = COUNTRY_CCY[c];
      expect(await circle.ledger.balance(cashAccount(COUNTRY_RAIL[c], ccy), ccy)).toBe(circle.seeds.get(c));
    }
    expect(await sql`select 1 from journals`).toHaveLength(28);
  });
});
