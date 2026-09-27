'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoundState } from './types';

/**
 * Polls GET /api/rounds/:id every 1.5 s (each read reconciles with the providers on the server).
 * Never overlaps requests; keeps the last good state if one poll fails.
 */
export function useRoundState(roundId: string | null, intervalMs = 1500) {
  const [state, setState] = useState<RoundState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const latest = useRef<RoundState | null>(null);

  const refresh = useCallback(async () => {
    if (!roundId || inFlight.current) return latest.current;
    inFlight.current = true;
    try {
      const res = await fetch(`/api/rounds/${roundId}`, { cache: 'no-store' });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      latest.current = body as RoundState;
      setState(body as RoundState);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
    }
    return latest.current;
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    latest.current = null;
    setState(null);
    void refresh();
    const t = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(t);
  }, [roundId, intervalMs, refresh]);

  return { state, error, refresh, latest };
}
