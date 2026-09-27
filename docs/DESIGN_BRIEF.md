# Kitty: design brief (starting prompt for Claude Design)

Paste everything below the line into Claude Design.

---

You are the product designer for **Kitty**, a fintech product we are shipping for a pan-African hackathon (StacStart "Build Without Borders", FinTech & Commerce track). The judges are industry experts and hiring employers. Design it as a real product with a clear UI/UX flow, not a hackathon mock-up. There is already a working backend and a functional but plain judge dashboard. Your job is the product experience around it.

## The product in one line
**Savings circles for people whose circle lives in different countries.** Each member pays and gets paid on their own local mobile money or bank rail, and the money never has to cross a border.

## The problem
Rotating savings circles are the most common way people save across Africa. They are called *ajo* or *esusu* in Nigeria, *susu* in Ghana and *chama* in Kenya and Uganda. Each round, everyone puts in the same amount and one member takes the whole pot, and it rotates until everyone has had a turn. Families and friend groups now live spread across Lagos, Nairobi, Kampala and Accra, and keeping a circle going across borders means remittances. Sending $200 to sub-Saharan Africa costs 8.78% on average, and 3 in 4 corridors cost more than 10% (World Bank, Q1 2025). So circles break up, or someone runs an informal FX arrangement nobody can check.

## The insight (the "aha" the UI must make obvious)
In a balanced circle, every member pays in the same total they eventually receive. **Over a full cycle, zero net value needs to cross any border.** Kitty collects each member's contribution on their own country's rail: Paystack in Nigeria, M-Pesa in Kenya, MTN MoMo in Uganda and Ghana. It pays each pot out from the recipient's own country pool. A double-entry ledger records the cross-border *fact* as an FX position instead of moving money. After four rounds the headline reads: **"Moved $800 · Net crossed a border: $0."**

Language rule: never say "cross-border payments". Say **"your money stays home"** and **"the circle doesn't need cross-border payments."** Only the float imbalance would ever settle, through a licensed partner.

## Who uses it
1. **Tunde (Lagos, member):** pays ₦ with Paystack. He wants to know what he owes, when, and whether everyone else paid.
2. **Wanjiru (Nairobi, member, first to receive):** pays and receives KSh on M-Pesa. She wants to see the pot coming and trust it will land.
3. **Kofi (Accra, the late member):** pays GH₵ on MTN MoMo. He sometimes needs to promise a date ("I go pay Friday abeg") without losing face.
4. **The organiser:** starts the circle, invites members from four countries, and watches everyone pay.
5. **The judge (hackathon only):** opens a dashboard with no phone and presses "Run a round" to watch real sandbox payments land across four cities.

## Screens and flows to design (in priority order)
**P0: must exist for the demo**
1. **Landing page.** The hook: "In Lagos it's ajo. In Accra, susu. In Nairobi, chama. Your circle moved abroad; your money rails didn't." Explain the insight visually, without jargon: four cities, each paying locally, and a "net crossed a border: $0" moment. Include how it works in three steps, trust and honesty (sandbox, licensed partners), and CTAs to "Start a circle" and "See a live round" (judge dashboard).
2. **Circle home (member view, mobile-first).** The current round (e.g. "Round 2 of 4"), who receives this pot and when, and every member's status (paid, pending, late, promised a date) with their country and rail. The payout order explained as "most trusted first; an early pot is effectively a loan". Shows *my* amount due in *my* currency, a big **Pay** button, and a "this circle so far" netting summary.
3. **Pay flows, one per rail, each with clear waiting states.**
   - **Paystack (NG):** opens a checkout window.
   - **M-Pesa (KE):** "Check your phone and enter your PIN". This is an STK push, so show a waiting screen with a timer.
   - **MTN MoMo (UG/GH):** an approval prompt on the phone.
   - States for all three: sent, waiting, succeeded, failed or timed out, retry.
   - Always show a **provider reference** after a payment. Every screen should end in something verifiable.
4. **Treasurer chat.** An AI treasurer inside the circle, as a panel or tab on circle home. It speaks English, Nigerian Pidgin and Swahili. The key pattern is **confirm before money moves**. The treasurer proposes ("Pay ₦66,438.90 now with Paystack?") as a confirmation card with Yes/No, and only the member's "yes" starts the payment. It can also record a promise ("Friday, 2 Oct") and tell the circle. Design the promise card, the confirmation card, and the payment-started card that carries the reference.
5. **Payout moment.** The recipient's view when the pot lands: amount in their currency, "paid from Kenya's own pool", and the reference. Make this a celebratory but trustworthy moment.
6. **Judge dashboard.** A redesign of the existing one, described under "Existing screens" below.

