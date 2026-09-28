'use client';
/**
 * Circle home (docs/design/Kitty Circle Home.dc.html). Everything shown is live: the round state comes from
 * GET /api/rounds/:id every 1.5 s (which reconciles with each provider), the rounds list from GET /api/circles/:id.
 * Dates are real ones only (promises, payout journals); nothing is invented.
 */
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { LedgerPanel } from '@/components/LedgerPanel';
import { Logo, ProofBadges, RefChip, SandboxPill, StatusPill, monoNote, type PillKind } from '@/components/brand';
import { Flag } from '@/components/Flag';
import { TreasurerChat } from '@/components/TreasurerChat';
import { COUNTRY, fmtMinor, fmtUsd } from '@/lib/ui/format';
import type { Contribution, Country, RoundState } from '@/lib/ui/types';
import { useRoundState } from '@/lib/ui/useRoundState';
import s from './circle.module.css';

type Member = { id: string; name: string; country: Country; rail: string; reputation_score: number; payout_position: number };
type RoundRow = { id: string; index: number; status: string; recipientMemberId: string; paidAt: string | null };
type CircleData = { circle: { id: string; name: string; period: string; unitUsdCents: string }; members: Member[]; rounds: RoundRow[]; roundId: string | null };

const TINT: Record<Country, [string, string]> = {
  KE: ['#f8e3e1', '#8a211c'],
  NG: ['#e2f1e8', '#155f34'],
  UG: ['#f8efd2', '#6b4f00'],
  GH: ['#e3eaf7', '#1f4c9c'],
};
const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
const first = (name: string) => name.split(' ')[0];
const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '';
const RAIL_FOOT: Record<Country, string> = {
  NG: "Card or bank transfer in naira. Stays in Nigeria's pool.",
  KE: "An M-Pesa prompt on your phone, in shillings. Stays in Kenya's pool.",
  UG: "An MTN MoMo approval on your phone. Stays in Uganda's pool.",
  GH: "An MTN MoMo approval on your phone. Stays in Ghana's pool.",
};
const WAITING: Record<Country, string> = {
  NG: 'Finish the Paystack test checkout. Card 4084 0840 8408 4081 · CVV 408.',
  KE: 'Check your phone and enter your M-Pesa PIN.',
  UG: 'Approve the MTN MoMo prompt on your phone.',
  GH: 'Approve the MTN MoMo prompt on your phone.',
};

function statusOf(c: Contribution): { kind: PillKind; label: string } {
  if (c.status === 'succeeded') return { kind: 'paid', label: 'Paid' };
  if (c.status === 'pending') return { kind: 'pending', label: c.member.country === 'NG' ? 'Pending · checkout' : 'Pending · on phone' };
  if (c.status === 'failed') return { kind: 'failed', label: 'Failed' };
  if (c.promisedFor) return { kind: 'promised', label: `Promised ${day(c.promisedFor)}` };
  return { kind: 'unpaid', label: 'Unpaid' };
}

const ROUND_PILL: Record<string, { kind: PillKind; label: string }> = {
  open: { kind: 'unpaid', label: 'Open' },
  collecting: { kind: 'pending', label: 'Collecting' },
  funded: { kind: 'paid', label: 'Funded' },
  paying: { kind: 'pending', label: 'Paying out' },
  paid: { kind: 'paid', label: 'Paid out' },
  withheld: { kind: 'failed', label: 'Withheld' },
};

/** The amount on the rail: KES in whole shillings (rounded up), MoMo in EUR, Paystack exact. */
function railAmount(c: Contribution) {
  if (c.member.country === 'KE') {
    const whole = c.railAmountMinor && c.railCcy === 'KES' ? BigInt(c.railAmountMinor) : ((BigInt(c.amountMinor) + 99n) / 100n) * 100n;
    return { main: fmtMinor(whole, 'KES', { dropZeroCents: true }), note: `from ${fmtMinor(c.amountMinor, 'KES').replace('KSh ', '')}` };
  }
  if (c.railCcy === 'EUR' && c.railAmountMinor) return { main: fmtMinor(c.amountMinor, c.ccy), note: `on rail ${fmtMinor(c.railAmountMinor, 'EUR')}` };
  return { main: fmtMinor(c.amountMinor, c.ccy), note: null };
}

