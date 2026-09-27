import { describe, expect, it } from 'vitest';
import { convertMinor, minorToUsdCents, usdToMinor } from './convert';
import { div, parseDecimal, rat, roundHalfUp } from './rational';
import { FX_URL, fallbackSnapshot, getRates, parseRatesText } from './snapshot';
import type { FxSnapshot } from './types';

const snap: FxSnapshot = {
  source: 'test',
  takenAt: '2026-09-26T00:00:00Z',
  rates: { NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654' },
};

// A trimmed real response shape from open.er-api.com.
const API_TEXT = `{"result":"success","provider":"https://www.exchangerate-api.com","base_code":"USD",
"rates":{"USD":1,"GHS":11.87654,"KES":129.3417,"NGN":1532.456789,"UGX":3712.345678,"ZAR":17.9}}`;

describe('rationals', () => {
  it('parses decimal strings exactly', () => {
    expect(parseDecimal('1532.456789')).toEqual(rat(1532456789n, 1000000n));
    expect(parseDecimal('3700')).toEqual(rat(3700n));
    expect(parseDecimal('1.5e-3')).toEqual(rat(3n, 2000n));
    expect(() => parseDecimal('12,5')).toThrow();
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(roundHalfUp(rat(5n, 2n))).toBe(3n);
    expect(roundHalfUp(rat(-5n, 2n))).toBe(-3n);
    expect(roundHalfUp(rat(7n, 3n))).toBe(2n);
    expect(roundHalfUp(rat(-7n, 3n))).toBe(-2n);
    expect(roundHalfUp(div(rat(1n), rat(3n)))).toBe(0n);
  });
});

describe('conversion respects minor units', () => {
  it('$50 into each currency', () => {
    expect(usdToMinor(5000n, 'NGN', snap)).toBe(7_662_284n); // ₦76,622.84 (kobo)
    expect(usdToMinor(5000n, 'KES', snap)).toBe(646_709n); // KES 6,467.09 (cents, 646708.5 rounds up)
    expect(usdToMinor(5000n, 'UGX', snap)).toBe(185_617n); // UGX 185,617 (no minor unit)
    expect(usdToMinor(5000n, 'GHS', snap)).toBe(59_383n); // GH₵593.83 (pesewas)
  });

  it('values balances back in USD cents', () => {
    expect(minorToUsdCents(185_617n, 'UGX', snap)).toBe(5000n);
    expect(minorToUsdCents(-646_709n, 'KES', snap)).toBe(-5000n);
  });

  it('cross-rates between local currencies with one rounding', () => {
    // 1 UGX ≈ 41.28 kobo: why cross-rating rounded UGX amounts would leak rounding into fx:position.
    expect(convertMinor(1n, 'UGX', 'NGN', snap)).toBe(41n);
    expect(convertMinor(185_617n, 'UGX', 'NGN', snap)).toBe(7_662_272n);
    expect(convertMinor(123n, 'KES', 'KES', snap)).toBe(123n);
  });
});

describe('FX snapshot', () => {
  it('reads rates from the raw response text as decimal strings (never floats)', () => {
    expect(parseRatesText(API_TEXT)).toEqual({ NGN: '1532.456789', KES: '129.3417', UGX: '3712.345678', GHS: '11.87654' });
    expect(() => parseRatesText('{"result":"error"}')).toThrow();
    expect(() => parseRatesText('{"result":"success","rates":{"NGN":1500}}')).toThrow(/KES/);
  });

  it('uses the live API when it answers', async () => {
    const fake = (async (url: string) => {
      expect(url).toBe(FX_URL);
      return new Response(API_TEXT);
    }) as unknown as typeof fetch;
    const s = await getRates(fake);
    expect(s.source).toBe('open.er-api');
    expect(s.rates.KES).toBe('129.3417');
  });

  it('falls back to data/fx-fallback.json when the API fails', async () => {
    const down = (async () => {
      throw new Error('ENOTFOUND');
    }) as unknown as typeof fetch;
    const s = await getRates(down);
    expect(s).toEqual(fallbackSnapshot());
    expect(s.source).toBe('fallback');
    for (const r of Object.values(s.rates)) expect(typeof r).toBe('string');
  });

  it('falls back when the API is slower than the timeout', async () => {
    const slow = ((_: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
      })) as unknown as typeof fetch;
    const s = await getRates(slow, 20);
    expect(s.source).toBe('fallback');
  });

  it('falls back on an HTTP error', async () => {
    const err = (async () => new Response('nope', { status: 503 })) as unknown as typeof fetch;
    expect((await getRates(err)).source).toBe('fallback');
  });
});
