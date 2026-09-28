import { getSql } from '@/lib/db';
import { errorJson, isUuid, json, notFound } from '@/lib/json';

/**
 * A circle, its members in payout order, every round (status + when its pot was paid, from the payout
 * journal: real dates only), and the current round id. Used by /c/[circleId].
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/circles/[id]'>) {
  try {
    const { id } = await ctx.params;
    // A malformed id is simply a circle that doesn't exist (not a 500 from Postgres' uuid parser).
    if (!isUuid(id)) return notFound('Circle not found');
    const sql = getSql();
    const [circle] = await sql`select id, name, status, contribution_unit_minor, period from circles where id = ${id}`;
    if (!circle) return json({ error: 'Circle not found' }, { status: 404 });
    const members = await sql`
      select id, name, country, rail, reputation_score, payout_position from members where circle_id = ${id} order by payout_position`;
    const rounds = await sql`
      select r.id, r.index, r.status, r.recipient_member_id,
             (select max(j.created_at) from journals j
              where j.kind = 'payout' and j.ref_type = 'payout' and j.ref_id like p.id::text || '#%') as paid_at
      from rounds r left join payouts p on p.round_id = r.id
      where r.circle_id = ${id} order by r.index`;
    return json({
      circle: { ...circle, unitUsdCents: circle.contribution_unit_minor },
      members,
      rounds: rounds.map((r) => ({
        id: r.id,
        index: r.index,
        status: r.status,
        recipientMemberId: r.recipient_member_id,
        paidAt: r.status === 'paid' ? r.paid_at : null,
      })),
      roundId: rounds.at(-1)?.id ?? null,
    });
  } catch (e) {
    return errorJson(e);
  }
}
