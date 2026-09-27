import { MINOR_UNITS, type Ccy } from '../ledger/types';
import { div, mul, parseDecimal, pow10, rat, roundHalfUp, type Rational } from './rational';
import type { FxSnapshot } from './types';

/** Minor units of `ccy` per USD cent, exactly: rate × 10^minor(ccy) / 10^2. */
function minorPerUsdCent(ccy: Ccy, snap: FxSnapshot): Rational {
  const rate = parseDecimal(snap.rates[ccy]);
  if (rate.num <= 0n) throw new RangeError(`Non-positive rate for ${ccy}`);
  return mul(rate, rat(pow10(MINOR_UNITS[ccy]), pow10(MINOR_UNITS.USD)));
}

/** USD cents → `ccy` minor units at the snapshot. One rounding, at the end. */
export function usdToMinor(usdCents: bigint, ccy: Ccy, snap: FxSnapshot): bigint {
  return roundHalfUp(mul(rat(usdCents), minorPerUsdCent(ccy, snap)));
}

/** `ccy` minor units → USD cents at the snapshot. Used to value balances for reporting. */
export function minorToUsdCents(amountMinor: bigint, ccy: Ccy, snap: FxSnapshot): bigint {
  return roundHalfUp(div(rat(amountMinor), minorPerUsdCent(ccy, snap)));
}

/** Cross-rate conversion between two local currencies' minor units. One rounding, at the end. */
export function convertMinor(amountMinor: bigint, from: Ccy, to: Ccy, snap: FxSnapshot): bigint {
  if (from === to) return amountMinor;
  return roundHalfUp(mul(rat(amountMinor), div(minorPerUsdCent(to, snap), minorPerUsdCent(from, snap))));
}
