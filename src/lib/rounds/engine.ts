/**
 * The rounds engine (docs/ARCHITECTURE.md §5). State lives in Postgres; money facts live in the ledger.
 *
 * Round lifecycle: open → collecting → funded → paying → paid   (or → withheld)
 * - A round pays only once EVERY contribution has succeeded.
 * - Reconcile-on-read: `reconcile(roundId)` asks each provider for the status of anything pending, posts
 *   the journals that follow, and moves the round forward. Webhooks only trigger the same reconcile.
 * - A payout is journaled BEFORE the provider call (so Invariant 3 can refuse it) and reversed if the
 *   provider rejects it. Failed payouts are never retried automatically (no retry storm while polling).
 *
 * The rails are injected, so the whole cycle runs in tests against real Postgres with fake rails.
 */
import type { Sql } from '../db';
import { toEurCents } from '../fx/convert';
import type { FxSnapshot } from '../fx/types';
import {
  COUNTRY_CCY,
  COUNTRY_RAIL,
  InsufficientPool,
  contributionLines,
  conversionLines,
  floatSeedLines,
  localPrice,
  makeLedger,
  payoutLines,
  potAccount,
  reversalLines,
  type Ccy,
  type Country,
  type Line,
} from '../ledger';
import { pgStore } from '../ledger/pg-store';
import { wholeShillings } from '../rails/daraja';
import type { Member, RailAdapter, RailStatus } from '../rails/types';
import type { SandboxLimits } from './sandbox-limits';

