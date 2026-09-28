# Kitty

[![CI](https://github.com/Manuel-dev01/kitty/actions/workflows/ci.yml/badge.svg)](https://github.com/Manuel-dev01/kitty/actions/workflows/ci.yml)

**One savings circle across four countries' payment systems, and no money has to cross a border.**

In Lagos it's *ajo*. In Accra, *susu*. In Nairobi, *chama*. The rotating savings circle is the most common way people save
across Nigeria, Kenya, Uganda and Ghana, but circles now live across borders. Sending $200 to sub-Saharan Africa costs
**8.78% on average**, and 3 in 4 corridors cost more than 10% (World Bank, Remittance Prices Worldwide, Q1 2025).

Kitty lets every member pay in, and get paid, on the service they already use at home:

| Country | Rail | Collect | Payout |
|---|---|---|---|
| 🇳🇬 Nigeria | Paystack | checkout, or a saved card | transfer |
| 🇰🇪 Kenya | M-Pesa (Daraja) | STK push | B2C |
| 🇺🇬 Uganda | MTN MoMo | RequestToPay | disbursement |
| 🇬🇭 Ghana | MTN MoMo | RequestToPay | disbursement |

**The insight:** in a balanced circle, every member pays in exactly what they eventually receive. Over a full cycle,
**zero net value needs to cross a border.** Kitty's double-entry ledger records each cross-border *fact* as an FX position
instead of moving money, and those positions are the netting engine. The naira stays in Nigeria and the shillings stay in
Kenya. Only a float imbalance would ever settle, through a licensed partner. That's the PAPSS principle, applied to
people's savings circles.

> Built for StacStart **Build Without Borders** · FinTech & Commerce track.

## Try it (judge guide)

**Live:** https://kitty-ebon-kappa.vercel.app. It runs on sandbox rails with test money, and no login is needed.

1. Open the **[judge dashboard](https://kitty-ebon-kappa.vercel.app/dashboard)** and press **Reset demo**. This builds the
   circle "Lagos · Nairobi · Kampala · Accra": four members, $50 each per round, a $200 pot, and payout order by reputation.
2. Press **Run a round.** Real sandbox requests go out on four rails at once. A Paystack test checkout opens for Tunde
   (card `4084 0840 8408 4081`, CVV `408`, any future expiry). You'll see:
   - each city lights up as its money lands **in its own country's pool**;
   - the ledger posts journals that visibly balance per currency;
   - the pot pays out in Nairobi from Kenya's own float.
3. Press **Run full cycle.** Four rounds, hands-free, end on **"Moved $800 · Net crossed a border: $0"**, with every
   `fx:position` at exactly zero.
4. Open **[the circle as a member](https://kitty-ebon-kappa.vercel.app/c/current)**. Use the avatar menu to view the circle as
   anyone. Chat with the **treasurer** in English, Nigerian Pidgin or Swahili: *"I go pay Friday abeg"* records a promise and
   tells the circle, and *"Abeg make I pay my own now"* → **Yes, pay** starts a real payment on that member's own rail.

Every step ends in something you can check: a provider reference (tap to copy), a journal ID, or a balanced ledger.

## What's real, and what isn't (labelled on screen, never hidden)

Every call below goes to the real provider sandbox, and every request and response is recorded in `provider_calls`.
Three steps can't complete in a sandbox. For those, the real request is still sent, its reference is kept, and the step is
completed by **labelled simulation**, with a `simulated · sandbox limit` badge that shows the reason when tapped. Each case
comes from a live finding ([`sandbox-limits.ts`](src/lib/rounds/sandbox-limits.ts)).

| Step | Status | Why |
|---|---|---|
| 🇳🇬 Paystack collect | **Real** | A test checkout, or a real server-side charge of the member's saved card (`charge_authorization`), verified with `transaction/verify` |
| 🇺🇬🇬🇭 MoMo collect and payout | **Real** | The MoMo sandbox settles in EUR: the ledger keeps UGX/GHS, and the UI says "MoMo sandbox · settles in EUR" |
| 🇰🇪 M-Pesa collect | STK push real · **approval simulated** | Safaricom's test number has no phone behind it, so every push ends in `1037` "No response from user". With a real Kenyan phone it's fully real, with no code change |
| 🇰🇪 M-Pesa B2C payout | Request real · **confirmation simulated** after 20 s | The sandbox accepts the payout (`ResponseCode 0`) but delivers no result callback, and B2C has no status query. A real callback always wins if one arrives |
| 🇳🇬 Paystack payout | Recipient real · **transfer simulated** | Paystack refuses transfers on a Starter business ("upgrade to a Registered Business"). The code is real; the account isn't |

`replay` (serving a recorded *real* provider response) exists only as a fallback. Judge mode uses it for Nigeria before
any card has been saved.

## How it works

```
 Member / judge ──▶  Next.js 16 on Vercel (App Router, TypeScript)
                     ├─ /  ·  /c/[circleId]  ·  /dashboard           UI: polls every 1.5 s
                     ├─ GET /api/rounds/:id   reconcile on read: ask each provider about anything pending,
                     │                        post the journals that follow, advance the round
                     ├─ /api/webhooks/*       verify (Paystack HMAC-SHA512 / URL secret) → provider_events first
                     │                        (idempotency) → the same reconcile (a webhook can't decide an outcome)
                     ├─ lib/rails             Paystack · Daraja · MoMo behind one RailAdapter interface
                     ├─ lib/rounds            open → collecting → funded → paying → paid | withheld
                     ├─ lib/ledger            double-entry, multi-currency, bigint minor units
                     ├─ lib/netting           gross vs net cross-border, pool health
                     ├─ lib/fx                one rate snapshot per cycle, exact rational maths
                     └─ lib/agent             DeepSeek treasurer: narrow tools, server-side consent
                                   │
                              Postgres (Neon), migrated from GitHub Actions
```

**Ledger.** Every money fact is a journal of lines on accounts: `cash:<rail>:<ccy>` (each country's pool),
`circle:<id>:pot:<ccy>`, `fx:position:<ccy>`, `fx:rounding:<ccy>` and `equity:float:<ccy>`. Amounts are `bigint` minor units,
and FX uses integer rationals, so no float ever touches money.

**Invariants, enforced in the database and in tests:**
1. Every journal balances **per currency** (a deferred constraint trigger).
2. After a full cycle at a constant snapshot, every `fx:position` is **exactly zero**. Conversion is unit-based: a
   contribution is a claim on the circle's $50 unit, so rounding never leaks into positions. Kenya's whole-shilling rounding
   is posted to `fx:rounding:KES`, where you can see it.
3. A pool never goes below zero. A payout is journaled *before* the provider call, so an overdraft is refused and the round
   is withheld; if the rail rejects the payout, the journal is reversed.

Every round status change is compare-and-set. That was found live: a MoMo webhook and a dashboard poll reconciled at the
same time, and now only one of them can move money.

**Treasurer agent (DeepSeek, tool use).** Its tools are bound to the signed-in member and circle, so the model can't name a
member, a round or an amount. `prepare_payment` only creates a token. `confirm_payment` takes no arguments, and starts the
member's own prepared payment only if **the server** reads the member's newest message as an explicit yes, sent after the
prepare step and before it expires. Tests use an adversarial scripted model to try paying without confirmation, for
someone else, and for a different amount. Every attempt is refused.

## Tests

- **Offline, and in CI against Postgres:** `npm test`. 112 tests cover:
  - the invariants, idempotency and race conditions;
  - the full 4-round cycle through the real rounds engine;
  - the sandbox limits (only the documented cases qualify);
  - agent safety and consent parsing in English, Pidgin and Swahili.
- **Live sandboxes, on demand:** `npm run test:live`. Real Paystack, Daraja and MoMo calls, the saved-card charge, and the
  DeepSeek agent in three languages.

## Run it locally

```bash
npm ci
vercel env pull .env.local        # sandbox keys (see .env.example for names)
npm run migrate                   # or the "Migrate database" GitHub Action
npm run dev
```

`npm run momo:provision` creates the MTN MoMo sandbox API users and keys. `PAYSTACK_SECRET_KEY` must be a `sk_test_` key, and
the app refuses to boot otherwise.

## Stack

Next.js 16 (App Router), React 19, TypeScript, plain CSS Modules with `next/font`, Postgres (Neon) through
[`postgres`](https://github.com/porsager/postgres), Vitest, GitHub Actions and Vercel. There's no ORM, no UI or animation
library, and no payment SDKs: each provider is called with `fetch` behind one interface.

## Honest limits

- Sandbox and test money only. No real money moves.
- Kitty doesn't perform cross-border settlement. It produces the net position a licensed partner would settle, and each
  country pool would sit with a licensed provider.
- Default risk exists with or without borders. Kitty handles it with reputation-based payout order, promises, and a
  withhold rule: a round with a missed promise is withheld and the member's reputation drops.
- The demo has no sign-in. The "view as" menu stands in for accounts.

## Docs

[Strategy](docs/STRATEGY.md) · [Architecture](docs/ARCHITECTURE.md) · [Demo script](docs/DEMO.md) · [Demo checklist](docs/DEMO_CHECKLIST.md) ·
[Design canvases](docs/design) · [Roadmap](docs/ROADMAP.md)

## Team

- Olamiye Emmanuel ([@Manuel-dev01](https://github.com/Manuel-dev01))

## License

MIT
