/**
 * The circle's treasurer. One turn = the member's message → (model ↔ tools, at most MAX_STEPS) → a reply.
 * Identity (circle, member) comes from the server, never from the model. See tools.ts for the safety rules.
 */
import type { Sql } from '../db';
import type { Rounds } from '../rounds';
import { COUNTRY } from '../ui/format';
import type { Country } from '../ui/types';
import type { ChatMessage, Llm } from './llm';
import { TOOL_DEFINITIONS, executeTool, type ToolContext, type ToolResult } from './tools';

const MAX_STEPS = 6;
const HISTORY = 12;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export class AgentError extends Error {
  constructor(message: string, readonly httpStatus = 400) {
    super(message);
    this.name = 'AgentError';
  }
}

const LANGUAGE: Record<string, string> = { en: 'English', pcm: 'Nigerian Pidgin', sw: 'Swahili' };

function systemPrompt(member: Row, circle: Row, today: string, language?: string) {
  const c = COUNTRY[member.country as Country];
  return [
    `You are the treasurer of "${circle.name}", a rotating savings circle (ajo / susu / chama) whose members live in different countries.`,
    `You are talking to ${member.name} in ${c.city}, ${c.name}, who pays and is paid with ${c.rail}. Today is ${today}.`,
    'Reply in the language and register the member uses: English, Nigerian Pidgin, or Swahili. Be warm, brief (1–3 sentences) and practical.',
    'Write plain text only: no markdown, no asterisks, no bullet lists.',
    ...(language && LANGUAGE[language] ? [`The member chose ${LANGUAGE[language]} in the app: prefer it unless they write in another language.`] : []),
    'Only promise what your tools do. You cannot schedule reminders or messages for later; do not offer to.',
    'Rules you must follow:',
    '- Get facts from your tools. Never invent amounts, dates, references or statuses; quote amounts exactly as the tools give them.',
    '- You cannot choose an amount or pay for anyone else. Payments are only ever for this member, for the amount the server sets.',
    '- To take a payment: call prepare_payment, tell the member the summary, and ask them to reply "yes" to confirm. Then STOP.',
    '- When the member\'s newest message is an explicit yes (yes, ok, oya, ndiyo, sawa…) after you asked them to confirm a payment, call confirm_payment (it takes no arguments). Do not prepare it again first. If a tool refuses, explain simply and do not retry the same thing.',
    '- When the member says when they will pay (e.g. "I go pay Friday abeg", "nitalipa Ijumaa"), work out the date from today and call record_promise.',
    '- Never claim money moved unless confirm_payment returned started: true. Collections are sandbox/test money.',
  ].join('\n');
}

/** One retry for a timed-out or failing model call (live demo: a slow provider must not break the chat). */
async function callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    return await fn();
  }
}

export interface AgentTurn {
  reply: string;
  cards: NonNullable<ToolResult['ui']>[];
  toolCalls: { name: string; args: unknown; result: Record<string, unknown> }[];
}

export async function runAgent(opts: {
  sql: Sql;
  rounds: Rounds;
  llm: Llm;
  circleId: string;
  memberId: string;
  message: string;
  today?: string;
  /** The language the member picked in the chat ('en' | 'pcm' | 'sw'): a preference, not an override. */
  language?: string;
}): Promise<AgentTurn> {
  const { sql, circleId, memberId } = opts;
  const message = opts.message.trim().slice(0, 1000);
  if (!message) throw new AgentError('Say something to the treasurer.');

  // Identity comes from the session: the member must belong to this circle.
  const [member] = await sql<Row[]>`select * from members where id = ${memberId} and circle_id = ${circleId}`;
  if (!member) throw new AgentError('That member is not in this circle.', 403);
  const [circle] = await sql<Row[]>`select * from circles where id = ${circleId}`;
  const today = opts.today ?? new Date().toISOString().slice(0, 10);

  const history = await sql<Row[]>`
    select role, content from agent_messages
    where circle_id = ${circleId} and member_id = ${memberId} and role in ('user', 'assistant')
    order by created_at desc limit ${HISTORY}`;
  const [saved] = await sql<Row[]>`
    insert into agent_messages (circle_id, member_id, role, content) values (${circleId}, ${memberId}, 'user', ${message})
    returning created_at`;

  const ctx: ToolContext = {
    sql,
    rounds: opts.rounds,
    circleId,
    memberId,
    userMessage: message,
    userMessageAt: new Date(saved.created_at),
    today,
  };
  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt(member, circle, today, opts.language) },
    ...history.reverse().map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content as string })),
    { role: 'user', content: message },
  ];

  const cards: AgentTurn['cards'] = [];
  const toolCalls: AgentTurn['toolCalls'] = [];
  let reply = '';
  for (let step = 0; step < MAX_STEPS; step++) {
    let out: ChatMessage;
    try {
      out = await callWithRetry(() => opts.llm(messages, TOOL_DEFINITIONS));
    } catch (e) {
      console.error('treasurer model unavailable:', (e as Error).message);
      reply = toolCalls.length
        ? 'I did part of that, but lost my connection before I could finish. Please check the status above and try again.'
        : 'Sorry, I’m having trouble connecting right now. Please try again in a moment.';
      break;
    }
    messages.push(out);
    if (!out.tool_calls?.length) {
      reply = out.content?.trim() ?? '';
      break;
    }
    for (const call of out.tool_calls) {
      let args: unknown = {};
      try {
        args = JSON.parse(call.function.arguments || '{}');
      } catch {
        args = {};
      }
      const result = await executeTool(ctx, call.function.name, args);
      toolCalls.push({ name: call.function.name, args, result: result.content });
      if (result.ui) cards.push(result.ui);
      messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result.content) });
    }
  }
  if (!reply) reply = 'Sorry, I could not finish that. Please try again.';

  await sql`
    insert into agent_messages (circle_id, member_id, role, content, tool_calls)
    values (${circleId}, ${memberId}, 'assistant', ${reply}, ${sql.json({ toolCalls, cards } as never)})`;
  return { reply, cards, toolCalls };
}

/** The member's conversation plus the circle's announcements, oldest first. */
export async function agentHistory(sql: Sql, circleId: string, memberId: string) {
  const rows = await sql<Row[]>`
    select role, content, tool_calls, member_id is null as announcement, created_at
    from agent_messages
    where circle_id = ${circleId} and (member_id = ${memberId} or member_id is null) and role in ('user', 'assistant')
    order by created_at desc limit 40`;
  return rows.reverse().map((r) => ({
    role: r.announcement ? 'circle' : r.role,
    content: r.content,
    cards: r.tool_calls?.cards ?? [],
    at: r.created_at,
  }));
}
