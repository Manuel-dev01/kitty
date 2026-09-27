/** Route handler for providers that cannot sign callbacks (Daraja, MoMo): URL secret, then the shared flow. */
import { getSql } from '../db';
import { errorJson, json } from '../json';
import { hasValidCallbackToken } from '../rails/http';
import type { RailAdapter } from '../rails/types';
import { rounds } from '.';
import { handleProviderEvent } from './webhooks';

export function callbackHandler(adapter: () => RailAdapter, ack: unknown = { ok: true }) {
  return async (req: Request) => {
    try {
      if (!hasValidCallbackToken(req.url)) return json({ error: 'forbidden' }, { status: 403 });
      const event = await adapter().parseWebhook(await req.text(), req.headers);
      if (event) await handleProviderEvent(getSql(), rounds(), event);
      return json(ack);
    } catch (e) {
      return errorJson(e);
    }
  };
}
