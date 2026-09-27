import { COUNTRY, fmtMinor, fmtUsd } from '@/lib/ui/format';
import type { RoundState } from '@/lib/ui/types';
import { Flag } from './Flag';

/** "Moved $X · Crossed a border $Y (Z%)", against what naive remittance would have sent. */
export function NettingMeter({ netting }: { netting: RoundState['netting'] }) {
  const moved = BigInt(netting.movedUsdCents);
  const net = BigInt(netting.netCrossBorderUsdCents);
  const gross = BigInt(netting.grossCrossBorderUsdCents);
  const pct = (v: bigint) => (moved === 0n ? 0 : Number((v * 1000n) / moved) / 10);
  return (
    <div className="meter">
      <div className="headline num">
        Moved {fmtUsd(netting.movedUsdCents)} · <span className="x">Crossed a border {fmtUsd(netting.netCrossBorderUsdCents)}</span>{' '}
        <span className="muted" style={{ fontWeight: 600 }}>({netting.crossedPct}%)</span>
      </div>
      <div className="bar" aria-label="Net crossing a border, share of money moved">
        <span style={{ width: `${pct(net)}%` }} />
      </div>
      <div className="muted" style={{ fontSize: '0.82em' }}>
        Net that would have to settle across a border: sum of positive <span className="mono">fx:position</span> balances.
      </div>
      <div className="bar naive" aria-label="Naive remittance, share of money moved">
        <span style={{ width: `${pct(gross)}%` }} />
      </div>
      <div className="muted num" style={{ fontSize: '0.82em' }}>
        Naive remittance would have sent <b>{fmtUsd(netting.grossCrossBorderUsdCents)}</b> across borders.
      </div>
    </div>
  );
}

/** Each country pool against the next payout it has to cover (Invariant 3 never lets one go below zero). */
export function PoolHealth({ pools }: { pools: RoundState['netting']['poolHealth'] }) {
  return (
    <div className="pools">
      {pools.map((p) => (
        <div key={p.country} className={`pool${p.ok ? '' : ' short'}`}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <Flag country={p.country} /> <b>{COUNTRY[p.country].city}</b>
          </div>
          <div className="v num">{fmtMinor(p.cashMinor, p.ccy)}</div>
          <div className="muted mono" style={{ fontSize: '0.8em' }}>
            cash:{p.rail}:{p.ccy}
          </div>
          {BigInt(p.nextPayoutMinor) > 0n && (
            <div className="num" style={{ fontSize: '0.8em', color: p.ok ? 'var(--accent)' : 'var(--gold)' }}>
              next payout {fmtMinor(p.nextPayoutMinor, p.ccy)} {p.ok ? '✓' : '· covered as contributions land'}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/** Invariant 2, on screen: after the full cycle every fx:position is exactly zero. */
export function ProofBanner({ state }: { state: RoundState }) {
  const r = state.netting.residuals;
  const rounding = Object.entries(r).filter(([, v]) => v.rounding !== '0');
  return (
    <section className="proof" aria-live="polite">
      <div className="muted" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '0.75em' }}>
        Full cycle complete · Invariant 2
      </div>
      <div className="big num">
        Moved {fmtUsd(state.netting.movedUsdCents)} · Net crossed a border: {fmtUsd(state.netting.netCrossBorderUsdCents)}
      </div>
      <div className="zeros">
        {Object.entries(r).map(([ccy, v]) => (
          <span className="zero" key={ccy}>
            fx:position:{ccy} = {fmtMinor(v.position, ccy)} {v.position === '0' ? '✓' : ''}
          </span>
        ))}
      </div>
      {rounding.length > 0 && (
        <p className="muted" style={{ fontSize: '0.8em', marginBottom: 0 }}>
          Rounding, shown rather than hidden:{' '}
          {rounding.map(([ccy, v]) => `fx:rounding:${ccy} ${fmtMinor(v.rounding, ccy)}`).join(' · ')} (Daraja takes whole shillings).
        </p>
      )}
    </section>
  );
}
