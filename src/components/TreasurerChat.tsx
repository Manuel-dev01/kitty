'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { COUNTRY } from '@/lib/ui/format';
import type { Country } from '@/lib/ui/types';
import { Flag } from './Flag';

type Card =
  | { type: 'confirm'; token: string; summary: string }
  | { type: 'promise'; date: string }
  | { type: 'payment_started'; providerRef: string; rail: string; checkoutUrl?: string };
type Msg = { role: 'user' | 'assistant' | 'circle'; content: string; cards?: Card[] };
export type ChatMember = { id: string; name: string; country: Country };

const SUGGESTIONS = ['What do I owe this round?', 'Pay my contribution', 'I go pay Friday abeg', 'Nitalipa Ijumaa'];

const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * The circle's treasurer (DeepSeek, tools enforced server-side). The Yes / Not now buttons simply send those
 * words as the member's message: consent is still judged by the server from what the member said.
 */
export function TreasurerChat({ circleId, members, onActivity }: { circleId: string; members: ChatMember[]; onActivity?: () => void }) {
  const [memberId, setMemberId] = useState<string>('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const me = members.find((m) => m.id === memberId);

  useEffect(() => {
    if (!memberId && members.length) setMemberId(members.find((m) => m.country === 'GH')?.id ?? members[0].id);
  }, [members, memberId]);

  const load = useCallback(async () => {
    if (!memberId) return;
    const res = await fetch(`/api/agent?circleId=${circleId}&memberId=${memberId}`, { cache: 'no-store' });
    const body = await res.json();
    if (res.ok) setMessages(body.messages);
  }, [circleId, memberId]);

  useEffect(() => {
    setMessages([]);
    void load();
  }, [load]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  async function send(text: string) {
    const message = text.trim();
    if (!message || !memberId || sending) return;
    // Paystack needs a checkout window, and browsers only allow opening it inside the click.
    const popup = me?.country === 'NG' && /^(yes|ok|oya|sure|confirm)/i.test(message) ? window.open('', 'kitty-paystack', 'popup,width=480,height=780') : null;
    setSending(true);
    setError(null);
    setDraft('');
    setMessages((m) => [...m, { role: 'user', content: message }]);
    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleId, memberId, message }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      const started = (body.cards as Card[]).find((c) => c.type === 'payment_started') as Extract<Card, { type: 'payment_started' }> | undefined;
      if (started?.checkoutUrl && popup) popup.location.href = started.checkoutUrl;
      else popup?.close();
      await load(); // brings in the reply, its cards, and any circle announcement
      onActivity?.();
    } catch (e) {
      popup?.close();
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  // Only the newest unanswered confirmation keeps its buttons.
  const lastConfirmAt = messages.map((m) => m.cards?.some((c) => c.type === 'confirm')).lastIndexOf(true);
  const answered = lastConfirmAt >= 0 && messages.slice(lastConfirmAt + 1).some((m) => m.role === 'user');

  return (
    <section className="panel chat" aria-label="Treasurer chat">
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Treasurer</h2>
        <label className="muted" style={{ fontSize: '0.8em', display: 'flex', gap: 6, alignItems: 'center' }}>
          Chatting as
          <select value={memberId} onChange={(e) => setMemberId(e.target.value)} className="select">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} · {COUNTRY[m.country].city}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="msgs" ref={scroller} aria-live="polite">
        {messages.length === 0 && !sending && (
          <p className="muted" style={{ margin: 0 }}>
            {me ? `Hi ${me.name.split(' ')[0]}. ` : ''}Ask what you owe, pay your contribution, or tell the circle when you’ll pay. English,
            Pidgin or Swahili. I never move money until you say yes.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.role === 'circle' && <span className="who-tag">Circle</span>}
            <span>{m.content}</span>
            {m.cards?.map((c, k) => (
              <div key={k} className={`card ${c.type}`}>
                {c.type === 'confirm' && (
                  <>
                    <div className="card-title">Confirm payment</div>
                    <div>{c.summary}</div>
                    {i === lastConfirmAt && !answered && (
                      <div className="actions" style={{ marginTop: 8 }}>
                        <button className="btn small go" onClick={() => send('Yes')} disabled={sending}>
                          Yes, pay
                        </button>
                        <button className="btn small ghost" onClick={() => send('Not now')} disabled={sending}>
                          Not now
                        </button>
                      </div>
                    )}
                  </>
                )}
                {c.type === 'promise' && (
                  <>
                    <div className="card-title">Promise recorded</div>
                    <div>
                      Pays by <b>{fmtDate(c.date)}</b>. The circle has been told.
                    </div>
                  </>
                )}
                {c.type === 'payment_started' && (
                  <>
                    <div className="card-title">Payment started · {c.rail}</div>
                    <div className="mono">ref {c.providerRef}</div>
                    {c.checkoutUrl && (
                      <a className="btn small go" style={{ marginTop: 8, display: 'inline-flex' }} href={c.checkoutUrl} target="kitty-paystack" rel="noreferrer">
                        Open Paystack checkout
                      </a>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        ))}
        {sending && <div className="bubble assistant muted">Treasurer is thinking…</div>}
      </div>

      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <div className="actions">
        {SUGGESTIONS.map((s) => (
          <button key={s} className="chip" onClick={() => send(s)} disabled={sending || !memberId}>
            {s}
          </button>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
        style={{ display: 'flex', gap: 8 }}
      >
        {me && <Flag country={me.country} />}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={me ? `Message as ${me.name.split(' ')[0]}…` : 'Message the treasurer…'}
          aria-label="Message the treasurer"
          disabled={!memberId}
        />
        <button className="btn small go" type="submit" disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </section>
  );
}
