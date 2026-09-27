import { daraja } from '@/lib/rails/daraja';
import { callbackHandler } from '@/lib/rounds/callback-route';

/** M-Pesa Express (STK push) callback. Only a hint: stkpushquery stays the source of truth. */
export const POST = callbackHandler(() => daraja, { ResultCode: 0, ResultDesc: 'Accepted' });
