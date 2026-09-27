/**
 * Safaricom Daraja (KE, KES, sandbox).
 * collect = STK push · status = stkpushquery (the PRIMARY path; sandbox callbacks are flaky)
 * payout  = B2C v3 (async: the result arrives on ResultURL and is stored in provider_events).
 * Daraja takes WHOLE shillings, so the ledger's KES cents are rounded up and the rail amount recorded.
 */
import { getSql } from '../db';
import { callbackUrl, ProviderError, providerFetch, requireEnv } from './http';
import type { NormalizedEvent, RailAdapter, RailStatus } from './types';

const base = () => (process.env.DARAJA_BASE_URL || 'https://sandbox.safaricom.co.ke').replace(/\/$/, '');

let cachedToken: { value: string; expiresAt: number } | undefined;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value;
  const basic = Buffer.from(`${requireEnv('DARAJA_CONSUMER_KEY')}:${requireEnv('DARAJA_CONSUMER_SECRET')}`).toString('base64');
  const { data } = await providerFetch<{ access_token: string; expires_in: string }>({
    provider: 'daraja',
    op: 'oauth',
    method: 'GET',
    url: `${base()}/oauth/v1/generate?grant_type=client_credentials`,
    headers: { Authorization: `Basic ${basic}` },
  });
  cachedToken = { value: data.access_token, expiresAt: Date.now() + 55 * 60_000 }; // tokens last 60 min
  return data.access_token;
}

async function call<T>(op: string, path: string, body: unknown, note?: Record<string, unknown>) {
  const token = await accessToken();
  const { data } = await providerFetch<T>({
    provider: 'daraja',
    op,
    method: 'POST',
    url: `${base()}${path}`,
    headers: { Authorization: `Bearer ${token}` },
    body,
    timeoutMs: 30_000,
    note,
  });
  return data;
}

