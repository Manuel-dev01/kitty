import { CURRENCIES, type Ccy, type Rail } from './types';

/** Money sitting at the provider (asset). One pool per rail and currency. */
export const cashAccount = (rail: Rail, ccy: Ccy) => `cash:${rail}:${ccy}`;
/** What the circle holds per currency (liability to members). */
export const potAccount = (circleId: string, ccy: Ccy) => `circle:${circleId}:pot:${ccy}`;
/** Kitty's cross-border exposure per currency. This is the netting engine. */
export const fxPosition = (ccy: Ccy) => `fx:position:${ccy}`;
/** Visible home for conversion rounding, so it never hides inside fx:position. */
export const fxRounding = (ccy: Ccy) => `fx:rounding:${ccy}`;
/** Seeds each pool's float. */
export const floatEquity = (ccy: Ccy) => `equity:float:${ccy}`;

export type ParsedAccount =
  | { type: 'cash'; rail: Rail; ccy: Ccy }
  | { type: 'pot'; circleId: string; ccy: Ccy }
  | { type: 'fx:position'; ccy: Ccy }
  | { type: 'fx:rounding'; ccy: Ccy }
  | { type: 'equity:float'; ccy: Ccy };

const isCcy = (s: string): s is Ccy => (CURRENCIES as readonly string[]).includes(s);
const isRail = (s: string): s is Rail => s === 'paystack' || s === 'daraja' || s === 'momo';

export function parseAccount(account: string): ParsedAccount {
  const p = account.split(':');
  const ccy = p[p.length - 1];
  if (isCcy(ccy)) {
    if (p.length === 3 && p[0] === 'cash' && isRail(p[1])) return { type: 'cash', rail: p[1], ccy };
    if (p.length === 4 && p[0] === 'circle' && p[1] && p[2] === 'pot') return { type: 'pot', circleId: p[1], ccy };
    if (p.length === 3 && p[0] === 'fx' && p[1] === 'position') return { type: 'fx:position', ccy };
    if (p.length === 3 && p[0] === 'fx' && p[1] === 'rounding') return { type: 'fx:rounding', ccy };
    if (p.length === 3 && p[0] === 'equity' && p[1] === 'float') return { type: 'equity:float', ccy };
  }
  throw new Error(`Unknown account: ${account}`);
}

export const isCashAccount = (account: string) => account.startsWith('cash:');
