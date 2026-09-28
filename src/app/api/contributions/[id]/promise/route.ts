import { errorJson, isUuid, json, notFound } from '@/lib/json';
import { rounds } from '@/lib/rounds';

/** A late member promises a date. The round waits; past the date it is withheld and reputation drops. */
export async function POST(req: Request, ctx: RouteContext<'/api/contributions/[id]/promise'>) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return notFound();
    const { date } = (await req.json()) as { date?: string };
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
    await rounds().recordPromise(id, date);
    return json({ ok: true });
  } catch (e) {
    return errorJson(e);
  }
}
