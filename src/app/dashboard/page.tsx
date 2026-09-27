'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AfricaMap } from '@/components/AfricaMap';
import { StepBadges } from '@/components/Badges';
import { Flag } from '@/components/Flag';
import { LedgerPanel } from '@/components/LedgerPanel';
import { MemberRow } from '@/components/MemberRow';
import { NettingMeter, PoolHealth, ProofBanner } from '@/components/NettingMeter';
import { COUNTRY, fmtMinor, shortRef } from '@/lib/ui/format';
import type { Country, RoundState } from '@/lib/ui/types';
import { useRoundState } from '@/lib/ui/useRoundState';

type Started = { country: Country; providerRef?: string; nextAction?: { type: string; url?: string } | null; error?: string };
type Step = { roundId: string | null; completed: boolean; started: Started[] };

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
  return json as T;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const TEST_CARD = '4084 0840 8408 4081 · CVV 408 · any future expiry';

export default function Dashboard() {
  const [circleId, setCircleId] = useState<string | null>(null);
  const [roundId, setRoundId] = useState<string | null>(null);
  const [booted, setBooted] = useState(false);
  const [busy, setBusy] = useState<null | 'round' | 'cycle' | 'reset'>(null);
  const [log, setLog] = useState<string[]>([]);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const { state, error, latest } = useRoundState(roundId);

  const say = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setLog((l) => [`${t}  ${msg}`, ...l].slice(0, 50));
  }, []);

  useEffect(() => {
    fetch('/api/demo', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        setCircleId(d.circleId ?? null);
        setRoundId(d.roundId ?? null);
      })
      .catch((e) => setFatal(String(e)))
      .finally(() => setBooted(true));
  }, []);

  async function advance(auto: boolean, popup?: Window | null): Promise<string | null> {
    const step = await post<Step>('/api/judge/round', { circleId, auto });
    if (step.completed || !step.roundId) {
      popup?.close();
      say('The cycle is complete.');
      return null;
    }
    setRoundId(step.roundId);
    for (const s of step.started) {
      const city = COUNTRY[s.country].city;
      say(s.error ? `${city}: ${s.error}` : `${city}: ${COUNTRY[s.country].rail} request sent · ref ${shortRef(s.providerRef ?? null)}`);
    }
    const checkout = step.started.find((s) => s.nextAction?.type === 'redirect')?.nextAction?.url ?? null;
    if (checkout) {
      setCheckoutUrl(checkout);
      if (popup && !popup.closed) popup.location.href = checkout;
      if (!auto) say('Lagos: Paystack test checkout opened for Tunde.');
    } else popup?.close();
    return step.roundId;
  }

  /** Waits (via the 1.5 s poll) until the round is paid, withheld, or stuck on a failed payout. */
  async function settle(rid: string, timeoutMs = 180_000): Promise<RoundState | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await sleep(1000);
      const s = latest.current;
      if (!s || s.round.id !== rid) continue;
      if (s.round.status === 'paid' || s.round.status === 'withheld') return s;
      if (s.round.status === 'funded' && s.payout?.status === 'failed') return s;
    }
    return latest.current;
  }

  async function runRound() {
    // Open the popup inside the click, or the browser blocks it; point it at the checkout once we have it.
    const popup = window.open('', 'kitty-paystack', 'popup,width=480,height=780');
    popup?.document.write('<p style="font:16px system-ui;padding:24px">Opening the Paystack test checkout…</p>');
    setBusy('round');
    try {
      await advance(false, popup);
    } catch (e) {
      popup?.close();
      say(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runCycle() {
    setBusy('cycle');
    try {
      for (let i = 0; i < 5; i++) {
        const rid = await advance(true);
        if (!rid) break;
        say('Collecting on four rails; waiting for the payout…');
        const s = await settle(rid);
        if (!s || s.round.status !== 'paid') {
          say(`Stopped: round ${s?.round.index ?? '?'} is ${s?.round.status ?? 'not responding'}.`);
          break;
        }
        say(`Round ${s.round.index} paid out in ${COUNTRY[s.round.recipient.country].city}.`);
      }
    } catch (e) {
      say(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function reset() {
    setBusy('reset');
    try {
      const d = await post<{ circleId: string; roundId: string }>('/api/demo');
      setCheckoutUrl(null);
      setLog([]);
      setCircleId(d.circleId);
      setRoundId(d.roundId);
      say('Demo reset: new circle, floats seeded, round 1 open.');
    } catch (e) {
      say(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  }

  async function useReplay() {
    if (!state) return;
    try {
      await post(`/api/rounds/${state.round.id}/replay`);
      say('Lagos: judge chose the recorded Paystack payment (replay).');
    } catch (e) {
      say(`Error: ${(e as Error).message}`);
    }
  }

  const completed = state?.circle.status === 'completed';
  const ngWaiting = state?.contributions.find((c) => c.member.country === 'NG' && c.status === 'pending');
  const recipient = state?.round.recipient;

  return (
    <main className="wrap">
      <div className="topbar">
        <div className="brand">
          Kitty <small>{state?.circle.name ?? 'Lagos · Nairobi · Kampala · Accra'}</small>
        </div>
        {state && (
          <span className={`pill ${state.round.status}`}>
            Round {state.round.index} of {state.contributions.length} · {state.round.status}
          </span>
        )}
        <div className="actions" style={{ marginLeft: 'auto' }}>
          <button className="btn go" onClick={runRound} disabled={!!busy || !circleId || completed}>
            {busy === 'round' ? 'Starting…' : 'Run a round'}
          </button>
          <button className="btn" onClick={runCycle} disabled={!!busy || !circleId || completed}>
            {busy === 'cycle' ? 'Running cycle…' : 'Run full cycle'}
          </button>
          <button className="btn ghost" onClick={reset} disabled={!!busy}>
            {busy === 'reset' ? 'Resetting…' : 'Reset demo'}
          </button>
        </div>
      </div>

      {fatal && <p className="error">{fatal}</p>}
      {booted && !circleId && (
        <div className="callout" style={{ marginBottom: 16 }}>
          No demo circle yet. Press <b>Reset demo</b> to create “Lagos · Nairobi · Kampala · Accra” with round 1 open.
        </div>
      )}
      {completed && state && (
        <div style={{ marginBottom: 16 }}>
          <ProofBanner state={state} />
        </div>
      )}

      <div className="grid">
        <div className="stack">
          <section className="panel">
            <h2>Four countries, four local rails</h2>
            <AfricaMap state={state} />
            <div className="legend">
              <span>● filled: landed in its own country pool</span>
              <span>◌ pulsing: payment prompt sent</span>
              <span>
                <i />
                recorded FX position, no money crossed
              </span>
            </div>
          </section>

          <section className="panel">
            <h2>
              Round {state?.round.index ?? '–'} contributions
              {recipient && ` · pot to ${recipient.name.split(' ')[0]} in ${COUNTRY[recipient.country].city}`}
            </h2>
            {ngWaiting && !state?.round.replayAllowed && (
              <div className="callout" style={{ marginBottom: 10 }}>
                Waiting for Tunde’s Paystack test checkout. Card: <span className="mono">{TEST_CARD}</span>
                <div className="actions" style={{ marginTop: 8 }}>
                  {checkoutUrl && (
                    <a className="btn small go" href={checkoutUrl} target="kitty-paystack" rel="noreferrer">
                      Open checkout
                    </a>
                  )}
                  <button className="btn small ghost" onClick={useReplay}>
                    Use the recorded payment · replay
                  </button>
                </div>
              </div>
            )}
            <div className="members">
              {state?.contributions.map((c) => (
                <MemberRow key={c.id} c={c} isRecipient={c.member.country === recipient?.country} />
              ))}
              {!state && booted && circleId && <p className="muted">Loading the round…</p>}
            </div>
            {state?.payout && recipient && (
              <div className="member recipient" style={{ marginTop: 10 }}>
                <Flag country={recipient.country} />
                <div>
                  <span className="who">Payout to {recipient.name}</span>{' '}
                  <span className="muted">· {COUNTRY[recipient.country].rail}, from {COUNTRY[recipient.country].name}’s own pool</span>
                </div>
                <div className="amt num">{fmtMinor(state.payout.amountMinor, state.payout.ccy)}</div>
                <div className="meta">
                  <span className={`pill ${state.payout.status}`}>{state.payout.status}</span>
                  {state.payout.providerRef && <span className="mono">ref {shortRef(state.payout.providerRef)}</span>}
                  <StepBadges simulated={state.payout.simulated} />
                </div>
              </div>
            )}
            {circleId && (
              <p className="muted" style={{ fontSize: '0.8em', marginBottom: 0 }}>
                Member view: <Link href={`/c/${circleId}`}>/c/{circleId.slice(0, 8)}…</Link>
                {state && (
                  <>
                    {' '}· FX {state.round.fxSnapshot.source === 'open.er-api' ? 'open.er-api (indicative)' : state.round.fxSnapshot.source}, one
                    snapshot per cycle
                  </>
                )}
              </p>
            )}
          </section>
        </div>

        <div className="stack">
          <section className="panel">
            <h2>Netting meter</h2>
            {state ? <NettingMeter netting={state.netting} /> : <p className="muted">—</p>}
          </section>
          <section className="panel">
            <h2>Pool health · each pool stays domestic</h2>
            {state ? <PoolHealth pools={state.netting.poolHealth} /> : <p className="muted">—</p>}
          </section>
          <section className="panel">
            <h2>Ledger · every journal balances per currency</h2>
            {state ? <LedgerPanel journals={state.journals} /> : <p className="muted">—</p>}
          </section>
          <section className="panel">
            <h2>Activity</h2>
            {error && <p className="error">Last refresh failed: {error}</p>}
            <ul className="log">
              {log.length ? log.map((l, i) => <li key={`${l}-${i}`}>{l}</li>) : <li>Press “Run a round” to start.</li>}
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
