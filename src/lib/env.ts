/**
 * Boot-time guard: Kitty only ever runs against sandbox / test money.
 * A live Paystack key is a hard stop, not a warning.
 */
export function assertSandboxKeys(env: Record<string, string | undefined> = process.env): void {
  const key = env.PAYSTACK_SECRET_KEY;
  if (key && !key.startsWith('sk_test_')) {
    throw new Error(
      'Refusing to boot: PAYSTACK_SECRET_KEY is not a test key (must start with sk_test_). Kitty runs on sandbox money only.',
    );
  }
}
