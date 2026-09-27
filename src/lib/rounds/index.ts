import { getSql } from '../db';
import { takeSnapshot } from '../fx/snapshot';
import type { FxSnapshot } from '../fx/types';
import type { Country } from '../ledger';
import { daraja } from '../rails/daraja';
import { makeMomo } from '../rails/momo';
import { paystack } from '../rails/paystack';
import type { RailAdapter } from '../rails/types';
import { makeRounds, type Rounds } from './engine';

export { makeRounds, RoundError, railAmount, type Rounds, type RoundsDeps } from './engine';
export { currentDemo, resetDemo, DEMO_MEMBERS } from './demo';
export { roundState } from './state';

/** Each member pays and is paid on their own country's rail. MoMo is bound to the round's snapshot (EUR). */
export function liveRail(country: Country, snap: FxSnapshot): RailAdapter {
  switch (country) {
    case 'NG':
      return paystack;
    case 'KE':
      return daraja;
    case 'UG':
    case 'GH':
      return makeMomo(country, { snapshot: async () => snap });
  }
}

let app: Rounds | undefined;

/** The app's rounds engine: Postgres + the live sandbox rails. */
export const rounds = (): Rounds => (app ??= makeRounds({ sql: getSql(), rail: liveRail, takeSnapshot: () => takeSnapshot() }));
