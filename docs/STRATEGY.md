# Kitty — Strategy

Researched 2026-09-24 from https://stacstart.com/hackathon, https://stacstart.com/summit and
https://luma.com/2obyd8e4. **Read this before any scope decision.**

---

## 1. The hackathon

**"Build Without Borders" (Borderless Bytes Hackathon)** by StacStart. It runs 100% virtual across Nigeria, Kenya,
Uganda and Ghana, as part of the StacStart Virtual Career Summit.

> Theme: "Build a product that solves a real African problem."

| Date (WAT/EAT) | What |
|---|---|
| 09-15 → 09-21 | Hackathon open, team formation |
| 09-22 | Build week starts |
| **09-28 23:59** | **Submission deadline** |
| 09-29 → 10-04 | Judging window |
| 10-04 | Finalists notified |
| 10-05 → 10-08 | Summit |
| **10-08** | **Grand Finale**: "pitch your project to the judging panel then jump straight into speed interviews with top employers" (40+ hiring partners) |

**Prizes:** 1st $1,000 + Priority Fast-Track Interviews · 2nd $500 + Fast-Track Interviews · 3rd $300 + Priority Fast-Track Interviews.

**Tracks:** Access & Inclusion · Future of Work · **FinTech & Commerce** ← Kitty · Civic Tech & Public
Good · Open/Wildcard ("the catch-all, not a dumping ground for weak entries").

### Rubric (verbatim)

| Criterion | Weight | Question the judges ask |
|---|---|---|
| Technical Execution | **35%** | "Is it built well and does the live demo function smoothly?" |
| Problem Fit | 25% | "Does it solve a real, meaningful problem for African users?" |
| Demo/Communication | 20% | "Is the pitch clear, compelling, and well-presented?" |
| Originality & Innovation | 20% | "Is the idea ambitious, unique, and differentiated" |

Judged by "industry experts and employer partners."

---

## 2. Track A — what triggers "judges blown away" *here*

1. **35% is reliability, not breadth.** The question is literally "does the live demo function
   smoothly." Every provider call needs a fallback, and the judge must be able to run a round
   from the live URL without a phone. That is what **judge mode** is for (`ARCHITECTURE.md` §7).
2. **The judges are employers.** The repo is read as a portfolio. A double-entry ledger with
   invariant tests, a clean adapter interface, CI and an honest README are worth more here than
   an extra screen. Winners get priority fast-track interviews, so every team member needs to be
   able to explain what they built.
3. **The panel spans four countries.** A Lagos-only product earns agreement from part of the panel.
   A product that works in **all four countries, on each one's own payment service**, gets
   agreement from every judge.
4. **The theme is in the name.** "Build Without Borders." Kitty is borderless *by construction*:
   it only makes sense across borders. That reads as the entry that understood the brief.
5. **Originality asks for "ambitious."** Single-country CRUD with one payment integration is the
   bar (see `COMPETITIVE.md`). Three real payment providers plus a netting engine clears it.
6. **One number the audience remembers.** "₦X moved. Net ₦0 crossed a border."

---

## 3. Track B — frontier tech and the unfair advantage

| Tool / pattern | What it gives Kitty | Risk |
|---|---|---|
| **Paystack test mode** | NG collections (checkout), transfers, HMAC-signed webhooks; instant keys | Currency tied to the business country (NGN). Transfers need OTP disabled in the dashboard |
| **Safaricom Daraja sandbox** | KE STK push (PIN prompt) + B2C payout; free, instant credentials (shortcode 174379) | Intermittently slow; callbacks unreliable, so we poll `stkpushquery` |
| **MTN MoMo Open API sandbox** | UG + GH collections (RequestToPay) and disbursements; self-serve keys | **Sandbox handles only EUR**; callbacks unreliable, so we poll status |
| **Claude Sonnet 5 (tool use)** | The treasurer agent: reads state, starts payments only after confirmation | Tools must be narrow; the LLM never sets amounts |
| **WhatsApp Cloud API test number** | Real WhatsApp channel without business verification | 5 recipient numbers max. **Stretch only**; the web chat is primary |
| **Spitch** | STT/TTS for Yoruba, Hausa, Igbo, Swahili | No Twi. **Cut** under the compressed timeline |
| **Multilateral netting (PAPSS principle)** | The core insight, and pure logic we own | None. This is the moat |
| open.er-api.com | Free FX for NGN/KES/UGX/GHS, no key | Label as indicative; fixed-rate file fallback |

---

## 4. Track C — five concepts considered

