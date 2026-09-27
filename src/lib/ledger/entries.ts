/**
 * Pure builders for the journals a circle posts (docs/ARCHITECTURE.md §4). No I/O.
 *
 * Conversion model (decided 2026-09-26): UNIT-BASED. A circle is denominated in a unit ($50). Each
 * contribution is a claim of one unit, paid at the snapshot's local price `usdToMinor(unit, ccy)`.
 * Converting it into the recipient's currency takes the actual local amount out of the source
 * currency and credits the recipient currency with that same unit's local price there, i.e. exactly
 * what a member in the recipient's country pays. Consequence: at a constant snapshot every
 * fx:position nets to exactly zero over a full cycle, at any rates, and every cash pool ends where
 * it started. Rounding lives only in each member's local price, never in fx:position.
 * (Cross-rating the rounded local amounts instead leaks the source's rounding: 0.5 UGX ≈ 20 kobo.)
 */
import { usdToMinor } from '../fx/convert';
import type { FxSnapshot } from '../fx/types';
import { cashAccount, floatEquity, fxPosition, potAccount } from './accounts';
import type { Ccy, Line, Rail } from './types';

/** Combines lines on the same account and drops zeros, so journals stay readable. */
export function mergeLines(lines: readonly Line[]): Line[] {
  const out = new Map<string, Line>();
  for (const l of lines) {
    const k = `${l.account}|${l.ccy}`;
    const cur = out.get(k);
    out.set(k, cur ? { ...cur, amountMinor: cur.amountMinor + l.amountMinor } : { ...l });
  }
  return [...out.values()].filter((l) => l.amountMinor !== 0n);
}

/** What a member in `ccy` pays for one unit at this snapshot. */
export const localPrice = (unitUsdCents: bigint, ccy: Ccy, snap: FxSnapshot) => usdToMinor(unitUsdCents, ccy, snap);

/** equity:float funds a pool so it can pay out before it has collected enough. */
export function floatSeedLines(rail: Rail, ccy: Ccy, amountMinor: bigint): Line[] {
  return [
    { account: cashAccount(rail, ccy), ccy, amountMinor },
    { account: floatEquity(ccy), ccy, amountMinor: -amountMinor },
  ];
}

/** A member paid on their own rail: the money sits in their country's pool; the circle owes it. */
export function contributionLines(circleId: string, rail: Rail, ccy: Ccy, amountMinor: bigint): Line[] {
  return [
    { account: cashAccount(rail, ccy), ccy, amountMinor },
    { account: potAccount(circleId, ccy), ccy, amountMinor: -amountMinor },
  ];
}

export interface PotSource {
  ccy: Ccy;
  /** Local amount actually held in the pot for this contribution. */
  amountMinor: bigint;
  /** The unit this contribution represents (USD cents). */
  unitUsdCents: bigint;
}

/**
 * Converts every non-target-currency contribution in a round's pot into the recipient's currency.
 * No cash moves: the only cross-border fact is recorded in fx:position:*.
 */
export function conversionLines(circleId: string, target: Ccy, sources: readonly PotSource[], snap: FxSnapshot): Line[] {
  const lines: Line[] = [];
  for (const s of sources) {
    if (s.ccy === target) continue;
    const into = usdToMinor(s.unitUsdCents, target, snap);
    lines.push(
      { account: potAccount(circleId, s.ccy), ccy: s.ccy, amountMinor: s.amountMinor },
      { account: fxPosition(s.ccy), ccy: s.ccy, amountMinor: -s.amountMinor },
      { account: fxPosition(target), ccy: target, amountMinor: into },
      { account: potAccount(circleId, target), ccy: target, amountMinor: -into },
    );
  }
  return mergeLines(lines);
}

/** The pot leaves from the recipient's own country pool, on their own rail. */
export function payoutLines(circleId: string, rail: Rail, ccy: Ccy, amountMinor: bigint): Line[] {
  return [
    { account: potAccount(circleId, ccy), ccy, amountMinor },
    { account: cashAccount(rail, ccy), ccy, amountMinor: -amountMinor },
  ];
}
