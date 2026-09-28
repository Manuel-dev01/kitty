/**
 * The judge-mode circle (docs/ARCHITECTURE.md §7): "Lagos · Nairobi · Kampala · Accra", four members,
 * $50 each per round, a $200 pot. "Reset demo" wipes circle state (never provider_calls, which hold the
 * recorded real responses, or fx_snapshots) and rebuilds it with floats seeded and round 1 open.
 */
import type { Sql } from '../db';
import type { Rounds } from './engine';

export const DEMO_MEMBERS = [
  // Highest reputation first: Wanjiru takes the first pot, in Nairobi, as in docs/DEMO.md.
  { name: 'Wanjiru Kamau', country: 'KE', rail: 'daraja', phone: '254708374149', email: null, reputation: 900 },
  { name: 'Tunde Adeyemi', country: 'NG', rail: 'paystack', phone: '+2348000000001', email: 'tunde.kitty@example.com', reputation: 800 },
  { name: 'Nakato Namutebi', country: 'UG', rail: 'momo', phone: '256772123456', email: null, reputation: 700 },
  { name: 'Kofi Mensah', country: 'GH', rail: 'momo', phone: '233241234567', email: null, reputation: 650 },
] as const;

export async function resetDemo(sql: Sql, rounds: Rounds, takeSnapshot: () => Promise<{ id?: string }>) {
  // The only external call (FX rates) happens BEFORE anything is wiped, so a failure there leaves the old demo intact.
  const snap = await takeSnapshot();
  if (!snap.id) throw new Error('Snapshot was not stored');
  await sql`truncate journal_lines, journals, payouts, contributions, rounds, agent_messages, pending_actions, members, circles
            restart identity cascade`;
  const [circle] = await sql<{ id: string }[]>`
    insert into circles (name, unit_ccy, contribution_unit_minor, period, status)
    values ('Lagos · Nairobi · Kampala · Accra', 'USD', 5000, 'weekly', 'draft') returning id`;
  for (const [i, m] of DEMO_MEMBERS.entries()) {
    // Staggered join times make the tie-break (join time) deterministic too.
    await sql`insert into members (circle_id, name, country, phone, email, rail, reputation_score, created_at)
              values (${circle.id}, ${m.name}, ${m.country}, ${m.phone}, ${m.email}, ${m.rail}, ${m.reputation},
                      now() - ${`${10 - i} minutes`}::interval)`;
  }
  await rounds.activateCircle(circle.id);
  await rounds.seedFloats(circle.id, await rounds.snapshotById(snap.id));
  const roundId = await rounds.openNextRound(circle.id, snap.id);
  return { circleId: circle.id, roundId };
}

/** The latest circle and its current round, for /dashboard. */
export async function currentDemo(sql: Sql) {
  const [row] = await sql<{ circle_id: string; round_id: string | null }[]>`
    select c.id as circle_id,
           (select r.id from rounds r where r.circle_id = c.id order by r.index desc limit 1) as round_id
    from circles c order by c.created_at desc limit 1`;
  return row ? { circleId: row.circle_id, roundId: row.round_id } : null;
}