1. **Kitty** (FinTech). Savings circles (ajo/susu/chama) whose members live in different countries.
   Each member pays on their own local payment service and each payout lands on the recipient's
   own service. A netting engine keeps cross-border movement near zero. An AI treasurer runs the circle.
2. **Mpaka** (Civic). A companion for informal traders at Busia/Malaba (KE–UG). It calculates the
   official duty under the EAC Simplified Trade Regime, gives a QR proof of declared goods, and
   maps illegal-fee demands. Voice in Swahili and Luganda.
3. **Sauti Books** (Access & Inclusion). Market traders keep books by sending WhatsApp voice notes
   in local languages, which become a cash-flow statement a lender can read.
4. **Band A Watch** (Civic). Phones plugged into the grid act as outage sensors, giving supply hours
   per feeder. It auto-drafts a complaint to NERC (Nigeria's electricity regulator) when Band A
   customers get less than their promised 20h/day. Also covers dumsor (GH) and KPLC (KE).
5. **ProofWork** (Future of Work). A verified portfolio for remote African talent, built from GitHub,
   payment history and references, that employers can query.

## 5. Track D — stress test

| | Tech ×.35 | Fit ×.25 | Demo ×.2 | Orig ×.2 | **Total** | What kills it |
|---|---|---|---|---|---|---|
| **Kitty** | 9 | 8 | 9 | 9 | **8.75** | Three sandboxes in a short build. Mitigated by one adapter interface, status polling and labelled replay |
| Band A Watch | 7 | 9 | 7 | 9 | 7.90 | Inverters confound the core thesis; the map needs many users to look alive |
| Mpaka | 6 | 9 | 7 | 9 | 7.55 | One wrong tariff figure sinks credibility; static screens make a weak live demo |
| Sauti Books | 7 | 8 | 8 | 5 | 7.05 | Crowded category |
| ProofWork | 6 | 6 | 7 | 5 | 6.00 | "LinkedIn again"; weak African-problem fit |

---

## 6. The champion: Kitty

**Pitch line:** *"In Lagos it's ajo. In Accra, susu. In Nairobi, chama. Your circle moved abroad;
your money rails didn't."*

**Problem.** Rotating savings circles are the most common savings institution across all four
countries. Families and friend groups are now spread across Lagos, Nairobi, Kampala and Accra, and
keeping the circle going means remittances. Sending $200 to sub-Saharan Africa costs **8.78% on
average**, the most expensive region in the world, and **3 in 4 corridors cost more than 10%**
(World Bank Remittance Prices Worldwide, Q1 2025). Intra-African corridors are worse than
intercontinental ones. So the circle breaks up, or someone runs an informal FX arrangement they
can't keep track of.

**The insight.** In a balanced circle, every member pays in N contributions and receives one pot of
the same total value. **Over a full cycle, zero net value crosses any border.** The only real need is
*timing float* inside each country. Kitty collects on local services, pays out on local services,
and keeps every cross-border position in explicit FX-position accounts. The netting engine *is*
those accounts (`ARCHITECTURE.md` §4). Only the float imbalance would ever settle through a licensed
partner. It is the PAPSS principle, applied to the people's savings circles.

**Why it wins, criterion by criterion**
- *Technical (35%)*: three real payment providers across four countries, a double-entry multi-currency ledger
  with invariant tests, idempotent webhooks, a netting engine, and a tool-using agent with a
  confirmation protocol. Judge mode makes it run for judges without phones.
- *Problem fit (25%)*: a savings institution every judge recognises from home, plus a real, cited cost.
- *Demo (20%)*: a live map where four cities light up, the ledger balances, and the netting meter
  sits at "net ₦0 crossed a border."
- *Originality (20%)*: single-country ROSCA apps exist. Kitty is a fiat circle that runs on four
  countries' own payment services, netted so that almost nothing has to cross a border.

**Honest limits (say these before a judge does)**
- All money is sandbox/test money. The MoMo sandbox only handles EUR; the ledger stores UGX/GHS
  and the adapter converts.
- Kitty does not perform cross-border settlement. It produces the net settlement report a licensed
  partner would execute. In production, each country pool sits with a licensed partner.
- ROSCA default risk exists with or without borders. Kitty handles it through payout order by reputation and a
  round-level withhold rule, not by pretending it away.

**Regulation answer, rehearsed:** "We never move money across a border. Each pool is domestic and
held with a licensed provider; the only cross-border flow is the net float imbalance, settled by a
licensed partner, the way PAPSS settles between central banks."
