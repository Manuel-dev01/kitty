/**
 * MTN MoMo Open API (UG + GH, sandbox).
 * collect = RequestToPay · status = GET requesttopay/{ref} (the PRIMARY path; callbacks are unreliable)
 * payout  = disbursement transfer · status = GET transfer/{ref}
 *
 * Currency honesty: the sandbox only settles in EUR. The ledger keeps UGX/GHS; this adapter sends the
 * EUR equivalent at the round's FX snapshot (rounded up) and records both amounts in provider_calls.
 * In production X-Target-Environment would be mtnuganda / mtnghana and the currency UGX / GHS.
 */
import { randomUUID } from 'node:crypto';
import { toEurCents } from '../fx/convert';
import { getRates } from '../fx/snapshot';
import type { FxSnapshot } from '../fx/types';
import { callbackUrl, providerFetch, requireEnv } from './http';
import type { Ccy, NormalizedEvent, RailAdapter, RailStatus } from './types';

type Product = 'collection' | 'disbursement';

const base = () => (process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com').replace(/\/$/, '');
const targetEnv = () => process.env.MOMO_TARGET_ENV || 'sandbox';
const creds = (p: Product) => {
  const prefix = p === 'collection' ? 'MOMO_COLLECTION' : 'MOMO_DISBURSEMENT';
  return {
    subscriptionKey: requireEnv(`${prefix}_SUBSCRIPTION_KEY`),
    user: requireEnv(`${prefix}_API_USER`),
    key: requireEnv(`${prefix}_API_KEY`),
  };
};

const tokens = new Map<Product, { value: string; expiresAt: number }>();

async function accessToken(product: Product): Promise<string> {
  const cached = tokens.get(product);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const c = creds(product);
  const { data } = await providerFetch<{ access_token: string; expires_in: number }>({
    provider: 'momo',
    op: `${product}.token`,
    method: 'POST',
    url: `${base()}/${product}/token/`,
    headers: {
      Authorization: `Basic ${Buffer.from(`${c.user}:${c.key}`).toString('base64')}`,
      'Ocp-Apim-Subscription-Key': c.subscriptionKey,
    },
  });
  tokens.set(product, { value: data.access_token, expiresAt: Date.now() + (Number(data.expires_in) - 60) * 1000 });
  return data.access_token;
}

async function headers(product: Product, extra: Record<string, string> = {}) {
  return {
    Authorization: `Bearer ${await accessToken(product)}`,
    'Ocp-Apim-Subscription-Key': creds(product).subscriptionKey,
    'X-Target-Environment': targetEnv(),
    ...extra,
  };
}

/** "46.31" from EUR cents, without a float. */
export const eurString = (cents: bigint) => `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;

/** MoMo wants the MSISDN as digits only. */
export const momoMsisdn = (phone: string | null) => {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (digits.length < 9) throw new Error(`Not an MSISDN: ${phone}`);
  return digits;
};

export function mapMomoStatus(s: string | undefined): RailStatus {
  if (s === 'SUCCESSFUL') return 'succeeded';
  if (s === 'FAILED' || s === 'REJECTED' || s === 'TIMEOUT') return 'failed';
  return 'pending'; // PENDING, ONGOING, CREATED
}

async function status(product: Product, path: string, ref: string): Promise<RailStatus> {
  const { data } = await providerFetch<{ status?: string }>({
    provider: 'momo',
    op: `${product}.status`,
    method: 'GET',
    url: `${base()}/${product}/${path}/${ref}`,
    headers: await headers(product),
  });
  return mapMomoStatus(data.status);
}

export interface MomoDeps {
  /** The FX snapshot the EUR amount is computed at. The rounds engine passes the round's snapshot. */
  snapshot: () => Promise<FxSnapshot>;
}

export function makeMomo(country: 'UG' | 'GH', deps: MomoDeps = { snapshot: () => getRates() }): RailAdapter {
  const currency: Ccy = country === 'UG' ? 'UGX' : 'GHS';

  async function send(product: Product, path: string, id: string, party: 'payer' | 'payee', phone: string | null, amountMinor: bigint) {
    const snap = await deps.snapshot();
    const eurCents = toEurCents(amountMinor, currency, snap);
    const ref = randomUUID(); // X-Reference-Id: the provider reference we poll
    await providerFetch({
      provider: 'momo',
      op: product === 'collection' ? 'collect' : 'payout',
      method: 'POST',
      url: `${base()}/${product}/v1_0/${path}`,
      headers: await headers(product, { 'X-Reference-Id': ref, 'X-Callback-Url': callbackUrl('/api/webhooks/momo') }),
      body: {
        amount: eurString(eurCents),
        currency: 'EUR',
        externalId: id,
        [party]: { partyIdType: 'MSISDN', partyId: momoMsisdn(phone) },
        payerMessage: 'Kitty circle',
        payeeNote: 'Kitty circle',
      },
      note: {
        ledgerAmountMinor: amountMinor.toString(),
        ledgerCcy: currency,
        railAmountEurCents: eurCents.toString(),
        fxSnapshotId: snap.id ?? null,
      },
    });
    return ref;
  }

  return {
    country,
    currency,
    async collect({ contributionId, member, amountMinor }) {
      const providerRef = await send('collection', 'requesttopay', contributionId, 'payer', member.phone, amountMinor);
      return { providerRef, nextAction: { type: 'prompt_sent' } };
    },
    collectStatus: (ref) => status('collection', 'v1_0/requesttopay', ref),
    async payout({ payoutId, member, amountMinor }) {
      return { providerRef: await send('disbursement', 'transfer', payoutId, 'payee', member.phone, amountMinor) };
    },
    payoutStatus: (ref) => status('disbursement', 'v1_0/transfer', ref),

    /**
     * MoMo cannot sign callbacks. The route checks the URL secret first, and a callback is only a
     * hint: the status is always re-read with GET before journaling. The body carries our externalId.
     */
    async parseWebhook(rawBody): Promise<NormalizedEvent | null> {
      let body: { externalId?: string; status?: string; financialTransactionId?: string; payer?: unknown; payee?: unknown };
      try {
        body = JSON.parse(rawBody);
      } catch {
        return null;
      }
      if (!body.externalId || !body.status) return null;
      return {
        provider: 'momo',
        eventId: `${body.financialTransactionId ?? body.externalId}:${body.status}`,
        op: body.payee ? 'payout' : 'collect',
        providerRef: body.externalId,
        status: mapMomoStatus(body.status),
        payload: body,
      };
    },
  };
}

export const momoUG = makeMomo('UG');
export const momoGH = makeMomo('GH');
