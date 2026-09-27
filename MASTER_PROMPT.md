# Master prompt — start building Kitty

Open a new Claude Code session in `C:\Users\DELL 5420\Desktop\hackathons\kitty` and paste the master prompt below.
It lays the foundation everyone else builds on. After that, each teammate pastes their **role prompt** (A, B or C)
into their own session for each day in `docs/ROADMAP.md`.

---

## ▶ Master prompt: the foundation (paste this first)

```
Read CLAUDE.md, then docs/STRATEGY.md, docs/ARCHITECTURE.md and docs/ROADMAP.md before doing anything.

We are building Kitty for the StacStart "Build Without Borders" hackathon (FinTech & Commerce track).
Team build. Deadline 2026-09-28 23:59 WAT; internal submit 18:00 WAT. The rubric is 35% "does the live
demo function smoothly", so reliability beats breadth in every decision.

Kitty runs savings circles (ajo/susu/chama) whose members live across Nigeria, Kenya, Uganda and Ghana.
Each member pays on their own local payment service (Paystack NG, M-Pesa Daraja KE, MTN MoMo UG+GH, all sandbox/test),
and each pot pays out on the recipient's own service. A double-entry multi-currency ledger records every
cross-border fact in fx:position:<ccy> accounts — that IS the netting engine. In a balanced circle the net
value crossing a border over a full cycle is zero.

Lay the foundation. Do exactly this, in order, and stop at the end to report:

1. Scaffold Next.js 16 + TypeScript (App Router) BY HAND. create-next-app refuses this folder because it
   contains docs. Write package.json, tsconfig.json and next.config.ts yourself, then
   `npm i next react react-dom` and `npm i -D typescript @types/node @types/react vitest`.
   Add only `postgres` (the porsager driver) beyond that for now. Use npm, never pnpm. Minimal dependencies.

2. Write SQL migrations in db/migrations for exactly the tables in docs/ARCHITECTURE.md §3, plus a
   deferred constraint trigger that rejects any journal whose lines do not sum to zero PER CURRENCY
   (Invariant 1). Add scripts/migrate.mjs.

3. Build src/lib/ledger: postJournal(kind, ref, lines[]) with bigint minor units, balance(account, ccy),
   and the account-naming helpers from ARCHITECTURE.md §4. Pure logic separated from the DB call so
   it is unit-testable.

4. Build src/lib/fx: take a snapshot from https://open.er-api.com/v6/latest/USD (NGN, KES, UGX, GHS),
   store it, fall back to data/fx-fallback.json. Conversion uses integer rationals, never floats.
   Respect minor units: NGN 2, KES 2, UGX 0, GHS 2.

5. Build src/lib/netting as a pure function over ledger balances: gross_cross_border,
   net_cross_border, pool_health (ARCHITECTURE.md §4).

6. Write vitest tests that PROVE the pitch before any provider exists:
   - every posted journal balances per currency (Invariant 1)
   - a simulated 4-member, 4-round circle (one member per country, $50 each, constant FX snapshot)
     posts contribution → conversion → payout journals. With a test snapshot whose rates convert
     exactly, after round 4 every fx:position balance is exactly 0 (Invariant 2). With realistic
     rates, each residual is at most one minor unit per conversion and is reported as rounding. In
     both cases the naive gross cross-border total is $600.
   - a payout that would take a cash:<rail> pool below zero is refused (Invariant 3)
   - posting the same provider event twice creates one journal (idempotency)

7. Define the RailAdapter interface in src/lib/rails/types.ts exactly as ARCHITECTURE.md §2, with
   empty stubs for paystack.ts, daraja.ts, momo.ts and replay.ts. No provider calls yet.

8. Add a GitHub Actions workflow: npm ci, typecheck, vitest. Add an MIT LICENSE.

9. Add a boot-time guard: if PAYSTACK_SECRET_KEY is set and does not start with sk_test_, throw.

Constraints:
- Money is bigint minor units everywhere. No floats near amounts.
- No UI beyond a placeholder page today. No agent today.
- Secrets only in .env (gitignored). .env.example already lists every variable.
- Do not add AI attribution trailers to any commit.

When done, run the tests and report exactly what passes, with the real output. If Invariant 2 does
not hold in the simulation, stop and tell me: the pitch depends on it, so the model is wrong and must be fixed
before anything is built on top of it.
```

---

