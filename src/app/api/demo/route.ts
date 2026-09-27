import { getSql } from '@/lib/db';
import { takeSnapshot } from '@/lib/fx/snapshot';
import { errorJson, json } from '@/lib/json';
import { currentDemo, resetDemo, rounds } from '@/lib/rounds';

/** The current demo circle and round, for /dashboard. */
export async function GET() {
  try {
    return json((await currentDemo(getSql())) ?? { circleId: null, roundId: null });
  } catch (e) {
    return errorJson(e);
  }
}

/** "Reset demo": rebuilds the judge-mode circle with floats seeded and round 1 open. */
export async function POST() {
  try {
    return json(await resetDemo(getSql(), rounds(), () => takeSnapshot()));
  } catch (e) {
    return errorJson(e);
  }
}
