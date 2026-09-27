'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { MemberRow } from '@/components/MemberRow';
import { NettingMeter } from '@/components/NettingMeter';
import { TreasurerChat, type ChatMember } from '@/components/TreasurerChat';
import { COUNTRY } from '@/lib/ui/format';
import { useRoundState } from '@/lib/ui/useRoundState';

function CirclePage() {
  const { circleId } = useParams<{ circleId: string }>();
  const paidRef = useSearchParams().get('paid');
  const [roundId, setRoundId] = useState<string | null>(null);
  const [members, setMembers] = useState<ChatMember[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { state, error, refresh } = useRoundState(roundId);

  useEffect(() => {
    fetch(`/api/circles/${circleId}`, { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 404) return setNotFound(true);
        const d = await r.json();
        setRoundId(d.roundId);
        setMembers(d.members);
      })
      .catch((e) => setMessage(String(e)));
  }, [circleId]);

  async function pay(contributionId: string, country: string) {
    // Open the popup in the click (browsers block it after an await); used only for Paystack's checkout.
    const popup = country === 'NG' ? window.open('', 'kitty-paystack', 'popup,width=480,height=780') : null;
    setBusyId(contributionId);
    setMessage(null);
    try {
      const res = await fetch(`/api/contributions/${contributionId}/collect`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (body.nextAction?.type === 'redirect') {
        if (popup) popup.location.href = body.nextAction.url;
        else window.location.href = body.nextAction.url;
        setMessage('Paystack test checkout opened. Test card 4084 0840 8408 4081, CVV 408, any future expiry.');
      } else {
        popup?.close();
        setMessage(`Payment prompt sent on ${COUNTRY[country as keyof typeof COUNTRY].rail}. Ref ${body.providerRef}.`);
      }
    } catch (e) {
      popup?.close();
      setMessage(`Could not start the payment: ${(e as Error).message}`);
    } finally {
      setBusyId(null);
    }
  }

  if (notFound) {
    return (
      <main className="wrap">
        <p>
          This circle doesn’t exist (the demo may have been reset). Go to the <Link href="/dashboard">dashboard</Link>.
        </p>
      </main>
    );
  }

  const open = state && ['open', 'collecting'].includes(state.round.status);
  return (
    <main className="wrap" style={{ maxWidth: 1100 }}>
      <div className="topbar">
        <div className="brand">
          Kitty <small>{state?.circle.name ?? 'savings circle'}</small>
        </div>
        {state && (
          <span className={`pill ${state.round.status}`}>
            Round {state.round.index} of {state.contributions.length} · {state.round.status}
          </span>
        )}
        <Link href="/dashboard" style={{ marginLeft: 'auto' }}>
          Dashboard →
        </Link>
      </div>

      {paidRef && (
        <div className="callout" style={{ marginBottom: 16 }}>
          Back from Paystack. Confirming <span className="mono">{paidRef}</span> with Paystack’s verify API (this page checks every 1.5 s).
        </div>
      )}
      {message && <div className="callout" style={{ marginBottom: 16 }}>{message}</div>}
      {error && <p className="error">Last refresh failed: {error}</p>}

      <div className="grid">
        <section className="panel">
          <h2>
            Members · payout order by reputation
            {state && ` · this pot goes to ${state.round.recipient.name}`}
          </h2>
          <div className="members">
            {state?.contributions.map((c) => (
              <MemberRow
                key={c.id}
                c={c}
                isRecipient={c.member.country === state.round.recipient.country}
                action={
                  open && c.status !== 'succeeded' && c.status !== 'pending' ? (
                    <button className="btn small go" onClick={() => pay(c.id, c.member.country)} disabled={busyId === c.id}>
                      {busyId === c.id ? 'Sending…' : `Pay with ${COUNTRY[c.member.country].rail}`}
                    </button>
                  ) : null
                }
              />
            ))}
            {!state && <p className="muted">Loading…</p>}
          </div>
          <p className="muted" style={{ fontSize: '0.8em', marginBottom: 0 }}>
            An early pot is effectively a loan, so the most trusted members receive first. Everyone pays and is paid on their own
            country’s rail; nothing is sent across a border.
          </p>
        </section>

        <div className="stack">
          <section className="panel">
            <h2>This circle so far</h2>
            {state ? <NettingMeter netting={state.netting} /> : <p className="muted">—</p>}
          </section>
          {members.length > 0 && <TreasurerChat circleId={circleId} members={members} onActivity={() => void refresh()} />}
        </div>
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CirclePage />
    </Suspense>
  );
}
