import type { Country } from '../ledger/types';
import { daraja } from './daraja';
import { momoGH, momoUG } from './momo';
import { paystack } from './paystack';
import type { RailAdapter } from './types';

export type * from './types';

const ADAPTERS: Record<Country, RailAdapter> = { NG: paystack, KE: daraja, UG: momoUG, GH: momoGH };

/** Each member pays and is paid on their own country's rail. */
export const railFor = (country: Country): RailAdapter => ADAPTERS[country];
