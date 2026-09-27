# Kitty — Architecture

The one rule that shapes the whole design: **the demo must work for a judge clicking the live URL with no phone.**
Every provider call has a status-polling path and a labelled replay path.

---

## 1. System overview

```
                ┌──────────────────────────── Next.js 16 (App Router, TS) on Vercel ───────────────────────────┐
  Member UI  ──▶│  /c/[circleId]         circle page: members, rounds, pay button, chat                        │
  Judge      ──▶│  /dashboard            live map (4 cities), ledger, netting meter, "Run a round"             │
                │                                                                                               │
                │  lib/rails/            RailAdapter interface                                                   │
                │    paystack.ts  (NG)   collect = checkout link     payout = transfer                          │
                │    daraja.ts    (KE)   collect = STK push          payout = B2C                               │
                │    momo.ts      (UG,GH) collect = RequestToPay     payout = disbursement transfer             │
                │    replay.ts           recorded real sandbox responses, used only when KITTY_REPLAY=1         │
                │  lib/ledger/           double-entry, multi-currency journals + invariants                     │
                │  lib/rounds/           circle & round state machine, payout order                             │
                │  lib/netting/          reads fx:position balances → settlement report                         │
                │  lib/fx/               rate snapshot per round                                                │
                │  lib/agent/            AI treasurer: tools + confirmation protocol                            │
                │  app/api/webhooks/*    paystack | daraja | momo  (verify → idempotent → journal)             │
                └───────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                                                │
                                                         Postgres (Neon)
```

**Stack:** Next.js 16 + TypeScript, Postgres (Neon via the Vercel Marketplace, or Supabase Postgres). The
`postgres` driver talks to it with plain SQL migrations and no ORM. DeepSeek (OpenAI-compatible API, called with plain `fetch`, no SDK) for the agent. There is no map
library: the map is an inline SVG of Africa with four city nodes. The UI refreshes by polling (1.5 s), not WebSockets.

**Why polling:** Vercel Hobby crons only run daily, and sandbox callbacks are unreliable. So we
**reconcile on read**. `GET /api/rounds/:id` first asks each provider for the status of any
pending contribution or payout, then returns state. Webhooks are an accelerator, not a dependency.

---

## 2. Rail adapters

```ts
type Country = 'NG' | 'KE' | 'UG' | 'GH';
type Ccy = 'NGN' | 'KES' | 'UGX' | 'GHS';

interface RailAdapter {
  country: Country;
  currency: Ccy;
  collect(req: { contributionId: string; member: Member; amountMinor: bigint }):
    Promise<{ providerRef: string; nextAction?: { type: 'redirect'; url: string } | { type: 'prompt_sent' } }>;
  collectStatus(providerRef: string): Promise<'pending' | 'succeeded' | 'failed'>;
  payout(req: { payoutId: string; member: Member; amountMinor: bigint }): Promise<{ providerRef: string }>;
  payoutStatus(providerRef: string): Promise<'pending' | 'succeeded' | 'failed'>;
  parseWebhook(rawBody: string, headers: Headers): Promise<NormalizedEvent | null>; // verifies signature
}
```

Every adapter call is recorded in `provider_calls` (request, response, latency). That table is
where the replay fixtures come from, and it doubles as the audit trail shown in the UI.

### Paystack (NG, NGN, test mode)
- **Collect:** `POST https://api.paystack.co/transaction/initialize` `{ email, amount (kobo), reference, callback_url, metadata }`
  returns `authorization_url`. Test checkout lets you pick success or failure.
- **Confirm:** webhook `charge.success`. Verify `x-paystack-signature` = HMAC-SHA512(raw body, secret key).
  Double-check with `GET /transaction/verify/:reference` before journaling.
- **Payout:** `POST /transferrecipient` (type `nuban`, test bank) then `POST /transfer { source:'balance', amount, recipient, reference }`.
  **Disable transfer OTP in the dashboard.** Webhook `transfer.success` / `transfer.failed`.

### Daraja (KE, KES, sandbox)
- **Auth:** `GET https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials`, Basic `key:secret`. Cache for 55 min.
- **Collect:** `POST /mpesa/stkpush/v1/processrequest`. Fields: `BusinessShortCode 174379`, `Password = base64(shortcode + passkey + timestamp)`,
  `Timestamp YYYYMMDDHHmmss` (Africa/Nairobi), `TransactionType CustomerPayBillOnline`,
  `Amount` (**whole shillings, no cents**), `PartyA` = phone, `PartyB 174379`, `PhoneNumber`, `CallBackURL` (https), `AccountReference`, `TransactionDesc`.
  Sandbox passkey and test MSISDN (254708374149) are on the Daraja portal.
