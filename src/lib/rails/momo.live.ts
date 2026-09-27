import { describe, expect, it } from 'vitest';
import type { FxSnapshot } from '../fx/types';
import { makeMomo } from './momo';
import type { Member } from './types';

const snap: FxSnapshot = {
  source: 'test',
  takenAt: '2026-09-27T00:00:00Z',
  rates: { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654', EUR: '0.8612' },
};
const momo = makeMomo('UG', { snapshot: async () => snap });

const member = (phone: string): Member => ({
  id: '00000000-0000-4000-8000-00000000000c',
  circleId: 'live-test',
  name: 'Nakato Namutebi',
  country: 'UG',
  phone,
  email: null,
  rail: 'momo',
  payoutPosition: 3,
  reputationScore: 700,
});

async function settle(read: () => Promise<string>, tries = 10) {
  let s = await read();
  for (let i = 0; i < tries && s === 'pending'; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    s = await read();
  }
  return s;
}

describe('MTN MoMo sandbox (live)', () => {
  it('collect: RequestToPay for UGX 185,617 is sent as EUR 43.06 and succeeds', async () => {
    const res = await momo.collect({ contributionId: crypto.randomUUID(), member: member('256772123456'), amountMinor: 185_617n });
    console.log('MoMo collect X-Reference-Id:', res.providerRef);
    const status = await settle(() => momo.collectStatus(res.providerRef));
    console.log('MoMo collect status:', status);
    expect(status).toBe('succeeded');
  });

  it('collect: the sandbox "pending" test number stays pending (the late-member demo beat)', async () => {
    const res = await momo.collect({ contributionId: crypto.randomUUID(), member: member('46733123454'), amountMinor: 185_617n });
    console.log('MoMo pending-number X-Reference-Id:', res.providerRef);
    expect(await momo.collectStatus(res.providerRef)).toBe('pending');
  });

  it('payout: disbursement transfer for UGX 742,469 succeeds', async () => {
    const res = await momo.payout({ payoutId: crypto.randomUUID(), member: member('256772123456'), amountMinor: 742_469n });
    console.log('MoMo payout X-Reference-Id:', res.providerRef);
    const status = await settle(() => momo.payoutStatus(res.providerRef));
    console.log('MoMo payout status:', status);
    expect(status).toBe('succeeded');
  });
});
