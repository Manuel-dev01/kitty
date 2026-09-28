import { errorJson, isUuid, json, notFound } from '@/lib/json';
import { rounds } from '@/lib/rounds';

/** The judge chose "use the recorded payment": this round's Paystack step may be served by (labelled) replay. */
export async function POST(_req: Request, ctx: RouteContext<'/api/rounds/[id]/replay'>) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return notFound();
    await rounds().allowReplay(id);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