- **Confirm:** callback `Body.stkCallback.ResultCode === 0`, keyed by `CheckoutRequestID`. **Poll
  `POST /mpesa/stkpushquery/v1/query` as the primary path**, because sandbox callbacks are flaky.
- **Payout:** `POST /mpesa/b2c/v3/paymentrequest` with `OriginatorConversationID`, initiator `testapi`,
  and the `SecurityCredential` generated on the portal's test-credentials page. The result is async via `ResultURL`.

### MTN MoMo (UG + GH, sandbox, EUR)
- **Provisioning (once):** subscribe to the Collections **and** Disbursements products, which gives one key each.
  `POST /v1_0/apiuser` (`X-Reference-Id: <uuid>`) → `POST /v1_0/apiuser/<uuid>/apikey`. Do this for each product.
  Keep it in `scripts/momo-provision.mjs`.
- **Token:** `POST /collection/token/` (and `/disbursement/token/`), Basic `uuid:apiKey`.
- **Collect:** `POST /collection/v1_0/requesttopay` with headers `X-Reference-Id` (uuid), `X-Target-Environment: sandbox`
  and body `{ amount, currency:'EUR', externalId, payer:{ partyIdType:'MSISDN', partyId }, payerMessage, payeeNote }`.
  Status via `GET /collection/v1_0/requesttopay/<ref>` returns `SUCCESSFUL | PENDING | FAILED`.
  The sandbox docs list magic MSISDNs that force failure, timeout or pending. **Use one for the "late member" demo beat.**
- **Payout:** `POST /disbursement/v1_0/transfer`, same shape with `payee`.
- **Currency honesty:** the ledger stores UGX/GHS. The adapter sends the EUR equivalent at the round's
  FX snapshot and records both amounts. The UI badge reads "MoMo sandbox · settles in EUR".
  In production this would be `X-Target-Environment: mtnuganda | mtnghana`.

### Currency minor units
NGN 2 (kobo) · KES 2 in the ledger, but Daraja takes whole shillings, so round up and record the rounding · **UGX 0** · GHS 2 (pesewas).
Amounts are `bigint` minor units everywhere, and FX math uses integer rationals with no floats.

---

## 3. Data model (Postgres)

```
circles          id, name, unit_ccy ('USD'), contribution_unit_minor, period, status(draft|active|completed), created_at
members          id, circle_id, name, country, phone, email, rail, payout_position, reputation_score
rounds           id, circle_id, index, recipient_member_id, fx_snapshot_id, status(open|collecting|funded|paying|paid|withheld)
contributions    id, round_id, member_id, ccy, amount_minor, rail_amount_minor, rail_ccy, provider_ref, status, promised_for
payouts          id, round_id, member_id, ccy, amount_minor, provider_ref, status
fx_snapshots     id, taken_at, source, rates jsonb   -- USD→NGN/KES/UGX/GHS
journals         id, kind(contribution|conversion|payout|float_seed|fee), ref_type, ref_id, created_at
journal_lines    id, journal_id, account, ccy, amount_minor   -- +debit / -credit
provider_events  provider, event_id PRIMARY KEY, received_at, payload   -- idempotency
provider_calls   id, provider, op, request, response, status_code, ms, created_at
agent_messages   id, circle_id, member_id, role, content, tool_calls jsonb, created_at
pending_actions  token PRIMARY KEY, member_id, action, args jsonb, expires_at, confirmed_at
```

---

## 4. Ledger and netting (the core)

**Accounts**
- `cash:<rail>:<ccy>`: money sitting at the provider (asset). One per country pool.
- `circle:<id>:pot:<ccy>`: what the circle holds, per currency (liability to members).
- `fx:position:<ccy>`: **Kitty's cross-border exposure per currency. This is the netting engine.**
- `equity:float:<ccy>`: seeds each pool's float.

**Invariant 1:** every journal balances **per currency**. Σ `amount_minor` grouped by `ccy` = 0.
The DB enforces this with a deferred constraint trigger, and the tests check it too.

**Contribution** (Tunde in Lagos pays ₦X):
```
cash:paystack:NGN          +X
circle:c1:pot:NGN          -X
```

**Payout** to Wanjiru in Nairobi (pot worth KES Y). First, convert every non-KES balance in the pot at the round's snapshot:
```
circle:c1:pot:NGN          +X      fx:position:NGN   -X        (NGN leg balances)
fx:position:KES            +Yx     circle:c1:pot:KES -Yx       (KES leg balances)
```
…then pay out:
```
circle:c1:pot:KES          +Y
cash:daraja:KES            -Y
```

The naira never left Nigeria (`cash:paystack:NGN` still holds it). The shillings came from Kenya's
own float. The only cross-border fact is recorded in `fx:position:*`.

