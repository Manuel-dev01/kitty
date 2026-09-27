/**
 * Judge mode (docs/ARCHITECTURE.md §7). One idempotent step that the dashboard's buttons call:
 * open the next round if the current one is paid, then start every unpaid/failed contribution on the
 * member's own rail. The dashboard then polls GET /api/rounds/:id, which reconciles on read.
 *
 * `auto` (Run full cycle) allows the round's Paystack step to be replayed from a recorded real success,
 * because nobody is at the test checkout. It is labelled `replay` on screen.
 */
import type { Sql } from '../db';
import type { Rounds } from './engine';
import { RoundError } from './engine';

export async function judgeAdvance(sql: Sql, rounds: Rounds, circleId: string, opts: { auto?: boolean } = {}) {
  const [circle] = await sql<{ status: string }[]>`select status from circles where id = ${circleId}`;
  if (!circle) throw new RoundError('Circle not found', 404);
  if (circle.status === 'completed') return { roundId: null, completed: true, started: [] };

  const [current] = await sql<{ id: string; status: string }[]>`
    select id, status from rounds where circle_id = ${circleId} order by index desc limit 1`;
  let roundId: string | null = current?.id ?? null;
  if (!current || current.status === 'paid') roundId = await rounds.openNextRound(circleId);
  if (!roundId) return { roundId: null, completed: true, started: [] };
  if (current?.id === roundId && current.status === 'withheld') throw new RoundError('Round is withheld');
  if (opts.auto) await rounds.allowReplay(roundId);

  const pending = (await rounds.contributionsOf(roundId)).filter((c) => c.status === 'unpaid' || c.status === 'failed');
  const started = await Promise.all(
    pending.map(async (c) => {
      try {
        const r = await rounds.startCollection(c.id);
        return { contributionId: c.id, country: c.country as string, providerRef: r.providerRef, nextAction: r.nextAction };
      } catch (e) {
        return { contributionId: c.id, country: c.country as string, error: (e as Error).message };
      }
    }),
  );
  return { roundId, completed: false, started };
}
