/**
 * Documented sandbox limits, and ONLY these, may complete a step by simulation (CLAUDE.md: "Simulation
 * is never silent"). In every case the real provider call is made first and its reference kept; the
 * reason below is stored on the row and shown as a `simulated · sandbox limit` badge.
 *
 * Found live on 2026-09-27:
 * - Daraja: the sandbox test MSISDN has no phone behind it, so an STK push to it always ends in
 *   1037 "No response from user". A Kenyan contribution can never succeed live without a real phone.
 * - Paystack: transfers are refused on a Starter business ("You cannot initiate third party payouts
 *   as a starter business", code transfer_unavailable). Collection works; payouts to Nigeria cannot.
 * - Daraja B2C: the payment request is accepted (ResponseCode 0) but the sandbox did not deliver the
 *   result callback (none arrived in 6+ minutes, while Paystack's webhook did), and B2C has no status
 *   query. Without the callback a round could never leave "paying".
 */
import { msisdn } from '../rails/daraja';
import { ProviderError } from '../rails/http';
import type { Member, RailStatus } from '../rails/types';

export const DARAJA_TEST_MSISDN = '254708374149';
/** How long to wait for a B2C result callback before confirming by simulation (ARCHITECTURE §7: 20 s). */
export const DARAJA_B2C_CONFIRM_AFTER_S = 20;

export interface SandboxLimits {
  /** Reason to treat a real, unapproved collection as approved; null to leave it alone. */
  collect(member: Member, status: RailStatus): string | null;
  /** Reason to treat a payout the rail refused as sent; null to reverse it as usual. */
  payout(member: Member, error: unknown): string | null;
  /** Reason to treat an accepted-but-unconfirmed payout as landed after `ageSeconds`; null to keep waiting. */
  payoutUnconfirmed(member: Member, ageSeconds: number): string | null;
}

const isTestMsisdn = (phone: string | null) => {
  try {
    return msisdn(phone) === DARAJA_TEST_MSISDN;
  } catch {
    return false;
  }
};

export const sandboxLimits: SandboxLimits = {
  collect(member, status) {
    if (status === 'succeeded' || member.country !== 'KE' || !isTestMsisdn(member.phone)) return null;
    return `Daraja sandbox: the test number ${DARAJA_TEST_MSISDN} has no phone to enter a PIN, so the STK push (sent for real) can never be approved. Approval simulated.`;
  },
  payout(member, error) {
    const code = error instanceof ProviderError ? (error.body as { code?: string } | null)?.code : undefined;
    if (member.country !== 'NG' || code !== 'transfer_unavailable') return null;
    return 'Paystack refuses transfers on a Starter business account (the transfer recipient was created for real). Transfer simulated.';
  },
  payoutUnconfirmed(member, ageSeconds) {
    if (member.country !== 'KE' || ageSeconds < DARAJA_B2C_CONFIRM_AFTER_S) return null;
    return `Daraja sandbox accepted the B2C payment (ResponseCode 0) but sent no result callback within ${DARAJA_B2C_CONFIRM_AFTER_S} s, and B2C has no status query. Confirmation simulated.`;
  },
};

/** Simulation is on for the sandbox unless KITTY_SIMULATE_LIMITS=0. */
export const limitsFromEnv = (): SandboxLimits | undefined =>
  process.env.KITTY_SIMULATE_LIMITS === '0' ? undefined : sandboxLimits;
