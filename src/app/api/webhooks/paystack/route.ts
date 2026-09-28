import { getSql } from '@/lib/db';
import { errorJson, json } from '@/lib/json';
import { paystack, verifyPaystackSignature } from '@/lib/rails/paystack';
import { rounds } from '@/lib/rounds';
import { handleProviderEvent } from '@/lib/rounds/webhooks';


// Provider and model calls are bounded individually; this caps the whole request.
export const maxDuration = 60;
/** Paystack webhook: x-paystack-signature is an HMAC-SHA512 of the RAW body, so read text, never JSON. */
export async function POST(req: Request) {
  try {
    const raw = await req.text();
    if (!verifyPaystackSignature(raw, req.headers.get('x-paystack-signature'))) return json({ error: 'invalid signature' }, { status: 401 });
    const event = await paystack.parseWebhook(raw, req.headers);
    if (!event) return json({ ok: true, ignored: true }); // signed, but not an event Kitty acts on: acknowledge it
    return json({ ok: true, ...(await handleProviderEvent(getSql(), rounds(), event)) });
  } catch (e) {
    return errorJson(e);
  }
}
