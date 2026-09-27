/** The read model behind GET /api/rounds/:id: everything the dashboard renders, in one payload. */
import { COUNTRY_CCY, localPrice, type Ccy, type Country } from '../ledger';
import { headline, nettingReport } from '../netting';
import type { Rounds } from './engine';
import type { Sql } from '../db';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export async function roundState(sql: Sql, rounds: Rounds, roundId: string) {
  const round = await rounds.loadRound(roundId);
  if (!round) return null;
  const snap = await rounds.snapshotById(round.fx_snapshot_id);
  const [circle] = await sql<Row[]>`select * from circles where id = ${round.circle_id}`;
  const contributions = await rounds.contributionsOf(roundId);
  const [payout] = await sql<Row[]>`select * from payouts where round_id = ${roundId}`;

  const journals = await sql<Row[]>`
    select j.id, j.kind, j.ref_type, j.ref_id, j.created_at,
           json_agg(json_build_object('account', l.account, 'ccy', l.ccy, 'amountMinor', l.amount_minor::text) order by l.id) as lines
    from journals j join journal_lines l on l.journal_id = j.id
    where exists (select 1 from journal_lines x where x.journal_id = j.id
                  and (x.account like ${`circle:${round.circle_id}:%`} or x.account like 'equity:float:%'))
    group by j.id order by j.created_at desc, j.id desc limit 80`;

  // Cumulative netting for the whole circle: every succeeded contribution, against its round's recipient.
  const facts = await sql<Row[]>`
    select m.country as payer_country, rm.country as recipient_country
    from contributions c
    join rounds r on r.id = c.round_id join members m on m.id = c.member_id join members rm on rm.id = r.recipient_member_id
    where r.circle_id = ${round.circle_id} and c.status = 'succeeded'`;
  const unit = BigInt(circle.contribution_unit_minor);
  const recipientCcy = COUNTRY_CCY[round.recipient_country as Country] as Ccy;
  const report = nettingReport({
    balances: await rounds.ledger.balances(),
    contributions: facts.map((f) => ({ payerCountry: f.payer_country, recipientCountry: f.recipient_country, unitUsdCents: unit })),
    snapshot: snap,
    nextPayout:
      round.status === 'paid' ? undefined : { ccy: recipientCcy, amountMinor: localPrice(unit, recipientCcy, snap) * BigInt(contributions.length) },
  });

  return {
    circle: { id: circle.id, name: circle.name, status: circle.status, unitUsdCents: unit },
    round: {
      id: round.id,
      index: round.index,
      status: round.status,
      replayAllowed: round.replay_allowed as boolean,
      recipient: { id: round.recipient_member_id, name: round.recipient_name, country: round.recipient_country, ccy: recipientCcy },
      fxSnapshot: { id: snap.id, source: snap.source, takenAt: snap.takenAt, rates: snap.rates },
    },
    contributions: contributions.map((c) => ({
      id: c.id,
      member: { id: c.member_id, name: c.name, country: c.country, rail: c.rail, reputationScore: c.reputation_score, payoutPosition: c.payout_position },
      ccy: c.ccy,
      amountMinor: BigInt(c.amount_minor),
      railAmountMinor: c.rail_amount_minor === null ? null : BigInt(c.rail_amount_minor),
      railCcy: c.rail_ccy,
      providerRef: c.provider_ref,
      status: c.status,
      promisedFor: c.promised_for,
      railNote: c.rail === 'momo' ? 'MoMo sandbox · settles in EUR' : null,
      /** Non-null when a documented sandbox limit completed this step: show a `simulated · sandbox limit` badge. */
      simulated: c.simulated as string | null,
      /** Non-null when served from a recorded real provider response: show a `replay` badge. */
      replay: c.replay as string | null,
    })),
    payout: payout
      ? {
          id: payout.id,
          status: payout.status,
          ccy: payout.ccy,
          amountMinor: BigInt(payout.amount_minor),
          providerRef: payout.provider_ref,
          simulated: payout.simulated as string | null,
        }
      : null,
    journals: journals.map((j) => ({ id: j.id, kind: j.kind, ref: { type: j.ref_type, id: j.ref_id }, createdAt: j.created_at, lines: j.lines })),
    netting: { ...report, headline: headline(report) },
  };
}
