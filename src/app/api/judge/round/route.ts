import { getSql } from '@/lib/db';
import { errorJson, json } from '@/lib/json';
import { currentDemo, judgeAdvance, rounds } from '@/lib/rounds';


// Provider and model calls are bounded individually; this caps the whole request.
export const maxDuration = 60;
/**
 * Judge mode step: open the next round if needed and start every unpaid contribution on its own rail.
 * Body: { circleId?: string, auto?: boolean }. `auto` = "Run full cycle" (Paystack step may be replayed).
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { circleId?: string; auto?: boolean };
    const circleId = body.circleId ?? (await currentDemo(getSql()))?.circleId;
    if (!circleId) return json({ error: 'No demo circle yet: reset the demo first' }, { status: 409 });
    return json(await judgeAdvance(getSql(), rounds(), circleId, { auto: body.auto === true }));
  } catch (e) {
    return errorJson(e);
  }
}
