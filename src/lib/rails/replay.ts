// Replay: serves recorded REAL sandbox responses from provider_calls when KITTY_REPLAY=1 or a live call
// times out. Every replayed step must carry a visible `replay` badge. Replay is never silent.
// Not implemented yet: see docs/ARCHITECTURE.md §7.
import { stubAdapter, type RailAdapter } from './types';

export function makeReplay(inner: RailAdapter): RailAdapter {
  return stubAdapter(`replay:${inner.country}`, inner.country, inner.currency);
}
