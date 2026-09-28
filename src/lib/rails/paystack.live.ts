import { describe, expect, it } from 'vitest';
import { ProviderError } from './http';
import { paystack, savedAuthorization, verifyCharge } from './paystack';
import type { Member } from './types';

const tunde: Member = {
  id: '00000000-0000-4000-8000-00000000000a',
  circleId: 'live-test',
  name: 'Tunde Adeyemi',
  country: 'NG',
  phone: '+2348000000000',
  email: 'tunde.kitty@example.com',
  rail: 'paystack',
  payoutPosition: 2,
  reputationScore: 800,
};

describe('Paystack sandbox (live)', () => {
  it('collect: initializes a real test checkout for ₦76,622.84', async () => {
    const res = await paystack.collect({ contributionId: crypto.randomUUID(), member: tunde, amountMinor: 7_662_284n });
    console.log('Paystack collect reference:', res.providerRef, '\n  checkout:', res.nextAction);
    expect(res.providerRef).toMatch(/^kitty-ctb-/);
    expect(res.nextAction).toMatchObject({ type: 'redirect', url: expect.stringMatching(/^https:\/\/checkout\.paystack\.com\//) });

    // Not paid yet: verify reports it as pending, with the exact amount we asked for.
    const v = await verifyCharge(res.providerRef);
    console.log('Paystack verify:', v.raw, v.amountMinor, v.currency);
    expect(v.status).toBe('pending');
    expect(v.amountMinor).toBe(7_662_284n);
    expect(await paystack.collectStatus(res.providerRef)).toBe('pending');
  });

  it('payout: creates a test recipient and a real test transfer', async (ctx) => {
    let res;
    try {
      res = await paystack.payout({ payoutId: crypto.randomUUID(), member: tunde, amountMinor: 1_000_000n });
    } catch (e) {
      // Known account limit: Paystack only allows transfers for Registered Businesses, not Starter ones.
      if (e instanceof ProviderError && (e.body as { code?: string })?.code === 'transfer_unavailable') {
        console.warn('Paystack payout unavailable on a Starter business account:', (e.body as { message: string }).message);
        return ctx.skip();
      }
      throw e;
    }
    console.log('Paystack payout reference:', res.providerRef);
    expect(res.providerRef).toMatch(/^kitty-pay-/);
    const status = await paystack.payoutStatus(res.providerRef);
    console.log('Paystack transfer status:', status);
    expect(['pending', 'succeeded']).toContain(status);
  });
});

describe('Paystack saved card (live)', () => {
  it('learns the reusable authorization from a real checkout and charges it server-side, for real', async () => {
    // A real test-card checkout completed in the browser on 2026-09-27.
    expect((await verifyCharge('kitty-ctb-2a5abd64baf445448e44b701-muk1zeyn')).status).toBe('succeeded');
    const saved = await savedAuthorization('tunde.kitty@example.com');
    expect(saved?.card).toMatch(/····4081/);
    const res = await paystack.collect({ contributionId: crypto.randomUUID(), member: tunde, amountMinor: 6_636_510n, preferSaved: true });
    console.log('Paystack saved-card charge:', res.providerRef);
    expect(res.nextAction).toBeUndefined(); // no checkout needed
    const v = await verifyCharge(res.providerRef);
    expect(v).toMatchObject({ status: 'succeeded', amountMinor: 6_636_510n, currency: 'NGN' });
  });
});
