# Kitty — working notes for Codex

StacStart **"Build Without Borders"** (Borderless Bytes) entry, **FinTech & Commerce** track. Team build.
**Deadline: 2026-09-28 23:59 WAT. Internal submit 18:00 WAT.** Finale (live pitch + speed interviews) 10-08.

Strategy and rubric: `docs/STRATEGY.md`. Technical design: `docs/ARCHITECTURE.md`. Day by day: `docs/ROADMAP.md`.
Rules and submission checklist: `docs/RULES.md`. Prior art: `docs/COMPETITIVE.md`. Demo script: `docs/DEMO.md`.
**Read `docs/STRATEGY.md` before any scope decision, and `docs/ARCHITECTURE.md` before touching money code.**

## What this is

Savings circles (ajo, susu, chama) whose members live across **Nigeria, Kenya, Uganda and Ghana**. Each member
pays on their own local payment service: **Paystack** (NG), **M-Pesa Daraja** (KE), **MTN MoMo** (UG, GH). Each pot is
paid out on the recipient's own service. A double-entry, multi-currency ledger records every cross-border fact
in `fx:position:<ccy>` accounts. Those accounts are the netting engine. In a balanced circle, **net value
crossing a border over a full cycle is zero**. An AI treasurer agent (DeepSeek, web chat, with WhatsApp as a stretch goal) handles
reminders, promises and confirmed payment prompts.

## Rubric (drives everything)

Technical Execution **35%** ("does the live demo function smoothly?") · Problem Fit 25% · Demo 20% · Originality 20%.
Judges are industry experts **and employers**, so the repo is read like a portfolio.

## Status

- ✅ Research, rubric analysis, concept, architecture, roadmap, demo script
- ✅ Foundation: Next 16 scaffold, migrations + invariant triggers, `lib/ledger`, `lib/fx`, `lib/netting`, rail
  interface + stubs, CI workflow, MIT licence. Invariants 1–3 and idempotency are tested. Conversion is **unit-based** (ARCHITECTURE §4).
  Size pool float in whole units (`3 × price($50)`), never `price($150)`.
- ✅ Infra: public repo https://github.com/Manuel-dev01/kitty (CI runs typecheck + all tests against Postgres).
  Live: https://kitty-ebon-kappa.vercel.app (public production alias; per-deploy URLs sit behind Vercel login, so never give judges those).
  Vercel project `kitty` is Git-connected, so every push to `main` deploys. The Neon DB `kitty-db` (free, iad1) is wired to Vercel env.
  **Migrations run from GitHub Actions** ("Migrate database" workflow, on push to `db/migrations/**` or by hand), because the lead's
  network blocks outbound 5432. Locally, run `vercel env pull .env.local`.
- ✅ Keys: all sandbox keys are in Vercel env (Paystack test, Daraja incl. B2C shortcode 600991, MoMo provisioned via `npm run momo:provision`, DeepSeek). Pull with `vercel env pull .env.local`. Add keys with `vercel env add`, never by editing `.env.local` (a pull overwrites it)
- ✅ Role A (rails + rounds): Paystack, Daraja and MoMo adapters are verified against the live sandboxes (`npm run test:live`).
  The rounds engine is in `lib/rounds`. `GET /api/rounds/:id` reconciles on read, the webhooks record `provider_events` first,
  and `POST /api/demo` resets the judge circle. The engine's full-cycle test on Postgres ends on "Moved $800 · Crossed a border $0".
- ⚠️ Live limits found. Both are handled by labelled simulation (see Hard constraints):
  - **Daraja sandbox:** the test MSISDN 254708374149 never approves an STK push (it ends in `1037` "No response from user"),
    so a Kenyan contribution can't succeed live without a real phone.
  - **Paystack:** payouts are refused on a Starter business ("You cannot initiate third party payouts as a starter business").
    NG collection works; judges complete a test checkout.
  - MoMo UG/GH collect and payout succeed live (EUR).
- ✅ Role B: `/dashboard` (SVG map, ledger, netting meter, pool health, Invariant 2 banner, judge mode: Run a round, Run full cycle,
  Reset demo) and `/c/[circleId]` (members, Pay per rail, chat slot). Verified at 360 px and 1440 px. **A full cycle ran live on
  production in 70 s and ended on "Moved $800 · Crossed a border $0"**, with every `fx:position` 0 and every pool back at its float.
  Replay (`rounds.replay_allowed`): in judge mode, the Paystack verify step can be served from the latest recorded REAL success
  in `provider_calls`, with a `replay` badge.
