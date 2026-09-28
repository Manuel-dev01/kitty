import { errorJson, isUuid, json, notFound } from '@/lib/json';
import { rounds } from '@/lib/rounds';

/** Opens the circle's next round (the previous one must be paid). Returns null roundId when the cycle is complete. */
export async function POST(_req: Request, ctx: RouteContext<'/api/circles/[id]/rounds'>) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return notFound();
    const roundId = await rounds().openNextRound(id);
    return json({ roundId, completed: roundId === null });
  } catch (e) {
    return errorJson(e);
  }
}
