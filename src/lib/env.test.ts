import { describe, expect, it } from 'vitest';
import { assertSandboxKeys } from './env';

describe('boot guard: sandbox keys only', () => {
  it('allows an unset key and a test key', () => {
    expect(() => assertSandboxKeys({})).not.toThrow();
    expect(() => assertSandboxKeys({ PAYSTACK_SECRET_KEY: 'sk_test_abc' })).not.toThrow();
  });

  it('refuses to boot with a live or malformed key', () => {
    expect(() => assertSandboxKeys({ PAYSTACK_SECRET_KEY: 'sk_live_abc' })).toThrow(/sk_test_/);
    expect(() => assertSandboxKeys({ PAYSTACK_SECRET_KEY: 'abc' })).toThrow(/sk_test_/);
  });
});
