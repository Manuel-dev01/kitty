/**
 * Inline SVG of Africa with the four city nodes (no map library). Equirectangular projection.
 * A node pulses while its contribution is pending and fills once it lands in its OWN country pool.
 * Dashed arcs appear when the pot is converted: they are recorded FX positions, not money moving.
 */
import { COUNTRY, fmtMinor } from '@/lib/ui/format';
import type { Country, RoundState } from '@/lib/ui/types';

const P = (lon: number, lat: number): [number, number] => [(lon + 20) * 10, (38 - lat) * 10];

// Simplified coastline (lon, lat), clockwise from the Strait of Gibraltar.
const COAST: [number, number][] = [
  [-5.9, 35.9], [-1, 35.3], [3, 36.8], [10.2, 37.2], [11.1, 35.2], [10.2, 33.8], [11.5, 33.1], [15.2, 32.3], [19.9, 30.6],
  [20.1, 32.4], [23.1, 32.6], [25.2, 31.6], [29.9, 31.2], [32.3, 31.3], [34.2, 31.3], [34.9, 29.5], [33.6, 27.9], [35.5, 24],
  [37.2, 21], [38.4, 18], [39.7, 15.5], [41.6, 13.4], [43.3, 12.6], [44.5, 10.4], [48, 11.2], [51.3, 11.8], [51, 10.4],
  [50.1, 8.1], [48.7, 5.3], [46, 2], [43.5, -0.5], [41.6, -1.7], [40.1, -3.3], [39.2, -4.7], [38.8, -6.5], [39.3, -8.2],
  [40.4, -10.5], [40.6, -14.5], [39.5, -16.9], [36.9, -18.3], [35.2, -21.3], [35.5, -23.9], [32.9, -25.9], [32.6, -28.6],
  [31.3, -29.4], [30, -31.3], [27.4, -33.3], [25.6, -33.9], [22.6, -33.9], [20, -34.8], [18.4, -34.2], [18.3, -33.1],
  [17.3, -30], [16.5, -28.6], [15.2, -26.7], [14.5, -22.9], [13.2, -20.2], [11.8, -18], [11.8, -15.8], [12.5, -13.2],
  [13.6, -12], [13.1, -9.8], [12.2, -6.2], [12.3, -5.5], [11, -3.9], [9.4, -0.9], [9.6, 0.9], [9.4, 3.8], [8.5, 4.5],
  [6.9, 4.3], [5.5, 5.3], [4.2, 6.4], [2.7, 6.3], [1.2, 6.1], [-1.1, 5], [-3.1, 5.1], [-5.3, 5.2], [-7.5, 4.4],
  [-9.3, 5.4], [-11.4, 6.9], [-13.1, 8.2], [-13.8, 9.6], [-15.1, 11], [-16.7, 12.4], [-17.2, 14.7], [-16.5, 16.2],
  [-16.1, 18.1], [-16.9, 20.8], [-17, 21.4], [-15.9, 23.5], [-14.4, 25.5], [-13.2, 27.7], [-11.4, 28.2], [-9.8, 29.9],
  [-9.6, 31.2], [-8.5, 33.3], [-6.8, 34], [-5.9, 35.9],
];
const MADAGASCAR: [number, number][] = [
  [49.3, -12], [50.2, -14.8], [50.4, -16], [49.6, -17.5], [48.6, -20.5], [47.5, -24.8], [45.2, -25.5], [44, -24.9],
  [43.3, -22.2], [44.4, -19.3], [44, -17.3], [44.4, -16.2], [46.4, -15.7], [47.6, -14.5], [48.4, -13.4], [49.3, -12],
];
const toPath = (pts: [number, number][]) => pts.map(([lon, lat], i) => `${i ? 'L' : 'M'}${P(lon, lat).map((v) => v.toFixed(1)).join(',')}`).join('') + 'Z';
const LAND = toPath(COAST);
const MADA = toPath(MADAGASCAR);

const LABEL: Record<Country, { dx: number; anchor: 'start' | 'end' }> = {
  NG: { dx: 22, anchor: 'start' },
  GH: { dx: -22, anchor: 'end' },
  KE: { dx: 22, anchor: 'start' },
  UG: { dx: -22, anchor: 'end' },
};

function arc(from: [number, number], to: [number, number]) {
  const [x1, y1] = from;
  const [x2, y2] = to;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2 - Math.max(60, Math.abs(x2 - x1) * 0.35); // bow upwards
  return `M${x1},${y1} Q${mx},${my} ${x2},${y2}`;
}

export function AfricaMap({ state }: { state: RoundState | null }) {
  const byCountry = new Map(state?.contributions.map((c) => [c.member.country, c]) ?? []);
  const recipient = state?.round.recipient.country;
  const converted = state && ['funded', 'paying', 'paid'].includes(state.round.status);
  const paidOut = state?.round.status === 'paid';

  return (
    <svg className="map" viewBox="-10 -10 880 770" role="img" aria-label="Map of Africa with Lagos, Accra, Kampala and Nairobi">
      <path className="land" d={LAND} />
      <path className="land" d={MADA} />

      {converted &&
        recipient &&
        (Object.keys(COUNTRY) as Country[])
          .filter((c) => c !== recipient && byCountry.has(c))
          .map((c) => (
            <path
              key={`arc-${c}`}
              className="arc"
              stroke={COUNTRY[c].color}
              d={arc(P(COUNTRY[c].lon, COUNTRY[c].lat), P(COUNTRY[recipient].lon, COUNTRY[recipient].lat))}
            />
          ))}

      {(Object.keys(COUNTRY) as Country[]).map((c) => {
        const [x, y] = P(COUNTRY[c].lon, COUNTRY[c].lat);
        const k = byCountry.get(c);
        const color = COUNTRY[c].color;
        const landed = k?.status === 'succeeded';
        const isRecipient = c === recipient;
        return (
          <g key={c}>
            {k?.status === 'pending' && <circle className="pulse" cx={x} cy={y} r={14} fill={color} />}
            {isRecipient && paidOut && <circle className="burst" cx={x} cy={y} r={16} fill="var(--gold)" />}
            {isRecipient && <circle cx={x} cy={y} r={21} fill="none" stroke="var(--gold)" strokeWidth={4} />}
            <circle
              className="node"
              cx={x}
              cy={y}
              r={landed ? 13 : 11}
              fill={landed ? color : '#fff'}
              stroke={k?.status === 'failed' ? 'var(--bad)' : color}
              strokeWidth={4}
            />
            <text className="city-label" x={x + LABEL[c].dx} y={y - 4} textAnchor={LABEL[c].anchor}>
              {COUNTRY[c].city}
            </text>
            {k && (
              <text className="city-sub" x={x + LABEL[c].dx} y={y + 20} textAnchor={LABEL[c].anchor}>
                {k.member.name.split(' ')[0]} · {fmtMinor(k.amountMinor, k.ccy)}
              </text>
            )}
            {isRecipient && state && (
              <text className="city-sub" x={x + LABEL[c].dx} y={y + 42} textAnchor={LABEL[c].anchor} style={{ fill: 'var(--gold)' }}>
                {paidOut ? 'pot paid out here' : 'pot pays out here'}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
