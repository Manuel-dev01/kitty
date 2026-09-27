import { daraja } from '@/lib/rails/daraja';
import { callbackHandler } from '@/lib/rounds/callback-route';

/** B2C result and queue-timeout callbacks. B2C has no status query, so this stored event IS the payout status. */
export const POST = callbackHandler(() => daraja, { ResultCode: 0, ResultDesc: 'Accepted' });
