import { describe, expect, it } from 'vitest';
import { daraja, wholeShillings } from './daraja';
import type { Member } from './types';

const wanjiru: Member = {
  id: '00000000-0000-4000-8000-00000000000b',
  circleId: 'live-test',
  name: 'Wanjiru Kamau',
  country: 'KE',
  phone: '254708374149', // Safaricom sandbox test MSISDN
  email: null,
  rail: 'daraja',
  payoutPosition: 1,
  reputationScore: 900,
};

describe('Daraja sandbox (live)', () => {
  it('collect: sends a real STK push for KES 6,467.09 (charged as 6,468 whole shillings)', async () => {
    expect(wholeShillings(646_709n)).toBe(6468n);
    const res = await daraja.collect({ contributionId: crypto.randomUUID(), member: wanjiru, amountMinor: 646_709n });
    console.log('Daraja STK CheckoutRequestID:', res.providerRef);
    expect(res.providerRef).toMatch(/^ws_CO_/);
    expect(res.nextAction).toEqual({ type: 'prompt_sent' });

    // Seconds after the push the sandbox reports ResultCode 4999 "still under processing".
    const status = await daraja.collectStatus(res.providerRef);
    console.log('Daraja stkpushquery status:', status);
    expect(status).toBe('pending');
  });

  it('payout: sends a real B2C v3 payment request for KES 25,868.36 (charged as 25,869 whole shillings)', async () => {
    const res = await daraja.payout({ payoutId: crypto.randomUUID(), member: wanjiru, amountMinor: 2_586_836n });
    console.log('Daraja B2C OriginatorConversationID:', res.providerRef);
    expect(res.providerRef).toBeTruthy();
  });
});
