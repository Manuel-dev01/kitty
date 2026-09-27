# Kitty — Roadmap

Team build. **Deadline 2026-09-28 23:59 WAT. Internal submit 18:00 WAT on 09-28.**

**Roles**
- **A: Payment rails and ledger.** Adapters, webhooks, ledger, rounds, netting.
- **B: Dashboard and UI.** Circle page, live map, ledger view, judge mode.
- **C: Agent, video and pitch.** Treasurer agent, demo script, video, README, pitch.

Each day ends on a **gate**. If a gate fails, the next morning goes to fixing it before anything new.

---

## D0 — Thu 09-24
- [ ] Team confirmed, Summit registration on Luma, #BuildWithStacStart post, rules email (`RULES.md`)
- [ ] Keys: Paystack test · Daraja sandbox app · MoMo sandbox (Collections + Disbursements) · Meta WhatsApp test number · Anthropic
- [ ] Public GitHub repo (MIT) with README stub and CI (typecheck + tests)
- [ ] Next.js skeleton deployed to Vercel (webhooks need a public https URL from day one)
- [ ] Ledger schema + migrations

**Gate 22:00:** the Paystack and Daraja sandboxes both return a successful response from our code.

## D1 — Fri 09-25
- [ ] **A:** circle/round model, ledger with Invariant 1, Paystack collect + webhook, Daraja STK push + callback + query polling
- [ ] **B:** dashboard shell, circle page, ledger view
- [ ] **C:** WhatsApp webhook echo + Claude tool loop with **read-only** tools (`get_circle_status`, `get_my_schedule`)

**Gate:** one NG contribution and one KE contribution land in the ledger via webhook/poll.

## D2 — Sat 09-26
- [ ] **A:** MoMo collections for UG + GH (EUR sandbox; the ledger holds UGX/GHS), payouts on all rails, round engine, **netting engine**
- [ ] **B:** live map (inline SVG, four cities), contribution animation, netting meter
- [ ] **C:** demo script draft, pre-loaded circle

**Gate:** one full four-country round works end to end: four contributions, one payout, ledger balanced.

## D3 — Sun 09-27
- [ ] **A:** ledger + netting tests (Invariants 1–3, idempotency), replay fixtures from `provider_calls`
- [ ] **B:** judge mode ("Run a round", "Run full cycle", "Reset demo"), replay badges, polish
- [ ] **C:** agent money actions with the confirmation protocol, reminders, promises, Pidgin/Swahili, reputation ordering, passport

**Feature freeze 20:00.** Then three full demo run-throughs, with every failure logged and fixed.

## D4 — Mon 09-28
- [ ] Record the video by **13:00** (`DEMO.md`)
- [ ] README: architecture diagram, judge guide, honest limitations
- [ ] Submission form: live URL, public repo, video, title, target audience, tech stack
- [ ] **Submit by 18:00 WAT.** 6-hour buffer to 23:59.

## Judging window — 09-29 → 10-04
- [ ] Freeze `main`. No pushes that touch money paths.
- [ ] Daily judge-mode health check on the live URL (each provider green, or replay working)

## Finale — 10-05 → 10-08
- [ ] Rehearse the live pitch against `DEMO.md`
- [ ] Each teammate prepares a 30-second "what I built" for the speed interviews
- [ ] **10-08:** finale pitch, then speed interviews
