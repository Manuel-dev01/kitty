'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Country } from '@/lib/ui/types';
import s from './TreasurerChat.module.css';

type ConfirmCard = {
  type: 'confirm';
  token: string;
  summary: string;
  amount?: string;
  rail?: string;
  round?: number;
  recipientName?: string;
  usd?: string;
  account?: string;
};
type Card = ConfirmCard | { type: 'promise'; date: string } | { type: 'payment_started'; providerRef: string; rail: string; checkoutUrl?: string };
type Msg = { role: 'user' | 'assistant' | 'circle'; content: string; cards?: Card[] };
export type ChatMember = { id: string; name: string; country: Country };
type Lang = 'en' | 'pcm' | 'sw';

const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'pcm', label: 'Pidgin' },
  { id: 'sw', label: 'Kiswahili' },
];
const SUGGESTIONS: Record<Lang, string[]> = {
  en: ['What do I owe this round?', 'Pay my contribution', "I'll pay on Friday"],
  pcm: ['Wetin I owe this round?', 'Abeg make I pay my own now', 'I go pay Friday abeg'],
  sw: ['Nadaiwa kiasi gani?', 'Nataka kulipa sasa', 'Nitalipa Ijumaa'],
};
const YES: Record<Lang, [string, string]> = { en: ['Yes', 'Not now'], pcm: ['Yes', 'No be now'], sw: ['Ndiyo', 'Si sasa'] };
const DEFAULT_LANG: Record<Country, Lang> = { NG: 'pcm', GH: 'pcm', KE: 'sw', UG: 'en' };

const fmtDate = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

function CalendarIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="1.8" y="2.6" width="8.4" height="7.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 5h8.4M4.2 1.4v2M7.8 1.4v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The circle's treasurer (docs/design/Kitty Circle Home.dc.html). Money safety lives on the server: the
 * "Yes, pay" and "Not now" buttons only send those words, and the server judges consent from them.
 */
