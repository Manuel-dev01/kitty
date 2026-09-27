import { makeMomo } from '@/lib/rails/momo';
import { callbackHandler } from '@/lib/rounds/callback-route';

/** MoMo callbacks (RequestToPay and transfers). Only a hint: GET status stays the source of truth. */
const handler = callbackHandler(() => makeMomo('UG'));
export const POST = handler;
export const PUT = handler;
