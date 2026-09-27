// Paystack (NG, NGN, test mode). collect = transaction/initialize checkout, payout = transfer.
// Not implemented yet: see docs/ARCHITECTURE.md §2 and the Role A prompt.
import { stubAdapter, type RailAdapter } from './types';

export const paystack: RailAdapter = stubAdapter('paystack', 'NG', 'NGN');
