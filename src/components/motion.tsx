'use client';
/**
 * Motion primitives, no libraries. CountUp animates MONEY with bigint interpolation (integer steps), so no
 * float ever touches an amount. Everything honours prefers-reduced-motion.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { fmtMinor } from '@/lib/ui/format';

const reduced = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** An amount that counts from its previous value (or `from`) to the new one. */
export function CountUp({
  value,
  ccy,
  from,
  durationMs = 900,
  dropZeroCents,
}: {
  value: string | bigint;
  ccy: string;
  from?: string | bigint;
  durationMs?: number;
  dropZeroCents?: boolean;
}) {
  const target = BigInt(value);
  const [shown, setShown] = useState<bigint>(from !== undefined ? BigInt(from) : target);
  const current = useRef(shown);

  useEffect(() => {
    const start = current.current;
    if (start === target || reduced()) {
      current.current = target;
      setShown(target);
      return;
    }
    const steps = 36n;
    let step = 0n;
    let raf = 0;
    let last = performance.now();
    const perStep = durationMs / Number(steps);
    const tick = (now: number) => {
      if (now - last >= perStep) {
        last = now;
        step += 1n;
        // ease-out on the integer step count: 1 - (1 - t)^2, all in bigint
        const rem = steps - step;
        const eased = steps * steps - rem * rem; // out of steps²
        const v = start + ((target - start) * eased) / (steps * steps);
        current.current = v;
        setShown(v);
        if (step >= steps) return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return <span className="num">{fmtMinor(shown, ccy, { dropZeroCents })}</span>;
}

/** Fades and lifts its children in when they scroll into view (once). */
export function Reveal({ children, delay = 0, className = '', style }: { children: ReactNode; delay?: number; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || typeof IntersectionObserver === 'undefined') return setInView(true);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setInView(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`k-reveal ${inView ? 'k-in' : ''} ${className}`} style={{ ...style, ['--k-delay' as string]: `${delay}ms` }}>
      {children}
    </div>
  );
}

/** True for `ms` after `value` changes (not on first render): drives one-shot flashes and pops. */
export function useChanged<T>(value: T, ms = 1400) {
  const first = useRef(true);
  const prev = useRef(value);
  const [changed, setChanged] = useState(false);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prev.current === value) return;
    prev.current = value;
    setChanged(true);
    const t = setTimeout(() => setChanged(false), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return changed;
}
