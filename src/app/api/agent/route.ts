import { agentHistory, deepseek, runAgent } from '@/lib/agent';
import { getSql } from '@/lib/db';
import { errorJson, json } from '@/lib/json';
import { rounds } from '@/lib/rounds';

const UUID = /^[0-9a-f-]{36}$/i;


// Provider and model calls are bounded individually; this caps the whole request.
export const maxDuration = 60;
/**
 * The treasurer chat. Body: { circleId, memberId, message }.
 * (Demo identity: the circle page lets you pick which member you are. The server checks membership, and
 * every tool is bound to that member; the model can never act for anyone else.)
 */
export async function POST(req: Request) {
  try {
    const { circleId, memberId, message, language } = (await req.json().catch(() => ({}))) as Record<string, string>;
    if (!UUID.test(circleId ?? '') || !UUID.test(memberId ?? '')) return json({ error: 'circleId and memberId are required' }, { status: 400 });
    if (typeof message !== 'string' || !message.trim()) return json({ error: 'message is required' }, { status: 400 });
    const lang = ['en', 'pcm', 'sw'].includes(language) ? language : undefined;
    const turn = await runAgent({ sql: getSql(), rounds: rounds(), llm: deepseek, circleId, memberId, message, language: lang });
    return json({ reply: turn.reply, cards: turn.cards });
  } catch (e) {
    return errorJson(e);
  }
}

/** ?circleId=…&memberId=… → the member's conversation plus circle announcements. */
export async function GET(req: Request) {
  try {
    const p = new URL(req.url).searchParams;
    const circleId = p.get('circleId') ?? '';
    const memberId = p.get('memberId') ?? '';
    if (!UUID.test(circleId) || !UUID.test(memberId)) return json({ error: 'circleId and memberId are required' }, { status: 400 });
    return json({ messages: await agentHistory(getSql(), circleId, memberId) });
  } catch (e) {
    return errorJson(e);
  }
}