**Conversion is unit-based** (decided 2026-09-26, `src/lib/ledger/entries.ts`). Each contribution is a claim of one
circle unit ($50). `X` is the local amount actually paid. `Yx` is **the snapshot price of that same $50 in KES**,
`usdToMinor(unit, KES)`, which is exactly what a Kenyan member pays. `Yx` is *not* a cross-rate of the rounded `X`: that
would carry the source currency's rounding into `fx:position` (0.5 UGX ≈ 20 kobo). With the unit rule, every `fx:position`
nets to exactly 0 over a cycle at any constant snapshot, and every pool ends at its seed. Rounding lives only in each
member's local price.

**Invariant 2 (the pitch):** in a balanced circle with a constant FX snapshot, after the final
round **every `fx:position:<ccy>` balance is 0**, apart from rounding of at most one minor unit per conversion (UGX has no
minor unit, and Daraja takes whole shillings). The rounding is posted to `fx:rounding:<ccy>` so it stays visible. With moving FX,
the residual is the FX drift, shown in the UI.

**Netting report** (`lib/netting`), per round and cumulative:
- `gross_cross_border` = what naive remittance would have sent: the value of every contribution
  from a member outside the recipient's country.
- `net_cross_border` = Σ of positive `fx:position` balances, valued in USD.
- `pool_health` per country = `cash:*` balance against the next round's payout need. A warning shows if a pool can't cover the next payout.
- Headline: **"Moved: $X · Crossed a border: $Y (Z%)"**.

**Invariant 3:** a pool can never go below zero. A payout is refused (the round becomes `withheld`) rather than overdrawing.

---

## 5. Rounds, order and default

- **Payout order:** by `reputation_score` descending, with ties broken by join time. An early pot is effectively a loan,
  so the most trusted members take it first. Show the reasoning in the UI.
- **Round lifecycle:** `open → collecting → funded → paying → paid`. A round pays only once **every** contribution
  has `succeeded`.
- **Late member:** they can record a promise (`promised_for`) through the agent. The round waits. Past the promise
  date, the round becomes `withheld` and the member's reputation drops.
- **Self-default rule:** if the round's recipient has not paid their own contribution, their pot is withheld until they cure it.
- **Reputation:** on-time rate, cure speed, completed circles. It is visible on every member row.

---

## 6. The treasurer agent

Model from `KITTY_AGENT_MODEL` (`deepseek-flash`) via DeepSeek's OpenAI-compatible `POST https://api.deepseek.com/chat/completions` with `tools` (function calling), using plain `fetch` and `DEEPSEEK_API_KEY`. No SDK dependency. The safety rules below are provider-independent: they are enforced server-side, never by the model.

**Tools** (all server-side and scoped to the caller's circle; the agent never sees other circles):
| Tool | Effect |
|---|---|
| `get_circle_status()` | round, recipient, who has and hasn't paid, pool health |
| `get_my_schedule(member_id)` | my payout round, amounts due, in my currency |
| `record_promise(member_id, round_id, date)` | sets `promised_for`, notifies the circle |
| `prepare_payment(member_id, round_id)` | creates a `pending_actions` token. **Does not move money** |
| `confirm_payment(token)` | only valid if the *same member* replied with an explicit yes after the prepare step and the token hasn't expired; fires `rail.collect` |

**Safety rules:** the LLM never supplies amounts (the server derives them), never pays out, and never
calls a provider directly. Every money action is two-step and bound to the member. The system prompt asks
the agent to answer in the member's language. English, Nigerian Pidgin and Swahili are expected.

**Channel:** a web chat panel on the circle page is **primary**, because judges can't be added to a WhatsApp test number.
The WhatsApp Cloud API test number (5 recipients) is a stretch goal behind the same agent function.

---

## 7. Judge mode

`/dashboard` has a pre-loaded circle "Lagos · Nairobi · Kampala · Accra": four members, $50 each per round, a $200 pot.
- **"Run a round"** fires real sandbox calls:
  - Daraja STK push to the sandbox test MSISDN
  - MoMo RequestToPay to sandbox MSISDNs
  - Paystack as a test checkout the judge completes in a popup
- The map animates each contribution as it lands. The recipient's payout fires, then the netting meter updates.
- **"Run full cycle"** runs four rounds and ends on the Invariant 2 screen.
- **Replay:** if a provider fails or times out (more than 20 s), the round continues from recorded *real* responses for that
  provider, and the UI shows a visible `replay` badge on that step. Replay is never silent.
- **"Reset demo"** restores the seed.

---

## 8. Environment variables

See `.env.example`. **The repo is public, so secrets live only in `.env` / Vercel env.**
