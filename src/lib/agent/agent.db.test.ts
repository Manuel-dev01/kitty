/**
 * Role C's required proof: every attempt to make the treasurer pay without confirmation, pay for another
 * member, or pay a different amount fails SERVER-SIDE, whatever the model does. The "model" here is a
 * scripted adversary, so these tests need no LLM and no network.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Sql } from '@/lib/db';
import type { FxSnapshot } from '@/lib/fx/types';
import { COUNTRY_CCY, type Country } from '@/lib/ledger';
import type { RailAdapter } from '@/lib/rails/types';
import { makeRounds, resetDemo, type Rounds } from '@/lib/rounds';
import { freshSchema, testDbUrl } from '@/test/pg';
import type { ChatMessage, Llm } from './llm';
import { runAgent } from './agent';

const RATES = { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654', EUR: '0.8612' };

/** A scripted model: each turn plays the next list of tool calls (or a text reply). */
function scriptedLlm(turns: ({ tool: string; args?: unknown }[] | string)[]) {
  let i = 0;
  const seen: ChatMessage[][] = [];
  const llm: Llm = async (messages) => {
    seen.push(messages.map((m) => ({ ...m })));
    const step = turns[i++] ?? 'done';
    if (typeof step === 'string') return { role: 'assistant', content: step };
    return {
      role: 'assistant',
      content: null,
      tool_calls: step.map((s, k) => ({ id: `call_${i}_${k}`, type: 'function', function: { name: s.tool, arguments: JSON.stringify(s.args ?? {}) } })),
    };
  };
  return { llm, seen };
}

