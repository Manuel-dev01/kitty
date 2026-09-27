/**
 * The real rounds engine against real Postgres, with fake rails. Proves the demo end to end:
 * four rounds, every pot paid on the recipient's own rail, "Moved $800 · Crossed a border $0".
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import type { FxSnapshot } from '@/lib/fx/types';
import { COUNTRY_CCY, COUNTRY_RAIL, CURRENCIES, cashAccount, fxPosition, fxRounding, type Country } from '@/lib/ledger';
import type { RailAdapter, RailStatus } from '@/lib/rails/types';
import { freshSchema, testDbUrl } from '@/test/pg';
import { ProviderError } from '@/lib/rails/http';
import { makeRounds, resetDemo, roundState, sandboxLimits, type Rounds } from '.';
import { handleProviderEvent } from './webhooks';

const RATES = { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654', EUR: '0.8612' };

/** Fake rails: collections succeed unless told otherwise; payouts can be made to throw per country. */
function fakeRails() {
  const status = new Map<string, RailStatus>();
  const collectAs = new Map<Country, RailStatus>();
  const payoutDown = new Set<Country>();
  const payoutError = new Map<Country, unknown>();
  let n = 0;
  const rail = (country: Country): RailAdapter => ({
    country,
    currency: COUNTRY_CCY[country],
    async collect() {
      const ref = `fake-c-${++n}`;
      status.set(ref, collectAs.get(country) ?? 'succeeded');
      return { providerRef: ref, nextAction: { type: 'prompt_sent' } };
    },
    collectStatus: async (ref) => status.get(ref) ?? 'pending',
    async payout() {
      if (payoutError.has(country)) throw payoutError.get(country);
      if (payoutDown.has(country)) throw new Error(`${country} rail down`);
      const ref = `fake-p-${++n}`;
      status.set(ref, 'succeeded');
      return { providerRef: ref };
    },
    payoutStatus: async (ref) => status.get(ref) ?? 'pending',
    parseWebhook: async () => null,
  });
  return { rail, collectAs, payoutDown, payoutError };
}

