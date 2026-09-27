// Safaricom Daraja (KE, KES, sandbox). collect = STK push (poll stkpushquery), payout = B2C v3.
// Not implemented yet: see docs/ARCHITECTURE.md §2 and the Role A prompt.
import { stubAdapter, type RailAdapter } from './types';

export const daraja: RailAdapter = stubAdapter('daraja', 'KE', 'KES');