function CircleHome() {
  const { circleId } = useParams<{ circleId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const paidRef = params.get('paid');
  const [data, setData] = useState<CircleData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<'circle' | 'treasurer' | 'ledger'>('circle');
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const { state, error, refresh } = useRoundState(data?.roundId ?? null);

  const loadCircle = useCallback(async () => {
    const r = await fetch(`/api/circles/${circleId}`, { cache: 'no-store' });
    if (r.status === 404) return setNotFound(true);
    if (r.ok) setData(await r.json());
  }, [circleId]);
  useEffect(() => {
    void loadCircle();
  }, [loadCircle]);
  // A round finishing (or a new one opening) changes the payout order and dates: reload the circle.
  useEffect(() => {
    if (state) void loadCircle();
  }, [state?.round.status, state?.round.id, loadCircle]); // eslint-disable-line react-hooks/exhaustive-deps

  const members = data?.members ?? [];
  const asParam = params.get('as');
  const viewer = members.find((m) => m.id === asParam) ?? members.find((m) => m.country === 'NG') ?? members[0];
  const setViewer = (id: string) => {
    setMenu(false);
    setCheckoutUrl(null);
    router.replace(`/c/${circleId}?as=${id}`, { scroll: false });
  };

  const mine = state?.contributions.find((c) => c.member.id === viewer?.id);
  const recipient = state ? members.find((m) => m.id === state.round.recipient.id) : undefined;
  const paidCount = state?.contributions.filter((c) => c.status === 'succeeded').length ?? 0;
  const n = members.length || 4;
  const unit = BigInt(data?.circle.unitUsdCents ?? '5000');
  const recipientContribution = state?.contributions.find((c) => c.member.id === state.round.recipient.id);
  const pot = state?.payout?.amountMinor ?? (recipientContribution ? (BigInt(recipientContribution.amountMinor) * BigInt(n)).toString() : null);
  const paidRounds = (data?.rounds ?? []).filter((r) => r.status === 'paid');
  const myPastPot = viewer && paidRounds.find((r) => r.recipientMemberId === viewer.id);

  async function pay() {
    if (!mine) return;
    const popup = mine.member.country === 'NG' ? window.open('', 'kitty-paystack', 'popup,width=480,height=780') : null;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/contributions/${mine.id}/collect`, { method: 'POST' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      if (body.nextAction?.type === 'redirect') {
        setCheckoutUrl(body.nextAction.url);
        if (popup) popup.location.href = body.nextAction.url;
        else window.open(body.nextAction.url, '_blank');
      } else popup?.close();
      void refresh();
    } catch (e) {
      popup?.close();
      setMessage(`Could not start the payment: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  if (notFound) {
    return (
      <div className={s.page}>
        <div className={s.main}>
          <div className={s.callout}>
            This circle doesn’t exist any more (the demo may have been reset). <Link href="/c/current">Open the current demo circle</Link> or
            the <Link href="/dashboard">judge dashboard</Link>.
          </div>
        </div>
      </div>
    );
  }

  const avatar = viewer && (
    <div className={s.avatarWrap}>
      <button
        type="button"
        className={s.avatar}
        style={{ background: TINT[viewer.country][0], color: TINT[viewer.country][1] }}
        onClick={() => setMenu((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={menu}
        title={`Viewing as ${viewer.name} (demo)`}
      >
        {initials(viewer.name)}
      </button>
      {menu && (
        <div className={s.menu} role="menu">
          <div className={s.menuLabel}>DEMO · VIEW THE CIRCLE AS</div>
          {members.map((m) => (
            <button key={m.id} type="button" role="menuitem" className={`${s.menuItem} ${m.id === viewer.id ? s.menuOn : ''}`} onClick={() => setViewer(m.id)}>
              <Flag country={m.country} size={[20, 13]} />
              {m.name}
              <span className={s.mono} style={{ marginLeft: 'auto' }}>
                {COUNTRY[m.country].city}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  const loading = !state || !data;
  const circleName = data?.circle.name ?? 'Lagos · Nairobi · Kampala · Accra';
  const meta = `${fmtUsd(unit)} a round · ${data?.circle.period ?? 'weekly'} · ${n} members`;

  return (
    <div className={`${s.page} ${tab === 'treasurer' ? s.showTreasurer : ''}`}>
      {/* Mobile header */}
      <header className={s.mHeader}>
        <div className={s.bar}>
          <div className={s.left}>
            <Logo small wordmark={false} />
            <SandboxPill short />
          </div>
          {avatar}
        </div>
        <div>
          <h1 className={s.title}>{circleName}</h1>
          <div className={s.meta}>{meta}</div>
        </div>
        <div className={s.tabs} role="tablist">
          {(['circle', 'treasurer', 'ledger'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className={`${s.tab} ${tab === t ? s.tabOn : ''}`} onClick={() => setTab(t)}>
              {t[0].toUpperCase() + t.slice(1)}
              {t === 'treasurer' && tab !== 'treasurer' && <span className={s.tabDot} />}
            </button>
          ))}
        </div>
      </header>

      {/* Desktop nav */}
      <nav className={s.dNav}>
        <div className={s.left} style={{ gap: 16 }}>
          <Logo />
          <SandboxPill />
        </div>
        <div className={s.dPills}>
          <button className={`${s.dPill} ${tab !== 'ledger' ? s.dPillOn : ''}`} onClick={() => setTab('circle')}>
            Circle
          </button>
          <button className={`${s.dPill} ${tab === 'ledger' ? s.dPillOn : ''}`} onClick={() => setTab('ledger')}>
            Ledger
          </button>
          <Link className={s.dPill} href="/dashboard">
            Judge dashboard
          </Link>
          {avatar}
        </div>
      </nav>

      <div className={s.shell}>
        <main className={s.main}>
          <div className={s.dTitleRow}>
            <div>
              <h1 className={s.dTitle}>{circleName}</h1>
              <div className={s.dMeta}>
                {meta} · {fmtUsd(unit * BigInt(n))} pot
              </div>
            </div>
            {state && (
              <span className={s.kicker}>
                ROUND {state.round.index} OF {n} · {(ROUND_PILL[state.round.status]?.label ?? state.round.status).toUpperCase()}
              </span>
            )}
          </div>

          {paidRef && (
            <div className={s.callout}>
              Back from Paystack. Kitty is confirming <span className={monoNote}>{paidRef}</span> with Paystack’s verify API.
            </div>
          )}
          {message && <div className={s.callout}>{message}</div>}
          {error && <p className={s.error}>Last refresh failed: {error}</p>}

          {loading ? (
            <Skeleton />
          ) : tab === 'ledger' ? (
            <section className={s.card}>
              <div className={s.cardHead}>
                <span className={s.h3}>Ledger</span>
                <span className={s.mono}>every journal balances per currency</span>
              </div>
              <LedgerPanel journals={state.journals} />
            </section>
          ) : (
            <>
              <div className={s.two}>
                <RoundCard state={state} recipient={recipient} pot={pot} paidCount={paidCount} n={n} unit={unit} paidAt={paidRounds.find((r) => r.id === state.round.id)?.paidAt ?? null} />
                <OweCard
                  mine={mine}
                  state={state}
                  unit={unit}
                  busy={busy}
                  checkoutUrl={checkoutUrl}
                  onPay={pay}
                />
              </div>

              <section className={s.list} aria-label="Who's paid">
                <div className={s.listHead}>
                  <span className={s.h3}>Who&apos;s paid</span>
                  <span className={s.mono}>in payout order</span>
                </div>
                <div className={s.thead}>
                  <span>MEMBER · PAYOUT ORDER</span>
                  <span>RAIL</span>
                  <span style={{ textAlign: 'right' }}>AMOUNT</span>
                  <span>STATUS</span>
                  <span>PROOF</span>
                </div>
                {state.contributions.map((c) => {
                  const st = statusOf(c);
                  const ra = railAmount(c);
                  const isYou = c.member.id === viewer?.id;
                  const isRecipient = c.member.id === state.round.recipient.id;
                  const past = paidRounds.find((r) => r.recipientMemberId === c.member.id);
                  return (
                    <div key={c.id} className={`${s.row} ${isYou ? s.rowYou : ''}`}>
                      <div className={s.who}>
                        <div className={s.whoTop}>
                          <span className={s.pos}>{c.member.payoutPosition}</span>
                          <Flag country={c.member.country} size={[20, 13]} />
                          <span>{c.member.name}</span>
                          {isYou && <span className={s.you}>You</span>}
                        </div>
                        <span className={s.sub}>
                          {COUNTRY[c.member.country].city}
                          <span className={s.hideDesk}> · {COUNTRY[c.member.country].rail}</span> · rep {c.member.reputationScore}
                        </span>
                        {isRecipient && <span className={s.gets}>Receives this pot</span>}
                      </div>
                      <span className={s.railCol}>{COUNTRY[c.member.country].rail}</span>
                      <div className={s.amtCol}>
                        <span className={s.amt}>{ra.main}</span>
                        {ra.note && <span className={s.amtNote}>{ra.note}</span>}
                        <span className={s.statusInline}>
                          <StatusPill kind={st.kind} small>
                            {st.label}
                          </StatusPill>
                        </span>
                      </div>
                      <span className={s.statusCol}>
                        <StatusPill kind={st.kind}>{st.label}</StatusPill>
                      </span>
                      <div className={s.proof}>
                        {c.providerRef && c.status !== 'unpaid' && <RefChip value={c.providerRef} />}
                        <ProofBadges replay={c.replay} simulated={c.simulated} />
                        {c.railNote && <span className={monoNote}>{c.railNote}</span>}
                        {!c.providerRef && !c.railNote && past && <span className={s.sub}>Received the round {past.index} pot{past.paidAt ? ` · ${day(past.paidAt)}` : ''}</span>}
                      </div>
                    </div>
                  );
                })}
              </section>

              <div className={s.two}>
                <section className={s.card}>
                  <span className={s.h3}>Payout order</span>
                  <span className={s.small}>
                    Most trusted first. An early pot is effectively a loan from the circle, so the strongest on-time record earns the
                    earliest turn.
                  </span>
                  <div className={s.order}>
                    {[...members]
                      .sort((a, b) => a.payout_position - b.payout_position)
                      .map((m) => {
                        const r = data.rounds.find((x) => x.index === m.payout_position);
                        const done = r?.status === 'paid';
                        const now = r?.id === state.round.id && !done;
                        return (
                          <div key={m.id} className={`${s.orderRow} ${now ? s.orderNow : ''} ${!done && !now ? s.orderDim : ''}`}>
                            {done ? (
                              <span className={s.stepDone}>
                                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                                  <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              </span>
                            ) : (
                              <span className={now ? s.stepNow : s.stepNext}>{m.payout_position}</span>
                            )}
                            <span>
                              {m.payout_position} · {first(m.name)}
                              {m.id === viewer?.id ? ' (you)' : ''}
                            </span>
                            <span className={s.orderWhen}>{done ? `paid ${day(r?.paidAt ?? null)}` : now ? 'this round' : `round ${m.payout_position}`}</span>
                          </div>
                        );
                      })}
                  </div>
                </section>
                <SoFar netting={state.netting} paidRounds={paidRounds.length} n={n} />
              </div>
              {myPastPot && mine?.status !== 'succeeded' && (
                <div className={`${s.small} ${s.hideDesk}`}>You received the round {myPastPot.index} pot{myPastPot.paidAt ? ` on ${day(myPastPot.paidAt)}` : ''}.</div>
              )}
            </>
          )}
        </main>

        <aside className={s.aside} style={{ flexDirection: 'column', minHeight: 0 }}>
          {viewer && data && (
            <TreasurerChat circleId={circleId} memberId={viewer.id} members={members} onActivity={() => void refresh()} />
          )}
        </aside>
      </div>
    </div>
  );
}

function RoundCard({
  state,
  recipient,
  pot,
  paidCount,
  n,
  unit,
  paidAt,
}: {
  state: RoundState;
  recipient?: Member;
  pot: string | null;
  paidCount: number;
  n: number;
  unit: bigint;
  paidAt: string | null;
}) {
  const pill = ROUND_PILL[state.round.status] ?? { kind: 'neutral' as PillKind, label: state.round.status };
  const rc = state.round.recipient.country;
  const paid = state.round.status === 'paid';
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.kicker}>
          ROUND {state.round.index} OF {n}
        </span>
        <StatusPill kind={pill.kind}>{pill.label}</StatusPill>
      </div>
      <div className={s.recipient}>
        <div className={s.bigAvatar} style={{ background: TINT[rc][0], color: TINT[rc][1] }}>
          {initials(state.round.recipient.name)}
          <span className={s.bigAvatarFlag}>
            <Flag country={rc} size={[20, 13]} />
          </span>
        </div>
        <div>
          <div className={s.potLabel}>
            {recipient ? state.round.recipient.name : first(state.round.recipient.name)} {paid ? 'received' : 'receives'} this pot
          </div>
          <div className={s.potAmt}>{pot ? fmtMinor(pot, state.round.recipient.ccy) : '—'}</div>
        </div>
      </div>
      <div className={s.small}>
        {paid ? (
          <>
            Paid out{paidAt ? <b style={{ color: 'var(--k-ink)' }}> {day(paidAt)}</b> : ''} from {COUNTRY[rc].name}&apos;s own pool
            {state.payout?.providerRef && (
              <>
                {' '}
                · <RefChip value={state.payout.providerRef} />
              </>
            )}
            <span style={{ marginLeft: 6 }}>
              <ProofBadges simulated={state.payout?.simulated} compact />
            </span>
          </>
        ) : state.round.status === 'paying' ? (
          <>Paying out from {COUNTRY[rc].name}&apos;s own pool now…</>
        ) : (
          <>Paid out from {COUNTRY[rc].name}&apos;s own pool, once all {n} have paid.</>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div className={s.segs} style={{ ['--n' as string]: n }}>
          {Array.from({ length: n }, (_, i) => (
            <div key={i} className={`${s.seg} ${i < paidCount ? s.segOn : ''}`} />
          ))}
        </div>
        <div className={s.mono}>
          {paidCount} of {n} paid · {fmtUsd(unit * BigInt(paidCount))} of {fmtUsd(unit * BigInt(n))}
        </div>
      </div>
    </section>
  );
}

function OweCard({
  mine,
  state,
  unit,
  busy,
  checkoutUrl,
  onPay,
}: {
  mine?: Contribution;
  state: RoundState;
  unit: bigint;
  busy: boolean;
  checkoutUrl: string | null;
  onPay: () => void;
}) {
  if (!mine) return null;
  const country = mine.member.country;
  const rail = COUNTRY[country].rail;
  const collecting = ['open', 'collecting'].includes(state.round.status);
  const top = (label: string) => (
    <div className={s.oweTop}>
      <span>{label}</span>
      <span className={s.oweTopRight}>{mine.promisedFor ? `promised ${day(mine.promisedFor)}` : `round ${state.round.index}`}</span>
    </div>
  );

  if (mine.status === 'succeeded') {
    return (
      <section className={s.owe}>
        {top('You paid this round')}
        <div>
          <div className={s.oweAmt}>{fmtMinor(mine.amountMinor, mine.ccy)}</div>
          <div className={s.oweSub}>= {fmtUsd(unit)} · in {COUNTRY[country].name}&apos;s pool</div>
        </div>
        <div className={s.wait}>
          <span className={s.okMark}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Paid with {rail}</span>
            {mine.providerRef && <span className={s.inkRef}>ref {mine.providerRef}</span>}
          </div>
        </div>
        {(mine.simulated || mine.replay) && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <ProofBadges replay={mine.replay} simulated={mine.simulated} />
          </div>
        )}
      </section>
    );
  }

  if (mine.status === 'pending') {
    return (
      <section className={s.owe}>
        {top('Waiting for you')}
        <div>
          <div className={s.oweAmt}>{fmtMinor(mine.amountMinor, mine.ccy)}</div>
          <div className={s.oweSub}>= {fmtUsd(unit)} · rate locked for this round</div>
        </div>
        <div className={s.wait}>
          <span className={s.spinner} aria-hidden="true" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>{WAITING[country]}</span>
            {mine.providerRef && <span className={s.inkRef}>ref {mine.providerRef}</span>}
          </div>
        </div>
        {country === 'NG' && (
          <a className={s.payBtn} href={checkoutUrl ?? '#'} target="kitty-paystack" rel="noreferrer" onClick={(e) => { if (!checkoutUrl) { e.preventDefault(); onPay(); } }}>
            {checkoutUrl ? 'Open the Paystack checkout' : 'Reopen checkout'}
          </a>
        )}
        <div className={s.oweFoot}>This page checks {rail} every 1.5 s. Nothing else to do here.</div>
      </section>
    );
  }

  return (
    <section className={s.owe}>
      {top(mine.status === 'failed' ? 'Your last attempt didn’t go through' : 'You owe this round')}
      <div>
        <div className={s.oweAmt}>{fmtMinor(mine.amountMinor, mine.ccy)}</div>
        <div className={s.oweSub}>= {fmtUsd(unit)} · rate locked for this round</div>
      </div>
      <button className={s.payBtn} onClick={onPay} disabled={busy || !collecting}>
        {busy ? 'Sending…' : mine.status === 'failed' ? `Try again with ${rail}` : `Pay with ${rail}`}
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <div className={s.oweFoot}>{collecting ? RAIL_FOOT[country] : `This round is ${state.round.status}.`}</div>
    </section>
  );
}

function SoFar({ netting, paidRounds, n }: { netting: RoundState['netting']; paidRounds: number; n: number }) {
  const moved = BigInt(netting.movedUsdCents);
  const net = BigInt(netting.netCrossBorderUsdCents);
  const pct = moved === 0n ? 0 : Number((net * 1000n) / moved) / 10;
  const done = paidRounds >= n;
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.h3}>This circle so far</span>
        <span className={s.mono}>{paidRounds ? `after round ${paidRounds}` : 'round 1'}</span>
      </div>
      <div className={s.stats}>
        <div className={s.stat}>
          <span className={s.statLabel}>Moved</span>
          <span className={s.statVal}>{fmtUsd(netting.movedUsdCents)}</span>
        </div>
        <div className={s.stat}>
          <span className={s.statLabel}>Crossed a border</span>
          <span className={s.statVal}>
            {fmtUsd(netting.netCrossBorderUsdCents)} <span className={s.statPct}>{pct}%</span>
          </span>
        </div>
      </div>
      <div className={s.stripe} aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <div className={s.small}>
        {done ? (
          <>
            Full cycle complete: <b style={{ color: 'var(--k-ink)' }}>net crossed a border: {fmtUsd(netting.netCrossBorderUsdCents)}</b>.
          </>
        ) : (
          <>
            These are recorded FX positions, not money sent. They cancel out as the rounds complete: after round {n},{' '}
            <b style={{ color: 'var(--k-ink)' }}>net crossed a border: $0</b>.
          </>
        )}
      </div>
    </section>
  );
}

function Skeleton() {
  const bar = (w: number | string, h = 14, extra = '') => <div className={`${s.skel} ${extra}`} style={{ width: w, height: h }} />;
  return (
    <>
      <div className={s.two}>
        <div className={s.card}>
          {bar(110, 12)}
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div className={s.skel} style={{ width: 48, height: 48, borderRadius: '50%' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bar(140, 12)}
              {bar(170, 22, s.shimmer)}
            </div>
          </div>
          <div className={s.segs}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={s.seg} />
            ))}
          </div>
        </div>
        <div className={s.owe}>
          <div className={s.skelDark} style={{ width: 120, height: 12 }} />
          <div className={`${s.skelDark} ${s.shimmer}`} style={{ width: 200, height: 36 }} />
          <div className={s.skelDark} style={{ height: 56, borderRadius: 14 }} />
        </div>
      </div>
      <div className={s.card} style={{ gap: 16 }}>
        {bar(90)}
        {[150, 130, 160].map((w) => (
          <div key={w} style={{ display: 'flex', justifyContent: 'space-between' }}>
            {bar(w)}
            {bar(70)}
          </div>
        ))}
      </div>
      <div className={s.loadingNote}>Checking the latest from each rail…</div>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <CircleHome />
    </Suspense>
  );
}
