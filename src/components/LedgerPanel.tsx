import { fmtMinor, sumsByCcy } from '@/lib/ui/format';
import type { RoundState } from '@/lib/ui/types';

/** Journal lines as they post, newest first, each visibly balancing per currency (Invariant 1). */
export function LedgerPanel({ journals }: { journals: RoundState['journals'] }) {
  if (!journals.length) return <p className="muted">No journals yet.</p>;
  return (
    <div className="ledger">
      {journals.map((j) => {
        const sums = sumsByCcy(j.lines);
        const ok = sums.every(([, v]) => v === 0n);
        return (
          <article className="journal" key={j.id}>
            <header>
              <span className={`kind ${j.kind}`}>
                {j.ref.type === 'payout_reversal' ? 'payout reversal' : j.kind.replace('_', ' ')}
              </span>
              <span className="mono muted" title={j.id}>
                {j.id.slice(0, 8)}
              </span>
            </header>
            <div className="jl">
              {j.lines.map((l, i) => {
                const neg = l.amountMinor.startsWith('-');
                return (
                  <div key={i} style={{ display: 'contents' }}>
                    <span className="acct" title={l.account}>
                      {l.account.replace(/^circle:[0-9a-f-]{36}:/, 'circle:')}
                    </span>
                    <span className={neg ? 'neg' : 'pos'}>{fmtMinor(l.amountMinor, l.ccy, { sign: true })}</span>
                  </div>
                );
              })}
            </div>
            <div className="balanced" style={ok ? undefined : { color: 'var(--bad)' }}>
              {sums.map(([ccy, v]) => `Σ ${ccy} ${v === 0n ? '0 ✓' : v.toString()}`).join(' · ')}
            </div>
          </article>
        );
      })}
    </div>
  );
}
