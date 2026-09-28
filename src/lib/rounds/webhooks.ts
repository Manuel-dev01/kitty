/**
 * Shared webhook handling. Order matters:
 *  1. the route verifies the sender (Paystack HMAC signature, or the URL secret for Daraja/MoMo);
 *  2. the event is inserted into provider_events FIRST, whose primary key makes redelivery a no-op;
 *  3. the affected round is reconciled, which re-reads the status from the provider's own API before
 *     any journal is posted. A webhook can speed a round up; it can never decide an outcome.
 */
import type { Sql } from '../db';
import type { NormalizedEvent } from '../rails/types';
import type { Rounds } from './engine';

export async function handleProviderEvent(sql: Sql, rounds: Rounds, event: NormalizedEvent) {
  const inserted = await sql`
    insert into provider_events (provider, event_id, payload)
    values (${event.provider}, ${event.eventId}, ${sql.json(event.payload as never)})
    on conflict do nothing returning event_id`;
  const roundId = await rounds.roundForProviderRef(event.providerRef);
  // The event is durable now. Reconcile is only a speed-up (the next poll does the same), so a failure here must
  // not become a 5xx that makes the provider retry the delivery.
  if (roundId) await rounds.reconcile(roundId).catch((e) => console.error('webhook reconcile', (e as Error).message));
  return { duplicate: inserted.length === 0, roundId };
}
