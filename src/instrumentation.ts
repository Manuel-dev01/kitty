import { assertSandboxKeys } from './lib/env';

// Runs once per server instance (including Vercel cold starts), where runtime env can differ from build env.
export function register() {
  assertSandboxKeys();
}