describe.skipIf(!testDbUrl)('rounds engine in Postgres', () => {
  let sql: Sql;
  let drop: () => Promise<void>;
  let rails: ReturnType<typeof fakeRails>;
  let rounds: Rounds;
  const takeSnapshot = async (): Promise<FxSnapshot> => {
    const [r] = await sql<{ id: string }[]>`insert into fx_snapshots (source, rates) values ('test', ${sql.json(RATES)}) returning id`;
    return { id: r.id, source: 'test', takenAt: new Date().toISOString(), rates: RATES };
  };
  const payAll = async (roundId: string) => {
    for (const c of await rounds.contributionsOf(roundId)) if (c.status !== 'succeeded') await rounds.startCollection(c.id);
  };
  const journalCount = async () => Number((await sql<{ n: number }[]>`select count(*)::int as n from journals`)[0].n);

  beforeEach(async () => {
    ({ sql, drop } = await freshSchema());
    rails = fakeRails();
    rounds = makeRounds({ sql, rail: (country) => rails.rail(country), takeSnapshot, today: () => '2026-09-27' });
  });
  afterEach(async () => drop?.());

  it('runs the full demo cycle: 4 rounds, reputation order, every fx:position 0, "Moved $800 · $0"', async () => {
    const { circleId, roundId } = await resetDemo(sql, rounds, takeSnapshot);
    const recipients: string[] = [];
    let id: string | null = roundId;
    let last;
    while (id) {
      await payAll(id);
      await rounds.reconcile(id); // settles all four, converts, pays out, confirms: one read does it all
      last = (await roundState(sql, rounds, id))!;
      expect(last.round.status).toBe('paid');
      expect(last.payout?.status).toBe('succeeded');
      recipients.push(last.round.recipient.country);
      if (last.round.index === 1) expect(last.netting.headline).toBe('Moved $200 · Crossed a border $150 (75%)');
      id = await rounds.openNextRound(circleId);
    }

    expect(recipients).toEqual(['KE', 'NG', 'UG', 'GH']); // most trusted first: the first pot pays out in Nairobi
    expect(last!.netting.headline).toBe('Moved $800 · Crossed a border $0 (0%)');
    expect(last!.netting.grossCrossBorderUsdCents).toBe(60000n);
    const [circle] = await sql`select status from circles where id = ${circleId}`;
    expect(circle.status).toBe('completed');

    for (const ccy of CURRENCIES) expect(await rounds.ledger.balance(fxPosition(ccy), ccy), ccy).toBe(0n);

    // Pools: NG/UG/GH end exactly at their float. Kenya holds the whole-shilling rounding, visibly in fx:rounding:KES:
    // 4 × 91 cents collected over the ledger amount, plus 36 cents not paid out (B2C rounds down).
    const seed = (c: Country) => sql<{ b: bigint }[]>`
      select coalesce(sum(l.amount_minor), 0)::bigint as b from journal_lines l join journals j on j.id = l.journal_id
      where j.kind = 'float_seed' and l.account = ${cashAccount(COUNTRY_RAIL[c], COUNTRY_CCY[c])}`;
    for (const c of ['NG', 'UG', 'GH'] as Country[]) {
      expect(await rounds.ledger.balance(cashAccount(COUNTRY_RAIL[c], COUNTRY_CCY[c]), COUNTRY_CCY[c])).toBe(BigInt((await seed(c))[0].b));
    }
    expect(await rounds.ledger.balance(cashAccount('daraja', 'KES'), 'KES')).toBe(BigInt((await seed('KE'))[0].b) + 400n);
    expect(await rounds.ledger.balance(fxRounding('KES'), 'KES')).toBe(-400n);
    expect(last!.netting.residuals.KES).toEqual({ position: 0n, rounding: -400n });
  });

  it('a round waits for EVERY contribution, then funds', async () => {
    const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
    rails.collectAs.set('GH', 'pending');
    await payAll(roundId!);
    await rounds.reconcile(roundId!);
    let s = (await roundState(sql, rounds, roundId!))!;
    expect(s.round.status).toBe('collecting');
    expect(s.contributions.map((c) => c.status)).toEqual(['succeeded', 'succeeded', 'succeeded', 'pending']);
    expect(s.payout).toBeNull();

    rails.collectAs.delete('GH');
    const gh = s.contributions.find((c) => c.member.country === 'GH')!;
    await rounds.startCollection(gh.id); // retry on the member's rail
    await rounds.reconcile(roundId!);
    s = (await roundState(sql, rounds, roundId!))!;
    expect(s.round.status).toBe('paid');
  });

  it('a failed payout is reversed in the ledger and never retried automatically', async () => {
    const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
    rails.payoutDown.add('KE');
    await payAll(roundId!);
    await rounds.reconcile(roundId!);
    const cashBefore = await rounds.ledger.balance(cashAccount('daraja', 'KES'), 'KES');
    let s = (await roundState(sql, rounds, roundId!))!;
    expect(s.round.status).toBe('funded');
    expect(s.payout?.status).toBe('failed');
    expect(s.journals.filter((j) => j.ref.type === 'payout_reversal')).toHaveLength(1);

    const n = await journalCount();
    await rounds.reconcile(roundId!); // polling must not hammer the rail or the ledger
    await rounds.reconcile(roundId!);
    expect(await journalCount()).toBe(n);

    rails.payoutDown.delete('KE');
    await rounds.retryPayout(roundId!);
    await rounds.reconcile(roundId!);
    s = (await roundState(sql, rounds, roundId!))!;
    expect(s.round.status).toBe('paid');
    expect(await rounds.ledger.balance(cashAccount('daraja', 'KES'), 'KES')).toBeLessThan(cashBefore);
  });

  it('Invariant 3: a payout the pool cannot cover withholds the round instead of overdrawing', async () => {
    const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
    // Drain Kenya's float back to equity before the Nairobi payout.
    const float = await rounds.ledger.balance(cashAccount('daraja', 'KES'), 'KES');
    await rounds.ledger.postJournal('fee', { type: 'test', id: 'drain' }, [
      { account: cashAccount('daraja', 'KES'), ccy: 'KES', amountMinor: -float },
      { account: 'equity:float:KES', ccy: 'KES', amountMinor: float },
    ]);
    await payAll(roundId!);
    await rounds.reconcile(roundId!);
    const s = (await roundState(sql, rounds, roundId!))!;
    expect(s.round.status).toBe('withheld');
    expect(s.payout?.status).toBe('failed');
    expect(await rounds.ledger.balance(cashAccount('daraja', 'KES'), 'KES')).toBeGreaterThanOrEqual(0n);
  });

  it('withhold rule: a promise past its date withholds the round and costs reputation', async () => {
    const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
    const gh = (await rounds.contributionsOf(roundId!)).find((c) => c.country === 'GH')!;
    await rounds.recordPromise(gh.id, '2026-09-26'); // "I go pay Friday", and Friday has passed
    await rounds.reconcile(roundId!);
    const [m] = await sql`select reputation_score from members where id = ${gh.member_id}`;
    expect(m.reputation_score).toBe(600);
    expect((await roundState(sql, rounds, roundId!))!.round.status).toBe('withheld');
  });

  it('webhooks: the same provider event twice is recorded once, and each delivery just reconciles', async () => {
    const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
    await payAll(roundId!);
    const ref = (await rounds.contributionsOf(roundId!))[0].provider_ref;
    const event = { provider: 'daraja' as const, eventId: `stk:${ref}`, op: 'collect' as const, providerRef: ref, status: 'succeeded' as const, payload: {} };
    const a = await handleProviderEvent(sql, rounds, event);
    const b = await handleProviderEvent(sql, rounds, event);
    expect(a).toEqual({ duplicate: false, roundId });
    expect(b).toEqual({ duplicate: true, roundId });
    expect(await sql`select 1 from provider_events`).toHaveLength(1);
    expect((await roundState(sql, rounds, roundId!))!.round.status).toBe('paid');
  });

  describe('documented sandbox limits (labelled simulation)', () => {
    beforeEach(() => {
      rounds = makeRounds({ sql, rail: (country) => rails.rail(country), takeSnapshot, today: () => '2026-09-27', limits: sandboxLimits });
    });

    it('Kenya on the Daraja test number: the real push is made, approval is simulated and labelled', async () => {
      const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
      rails.collectAs.set('KE', 'failed'); // what the sandbox really returns: 1037, no phone to enter a PIN
      await payAll(roundId!);
      await rounds.reconcile(roundId!);
      const s = (await roundState(sql, rounds, roundId!))!;
      const ke = s.contributions.find((c) => c.member.country === 'KE')!;
      expect(ke.status).toBe('succeeded');
      expect(ke.providerRef).toMatch(/^fake-c-/); // the real attempt's reference is kept
      expect(ke.simulated).toMatch(/Daraja sandbox.*test number/);
      expect(s.contributions.filter((c) => c.simulated)).toHaveLength(1); // nothing else is simulated
      expect(s.round.status).toBe('paid');
    });

    it('Nigeria payout on a Starter Paystack account: simulated and labelled, journal stands', async () => {
      const { circleId, roundId } = await resetDemo(sql, rounds, takeSnapshot);
      rails.payoutError.set('NG', new ProviderError('paystack', 'payout', 400, { code: 'transfer_unavailable' }));
      await payAll(roundId!);
      await rounds.reconcile(roundId!); // round 1 pays Nairobi for real
      const r2 = (await rounds.openNextRound(circleId))!;
      await payAll(r2);
      await rounds.reconcile(r2);
      const s = (await roundState(sql, rounds, r2))!;
      expect(s.round.recipient.country).toBe('NG');
      expect(s.round.status).toBe('paid');
      expect(s.payout).toMatchObject({ status: 'succeeded', simulated: expect.stringMatching(/Starter business/) });
      expect(s.journals.filter((j) => j.ref.type === 'payout_reversal')).toHaveLength(0);
    });

    it('any other failure is NOT simulated: a real payout error is still reversed', async () => {
      const { roundId } = await resetDemo(sql, rounds, takeSnapshot);
      rails.payoutError.set('KE', new ProviderError('daraja', 'payout', 500, { errorCode: 'boom' }));
      await payAll(roundId!);
      await rounds.reconcile(roundId!);
      const s = (await roundState(sql, rounds, roundId!))!;
      expect(s.round.status).toBe('funded');
      expect(s.payout).toMatchObject({ status: 'failed', simulated: null });
    });
  });
});
