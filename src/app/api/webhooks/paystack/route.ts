import { getSql } from '@/lib/db';
import { errorJson, json } from '@/lib/json';
import { paystack } from '@/lib/rails/paystack';
import { rounds } from '@/lib/rounds';
import { handleProviderEvent } from '@/lib/rounds/webhooks';

/** Paystack webhook: x-paystack-signature is an HMAC-SHA512 of the RAW body, so read text, never JSON. */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    const event = await paystack.parseWebhook(raw, req.headers);
    if (!event) return json({ error: 'invalid signature or unhandled event' }, { status: 401 });
    return json({ ok: true, ...(await handleProviderEvent(getSql(), rounds(), event)) });
  } catch (e) {
    return errorJson(e);
  }
}