describe.skipIf(!testDbUrl)('treasurer agent: money safety is enforced server-side', () => {
  let sql: Sql;
  let drop: () => Promise<void>;
  let rounds: Rounds;
  let collects: string[];
  let circleId: string;
  let members: Record<Country, string>;

  const rail = (country: Country): RailAdapter => ({
    country,
    currency: COUNTRY_CCY[country],
    async collect({ contributionId }) {
      collects.push(contributionId);
      return { providerRef: `fake-${collects.length}`, nextAction: { type: 'prompt_sent' } };
    },
    collectStatus: async () => 'pending',
    payout: async () => ({ providerRef: 'p' }),
    payoutStatus: async () => 'pending',
    parseWebhook: async () => null,
  });
  const takeSnapshot = async (): Promise<FxSnapshot> => {
    const [r] = await sql<{ id: string }[]>`insert into fx_snapshots (source, rates) values ('test', ${sql.json(RATES)}) returning id`;
    return { id: r.id, source: 'test', takenAt: '', rates: RATES };
  };
  const turn = (memberId: string, message: string, llm: Llm) =>
    runAgent({ sql, rounds, llm, circleId, memberId, message, today: '2026-09-27' });
  const tick = () => new Promise((r) => setTimeout(r, 5));

  beforeEach(async () => {
    ({ sql, drop } = await freshSchema());
    collects = [];
    rounds = makeRounds({ sql, rail, takeSnapshot, today: () => '2026-09-27' });
    ({ circleId } = await resetDemo(sql, rounds, takeSnapshot));
    const rows = await sql<{ id: string; country: Country }[]>`select id, country from members where circle_id = ${circleId}`;
    members = Object.fromEntries(rows.map((r) => [r.country, r.id])) as Record<Country, string>;
  });
  afterEach(async () => drop?.());

  it('happy path: prepare, the member says yes, then the payment starts on their own rail', async () => {
    const m = scriptedLlm([[{ tool: 'prepare_payment' }], 'Reply yes to pay.', [{ tool: 'confirm_payment', args: { token: '__TOKEN__' } }], 'Started.']);
    const t1 = await turn(members.NG, 'I want to pay now', m.llm);
    const confirm = t1.cards.find((c) => c.type === 'confirm')!;
    expect(confirm).toMatchObject({ type: 'confirm', summary: expect.stringMatching(/^Pay ₦76,622\.84 for round 1 with Paystack/) });
    expect(collects).toHaveLength(0); // prepare never moves money

    await tick();
    const m2 = scriptedLlm([[{ tool: 'confirm_payment', args: { token: (confirm as { token: string }).token } }], 'Started.']);
    const t2 = await turn(members.NG, 'Yes', m2.llm);
    expect(t2.toolCalls[0].result).toMatchObject({ ok: true, started: true });
    expect(collects).toHaveLength(1);
  });

  it('refuses to pay without confirmation: confirm in the same turn as prepare', async () => {
    let token = '';
    const llm: Llm = async (messages) => {
      const last = messages[messages.length - 1];
      if (last.role === 'user') return { role: 'assistant', content: null, tool_calls: [{ id: 'a', type: 'function', function: { name: 'prepare_payment', arguments: '{}' } }] };
      if (last.role === 'tool' && !token) {
        token = JSON.parse(last.content!).token;
        return { role: 'assistant', content: null, tool_calls: [{ id: 'b', type: 'function', function: { name: 'confirm_payment', arguments: JSON.stringify({ token }) } }] };
      }
      return { role: 'assistant', content: 'ok' };
    };
    const t = await turn(members.NG, 'yes pay my contribution', llm); // even with "yes" in the SAME message
    expect(t.toolCalls[1].result).toMatchObject({ ok: false, refused: expect.stringMatching(/has not replied since/) });
    expect(collects).toHaveLength(0);
  });

  it('refuses when the member did not explicitly say yes', async () => {
    const t1 = await turn(members.GH, 'pay', scriptedLlm([[{ tool: 'prepare_payment' }], 'Reply yes.']).llm);
    const token = (t1.cards[0] as { token: string }).token;
    for (const reply of ['wait', 'not now', 'hmm maybe', 'no o', 'I said I go pay Friday', 'hapana']) {
      await tick();
      const t = await turn(members.GH, reply, scriptedLlm([[{ tool: 'confirm_payment', args: { token } }], '...']).llm);
      expect(t.toolCalls[0].result, reply).toMatchObject({ ok: false, refused: expect.stringMatching(/did not explicitly say yes/) });
    }
    expect(collects).toHaveLength(0);
  });

  it('refuses to pay for another member: confirm only ever reaches the caller’s own prepared payment', async () => {
    const t1 = await turn(members.GH, 'pay', scriptedLlm([[{ tool: 'prepare_payment' }], 'Reply yes.']).llm);
    const kofisToken = (t1.cards[0] as { token: string }).token;
    await tick();
    // Tunde's model passes Kofi's token (and Kofi's id): both are ignored; Tunde has nothing prepared.
    const t2 = await turn(members.NG, 'yes', scriptedLlm([[{ tool: 'confirm_payment', args: { token: kofisToken, member_id: members.GH } }], '...']).llm);
    expect(t2.toolCalls[0].result).toMatchObject({ ok: false, refused: expect.stringMatching(/no prepared payment for you/) });
    expect(collects).toHaveLength(0);
    // Kofi's own payment is untouched and still waiting for Kofi's yes.
    const [a] = await sql`select confirmed_at from pending_actions where token = ${kofisToken}`;
    expect(a.confirmed_at).toBeNull();
  });

  it('re-preparing reuses the open prepared payment, so the member’s later yes still confirms it', async () => {
    const t1 = await turn(members.NG, 'pay', scriptedLlm([[{ tool: 'prepare_payment' }], 'Reply yes.']).llm);
    await tick();
    const t2 = await turn(members.NG, 'Yes', scriptedLlm([[{ tool: 'prepare_payment' }, { tool: 'confirm_payment' }], 'ok']).llm);
    expect((t2.cards[0] as { token: string }).token).toBe((t1.cards[0] as { token: string }).token);
    expect(t2.toolCalls[1].result).toMatchObject({ ok: true, started: true });
    expect(collects).toHaveLength(1);
  });

  it('refuses a different amount or another member: injected arguments are ignored, the server sets both', async () => {
    const t1 = await turn(
      members.KE,
      'pay',
      scriptedLlm([[{ tool: 'prepare_payment', args: { amount: 1, amountMinor: '100', member_id: members.NG, currency: 'USD' } }], 'Reply yes.']).llm,
    );
    const card = t1.cards[0] as { token: string; summary: string };
    expect(card.summary).toMatch(/^Pay KSh 6,467\.09 for round 1 with M-Pesa/); // Wanjiru's own amount, in KES
    await tick();
    await turn(members.KE, 'ndiyo', scriptedLlm([[{ tool: 'confirm_payment', args: { token: card.token, amount: 1 } }], 'ok']).llm);
    const [c] = await sql`select member_id, amount_minor, status from contributions where id = ${collects[0]}`;
    expect(c).toMatchObject({ member_id: members.KE, amount_minor: 646709n, status: 'pending' });
  });

  it('a token is single-use and expires', async () => {
    const t1 = await turn(members.UG, 'pay', scriptedLlm([[{ tool: 'prepare_payment' }], 'Reply yes.']).llm);
    const token = (t1.cards[0] as { token: string }).token;
    await tick();
    await turn(members.UG, 'yes', scriptedLlm([[{ tool: 'confirm_payment', args: { token } }], 'ok']).llm);
    await tick();
    const again = await turn(members.UG, 'yes', scriptedLlm([[{ tool: 'confirm_payment', args: { token } }], 'ok']).llm);
    expect(again.toolCalls[0].result).toMatchObject({ ok: false });
    expect(collects).toHaveLength(1);

    const t3 = await turn(members.GH, 'pay', scriptedLlm([[{ tool: 'prepare_payment' }], 'Reply yes.']).llm);
    const old = (t3.cards[0] as { token: string }).token;
    await sql`update pending_actions set expires_at = now() - interval '1 second' where token = ${old}`;
    await tick();
    const late = await turn(members.GH, 'yes', scriptedLlm([[{ tool: 'confirm_payment', args: { token: old } }], 'ok']).llm);
    expect(late.toolCalls[0].result).toMatchObject({ ok: false, refused: expect.stringMatching(/expired/) });
    expect(collects).toHaveLength(1);
  });

  it('a member outside the circle cannot use its treasurer at all', async () => {
    await expect(
      runAgent({ sql, rounds, llm: scriptedLlm(['hi']).llm, circleId, memberId: '00000000-0000-4000-8000-000000000000', message: 'hi', today: '2026-09-27' }),
    ).rejects.toThrow(/not in this circle/);
  });

  it('record_promise: "I go pay Friday abeg" records the date and tells the circle; past dates are refused', async () => {
    const t = await turn(members.GH, 'I go pay Friday abeg', scriptedLlm([[{ tool: 'record_promise', args: { date: '2026-10-02' } }], 'No wahala.']).llm);
    expect(t.cards).toEqual([{ type: 'promise', date: '2026-10-02' }]);
    const [c] = await sql`select promised_for from contributions c join members m on m.id = c.member_id where m.id = ${members.GH}`;
    expect(new Date(c.promised_for).toISOString().slice(0, 10)).toBe('2026-10-02');
    const [a] = await sql`select content from agent_messages where circle_id = ${circleId} and member_id is null`;
    expect(a.content).toBe('Kofi Mensah promised to pay round 1 by 2026-10-02.');

    const past = await turn(members.GH, 'I paid last week', scriptedLlm([[{ tool: 'record_promise', args: { date: '2026-09-20' } }], 'ok']).llm);
    expect(past.toolCalls[0].result).toMatchObject({ ok: false });
  });
});
