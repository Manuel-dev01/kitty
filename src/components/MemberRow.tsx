import { COUNTRY, fmtMinor, shortRef } from '@/lib/ui/format';
import type { Contribution } from '@/lib/ui/types';
import { StepBadges } from './Badges';
import { Flag } from './Flag';

/** One member's contribution this round: who, which rail, how much, status, and the provider reference. */
export function MemberRow({ c, isRecipient, action }: { c: Contribution; isRecipient?: boolean; action?: React.ReactNode }) {
  const meta = COUNTRY[c.member.country];
  const onRail =
    c.railAmountMinor && c.railCcy && c.railCcy !== c.ccy ? ` · on rail ${fmtMinor(c.railAmountMinor, c.railCcy)}` : '';
  return (
    <div className={`member${isRecipient ? ' recipient' : ''}`}>
      <Flag country={c.member.country} title={meta.name} />
      <div>
        <span className="who">{c.member.name}</span> <span className="muted">· {meta.city}</span>
        {isRecipient && <span className="pill paying" style={{ marginLeft: 8 }}>receives the pot</span>}
      </div>
      <div className="amt num">{fmtMinor(c.amountMinor, c.ccy)}</div>
      <div className="meta">
        <span className={`pill ${c.status}`}>{c.status}</span>
        <span>{meta.rail}</span>
        <span className="num">rep {c.member.reputationScore}</span>
        {c.providerRef && (
          <span className="mono" title={c.providerRef}>
            ref {shortRef(c.providerRef)}
          </span>
        )}
        {onRail && <span className="num">{onRail.slice(3)}</span>}
        {c.promisedFor && <span>promised for {c.promisedFor.slice(0, 10)}</span>}
        <StepBadges replay={c.replay} simulated={c.simulated} note={c.railNote} />
        {action}
      </div>
    </div>
  );
}
