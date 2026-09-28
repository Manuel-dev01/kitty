/**
 * The treasurer's tools (docs/ARCHITECTURE.md §6). Safety is enforced HERE, server-side, not in the prompt:
 * - Every tool is bound to the caller's circle and member (from the session). The model cannot name a
 *   member, a round or an amount: the schemas have no such fields and extra arguments are ignored.
 * - prepare_payment only creates a pending_actions token. It never moves money.
 * - confirm_payment takes NO arguments: the server confirms this member's own latest open prepared payment,
 *   and only if their latest message is an explicit yes (judged by the server from their words), sent AFTER
 *   the prepare step, before it expires. The model never handles a token it could swap.
 * - The LLM never pays out and never calls a provider directly.
 */
import { randomBytes } from 'node:crypto';
import type { Sql } from '../db';
import type { Rounds } from '../rounds';
import { COUNTRY, fmtMinor } from '../ui/format';
import type { Country } from '../ui/types';
import { isExplicitYes } from './consent';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

export const PREPARE_TTL_MINUTES = 10;

/** Who is talking, and what they actually said this turn. Built by the server, never by the model. */
export interface ToolContext {
  sql: Sql;
  rounds: Rounds;
  circleId: string;
  memberId: string;
  userMessage: string;
  userMessageAt: Date;
  today: string; // YYYY-MM-DD
}

/** The confirmation card the member sees. Every field is computed by the server, never by the model. */
export interface ConfirmCard {
  type: 'confirm';
  token: string;
  summary: string;
  amount: string;
  rail: string;
  round: number;
  recipientName: string;
  usd: string;
  account: string;
}

export interface ToolResult {
  /** What the model sees. */
  content: Record<string, unknown>;
  /** What the UI renders (cards and actions), never seen as instructions by anyone. */
  ui?: ConfirmCard | { type: 'promise'; date: string } | { type: 'payment_started'; providerRef: string; rail: string; checkoutUrl?: string };
}

export const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_circle_status',
      description: "The circle's current round: who receives the pot, and who has and hasn't paid (with any promised dates).",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_my_schedule',
      description: "The member's own schedule: what they owe this round in their currency, whether it's paid, and which round they receive the pot.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'record_promise',
      description: "Record the member's promise to pay this round's contribution by a date, and tell the circle. Use when they say when they will pay.",
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'The promised date, YYYY-MM-DD, today or within the next 30 days.' } },
        required: ['date'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_payment',
      description:
        "Prepare the member's payment for this round. Does NOT move money: it returns a summary with the server-computed amount. Then ask the member to reply yes to confirm.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'confirm_payment',
      description:
        'Start the payment you prepared earlier, on the member’s own rail. Only valid if the member’s newest message explicitly says yes to it.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
] as const;

async function currentContribution(ctx: ToolContext) {
  const [row] = await ctx.sql<Row[]>`
    select c.id, c.ccy, c.amount_minor, c.status, c.promised_for, c.provider_ref, r.id as round_id, r.index, r.status as round_status,
           m.name, m.country, m.rail, rm.name as recipient_name, ci.contribution_unit_minor
    from rounds r
    join contributions c on c.round_id = r.id and c.member_id = ${ctx.memberId}
    join members rm on rm.id = r.recipient_member_id
    join circles ci on ci.id = r.circle_id
    join members m on m.id = c.member_id
    where r.circle_id = ${ctx.circleId}
    order by r.index desc limit 1`;
  return row;
}

const fail = (reason: string): ToolResult => ({ content: { ok: false, refused: reason } });