**P1: nice to have**
7. **Start a circle:** name, contribution per round (a USD unit such as $50, shown in each member's local currency), period, and invite members by country and phone or email.
8. **Join a circle** from an invite link: see the circle, your local amount, your rail, and your payout position.
9. **Circle ledger and transparency:** the plain-language story of where the money is, with the underlying journal as an expandable "for the curious" view.
10. **Member reputation or passport:** on-time rate and completed circles. This is what earns an earlier payout position.

## Existing screens you are redesigning (keep their information and meaning)
The judge dashboard at `/dashboard` currently has:
- **Top bar:** circle name, "Round N of 4 · status", and buttons **Run a round**, **Run full cycle**, **Reset demo**.
- **Map:** an inline SVG of Africa with 4 city nodes (Lagos, Accra, Kampala, Nairobi). A node pulses while a payment prompt is out and fills when the money lands in its own country pool. Dashed arcs between cities mean "recorded FX position, **no money crossed**".
- **Contributions list:** a flag, name, city, rail, reputation, local amount, a status pill and the provider reference for each member. The recipient is highlighted as "receives the pot".
- **Netting meter:** "Moved $X · Crossed a border $Y (Z%)" against "Naive remittance would have sent $600 across borders".
- **Pool health:** each country's pool (e.g. `cash:paystack:NGN`) and whether it covers the next payout.
- **Ledger:** journals as they post (contribution, conversion, payout), each showing its lines and "Σ NGN 0 ✓" to prove it balances per currency.
- **Invariant 2 banner** at the end: "Moved $800 · Net crossed a border: $0", with each fx:position = 0 ✓.
- **Activity log.**

## Honesty requirements (non-negotiable, and visible in the UI)
- Everything runs on **sandbox/test money**. Say so tastefully (a small persistent "Sandbox" marker).
- Some steps can't complete in a sandbox. They are labelled, never hidden:
  - **`replay`**: served from a recorded real provider response.
  - **`simulated · sandbox limit`**: a documented sandbox limit, such as Safaricom's test number having no phone to enter a PIN. The real request is still sent and its reference shown.
  - Design these badges so they are clear but don't look like errors. Tapping one reveals the reason.
- The MoMo sandbox settles in EUR. Show a subtle note "MoMo sandbox · settles in EUR" next to UG/GH payments, including the rail amount (e.g. "on rail €43.88").

## Content and data you can rely on (use real-looking values)
- Demo circle "Lagos · Nairobi · Kampala · Accra", 4 members, $50 each per round, a $200 pot, 4 rounds.
  - Wanjiru Kamau: Nairobi, M-Pesa, reputation 900, receives round 1.
  - Tunde Adeyemi: Lagos, Paystack, 800, round 2.
  - Nakato Namutebi: Kampala, MTN MoMo, 700, round 3.
  - Kofi Mensah: Accra, MTN MoMo, 650, round 4.
- Local amounts for $50: ₦66,438.90 · KSh 6,483.04 · USh 193,106 (no decimals) · GH₵581.60.
  - A pot is 4 × the recipient's local amount, e.g. KSh 25,932.16.
  - Kenya's M-Pesa charges whole shillings, so a KSh 6,483.04 contribution is charged as KSh 6,484.
- Headlines by round: $200 moved / $150 crossed (75%) → $400 / $200 → $600 / $150 → **$800 / $0**.
- Provider references look like `ws_CO_270920262157154708374149` (M-Pesa), `kitty-ctb-ad8d1b68…muk6kepu` (Paystack), and UUIDs for MoMo.
- Statuses:
  - round: open, collecting, funded, paying, paid, withheld;
  - contribution: unpaid, pending, succeeded, failed;
  - a member may also have "promised for <date>".

## Design constraints (it will be built exactly as designed)
- The stack is Next.js 16 (App Router) with React 19 and **plain CSS with CSS variables**. There is no Tailwind, no component library, and no map or animation libraries. Use SVG and CSS animations only. Keep dependencies at zero.
- **Mobile-first at 360 px**, and it must also read on a **projector** during a live pitch. Prefer a light, high-contrast theme, because projectors wash out dark UIs. A tasteful dark mode is optional.
- **No emoji flags**: they render as letters on Windows. Use simple inline SVG flags.
- Money uses tabular numbers, with the correct symbol and decimals per currency (₦, KSh, USh with 0 decimals, GH₵, €, $).
- Accessibility: WCAG AA contrast, 44 px touch targets, status never shown by colour alone, and motion that respects `prefers-reduced-motion`.
- The brand should feel warm, communal and trustworthy, African without clichés, and not a crypto look. Country accent colours currently in use: Nigeria green `#178a4c`, Kenya red `#c4302b`, Uganda gold `#c99400`, Ghana blue `#2457b0`, with an ink/cream base.

## What I want from you
1. A short **design direction**: brand feel, typography, colour tokens as CSS variables, iconography, and motion principles.
2. The **user flow** connecting the screens above, from landing through first payout.
3. **High-fidelity screens** for every P0 item at mobile (360 px) and desktop (1440 px), including the loading, empty, waiting, failed and "simulated/replay" states.
4. A small **component set**: status pill, member row, amount due card, pay button per rail, confirmation card, promise card, provider-reference chip, replay and simulated badges, netting meter, pool card, journal card, and city node.
5. Then P1 screens if there is time.

Start with the design direction and the landing page plus circle home, and I'll review before you go further.
