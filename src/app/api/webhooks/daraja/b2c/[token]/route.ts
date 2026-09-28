import { daraja } from '@/lib/rails/daraja';
import { callbackHandler } from '@/lib/rounds/callback-route';

/** B2C results with the shared secret in the path (see callbackUrl): the handler checks it from the URL. */
export const POST = callbackHandler(() => daraja, { ResultCode: 0, ResultDesc: 'Accepted' });