async function getCircleStatus(ctx: ToolContext): Promise<ToolResult> {
  const [round] = await ctx.sql<Row[]>`
    select r.id, r.index, r.status, m.name as recipient, m.country as recipient_country,
           (select count(*)::int from members where circle_id = ${ctx.circleId}) as rounds_total
    from rounds r join members m on m.id = r.recipient_member_id
    where r.circle_id = ${ctx.circleId} order by r.index desc limit 1`;
  if (!round) return fail('This circle has no round yet.');
  const members = await ctx.sql<Row[]>`
    select m.name, m.country, c.ccy, c.amount_minor, c.status, c.promised_for
    from contributions c join members m on m.id = c.member_id
    where c.round_id = ${round.id} order by m.payout_position`;
  return {
    content: {
      ok: true,
      round: `${round.index} of ${round.rounds_total}`,
      roundStatus: round.status,
      potGoesTo: `${round.recipient} in ${COUNTRY[round.recipient_country as Country].city}`,
      members: members.map((m) => ({
        name: m.name,
        city: COUNTRY[m.country as Country].city,
        owes: fmtMinor(m.amount_minor, m.ccy),
        status: m.status,
        promisedFor: m.promised_for ? new Date(m.promised_for).toISOString().slice(0, 10) : null,
      })),
    },
  };
}

async function getMySchedule(ctx: ToolContext): Promise<ToolResult> {
  const c = await currentContribution(ctx);
  if (!c) return fail('You are not in a round yet.');
  const [me] = await ctx.sql<Row[]>`select payout_position, rail, country from members where id = ${ctx.memberId}`;
  const [{ n }] = await ctx.sql<Row[]>`select count(*)::int as n from members where circle_id = ${ctx.circleId}`;
  return {
    content: {
      ok: true,
      thisRound: c.index,
      youOwe: fmtMinor(c.amount_minor, c.ccy),
      status: c.status,
      promisedFor: c.promised_for ? new Date(c.promised_for).toISOString().slice(0, 10) : null,
      payWith: COUNTRY[me.country as Country].rail,
      youReceiveThePotInRound: me.payout_position,
      potSize: fmtMinor(BigInt(c.amount_minor) * BigInt(n), c.ccy),
      note: 'Amounts are set by the circle and computed by the server; quote them exactly.',
    },
  };
}

