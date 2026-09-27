import { getSql } from '@/lib/db';
import { errorJson, json } from '@/lib/json';

/** A circle, its members in payout order, and its current round id (for /c/[circleId]). */
export async function GET(_req: Request, ctx: RouteContext<'/api/circles/[id]'>) {
  try {
    const { id } = await ctx.params;
    const sql = getSql();
    const [circle] = await sql`select id, name, status, contribution_unit_minor, period from circles where id = ${id}`;
    if (!circle) return json({ error: 'Circle not found' }, { status: 404 });
    const members = await sql`
      select id, name, country, rail, reputation_score, payout_position from members where circle_id = ${id} order by payout_position`;
    const [round] = await sql`select id from rounds where circle_id = ${id} order by index desc limit 1`;
    return json({ circle, members, roundId: round?.id ?? null });
  } catch (e) {
    return errorJson(e);
  }
}
