'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoundState } from './types';

const POLL_TIMEOUT_MS = 15_000;

/**
 * Polls GET /api/rounds/:id every 1.5 s (each read reconciles with the providers on the server).
 * - Never overlaps requests, and a request for a previous round can never overwrite the current one.
 * - Each poll has a timeout, so a hung request can't freeze the page.
 * - Keeps the last good state if one poll fails.
 * - `gone` becomes true when the round no longer exists (e.g. someone pressed "Reset demo"); polling stops
 *   and the page decides where to go next.
 */
export function useRoundState(roundId: string | null, intervalMs = 1500) {
  const [state, setState] = useState<RoundState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gone, setGone] = useState(false);
  const inFlight = useRef<AbortController | null>(null);
  const latest = useRef<RoundState | null>(null);
  const current = useRef(roundId);
  current.current = roundId;

  const refresh = useCallback(async () => {
    if (!roundId || inFlight.current) return latest.current;
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), POLL_TIMEOUT_MS);
    try {
      const res = await fetch(`/api/rounds/${roundId}`, { cache: 'no-store', signal: ctrl.signal });
      // A body cut short (e.g. the timeout fired mid-read) is an error, never an empty state.
      const body = await res.json().catch(() => null);
      if (current.current !== roundId) return latest.current; // the page moved on to another round
      if (res.status === 404) {
        setGone(true);
        return latest.current;
      }
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      if (!body?.round || !Array.isArray(body.contributions)) throw new Error('The server sent an incomplete answer; retrying…');
      latest.current = body as RoundState;
      setState(body as RoundState);
      setError(body.reconcileError ? `Some providers didn't answer: ${body.reconcileError}` : null);
    } catch (e) {
      if (current.current === roundId) setError(ctrl.signal.aborted ? 'The server is slow to answer; retrying…' : (e as Error).message);
    } finally {
      clearTimeout(timer);
      if (inFlight.current === ctrl) inFlight.current = null;
    }
    return latest.current;
  }, [roundId]);

  useEffect(() => {
    if (!roundId) return;
    latest.current = null;
    setState(null);
    setGone(false);
    setError(null);
    void refresh();
    const t = setInterval(() => void refresh(), intervalMs);
    return () => {
      clearInterval(t);
      inFlight.current?.abort();
      inFlight.current = null;
    };
  }, [roundId, intervalMs, refresh]);

  // Stop polling a round that no longer exists.
  useEffect(() => {
    if (!gone) return;
    inFlight.current?.abort();
  }, [gone]);

  return { state, error, gone, refresh, latest };
}