async function recordPromise(ctx: ToolContext, args: Row): Promise<ToolResult> {
  const date = String(args.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return fail('The date must be YYYY-MM-DD.');
  const days = (Date.parse(date) - Date.parse(ctx.today)) / 86_400_000;
  if (!(days >= 0 && days <= 30)) return fail('The promised date must be today or within the next 30 days.');
  const c = await currentContribution(ctx);
  if (!c) return fail('You are not in a round yet.');
  if (c.status === 'succeeded') return fail('This round is already paid. No promise needed.');
  await ctx.rounds.recordPromise(c.id, date);
  const text = `${c.name} promised to pay round ${c.index} by ${date}.`;
  await ctx.sql`insert into agent_messages (circle_id, member_id, role, content) values (${ctx.circleId}, null, 'assistant', ${text})`;
  return { content: { ok: true, recorded: date, circleTold: text }, ui: { type: 'promise', date } };
}

async function preparePayment(ctx: ToolContext): Promise<ToolResult> {
  const c = await currentContribution(ctx);
  if (!c) return fail('You are not in a round yet.');
  if (c.status === 'succeeded') return fail('You have already paid this round.');
  if (c.status === 'pending') return fail('A payment for this round is already waiting for your approval on your phone or checkout.');
  if (!['open', 'collecting'].includes(c.round_status)) return fail(`The round is ${c.round_status}; it is not collecting.`);
  const summary = `Pay ${fmtMinor(c.amount_minor, c.ccy)} for round ${c.index} with ${COUNTRY[c.country as Country].rail}`;
  const card = (token: string): ConfirmCard => ({
    type: 'confirm',
    token,
    summary,
    amount: fmtMinor(c.amount_minor, c.ccy),
    rail: COUNTRY[c.country as Country].rail,
    round: c.index,
    recipientName: c.recipient_name,
    usd: fmtMinor(c.contribution_unit_minor, 'USD'),
    account: `cash:${c.rail}:${c.ccy}`,
  });
  const [open] = await ctx.sql<Row[]>`
    select token from pending_actions
    where member_id = ${ctx.memberId} and circle_id = ${ctx.circleId} and action = 'pay_contribution'
      and confirmed_at is null and expires_at > now() and args->>'contributionId' = ${c.id}
    order by created_at desc limit 1`;
  if (open) {
    return {
      content: { ok: true, summary, alreadyPrepared: true, next: 'Ask the member to reply yes to confirm.' },
      ui: card(open.token),
    };
  }
  const token = randomBytes(12).toString('base64url');
  await ctx.sql`
    insert into pending_actions (token, member_id, circle_id, action, args, expires_at, created_at)
    values (${token}, ${ctx.memberId}, ${ctx.circleId}, 'pay_contribution', ${ctx.sql.json({ contributionId: c.id })},
            now() + ${`${PREPARE_TTL_MINUTES} minutes`}::interval, now())`;
  return {
    content: { ok: true, summary, expiresInMinutes: PREPARE_TTL_MINUTES, next: 'Ask the member to reply yes to confirm. Do not confirm in this turn.' },
    ui: card(token),
  };
}

async function confirmPayment(ctx: ToolContext): Promise<ToolResult> {
  // Bound to the session: this member's own latest open prepared payment. Arguments from the model are ignored.
  const [a] = await ctx.sql<Row[]>`
    select * from pending_actions
    where member_id = ${ctx.memberId} and circle_id = ${ctx.circleId} and action = 'pay_contribution' and confirmed_at is null
    order by created_at desc limit 1`;
  const token = a?.token as string;
  // Every check below is independent of what the model claims.
  if (!a) return fail('There is no prepared payment for you. Prepare it first.');
  if (new Date(a.expires_at) <= new Date()) return fail('That confirmation expired. Prepare the payment again.');
  if (new Date(a.created_at) >= ctx.userMessageAt) {
    return fail('The member has not replied since the payment was prepared. Ask them to confirm first.');
  }
  if (!isExplicitYes(ctx.userMessage)) return fail('The member did not explicitly say yes. Ask them to confirm with a clear yes.');

  const [claimed] = await ctx.sql<Row[]>`
    update pending_actions set confirmed_at = now() where token = ${token} and confirmed_at is null returning token`;
  if (!claimed) return fail('That payment was already confirmed.');
  // At most once: the "yes" is consumed before the rail call, so a timed-out request can never be re-sent on the
  // same consent. If it fails, the member prepares again and gives a fresh yes.
  const started = await ctx.rounds.startCollection(a.args.contributionId);
  const [m] = await ctx.sql<Row[]>`select country from members where id = ${ctx.memberId}`;
  const rail = COUNTRY[m.country as Country].rail;
  const checkoutUrl = started.nextAction?.type === 'redirect' ? started.nextAction.url : undefined;
  return {
    content: {
      ok: true,
      started: true,
      providerRef: started.providerRef,
      next: checkoutUrl ? 'A Paystack checkout was opened for the member.' : 'A payment prompt was sent to the member’s phone; they approve it there.',
    },
    ui: { type: 'payment_started', providerRef: started.providerRef, rail, checkoutUrl },
  };
}

export async function executeTool(ctx: ToolContext, name: string, rawArgs: unknown): Promise<ToolResult> {
  const args = (rawArgs && typeof rawArgs === 'object' ? rawArgs : {}) as Row; // unknown fields are simply never read
  try {
    switch (name) {
      case 'get_circle_status':
        return await getCircleStatus(ctx);
      case 'get_my_schedule':
        return await getMySchedule(ctx);
      case 'record_promise':
        return await recordPromise(ctx, args);
      case 'prepare_payment':
        return await preparePayment(ctx);
      case 'confirm_payment':
        return await confirmPayment(ctx);
      default:
        return fail(`Unknown tool ${name}.`);
    }
  } catch (e) {
    return fail(`The tool failed: ${(e as Error).message}`);
  }
}
