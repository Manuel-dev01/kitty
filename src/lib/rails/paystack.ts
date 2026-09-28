/**
 * Paystack (NG, NGN, test mode).
 * collect = transaction/initialize → checkout link · status = transaction/verify (source of truth)
 * payout  = transferrecipient + transfer · webhook = HMAC-SHA512 of the RAW body with the secret key.
 * saved card: a real successful checkout yields a reusable authorization; later collections can charge it
 * server-side (transaction/charge_authorization), a real test-mode charge rather than a replayed response.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getSql } from '../db';
import { providerFetch, requireEnv } from './http';
import type { Member, NormalizedEvent, RailAdapter, RailStatus } from './types';

const BASE = 'https://api.paystack.co';

function secretKey(): string {
  const key = requireEnv('PAYSTACK_SECRET_KEY');
  if (!key.startsWith('sk_test_')) throw new Error('PAYSTACK_SECRET_KEY must be a test key (sk_test_)');
  return key;
}

const call = <T>(op: string, method: 'GET' | 'POST', path: string, body?: unknown) =>
  providerFetch<{ status: boolean; message: string; data: T }>({
    provider: 'paystack',
    op,
    method,
    url: `${BASE}${path}`,
    headers: { Authorization: `Bearer ${secretKey()}` },
    body,
  }).then((r) => r.data.data);

/** Paystack references allow [A-Za-z0-9.=-]. One contribution can have several attempts. */
export const paystackReference = (kind: 'ctb' | 'pay', id: string) =>
  `kitty-${kind}-${id.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}-${Date.now().toString(36)}`;

export function mapChargeStatus(s: string): RailStatus {
  if (s === 'success') return 'succeeded';
  if (s === 'failed' || s === 'reversed') return 'failed';
  return 'pending'; // abandoned (not paid yet), ongoing, pending, processing, queued
}

export function mapTransferStatus(s: string): RailStatus {
  if (s === 'success') return 'succeeded';
  if (s === 'failed' || s === 'reversed' || s === 'rejected') return 'failed';
  return 'pending'; // pending, otp, processing, queued
}

type Authorization = { authorization_code?: string; reusable?: boolean; card_type?: string; last4?: string; exp_month?: string; exp_year?: string };

const cardLabel = (a: Authorization) => `${(a.card_type ?? 'card').trim()} ····${a.last4 ?? '????'} ${a.exp_month ?? ''}/${a.exp_year ?? ''}`.trim();

/** Remember a reusable authorization from a REAL successful charge (best effort: never breaks a payment). */
async function learnAuthorization(email: string | undefined, a: Authorization | undefined, ref: string) {
  if (!email || !a?.reusable || !a.authorization_code || !process.env.DATABASE_URL) return;
  try {
    await getSql()`
      insert into saved_authorizations (provider, email, authorization_code, card, source_ref)
      values ('paystack', ${email}, ${a.authorization_code}, ${cardLabel(a)}, ${ref})
      on conflict (provider, email) do update set authorization_code = excluded.authorization_code, card = excluded.card,
        source_ref = excluded.source_ref, created_at = now()`;
  } catch (e) {
    console.warn('could not save Paystack authorization:', (e as Error).message);
  }
}

/**
 * The member's saved card, if a real checkout ever produced a reusable one. Falls back to the recorded real
 * verify responses in provider_calls (so a card learned before this table existed is not lost).
 */
export async function savedAuthorization(email: string): Promise<{ code: string; card: string } | null> {
  if (!process.env.DATABASE_URL) return null;
  const sql = getSql();
  const [row] = await sql<{ authorization_code: string; card: string }[]>`
    select authorization_code, card from saved_authorizations where provider = 'paystack' and email = ${email}`;
  if (row) return { code: row.authorization_code, card: row.card };
  const [rec] = await sql<{ a: Authorization; ref: string }[]>`
    select response->'data'->'authorization' as a, response->'data'->>'reference' as ref
    from provider_calls
    where provider = 'paystack' and op in ('verify', 'collectStatus') and status_code = 200
      and response->'data'->>'status' = 'success'
      and response->'data'->'customer'->>'email' = ${email}
      and (response->'data'->'authorization'->>'reusable')::boolean
    order by id desc limit 1`;
  if (!rec?.a?.authorization_code) return null;
  await learnAuthorization(email, rec.a, rec.ref);
  return { code: rec.a.authorization_code, card: cardLabel(rec.a) };
}

