'use client';
/** Kitty's shared brand pieces (docs/design/*.dc.html): logo, sandbox marker, status pills, proof chips. */
import Link from 'next/link';
import { useState } from 'react';
import s from './brand.module.css';

export function Mark({ size = 28, muted = false }: { size?: number; muted?: boolean }) {
  // Four members around one circle, in the four country colours.
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      <circle cx="14" cy="14" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="14" cy="5" r="3.4" fill="#178a4c" />
      <circle cx="23" cy="14" r="3.4" fill="#c4302b" />
      <circle cx="14" cy="23" r="3.4" fill={muted ? 'var(--k-line)' : '#c99400'} />
      <circle cx="5" cy="14" r="3.4" fill={muted ? 'var(--k-line)' : '#2457b0'} />
    </svg>
  );
}

export function Logo({ small = false, wordmark = true, href = '/' }: { small?: boolean; wordmark?: boolean; href?: string }) {
  return (
    <Link href={href} className={`${s.logo} ${small ? s.small : ''}`} aria-label="Kitty home">
      <Mark size={small ? 26 : 30} />
      {wordmark && <span className={s.word}>kitty</span>}
    </Link>
  );
}

export function SandboxPill({ short = false }: { short?: boolean }) {
  return (
    <span className={`${s.sandbox} ${short ? s.small : ''}`} title="Sandbox build: real provider requests, test money only">
      <span className={s.dot} />
      {short ? 'SANDBOX' : 'SANDBOX · TEST MONEY'}
    </span>
  );
}

export type PillKind = 'paid' | 'pending' | 'unpaid' | 'promised' | 'failed' | 'neutral';

const ICON: Record<PillKind, React.ReactNode> = {
  paid: <path d="M2.5 6.2l2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />,
  pending: (
    <>
      <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 3.6V6l1.7 1.1" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  unpaid: <circle cx="6" cy="6" r="4.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 1.6" />,
  promised: (
    <>
      <rect x="1.8" y="2.6" width="8.4" height="7.6" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M1.8 5h8.4M4.2 1.4v2M7.8 1.4v2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  failed: <path d="M3.5 3.5l5 5M8.5 3.5l-5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  neutral: <circle cx="6" cy="6" r="2.4" fill="currentColor" />,
};

/** Status is never colour alone: every pill has an icon and a word. */
export function StatusPill({ kind, children, small = false }: { kind: PillKind; children: React.ReactNode; small?: boolean }) {
  return (
    <span className={`${s.pill} ${s[kind]} ${small ? s.sm : ''}`}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        {ICON[kind]}
      </svg>
      {children}
    </span>
  );
}

/** A provider reference you can copy and check with the provider. */
export function RefChip({ value, label = 'REF' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const short = value.length > 24 ? `${value.slice(0, 14)}…${value.slice(-6)}` : value;
  return (
    <button
      type="button"
      className={s.ref}
      title={`${value} (click to copy)`}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
    >
      <span className={s.refLabel}>{copied ? 'COPIED' : label}</span>
      <span className={s.refText}>{short}</span>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
        <rect x="4" y="4" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M8 2.2H2.9a.8.8 0 0 0-.8.8V8" fill="none" stroke="currentColor" strokeWidth="1.2" />
      </svg>
    </button>
  );
}

/** `replay` and `simulated · sandbox limit`, never silent: tap to read the stored reason. */
export function ProofBadges({ replay, simulated, compact = false }: { replay?: string | null; simulated?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState<'r' | 's' | null>(null);
  if (!replay && !simulated) return null;
  return (
    <>
      {replay && (
        <button type="button" className={s.badge} onClick={() => setOpen(open === 'r' ? null : 'r')} aria-expanded={open === 'r'} title={replay}>
          ↺ replay<span className={s.info}>i</span>
        </button>
      )}
      {simulated && (
        <button type="button" className={s.badge} onClick={() => setOpen(open === 's' ? null : 's')} aria-expanded={open === 's'} title={simulated}>
          <svg width="11" height="11" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 1.5L10.5 6 6 10.5 1.5 6z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          </svg>
          {compact ? 'simulated' : 'simulated · sandbox limit'}
          <span className={s.info}>i</span>
        </button>
      )}
      {open && <p className={s.why}>{open === 'r' ? replay : simulated}</p>}
    </>
  );
}

export const monoNote = s.note;
