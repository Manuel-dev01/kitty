import { redirect } from 'next/navigation';
import { getSql } from '@/lib/db';
import { currentDemo } from '@/lib/rounds';

export const dynamic = 'force-dynamic';

/** A stable link to the live demo circle's member view (the demo is rebuilt on every "Reset demo"). */
export default async function CurrentCircle({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const demo = await currentDemo(getSql()).catch(() => null);
  if (!demo?.circleId) redirect('/dashboard');
  const as = (await searchParams).as;
  redirect(`/c/${demo.circleId}${as ? `?as=${encodeURIComponent(as)}` : ''}`);
}