/** Status plus the amount Paystack actually charged, so reconciliation can refuse a short payment. */
export async function verifyCharge(reference: string) {
  const data = await call<{
    status: string;
    amount: number;
    currency: string;
    reference: string;
    authorization?: Authorization;
    customer?: { email?: string };
  }>('verify', 'GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  if (data.status === 'success') await learnAuthorization(data.customer?.email, data.authorization, reference);
  return { status: mapChargeStatus(data.status), amountMinor: BigInt(data.amount), currency: data.currency, raw: data.status };
}

async function createRecipient(member: Member): Promise<string> {
  // Sandbox: every NG member is paid to Paystack's test account. A real build stores each member's NUBAN.
  const data = await call<{ recipient_code: string }>('transferrecipient', 'POST', '/transferrecipient', {
    type: 'nuban',
    name: member.name,
    account_number: process.env.PAYSTACK_TEST_ACCOUNT_NUMBER || '0000000000',
    bank_code: process.env.PAYSTACK_TEST_BANK_CODE || '057',
    currency: 'NGN',
  });
  return data.recipient_code;
}

export const paystack: RailAdapter & { collectedAmount(reference: string): Promise<bigint> } = {
  country: 'NG',
  currency: 'NGN',

  /** What Paystack actually charged (kobo). Reconciliation refuses a payment short of the contribution. */
  async collectedAmount(reference) {
    return (await verifyCharge(reference)).amountMinor;
  },

  async collect({ contributionId, member, amountMinor, preferSaved }) {
    const reference = paystackReference('ctb', contributionId);
    const email = member.email || `kitty+${member.id.slice(0, 8)}@example.com`;
    // Judge mode ("Run full cycle") has nobody at a checkout: charge the member's saved card for real.
    const saved = preferSaved ? await savedAuthorization(email) : null;
    if (saved) {
      // One deterministic reference per contribution: if a first attempt timed out but Paystack took it, a retry is
      // refused as a duplicate and Kitty verifies the original charge instead of charging the card again.
      const savedRef = `kitty-ctb-${contributionId.replace(/[^A-Za-z0-9]/g, '').slice(0, 24)}-saved`;
      try {
        const charged = await call<{ reference: string; status: string }>('collect', 'POST', '/transaction/charge_authorization', {
          authorization_code: saved.code,
          email,
          amount: amountMinor.toString(),
          currency: 'NGN',
          reference: savedRef,
          metadata: { contributionId, memberId: member.id, circleId: member.circleId, savedCard: saved.card },
        });
        return { providerRef: charged.reference ?? savedRef };
      } catch (e) {
        if (/duplicate/i.test(JSON.stringify((e as { body?: unknown }).body ?? ''))) return { providerRef: savedRef };
        throw e;
      }
    }
    const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, '') ?? '';
    const data = await call<{ authorization_url: string; reference: string }>('collect', 'POST', '/transaction/initialize', {
      email,
      amount: amountMinor.toString(), // kobo
      currency: 'NGN',
      reference,
      callback_url: `${base}/c/${member.circleId}?paid=${encodeURIComponent(reference)}`,
      metadata: { contributionId, memberId: member.id, circleId: member.circleId },
    });
    return { providerRef: data.reference, nextAction: { type: 'redirect', url: data.authorization_url } };
  },

  async collectStatus(providerRef) {
    return (await verifyCharge(providerRef)).status;
  },

  async payout({ payoutId, member, amountMinor }) {
    const recipient = await createRecipient(member);
    const reference = paystackReference('pay', payoutId);
    const data = await call<{ reference: string; status: string }>('payout', 'POST', '/transfer', {
      source: 'balance',
      amount: amountMinor.toString(),
      recipient,
      reference,
      reason: 'Kitty circle payout',
    });
    return { providerRef: data.reference };
  },

  async payoutStatus(providerRef) {
    const data = await call<{ status: string }>('payoutStatus', 'GET', `/transfer/verify/${encodeURIComponent(providerRef)}`);
    return mapTransferStatus(data.status);
  },

  async parseWebhook(rawBody, headers): Promise<NormalizedEvent | null> {
    if (!verifyPaystackSignature(rawBody, headers.get('x-paystack-signature'))) return null;
    const event = JSON.parse(rawBody) as { event: string; data: { id?: number; reference: string; status: string } };
    const op = event.event.startsWith('charge.') ? 'collect' : event.event.startsWith('transfer.') ? 'payout' : null;
    if (!op) return null;
    return {
      provider: 'paystack',
      eventId: `${event.event}:${event.data.id ?? event.data.reference}`,
      op,
      providerRef: event.data.reference,
      status: op === 'collect' ? mapChargeStatus(event.data.status) : mapTransferStatus(event.data.status),
      payload: event,
    };
  },
};

/** x-paystack-signature = hex HMAC-SHA512 of the raw request body, keyed with the secret key. */
export function verifyPaystackSignature(rawBody: string, signature: string | null, key = process.env.PAYSTACK_SECRET_KEY): boolean {
  if (!signature || !key) return false;
  const expected = createHmac('sha512', key).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
