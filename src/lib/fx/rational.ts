/** Exact rational arithmetic on bigint. FX never touches a float. `den` is always > 0. */
export interface Rational {
  num: bigint;
  den: bigint;
}

const abs = (x: bigint) => (x < 0n ? -x : x);

function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function rat(num: bigint, den: bigint = 1n): Rational {
  if (den === 0n) throw new RangeError('Zero denominator');
  if (den < 0n) [num, den] = [-num, -den];
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}

export const pow10 = (n: number): bigint => 10n ** BigInt(n);

/**
 * Parses a decimal string exactly: "1532.456789", "3700", "1.5e-3".
 * This is how rates enter the system, so they are never parsed into floats.
 */
export function parseDecimal(s: string): Rational {
  const m = /^([+-]?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(s.trim());
  if (!m) throw new Error(`Not a decimal: ${JSON.stringify(s)}`);
  const [, sign, int, frac = '', exp = '0'] = m;
  let num = BigInt(int + frac) * (sign === '-' ? -1n : 1n);
  let den = pow10(frac.length);
  const e = Number(exp);
  if (e >= 0) num *= pow10(e);
  else den *= pow10(-e);
  return rat(num, den);
}

export const mul = (a: Rational, b: Rational): Rational => rat(a.num * b.num, a.den * b.den);

export function div(a: Rational, b: Rational): Rational {
  if (b.num === 0n) throw new RangeError('Division by zero');
  return rat(a.num * b.den, a.den * b.num);
}

/** Nearest integer, ties away from zero (symmetric for negatives). */
export function roundHalfUp(r: Rational): bigint {
  const q = abs(r.num) / r.den;
  const rem = abs(r.num) % r.den;
  const rounded = rem * 2n >= r.den ? q + 1n : q;
  return r.num < 0n ? -rounded : rounded;
}