export function TreasurerChat({
  circleId,
  memberId,
  members,
  onActivity,
}: {
  circleId: string;
  memberId: string;
  members: ChatMember[];
  onActivity?: () => void;
}) {
  const me = members.find((m) => m.id === memberId);
  const [lang, setLang] = useState<Lang>(me ? DEFAULT_LANG[me.country] : 'en');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (me) setLang(DEFAULT_LANG[me.country]);
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    const res = await fetch(`/api/agent?circleId=${circleId}&memberId=${memberId}`, { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (res.ok) setMessages(body.messages);
  }, [circleId, memberId]);

  useEffect(() => {
    setMessages([]);
    setError(null);
    void load();
  }, [load]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || sending) return;
    // Paystack needs its checkout window, and browsers only allow opening one inside the click.
    const affirmative = /^(yes|ok|oya|sure|confirm|ndiyo|sawa)/i.test(message);
    const popup = me?.country === 'NG' && affirmative ? window.open('', 'kitty-paystack', 'popup,width=480,height=780') : null;
    setSending(true);
    setError(null);
    setDraft('');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId, memberId, message, language: lang }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await res.json().catch(() => ({ error: `The treasurer is unavailable (HTTP ${res.status}). Please try again.` }));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const started = (body.cards as Card[]).find((c) => c.type === 'payment_started') as Extract<Card, { type: 'payment_started' }> | undefined;
      if (started?.checkoutUrl && popup) popup.location.href = started.checkoutUrl;
      else popup?.close();
      await load();
      onActivity?.();
    } catch (e) {
      popup?.close();
      setError((e as Error).name === 'TimeoutError' ? 'The treasurer took too long to answer. Please try again.' : (e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // Only the newest unanswered confirmation keeps its buttons.
  const lastConfirmAt = messages.map((m) => m.cards?.some((c) => c.type === 'confirm')).lastIndexOf(true);
  const answered = lastConfirmAt >= 0 && messages.slice(lastConfirmAt + 1).some((m) => m.role === 'user');

  return (
    <section className={s.panel} aria-label="Treasurer">
      <div className={s.head}>
        <div className={s.id}>
          <div className={s.mark} aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 28 28">
              <circle cx="14" cy="14" r="8" fill="none" stroke="#fffdf8" strokeWidth="2" />
              <circle cx="14" cy="6" r="3" fill="#fffdf8" />
            </svg>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className={s.name}>Treasurer</span>
            <span className={s.tag}>Nothing moves until you say yes{me ? ` · talking to ${me.name.split(' ')[0]}` : ''}</span>
          </div>
        </div>
        <div className={s.langs} role="radiogroup" aria-label="Language">
          {LANGS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className={`${s.lang} ${lang === l.id ? s.langOn : ''}`} onClick={() => setLang(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.msgs} ref={scroller} aria-live="polite">
        <div className={s.spacer} />
        {messages.length === 0 && !sending && (
          <p className={s.empty}>
            Ask what you owe, pay your contribution, or tell the circle when you&apos;ll pay. I never move money until you say yes, and I
            can only ever take your own payment, for the amount the circle set.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'contents' }}>
            {m.role === 'circle' ? (
              <div className={s.announce}>
                <CalendarIcon />
                {m.content} · shared with the circle
              </div>
            ) : m.content ? (
              <div className={m.role === 'user' ? s.me : s.them}>{m.content}</div>
            ) : null}
            {m.cards?.map((c, k) => {
              if (c.type === 'confirm') {
                const live = i === lastConfirmAt && !answered;
                return (
                  <div key={k} className={s.confirm}>
                    <div className={s.cardKicker}>CONFIRM PAYMENT</div>
                    <div className={s.cardTitle}>
                      {c.amount ? (
                        <>
                          Pay <span className={s.num}>{c.amount}</span> now with {c.rail}?
                        </>
                      ) : (
                        `${c.summary}?`
                      )}
                    </div>
                    {c.amount && (
                      <div className={s.rows}>
                        <span>For</span>
                        <span>
                          Round {c.round} · {c.recipientName?.split(' ')[0]}&apos;s pot
                        </span>
                        <span>Equals</span>
                        <span className={s.num}>{c.usd}</span>
                        <span>Into</span>
                        <span className={s.acct}>{c.account}</span>
                      </div>
                    )}
                    {live ? (
                      <div className={s.btns}>
                        <button type="button" className={s.yes} onClick={() => send(YES[lang][0])} disabled={sending}>
                          Yes, pay
                        </button>
                        <button type="button" className={s.no} onClick={() => send(YES[lang][1])} disabled={sending}>
                          Not now
                        </button>
                      </div>
                    ) : (
                      <div className={s.done}>Answered below.</div>
                    )}
                  </div>
                );
              }
              if (c.type === 'promise') {
                return (
                  <div key={k} className={s.announce}>
                    <CalendarIcon />
                    Promise recorded: pays by {fmtDate(c.date)}
                  </div>
                );
              }
              return (
                <div key={k} className={s.started}>
                  <div className={s.cardKicker}>PAYMENT STARTED · {c.rail.toUpperCase()}</div>
                  <div className={s.startedRef}>ref {c.providerRef}</div>
                  {c.checkoutUrl && (
                    <a className={s.checkout} href={c.checkoutUrl} target="kitty-paystack" rel="noreferrer">
                      Open the Paystack checkout
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        {sending && <div className={`${s.thinking} ${s.dots}`}>Treasurer is thinking</div>}
      </div>

      {error && <p className={s.error}>{error}</p>}
      <div className={s.chips}>
        {SUGGESTIONS[lang].map((q) => (
          <button key={q} type="button" className={s.chip} onClick={() => send(q)} disabled={sending}>
            {q}
          </button>
        ))}
      </div>
      <form
        className={s.foot}
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <input className={s.input} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Ask, or say when you'll pay…" aria-label="Message the treasurer" />
        <button className={s.send} type="submit" disabled={sending || !draft.trim()} aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M3 8h9M8.5 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </form>
    </section>
  );
}
