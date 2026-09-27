import { getSql } from '@/lib/db';
import { errorJson, json } from '@/lib/json';
import { roundState, rounds } from '@/lib/rounds';

/** Reconcile-on-read: ask every provider about anything pending, then return the round's full state. */
export async function GET(_req: Request, ctx: RouteContext<'/api/rounds/[id]'>) {
  try {
    const { id } = await ctx.params;
    await rounds().reconcile(id);
    const state = await roundState(getSql(), rounds(), id);
    return state ? json(state) : json({ error: 'Round not found' }, { status: 404 });
  } catch (e) {
    return errorJson(e);
  }
}