## ▶ Role A: payment rails and ledger

```
Read CLAUDE.md and docs/ARCHITECTURE.md §2–§5.

Implement the rail adapters against the RailAdapter interface, one at a time, each verified against
the real sandbox before moving on:

1. paystack.ts (NG): transaction/initialize for collect; webhook route app/api/webhooks/paystack
   verifying x-paystack-signature (HMAC-SHA512 of the RAW body) and then transaction/verify before
   journaling; transferrecipient + transfer for payout.
2. daraja.ts (KE): cached OAuth token; STK push (Password = base64(shortcode+passkey+timestamp),
   Nairobi-time timestamp, whole-shilling Amount); callback route; stkpushquery polling as the
   PRIMARY status path; B2C v3 payout.
3. momo.ts (UG + GH): scripts/momo-provision.mjs to create API users/keys for Collections and
   Disbursements; requesttopay + status polling; disbursement transfer. Sandbox is EUR-only: store
   UGX/GHS in the ledger and send the EUR equivalent at the round's FX snapshot, recording both.

Every provider call is written to provider_calls. Webhooks insert into provider_events first
(primary key = idempotency). Then build src/lib/rounds (state machine, payout order by reputation,
withhold rule) and GET /api/rounds/:id that reconciles pending provider statuses on read.

After each adapter, run one real sandbox call and paste me the provider reference. Do not mark an
adapter done on mocked responses.
```

## ▶ Role B: dashboard and UI

```
Read CLAUDE.md, docs/ARCHITECTURE.md §1 and §7, and docs/DEMO.md.

Build:
- /c/[circleId]: members (country flag, rail, reputation, paid/unpaid for this round), the
  current round, a Pay button that calls the member's rail, and a chat panel slot for the agent.
- /dashboard: an inline SVG of Africa with four city nodes (Lagos, Nairobi, Kampala, Accra) and
  animated flows as contributions land; a ledger panel showing journal lines as they post (visibly
  balancing per currency); the netting meter "Moved $X · Crossed a border $Y (Z%)"; per-country
  pool health.
- Judge mode buttons: "Run a round", "Run full cycle", "Reset demo". Any step served by replay shows
  a visible `replay` badge. Replay is never silent.

No map or animation libraries: SVG + CSS only. Poll the round endpoint every 1.5 s. It must look
right at 360 px wide and on a projector. Check every screen against docs/DEMO.md beat by beat.
```

## ▶ Role C: the treasurer agent

```
Read CLAUDE.md and docs/ARCHITECTURE.md §6. Load the claude-api skill before writing any agent code.

Build src/lib/agent with @anthropic-ai/sdk, model from KITTY_AGENT_MODEL (claude-sonnet-5), tool use:
get_circle_status, get_my_schedule, record_promise, prepare_payment, confirm_payment, exactly as
specified. prepare_payment only creates a pending_actions token. confirm_payment is valid only when
the SAME member explicitly said yes after the prepare, before expiry. The server derives every
amount, and the model never supplies one. Tools are scoped to the caller's circle.

Expose it at POST /api/agent (the web chat panel on /c/[circleId] is the primary channel). The agent
answers in the member's language; test English, Nigerian Pidgin ("I go pay Friday abeg") and Swahili.
Write tests that try to make it pay without confirmation, pay for another member, or pay a
different amount, and prove every attempt fails server-side.

Stretch, only after the web chat is solid: route the WhatsApp Cloud API test number to the same
agent function.
```

---

## ▶ D3 evening / D4: freeze and submit

```
Read docs/RULES.md and docs/DEMO.md. Feature freeze is in effect, so do not add functionality.

1. Run judge mode end to end three times against the live URL and list every failure.
2. Fix only failures, empty states and error states.
3. Finish README.md: architecture diagram, judge guide (what to click, what you'll see), what's
   real vs replay, honest limits, team, tech stack.
4. Work through the "Final checklist before pressing submit" in docs/RULES.md and tell me which items
   are not yet satisfied. Verify every public link from a logged-out browser.
```

---

## Tips for driving these sessions

- **Paste one prompt at a time.** They're deliberately narrow; widening them is how scope creeps in.
- The master prompt's Invariant 2 test is the go/no-go for the whole concept. It's pure math, so it should pass on day one.
- Keep `CLAUDE.md` Status updated. It's the first thing a fresh session reads, and teammates' sessions share it through the repo.
