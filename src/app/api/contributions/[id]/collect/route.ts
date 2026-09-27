import { errorJson, json } from '@/lib/json';
import { rounds } from '@/lib/rounds';

/**
 * Starts a member's payment on their own rail. Returns the provider reference and the next action:
 * a Paystack checkout URL to open, or "prompt_sent" (M-Pesa STK push / MoMo RequestToPay).
 */
export async function POST(_req: Request, ctx: RouteContext<'/api/contributions/[id]/collect'>) {
  try {
    const { id } = await ctx.params;
    return json(await rounds().startCollection(id));
  } catch (e) {
    return errorJson(e);
  }
}