/** YYYYMMDDHHmmss in Africa/Nairobi (EAT is UTC+3 all year, no DST). */
export function nairobiTimestamp(d = new Date()): string {
  return new Date(d.getTime() + 3 * 3600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** Daraja takes whole shillings: round KES cents UP, never charge less than the ledger amount. */
export const wholeShillings = (cents: bigint): bigint => (cents + 99n) / 100n;
/** B2C payouts round DOWN to whole shillings, so a payout never takes more than the pot from the pool. */
export const wholeShillingsDown = (cents: bigint): bigint => cents / 100n;

/** 2547XXXXXXXX: Daraja wants the MSISDN without "+". */
export const msisdn = (phone: string | null): string => {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!/^254\d{9}$/.test(digits)) throw new Error(`Not a Kenyan MSISDN: ${phone}`);
  return digits;
};

function stkPassword(timestamp: string) {
  const shortcode = process.env.DARAJA_SHORTCODE || '174379';
  return { shortcode, password: Buffer.from(`${shortcode}${requireEnv('DARAJA_PASSKEY')}${timestamp}`).toString('base64') };
}

/**
 * STK ResultCode → status. 0 = paid. 4999 = "still under processing" (seen live on the sandbox right after
 * a push). Any other code is a finished, failed attempt (1032 cancelled, 1037 unreachable, 2001 wrong PIN…).
 */
export function mapStkResult(code: string | number): RailStatus {
  const c = String(code);
  if (c === '0') return 'succeeded';
  if (c === '4999') return 'pending';
  return 'failed';
}

export const daraja: RailAdapter = {
  country: 'KE',
  currency: 'KES',

  async collect({ contributionId, member, amountMinor }) {
    const timestamp = nairobiTimestamp();
    const { shortcode, password } = stkPassword(timestamp);
    const phone = msisdn(member.phone);
    const amount = wholeShillings(amountMinor);
    const data = await call<{ CheckoutRequestID: string; ResponseCode: string; ResponseDescription: string }>(
      'collect',
      '/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: Number(amount), // whole shillings, a small safe integer
        PartyA: phone,
        PartyB: shortcode,
        PhoneNumber: phone,
        CallBackURL: callbackUrl('/api/webhooks/daraja/stk'),
        AccountReference: 'Kitty',
        TransactionDesc: `Kitty ${contributionId.slice(0, 8)}`,
      },
      { ledgerAmountMinor: amountMinor.toString(), railAmountWholeKes: amount.toString() },
    );
    if (data.ResponseCode !== '0') throw new ProviderError('daraja', 'collect', 200, data);
    return { providerRef: data.CheckoutRequestID, nextAction: { type: 'prompt_sent' } };
  },

  async collectStatus(providerRef) {
    const timestamp = nairobiTimestamp();
    const { shortcode, password } = stkPassword(timestamp);
    try {
      const data = await call<{ ResultCode?: string }>('collectStatus', '/mpesa/stkpushquery/v1/query', {
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: providerRef,
      });
      return data.ResultCode === undefined ? 'pending' : mapStkResult(data.ResultCode);
    } catch (e) {
      // "The transaction is being processed" (500.001.1001) and sandbox rate limits mean: not finished yet.
      if (e instanceof ProviderError && (e.status === 500 || e.status === 429 || e.status === 0)) return 'pending';
      throw e;
    }
  },

  async payout({ payoutId, member, amountMinor }) {
    const amount = wholeShillingsDown(amountMinor);
    const data = await call<{ OriginatorConversationID: string; ConversationID: string; ResponseCode: string }>(
      'payout',
      '/mpesa/b2c/v3/paymentrequest',
      {
        OriginatorConversationID: payoutId,
        InitiatorName: process.env.DARAJA_B2C_INITIATOR || 'testapi',
        SecurityCredential: requireEnv('DARAJA_B2C_SECURITY_CREDENTIAL'),
        CommandID: 'BusinessPayment',
        Amount: Number(amount),
        PartyA: requireEnv('DARAJA_B2C_SHORTCODE'),
        PartyB: msisdn(member.phone),
        Remarks: 'Kitty circle payout',
        QueueTimeOutURL: callbackUrl('/api/webhooks/daraja/b2c'),
        ResultURL: callbackUrl('/api/webhooks/daraja/b2c'),
        Occasion: 'Kitty',
      },
      { ledgerAmountMinor: amountMinor.toString(), railAmountWholeKes: amount.toString() },
    );
    if (data.ResponseCode !== '0') throw new ProviderError('daraja', 'payout', 200, data);
    return { providerRef: data.OriginatorConversationID || payoutId };
  },

  async payoutStatus(providerRef) {
    // B2C has no synchronous status: the result lands on ResultURL and is stored in provider_events.
    const sql = getSql();
    const [row] = await sql<{ payload: { Result?: { ResultCode?: number | string } } }[]>`
      select payload from provider_events where provider = 'daraja' and event_id = ${`b2c:${providerRef}`}`;
    const code = row?.payload?.Result?.ResultCode;
    return code === undefined ? 'pending' : String(code) === '0' ? 'succeeded' : 'failed';
  },

  /**
   * Daraja cannot sign callbacks. The route checks the URL secret first (hasValidCallbackToken), and
   * a collect callback is only a hint: the status is re-read with stkpushquery before journaling.
   */
  async parseWebhook(rawBody): Promise<NormalizedEvent | null> {
    let body: {
      Body?: { stkCallback?: { CheckoutRequestID: string; ResultCode: number | string } };
      Result?: { OriginatorConversationID: string; ConversationID?: string; ResultCode: number | string };
    };
    try {
      body = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const stk = body.Body?.stkCallback;
    if (stk?.CheckoutRequestID) {
      return {
        provider: 'daraja',
        eventId: `stk:${stk.CheckoutRequestID}`,
        op: 'collect',
        providerRef: stk.CheckoutRequestID,
        status: mapStkResult(stk.ResultCode),
        payload: body,
      };
    }
    const result = body.Result;
    if (result?.OriginatorConversationID) {
      return {
        provider: 'daraja',
        eventId: `b2c:${result.OriginatorConversationID}`,
        op: 'payout',
        providerRef: result.OriginatorConversationID,
        status: String(result.ResultCode) === '0' ? 'succeeded' : 'failed',
        payload: body,
      };
    }
    return null;
  },
};
