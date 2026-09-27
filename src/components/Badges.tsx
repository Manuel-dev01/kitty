'use client';
import { useState } from 'react';

/**
 * `replay` and `simulated · sandbox limit` badges. Never silent: tapping one shows the stored reason
 * (tooltips don't work on phones or in a projected demo).
 */
export function StepBadges({ replay, simulated, note }: { replay?: string | null; simulated?: string | null; note?: string | null }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!replay && !simulated && !note) return null;
  return (
    <>
      {replay && (
        <button className="badge replay" onClick={() => setOpen(open === 'r' ? null : 'r')} title={replay} aria-expanded={open === 'r'}>
          replay
        </button>
      )}
      {simulated && (
        <button className="badge sim" onClick={() => setOpen(open === 's' ? null : 's')} title={simulated} aria-expanded={open === 's'}>
          simulated · sandbox limit
        </button>
      )}
      {note && <span className="badge note">{note}</span>}
      {open && <p className="why" style={{ flexBasis: '100%' }}>{open === 'r' ? replay : simulated}</p>}
    </>
  );
}
