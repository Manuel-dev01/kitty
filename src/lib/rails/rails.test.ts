/** Pure adapter logic, tested offline. The live counterparts are in *.live.ts (npm run test:live). */
import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { toEurCents } from '../fx/convert';
import type { FxSnapshot } from '../fx/types';
import { daraja, mapStkResult, msisdn, nairobiTimestamp, wholeShillings } from './daraja';
import { hasValidCallbackToken, redact } from './http';
import { eurString, makeMomo, mapMomoStatus } from './momo';
import { mapChargeStatus, paystack, paystackReference, verifyPaystackSignature } from './paystack';

const snap: FxSnapshot = {
  source: 'test',
  takenAt: '2026-09-27T00:00:00Z',
  rates: { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654', EUR: '0.8612' },
};

describe('Paystack', () => {
  const key = 'sk_test_unit';
  const body = JSON.stringify({ event: 'charge.success', data: { id: 42, reference: 'kitty-ctb-x', status: 'success' } });
  const sig = createHmac('sha512', key).update(body).digest('hex');

  it('verifies x-paystack-signature over the raw body, and rejects anything else', () => {
    expect(verifyPaystackSignature(body, sig, key)).toBe(true);
    expect(verifyPaystackSignature(body + ' ', sig, key)).toBe(false); // re-serialised body
    expect(verifyPaystackSignature(body, sig.replace(/.$/, '0'), key)).toBe(false);
    expect(verifyPaystackSignature(body, null, key)).toBe(false);
  });

  it('parseWebhook returns a normalized event only for a valid signature', async () => {
    process.env.PAYSTACK_SECRET_KEY = key;
    const ok = await paystack.parseWebhook(body, new Headers({ 'x-paystack-signature': sig }));
    expect(ok).toMatchObject({ provider: 'paystack', eventId: 'charge.success:42', op: 'collect', providerRef: 'kitty-ctb-x', status: 'succeeded' });
    expect(await paystack.parseWebhook(body, new Headers({ 'x-paystack-signature': 'forged' }))).toBeNull();
  });

  it('maps statuses and builds valid references', () => {
    expect(mapChargeStatus('success')).toBe('succeeded');
    expect(mapChargeStatus('abandoned')).toBe('pending'); // seen live: checkout opened, not paid
    expect(mapChargeStatus('failed')).toBe('failed');
    expect(paystackReference('ctb', '299652d8-2c0a-442d-b583-5205aaaa')).toMatch(/^kitty-ctb-[A-Za-z0-9]{1,24}-[a-z0-9]+$/);
  });
});

describe('Daraja', () => {
  it('timestamps in Nairobi time (UTC+3)', () => {
    expect(nairobiTimestamp(new Date('2026-09-27T21:30:05Z'))).toBe('20260928003005');
  });

  it('charges whole shillings, rounding up', () => {
    expect(wholeShillings(646_709n)).toBe(6468n);
    expect(wholeShillings(646_700n)).toBe(6467n);
    expect(wholeShillings(1n)).toBe(1n);
  });

  it('maps STK result codes: 4999 is still processing (seen live), 1037 is a timeout', () => {
    expect(mapStkResult('0')).toBe('succeeded');
    expect(mapStkResult('4999')).toBe('pending');
    expect(mapStkResult('1037')).toBe('failed');
    expect(mapStkResult(1032)).toBe('failed');
  });

  it('normalizes MSISDNs and parses STK and B2C callbacks', async () => {
    expect(msisdn('+254 708 374 149')).toBe('254708374149');
    expect(() => msisdn('0708374149')).toThrow();
    const stk = await daraja.parseWebhook(
      JSON.stringify({ Body: { stkCallback: { CheckoutRequestID: 'ws_CO_1', ResultCode: 0 } } }),
      new Headers(),
    );
    expect(stk).toMatchObject({ eventId: 'stk:ws_CO_1', op: 'collect', status: 'succeeded' });
    const b2c = await daraja.parseWebhook(
      JSON.stringify({ Result: { OriginatorConversationID: 'p-1', ResultCode: 2001 } }),
      new Headers(),
    );
    expect(b2c).toMatchObject({ eventId: 'b2c:p-1', op: 'payout', status: 'failed' });
    expect(await daraja.parseWebhook('not json', new Headers())).toBeNull();
  });
});

describe('MoMo', () => {
  it('converts the ledger amount to EUR cents, rounding up (values accepted live by the sandbox)', () => {
    expect(toEurCents(185_617n, 'UGX', snap)).toBe(4306n); // EUR 43.06
    expect(toEurCents(742_469n, 'UGX', snap)).toBe(17224n); // EUR 172.24
    expect(eurString(4306n)).toBe('43.06');
    expect(eurString(5n)).toBe('0.05');
    expect(() => toEurCents(1n, 'UGX', { ...snap, rates: { ...snap.rates, EUR: undefined } })).toThrow(/EUR/);
  });

  it('maps statuses: CREATED stays pending (seen live for the pending test number)', () => {
    expect(mapMomoStatus('SUCCESSFUL')).toBe('succeeded');
    expect(mapMomoStatus('CREATED')).toBe('pending');
    expect(mapMomoStatus('PENDING')).toBe('pending');
    expect(mapMomoStatus('FAILED')).toBe('failed');
  });

  it('parses callbacks by externalId', async () => {
    const e = await makeMomo('GH').parseWebhook(
      JSON.stringify({ externalId: 'ctb-1', status: 'SUCCESSFUL', financialTransactionId: '99', payer: {} }),
      new Headers(),
    );
    expect(e).toMatchObject({ provider: 'momo', eventId: '99:SUCCESSFUL', op: 'collect', providerRef: 'ctb-1', status: 'succeeded' });
  });
});

describe('callback secrets and redaction', () => {
  const saved = process.env.KITTY_WEBHOOK_SECRET;
  afterEach(() => {
    process.env.KITTY_WEBHOOK_SECRET = saved;
  });

  it('accepts a callback only with the exact URL secret', () => {
    process.env.KITTY_WEBHOOK_SECRET = 's3cret-value-123';
    expect(hasValidCallbackToken('https://x/api/webhooks/daraja/stk?t=s3cret-value-123')).toBe(true);
    expect(hasValidCallbackToken('https://x/api/webhooks/daraja/stk?t=s3cret-value-12')).toBe(false);
    expect(hasValidCallbackToken('https://x/api/webhooks/daraja/stk')).toBe(false);
  });

  it('scrubs secret fields and secret values, but keeps public fields like checkout URLs', () => {
    process.env.KITTY_WEBHOOK_SECRET = 's3cret-value-123';
    expect(
      redact({
        Password: 'abc',
        SecurityCredential: 'xyz',
        access_token: 't',
        CallBackURL: 'https://x/cb?t=s3cret-value-123',
        authorization_url: 'https://checkout.paystack.com/abc',
      }),
    ).toEqual({
      Password: '[redacted]',
      SecurityCredential: '[redacted]',
      access_token: '[redacted]',
      CallBackURL: 'https://x/cb?t=[redacted]',
      authorization_url: 'https://checkout.paystack.com/abc',
    });
  });
});

describe('sandbox limits: only the two documented cases qualify', async () => {
  const { sandboxLimits } = await import('../rounds/sandbox-limits');
  const { ProviderError } = await import('./http');
  const m = (country: 'KE' | 'NG' | 'UG', phone: string) =>
    ({ id: 'm', circleId: 'c', name: 'x', country, phone, email: null, rail: 'daraja', payoutPosition: 1, reputationScore: 1 }) as const;

  it('Daraja: only the sandbox test MSISDN, only when not succeeded', () => {
    expect(sandboxLimits.collect(m('KE', '254708374149'), 'failed')).toMatch(/test number/);
    expect(sandboxLimits.collect(m('KE', '+254 708 374 149'), 'pending')).toMatch(/test number/);
    expect(sandboxLimits.collect(m('KE', '254708374149'), 'succeeded')).toBeNull();
    expect(sandboxLimits.collect(m('KE', '254711000000'), 'failed')).toBeNull(); // a real phone is never simulated
    expect(sandboxLimits.collect(m('UG', '256772123456'), 'failed')).toBeNull();
  });

  it('Paystack: only transfer_unavailable on a Nigerian payout', () => {
    const starter = new ProviderError('paystack', 'payout', 400, { code: 'transfer_unavailable' });
    expect(sandboxLimits.payout(m('NG', ''), starter)).toMatch(/Starter business/);
    expect(sandboxLimits.payout(m('NG', ''), new ProviderError('paystack', 'payout', 400, { code: 'insufficient_balance' }))).toBeNull();
    expect(sandboxLimits.payout(m('NG', ''), new Error('network'))).toBeNull();
    expect(sandboxLimits.payout(m('KE', ''), starter)).toBeNull();
  });

  it('Daraja B2C: only Kenya, only after the 20 s wait', () => {
    expect(sandboxLimits.payoutUnconfirmed(m('KE', ''), 5)).toBeNull();
    expect(sandboxLimits.payoutUnconfirmed(m('KE', ''), 20)).toMatch(/no result callback/);
    expect(sandboxLimits.payoutUnconfirmed(m('UG', ''), 3600)).toBeNull(); // MoMo has a real status query
  });
});
