import type { Country } from '@/lib/ui/types';

/** Inline SVG flags: emoji flags render as plain letters on Windows (and on many projectors). */
export function Flag({ country, title, size, style }: { country: Country; title?: string; size?: [number, number]; style?: React.CSSProperties }) {
  const label = title ?? country;
  return (
    <svg
      className="flag"
      viewBox="0 0 30 20"
      role="img"
      aria-label={label}
      style={size ? { width: size[0], height: size[1], flex: 'none', ...style } : style}
    >
      <title>{label}</title>
      {country === 'NG' && (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect width="10" height="20" fill="#008751" />
          <rect x="20" width="10" height="20" fill="#008751" />
        </>
      )}
      {country === 'KE' && (
        <>
          <rect width="30" height="20" fill="#fff" />
          <rect width="30" height="6" fill="#000" />
          <rect y="7" width="30" height="6" fill="#bb0000" />
          <rect y="14" width="30" height="6" fill="#006600" />
          <ellipse cx="15" cy="10" rx="3.2" ry="6" fill="#bb0000" stroke="#000" strokeWidth="0.8" />
        </>
      )}
      {country === 'UG' && (
        <>
          {['#000', '#fcdc04', '#d90000', '#000', '#fcdc04', '#d90000'].map((c, i) => (
            <rect key={i} y={(i * 20) / 6} width="30" height={20 / 6 + 0.05} fill={c} />
          ))}
          <circle cx="15" cy="10" r="3.4" fill="#fff" />
        </>
      )}
      {country === 'GH' && (
        <>
          <rect width="30" height="7" fill="#ce1126" />
          <rect y="6.67" width="30" height="6.67" fill="#fcd116" />
          <rect y="13.33" width="30" height="6.67" fill="#006b3f" />
          <polygon
            points="15,6.8 15.8,9.2 18.3,9.2 16.3,10.7 17,13.1 15,11.6 13,13.1 13.7,10.7 11.7,9.2 14.2,9.2"
            fill="#000"
          />
        </>
      )}
    </svg>
  );
}