- Lesson learned live: provider webhooks and polls reconcile concurrently. Every round status change must be compare-and-set.
- ✅ Role C: the treasurer agent (`lib/agent`, `POST /api/agent`, chat on `/c/[circleId]`) runs on `deepseek-flash`. Tools are bound
  to the session member. `confirm_payment` takes no arguments and needs the member's own explicit yes, judged by the server
  (`consent.ts`). The adversarial tests are in `agent.db.test.ts`; the live English, Pidgin and Swahili run is in `agent.live.ts`.
  The late-member beat ran live on production: Kofi's Pidgin promise, then a confirmed MoMo payment.
- ✅ UI from Claude Design (`docs/design/*.dc.html`): landing `/`, circle home `/c/[id]` (with a demo "view as" menu and the
  treasurer aside), `/c/current` redirecting to the live demo circle, and the dashboard retheme (visual only). Tokens are `--k-*`
  in `globals.css`, fonts via `next/font`, shared pieces in `src/components/brand.tsx`. A production full cycle still ends on $800 / $0.
- ✅ Real rails upgrade: Paystack saved-card charges (`saved_authorizations`, `charge_authorization`) replace replay in "Run full
  cycle"; a production run showed NG real in all 4 rounds. B2C re-tested with the secret in the path: still no result callback, so that limit stands.
- ✅ Motion (`src/components/motion.tsx`, keyframes in `globals.css`); CountUp uses bigint interpolation. All of it is off under reduced motion.
- ✅ README: judge guide, the real / simulated table, architecture, tests, honest limits.
- ⬜ Video; the submission form; add teammates to the README.

## Hard constraints

- **Sandbox/test money only.** Never wire live keys. Paystack keys must start with `sk_test_`; refuse to boot otherwise.
- **Money is `bigint` minor units.** No floats anywhere near amounts. FX uses integer rationals.
- **Every journal balances per currency.** Enforced in the DB and in tests. Never "fix" a balance by hand-inserting lines.
- **Webhooks are idempotent** (`provider_events` primary key) and **signature-verified**. Reconcile-on-read polling is the primary path; webhooks only speed it up.
- **The LLM never moves money.** It never sets amounts, and every money action is `prepare_payment` → member says yes → `confirm_payment`.
- **Replay is never silent.** Any step served from recorded fixtures shows a `replay` badge.
- **Simulation is never silent, and only for documented sandbox limits** (`src/lib/rounds/sandbox-limits.ts`: the Daraja test MSISDN
  can't approve an STK push; a Paystack Starter account can't transfer; Daraja B2C sends no result callback, confirmed after 20 s).
  The real call is always made first and its reference kept.
  The step's `simulated` reason is stored and returned by the API, and the UI shows a `simulated · sandbox limit` badge. Never add a case without a live finding.
- Keep dependencies minimal and use `npm`. The lead's machine is on slow bandwidth.
- **Scaffold by hand.** `create-next-app` refuses this folder because it already contains docs. Write `package.json`, `tsconfig.json`
  and `next.config.ts` directly, then `npm i next react react-dom`.
- The repo is public, so secrets live only in `.env` and Vercel env. `.env.example` lists the names.
- Commits: **no AI attribution trailers.**

## Conventions

- **Never pitch "cross-border payments."** Pitch that **the circle doesn't need them**. Only the float imbalance settles cross-border, through a licensed partner.
- Never claim nobody has digitised ajo (single-country apps exist). Never claim a PAPSS integration (it's the inspiration).
- MoMo sandbox is EUR-only. The ledger holds UGX/GHS and the UI says "MoMo sandbox · settles in EUR". Be upfront.
- Every screen ends in a verifiable state change: a provider reference, a journal ID, a balanced ledger.

## The demo this all serves

A judge opens `/dashboard` and presses **Run a round**. Four cities light up as real sandbox payments land, the ledger
balances, the pot pays out in Nairobi from Kenya's own float. Then **Run full cycle** ends on:
**"Moved $800 · Net crossed a border: $0."**

**Protect this demo above every feature.**

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