export interface RoundsDeps {
  sql: Sql;
  /** The rail for a member's country, bound to the round's FX snapshot (MoMo needs it for EUR). */
  rail: (country: Country, snap: FxSnapshot) => RailAdapter;
  /** Takes and STORES a snapshot (the result must carry its fx_snapshots id). */
  takeSnapshot: () => Promise<FxSnapshot>;
  /** YYYY-MM-DD, for promise deadlines. */
  today?: () => string;
  /** Documented sandbox limits that may complete a step by (labelled) simulation. Off when undefined. */
  limits?: SandboxLimits;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export class RoundError extends Error {
  constructor(message: string, readonly httpStatus = 409) {
    super(message);
    this.name = 'RoundError';
  }
}

export const toMember = (r: Row): Member => ({
  id: r.member_id ?? r.id,
  circleId: r.circle_id,
  name: r.name,
  country: r.country,
  phone: r.phone,
  email: r.email,
  rail: r.rail,
  payoutPosition: r.payout_position,
  reputationScore: r.reputation_score,
});

/** What the rail actually moves for a ledger amount: KES in whole shillings, MoMo sandbox in EUR. */
export function railAmount(country: Country, amountMinor: bigint, snap: FxSnapshot): { minor: bigint; ccy: string } {
  if (country === 'KE') return { minor: wholeShillings(amountMinor) * 100n, ccy: 'KES' };
  if (country === 'UG' || country === 'GH') return { minor: toEurCents(amountMinor, COUNTRY_CCY[country], snap), ccy: 'EUR' };
  return { minor: amountMinor, ccy: COUNTRY_CCY[country] };
}

/** Cash a payout actually takes from the pool: Daraja B2C pays whole shillings, rounded down. */
const cashPaid = (country: Country, potMinor: bigint) => (country === 'KE' ? (potMinor / 100n) * 100n : potMinor);

export function makeRounds(deps: RoundsDeps) {
  const { sql } = deps;
  const ledger = makeLedger(pgStore(sql));
  const today = deps.today ?? (() => new Date().toISOString().slice(0, 10));

  async function snapshotById(id: string): Promise<FxSnapshot> {
    const [r] = await sql<Row[]>`select id, source, taken_at, rates from fx_snapshots where id = ${id}`;
    if (!r) throw new RoundError(`FX snapshot ${id} not found`, 500);
    return { id: r.id, source: r.source, takenAt: new Date(r.taken_at).toISOString(), rates: r.rates };
  }

  async function loadRound(roundId: string) {
    const [r] = await sql<Row[]>`
      select r.*, c.contribution_unit_minor, c.status as circle_status,
             m.country as recipient_country, m.name as recipient_name
      from rounds r join circles c on c.id = r.circle_id join members m on m.id = r.recipient_member_id
      where r.id = ${roundId}`;
    return r;
  }

  const contributionsOf = (roundId: string) => sql<Row[]>`
    select c.id, c.round_id, c.member_id, c.ccy, c.amount_minor, c.rail_amount_minor, c.rail_ccy, c.provider_ref,
           c.status, c.promised_for, c.simulated, c.replay, m.circle_id, m.name, m.country, m.phone, m.email, m.rail,
           m.payout_position, m.reputation_score
    from contributions c join members m on m.id = c.member_id
    where c.round_id = ${roundId}
    order by m.payout_position`;

  /** Payout order: most trusted first (an early pot is effectively a loan), ties by join time. */
  async function activateCircle(circleId: string) {
    await sql.begin(async (q) => {
      await q`update members set payout_position = null where circle_id = ${circleId}`;
      await q`
        with ordered as (
          select id, row_number() over (order by reputation_score desc, created_at asc, id) as pos
          from members where circle_id = ${circleId})
        update members m set payout_position = o.pos from ordered o where m.id = o.id`;
      await q`update circles set status = 'active' where id = ${circleId}`;
    });
  }

  /** Seeds each country pool's float from equity, in whole units (3 × price(unit), never price(3 units)). */
  async function seedFloats(circleId: string, snap: FxSnapshot, units = 3n) {
    const [circle] = await sql<Row[]>`select contribution_unit_minor from circles where id = ${circleId}`;
    const countries = await sql<Row[]>`select distinct country from members where circle_id = ${circleId}`;
    for (const row of countries) {
      const country = row.country as Country;
      const ccy = COUNTRY_CCY[country];
      const amount = localPrice(BigInt(circle.contribution_unit_minor), ccy, snap) * units;
      await ledger.postJournal('float_seed', { type: 'pool', id: `${circleId}:${country}` }, floatSeedLines(COUNTRY_RAIL[country], ccy, amount));
    }
  }

  /** Opens the next round. One FX snapshot per cycle: it reuses the previous round's unless given one. */
  async function openNextRound(circleId: string, snapshotId?: string): Promise<string | null> {
    const [last] = await sql<Row[]>`select * from rounds where circle_id = ${circleId} order by index desc limit 1`;
    if (last && last.status !== 'paid') throw new RoundError(`Round ${last.index} is still ${last.status}`);
    const snapId = snapshotId ?? last?.fx_snapshot_id ?? (await deps.takeSnapshot()).id;
    const snap = await snapshotById(snapId);

    return sql.begin(async (q) => {
      const [circle] = await q<Row[]>`select * from circles where id = ${circleId} for update`;
      if (!circle) throw new RoundError('Circle not found', 404);
      if (circle.status === 'completed') return null; // the cycle is done
      if (circle.status !== 'active') throw new RoundError(`Circle is ${circle.status}`);
      const members = await q<Row[]>`select * from members where circle_id = ${circleId} order by payout_position`;
      const index = (last?.index ?? 0) + 1;
      if (index > members.length) {
        await q`update circles set status = 'completed' where id = ${circleId}`;
        return null;
      }
      const recipient = members.find((m) => m.payout_position === index);
      if (!recipient) throw new RoundError('Circle has no payout order; activate it first', 500);
      const [round] = await q<Row[]>`
        insert into rounds (circle_id, index, recipient_member_id, fx_snapshot_id, status)
        values (${circleId}, ${index}, ${recipient.id}, ${snapId}, 'open') returning id`;
      for (const m of members) {
        const ccy = COUNTRY_CCY[m.country as Country];
        const amount = localPrice(BigInt(circle.contribution_unit_minor), ccy, snap);
        await q`insert into contributions (round_id, member_id, ccy, amount_minor, status)
                values (${round.id}, ${m.id}, ${ccy}, ${amount.toString()}, 'unpaid')`;
      }
      return round.id as string;
    });
  }

  /** Starts (or restarts) a member's payment on their own rail. */
  async function startCollection(contributionId: string, opts: { preferSaved?: boolean } = {}) {
    const [c] = await sql<Row[]>`
      select c.*, m.circle_id, m.name, m.country, m.phone, m.email, m.rail, m.payout_position, m.reputation_score,
             r.status as round_status, r.fx_snapshot_id
      from contributions c join members m on m.id = c.member_id join rounds r on r.id = c.round_id
      where c.id = ${contributionId}`;
    if (!c) throw new RoundError('Contribution not found', 404);
    if (c.status === 'succeeded') throw new RoundError('Already paid');
    if (!['open', 'collecting'].includes(c.round_status)) throw new RoundError(`Round is ${c.round_status}`);

    const snap = await snapshotById(c.fx_snapshot_id);
    const amount = BigInt(c.amount_minor);
    const res = await deps.rail(c.country, snap).collect({ contributionId, member: toMember(c), amountMinor: amount, preferSaved: opts.preferSaved });
    const onRail = railAmount(c.country, amount, snap);
    await sql`update contributions set provider_ref = ${res.providerRef}, status = 'pending',
              rail_amount_minor = ${onRail.minor.toString()}, rail_ccy = ${onRail.ccy} where id = ${contributionId}`;
    await sql`update rounds set status = 'collecting' where id = ${c.round_id} and status = 'open'`;
    return { providerRef: res.providerRef, nextAction: res.nextAction ?? null, railAmount: onRail };
  }

  async function recordPromise(contributionId: string, date: string) {
    await sql`update contributions set promised_for = ${date}::date where id = ${contributionId} and status <> 'succeeded'`;
  }

  async function settleContribution(round: Row, c: Row, snap: FxSnapshot, adapter: RailAdapter) {
    let status: RailStatus;
    try {
      status = await adapter.collectStatus(c.provider_ref);
    } catch {
      return; // provider unreachable: stays pending, the next read tries again
    }
    // A documented sandbox limit may complete this step, but only after the real call above, and labelled.
    const simulated = status === 'succeeded' ? null : (deps.limits?.collect(toMember(c), status) ?? null);
    const replay = !simulated && status === 'pending' && round.replay_allowed ? await replayFor(c) : null;
    if (!simulated && !replay && status === 'pending') return;
    if (!simulated && status === 'failed') {
      await sql`update contributions set status = 'failed' where id = ${c.id} and status = 'pending' and provider_ref = ${c.provider_ref}`;
      return;
    }
    const amount = BigInt(c.amount_minor);
    const collected = (adapter as Partial<{ collectedAmount(ref: string): Promise<bigint> }>).collectedAmount;
    if (!simulated && !replay && collected) {
      let got: bigint;
      try {
        got = await collected.call(adapter, c.provider_ref);
      } catch {
        return; // provider unreachable: stays pending, the next read verifies again
      }
      if (got < amount) {
        // short payment
        await sql`update contributions set status = 'failed' where id = ${c.id} and status = 'pending' and provider_ref = ${c.provider_ref}`;
        return;
      }
    }
    const country = c.country as Country;
    const received = country === 'KE' ? BigInt(c.rail_amount_minor ?? c.amount_minor) : amount;
    await ledger.postJournal(
      'contribution',
      { type: 'contribution', id: c.id },
      contributionLines(round.circle_id, COUNTRY_RAIL[country], c.ccy as Ccy, amount, received),
    );
    // Journals are idempotent per contribution; the status only moves if this is still the current attempt.
    await sql`update contributions set status = 'succeeded', simulated = ${simulated}, replay = ${replay}
              where id = ${c.id} and status = 'pending' and provider_ref = ${c.provider_ref}`;
  }

  /**
   * Replay (ARCHITECTURE §7): when judge mode runs a round with nobody at the Paystack checkout, the
   * verify step is served from the latest RECORDED REAL successful Paystack verify in provider_calls.
   * If none has ever been recorded, there is nothing to replay and the step keeps waiting.
   */
  async function replayFor(c: Row): Promise<string | null> {
    if (c.country !== 'NG') return null;
    const [fixture] = await sql<Row[]>`
      select id, response->'data'->>'reference' as reference, response->'data'->>'amount' as amount, created_at
      from provider_calls
      where provider = 'paystack' and op = 'verify' and status_code = 200 and response->'data'->>'status' = 'success'
      order by id desc limit 1`;
    if (!fixture) return null;
    return `Paystack verify replayed from a recorded real success (provider_calls #${fixture.id}, ${fixture.reference}, ${new Date(fixture.created_at).toISOString().slice(0, 16)}Z): judge mode had no one at the test checkout. A real checkout was created for this contribution.`;
  }

  async function markPaid(round: Row, payoutId: string, simulated: string | null = null) {
    await sql`update payouts set status = 'succeeded', simulated = ${simulated} where id = ${payoutId}`;
    await sql`update rounds set status = 'paid' where id = ${round.id} and status in ('paying', 'funded')`;
    const [{ n }] = await sql<Row[]>`select count(*)::int as n from members where circle_id = ${round.circle_id}`;
    if (round.index >= n) await sql`update circles set status = 'completed' where id = ${round.circle_id}`;
  }

  async function initiatePayout(round: Row, snap: FxSnapshot) {
    const country = round.recipient_country as Country;
    const ccy = COUNTRY_CCY[country];
    // Claim the funded → paying transition atomically: polls (every 1.5 s) and provider webhooks reconcile
    // concurrently, and only one of them may send money. The loser returns without touching anything.
    const [claimed] = await sql<Row[]>`update rounds set status = 'paying' where id = ${round.id} and status = 'funded' returning id`;
    if (!claimed) return;

    let payoutId: string | null = null;
    let journalRef: string | null = null;
    try {
      return await sendPayout();
    } catch (e) {
      // Nothing may leave the round stuck at "paying" with no provider reference: undo and wait for a retry.
      console.error('payout preparation failed', (e as Error).message);
      if (payoutId && journalRef) await reversePayout(round, payoutId, journalRef);
      else await sql`update rounds set status = 'funded' where id = ${round.id} and status = 'paying'`;
      throw e;
    }

    async function sendPayout() {
    const pot = -(await ledger.balance(potAccount(round.circle_id, ccy), ccy)); // the pot is a credit balance
    if (pot <= 0n) throw new RoundError('Nothing in the pot to pay out', 500);

    const [payout] = await sql<Row[]>`
      insert into payouts (round_id, member_id, ccy, amount_minor, status)
      values (${round.id}, ${round.recipient_member_id}, ${ccy}, ${pot.toString()}, 'pending')
      on conflict (round_id) do update set amount_minor = excluded.amount_minor, status = 'pending', provider_ref = null, simulated = null
      returning id`;
    const [{ n }] = await sql<Row[]>`
      select count(*)::int as n from journals where kind = 'payout' and ref_type = 'payout' and ref_id like ${`${payout.id}#%`}`;
    payoutId = payout.id;
    const ref = { type: 'payout', id: `${payout.id}#${n + 1}` };
    const lines = payoutLines(round.circle_id, COUNTRY_RAIL[country], ccy, pot, cashPaid(country, pot));

    try {
      await ledger.postJournal('payout', ref, lines);
      journalRef = ref.id;
    } catch (e) {
      if (!(e instanceof InsufficientPool)) throw e;
      // Invariant 3: refuse rather than overdraw.
      await sql`update payouts set status = 'failed' where id = ${payout.id}`;
      await sql`update rounds set status = 'withheld' where id = ${round.id} and status = 'paying'`;
      payoutId = null; // handled: nothing to undo
      return;
    }
    const [recipient] = await sql<Row[]>`select * from members where id = ${round.recipient_member_id}`;
    try {
      const res = await deps.rail(country, snap).payout({ payoutId: payout.id, member: toMember(recipient), amountMinor: pot });
      await sql`update payouts set provider_ref = ${res.providerRef}, requested_at = now() where id = ${payout.id}`;
    } catch (e) {
      // A documented sandbox limit (e.g. Paystack Starter accounts can't transfer) completes the payout,
      // labelled. The journal stands. Anything else is reversed and waits for an explicit retry.
      const simulated = deps.limits?.payout(toMember(recipient), e) ?? null;
      if (simulated) await markPaid(round, payout.id, simulated);
      else await reversePayout(round, payout.id, ref.id);
    }
    payoutId = null; // outcome recorded either way
    }
  }

  /** Undo a payout journal whose provider call failed. The round waits at `funded` for an explicit retry. */
  async function reversePayout(round: Row, payoutId: string, journalRefId?: string) {
    const [j] = journalRefId
      ? await sql<Row[]>`select id, ref_id from journals where kind = 'payout' and ref_type = 'payout' and ref_id = ${journalRefId}`
      : await sql<Row[]>`select id, ref_id from journals where kind = 'payout' and ref_type = 'payout' and ref_id like ${`${payoutId}#%`}
                         order by created_at desc limit 1`;
    if (j) {
      const lines = await sql<Row[]>`select account, ccy, amount_minor from journal_lines where journal_id = ${j.id}`;
      const original: Line[] = lines.map((l) => ({ account: l.account, ccy: l.ccy, amountMinor: BigInt(l.amount_minor) }));
      await ledger.postJournal('payout', { type: 'payout_reversal', id: j.ref_id }, reversalLines(original));
    }
    await sql`update payouts set status = 'failed' where id = ${payoutId}`;
    await sql`update rounds set status = 'funded' where id = ${round.id} and status = 'paying'`;
  }

  /** Reconcile-on-read: bring the round up to date with every provider, then return nothing (read state after). */
  async function reconcile(roundId: string): Promise<void> {
    let round = await loadRound(roundId);
    if (!round || round.status === 'paid' || round.status === 'withheld') return;
    const snap = await snapshotById(round.fx_snapshot_id);

    // 1. Pending contributions: ask each member's own rail, all rails at once.
    const pendingNow = (await contributionsOf(roundId)).filter((c) => c.status === 'pending' && c.provider_ref);
    await Promise.all(
      pendingNow.map((c) =>
        settleContribution(round, c, snap, deps.rail(c.country, snap)).catch((e) => console.error('settle', c.id, (e as Error).message)),
      ),
    );

    // 2. Withhold rule: a promise that has passed without payment withholds the round and costs reputation.
    const overdue = await sql<Row[]>`
      select member_id from contributions
      where round_id = ${roundId} and status <> 'succeeded' and promised_for is not null and promised_for < ${today()}::date`;
    if (overdue.length) {
      const [withheld] = await sql<Row[]>`
        update rounds set status = 'withheld' where id = ${roundId} and status in ('open', 'collecting') returning id`;
      if (withheld) {
        await sql`update members set reputation_score = greatest(0, reputation_score - 50)
                  where id in ${sql(overdue.map((o) => o.member_id))}`;
      }
      return;
    }

    // 3. Funded once EVERY contribution (including the recipient's own) has succeeded: convert the pot.
    const contributions = await contributionsOf(roundId);
    if (['open', 'collecting'].includes(round.status) && contributions.every((c) => c.status === 'succeeded')) {
      const target = COUNTRY_CCY[round.recipient_country as Country];
      const lines = conversionLines(
        round.circle_id,
        target,
        contributions.map((c) => ({ ccy: c.ccy as Ccy, amountMinor: BigInt(c.amount_minor), unitUsdCents: BigInt(round.contribution_unit_minor) })),
        snap,
      );
      if (lines.length) await ledger.postJournal('conversion', { type: 'round', id: roundId }, lines);
      await sql`update rounds set status = 'funded' where id = ${roundId} and status in ('open', 'collecting')`;
      round = await loadRound(roundId);
    }

    // 4. Funded: the FIRST payout attempt is automatic; a failed one waits for an explicit retry.
    //    If a payout already exists (a state only a race could leave), move the round to match it, never pay twice.
    if (round.status === 'funded') {
      const [p] = await sql<Row[]>`select id, status, provider_ref from payouts where round_id = ${roundId}`;
      if (!p) await initiatePayout(round, snap);
      else if (p.status === 'succeeded') await markPaid(round, p.id, undefined);
      else if (p.status === 'pending' && p.provider_ref)
        await sql`update rounds set status = 'paying' where id = ${roundId} and status = 'funded'`;
      round = await loadRound(roundId);
    }

    // 5. Paying: ask the recipient's rail whether the payout landed.
    if (round.status === 'paying') {
      const [p] = await sql<Row[]>`
        select *, extract(epoch from now() - coalesce(requested_at, now() - interval '1 hour'))::int as age_s
        from payouts where round_id = ${roundId}`;
      if (!p?.provider_ref) return;
      let status: RailStatus = 'pending';
      try {
        status = await deps.rail(round.recipient_country, snap).payoutStatus(p.provider_ref);
      } catch {
        // provider unreachable: treated as still pending
      }
      if (status === 'succeeded') {
        await markPaid(round, p.id);
      } else if (status === 'failed') {
        await reversePayout(round, p.id);
      } else {
        // A real result always wins; only a documented limit may confirm an accepted payout that never reports back.
        const [recipient] = await sql<Row[]>`select * from members where id = ${round.recipient_member_id}`;
        const simulated = deps.limits?.payoutUnconfirmed(toMember(recipient), Number(p.age_s)) ?? null;
        if (simulated) await markPaid(round, p.id, simulated);
      }
    }
  }

  /** Judge mode: allow this round's Paystack step to be served by replay (never silent). */
  async function allowReplay(roundId: string) {
    await sql`update rounds set replay_allowed = true where id = ${roundId}`;
  }

  /** Explicit retry after a failed payout (never automatic). */
  async function retryPayout(roundId: string) {
    const round = await loadRound(roundId);
    if (!round || round.status !== 'funded') throw new RoundError(`Round is ${round?.status ?? 'missing'}`);
    await initiatePayout(round, await snapshotById(round.fx_snapshot_id));
  }

  /** The round a provider reference (or MoMo externalId) belongs to, for webhooks. */
  async function roundForProviderRef(ref: string): Promise<string | null> {
    const [c] = await sql<Row[]>`
      select round_id from contributions where provider_ref = ${ref} or id::text = ${ref}
      union all
      select round_id from payouts where provider_ref = ${ref} or id::text = ${ref}
      limit 1`;
    return c?.round_id ?? null;
  }

  return {
    ledger,
    activateCircle,
    seedFloats,
    openNextRound,
    startCollection,
    recordPromise,
    reconcile,
    retryPayout,
    allowReplay,
    roundForProviderRef,
    snapshotById,
    loadRound,
    contributionsOf,
  };
}

export type Rounds = ReturnType<typeof makeRounds>;
