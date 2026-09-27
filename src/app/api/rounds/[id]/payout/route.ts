import { errorJson, json } from '@/lib/json';
import { rounds } from '@/lib/rounds';

/** Explicit retry of a failed payout. Payouts are never retried automatically. */
export async function POST(_req: Request, ctx: RouteContext<'/api/rounds/[id]/payout'>) {
  try {
    const { id } = await ctx.params;
    await rounds().retryPayout(id);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
