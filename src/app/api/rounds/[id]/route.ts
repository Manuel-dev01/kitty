import { getSql } from '@/lib/db';
import { errorJson, isUuid, json, notFound } from '@/lib/json';
import { roundState, rounds } from '@/lib/rounds';


// Provider and model calls are bounded individually; this caps the whole request.
export const maxDuration = 60;
/**
 * Reconcile-on-read: ask every provider about anything pending, then return the round's full state.
 * `?reconcile=0` returns the stored state without calling any provider (for inspection).
 * If reconciling fails, the stored state is still returned, with the error, so the UI never goes blank.
 */
export async function GET(req: Request, ctx: RouteContext<'/api/rounds/[id]'>) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return notFound();
    let reconcileError: string | null = null;
    if (new URL(req.url).searchParams.get('reconcile') !== '0') {
      try {
        await rounds().reconcile(id);
      } catch (e) {
        console.error(e);
        reconcileError = (e as Error).message;
      }
    }
    const state = await roundState(getSql(), rounds(), id);
    return state ? json({ ...state, reconcileError }) : json({ error: 'Round not found' }, { status: 404 });
  } catch (e) {
    return errorJson(e);
  }
}
