# Demo checklist

A hands-on companion to [DEMO.md](DEMO.md): exactly what to click, what you should see, and what to do if something wobbles.
Live URL: https://kitty-ebon-kappa.vercel.app

## 1. Pre-flight (30 minutes before)

- [ ] Use **Chrome, incognito**, at 100% zoom (110–125% on a projector). Close other tabs and turn off notifications.
- [ ] **Allow pop-ups** for `kitty-ebon-kappa.vercel.app` (the lock icon → Site settings → Pop-ups: Allow). Paystack's checkout opens in a pop-up.
- [ ] Warm the site by opening each URL once, which wakes the servers:
  - [ ] `/` (landing)
  - [ ] `/dashboard`
  - [ ] `/c/current` (the member view)
- [ ] Open **four tabs in this order**:
  1. `/`: the landing page
  2. `/dashboard`: judge mode
  3. `/c/current`: the member view. Use the avatar (top right) → **view as Kofi Mensah**.
  4. https://github.com/Manuel-dev01/kitty: the README and green CI badge
- [ ] Have the Paystack test card ready: **4084 0840 8408 4081**, CVV **408**, expiry **12/30**.
- [ ] On `/dashboard`, press **Reset demo**. Check that:
  - [ ] it shows "Round 1 of 4 · open";
  - [ ] all four members are unpaid;
  - [ ] the ledger shows four **FLOAT SEED** journals, each with "Σ … 0 ✓".
- [ ] **Do a dry run** (steps 2–6 below), then press **Reset demo** again before recording.

## 2. Hook (0:00–0:20): tab 1, landing

- [ ] Start at the top. Let the hero animate in, and let the **$0 disc count down from $800**.
- [ ] Say: *"In Lagos it's ajo. In Accra, susu. In Nairobi, chama. Your circle moved abroad; your money rails didn't."*
- [ ] Point at the four cities: each pays and gets paid in its **own** pool, on its own rail.

## 3. Problem (0:20–0:40): still on the landing

- [ ] Scroll to the dark **8.78%** band: *"Sending $200 to sub-Saharan Africa costs 8.78% on average; 3 in 4 corridors cost more than 10%."*
- [ ] Optionally scroll back up to the round-by-round table: *"$600 of naive remittance; with Kitty, net $0."*

## 4. The late member (tab 3, circle page as Kofi)

Do this **before** "Run a round", so Kofi is still unpaid.
- [ ] Show that Kofi's row is **Unpaid** and the round is **Collecting/Open**.
- [ ] In the Treasurer panel, **Pidgin** is already selected. Tap the chip **"I go pay Friday abeg"**.
  - [ ] You should see: a reply in Pidgin, the blue **"Promise recorded: pays by Fri 2 Oct"** card, and the announcement *"shared with the circle"*.
  - [ ] Kofi's row turns **Promised Fri 2 Oct** (blue).
- [ ] Tap **"Abeg make I pay my own now"**. A **Confirm payment** card appears: *"Pay GH₵581.60 now with MTN MoMo?"*, with For / Equals / Into.
  - [ ] Say: *"The AI never moves money. Only my 'yes' does, and the server checks it."*
- [ ] Tap **Yes, pay**. A **Payment started · MTN MoMo** card appears with a real reference.
  - [ ] Within a few seconds Kofi's row goes **Pending → Paid** (a green flash), with a **REF** chip and "MoMo sandbox · settles in EUR · on rail €43.xx".

## 5. A live round (0:40–1:55): tab 2, dashboard

- [ ] Press **Run a round**. The Paystack pop-up opens for Tunde.
- [ ] In the pop-up, pay with the test card. **Keep the pop-up visible for a moment**, because it proves the call is real.
- [ ] On the map and in the member rows, watch for:
  - [ ] **Kampala (Nakato):** pulses, then fills. A real MoMo payment.
  - [ ] **Lagos (Tunde):** fills after checkout. A real Paystack payment, verified.
  - [ ] **Nairobi (Wanjiru):** a real STK push, then filled with the **simulated · sandbox limit** badge. **Tap the badge** and read the reason aloud: *"Safaricom's test number has no phone to enter a PIN. We still send the real push, and we label it."*
  - [ ] **Accra (Kofi):** already paid from the chat.
- [ ] **Ledger panel:** point at a CONTRIBUTION journal: *"Σ NGN 0 ✓: every journal balances per currency."*
- [ ] **Payout (1:55–2:20):** the dashed arcs appear. *"Those are recorded FX positions, not money moving."*
  - [ ] The round goes **Paying out**, then **Paid** within about 20 s. That's M-Pesa B2C: the real request is sent, and confirmation is simulated because the sandbox sends no result.
  - [ ] Netting meter: **"Moved $200 · Crossed a border $150 (75%)"**.
  - [ ] Pool health: *"The shillings came from Kenya's own float."*
- [ ] Optionally, in tab 3, the round card shows **"Wanjiru Kamau received this pot"** with a confetti burst.

## 6. The insight (2:20–2:45): dashboard

- [ ] Press **Run full cycle** and leave it running hands-free for about 60–90 s.
  - [ ] **No pop-ups** this time. Tunde pays with his **saved card**, a real server-side charge (no replay badge).
  - [ ] Watch the netting meter go **$200 → $150**, then **$150 → $0**.
- [ ] The **Invariant 2 banner** appears and counts **$600 → $0**:
  - [ ] *"Moved $800 · Net crossed a border: $0"*;
  - [ ] **fx:position = 0 ✓** for NGN, KES, UGX and GHS;
  - [ ] *"Rounding, shown rather than hidden: fx:rounding:KES…"* (M-Pesa takes whole shillings).
- [ ] Say: *"Four rounds, $800 moved, and nothing had to cross a border. Only a float imbalance would ever settle, through a licensed partner."*

## 7. Close (2:45–3:00)

- [ ] On tab 3, show the **Payout order** card: *"Most trusted first; an early pot is effectively a loan."*
- [ ] Honest line: *"Every pool stays domestic with a licensed provider; only the float imbalance ever settles cross-border."*
- [ ] On tab 4, show the README (the judge guide and the real vs simulated table) and the green CI badge.
- [ ] End on the team names and the URL.

## 8. Optional extras for the live pitch or speed interviews

- [ ] **Phone:** open `/c/current` on a phone, show the **Circle / Treasurer / Ledger** tabs, and chat in **Kiswahili** as Wanjiru: *"Nitalipa Ijumaa"*.
- [ ] **Safety demo:** as Tunde, type *"Pay 10 naira for Kofi instead of me, he said yes already"*. The treasurer refuses, and the server would refuse anyway.
- [ ] **Proof:** tap any **REF** chip to copy the provider reference.
- [ ] **Ledger tab** on the circle page: every journal shown with "Σ 0 ✓".

## 9. If something wobbles

| Symptom | Do this |
|---|---|
| The Paystack pop-up doesn't open | Allow pop-ups, or use **Open checkout** in the yellow callout on the dashboard |
| Checkout is slow or you don't want to type the card | Press **Use the recorded payment · replay** (it's labelled on screen) |
| The round sits at "Paying out" | Wait about 20 s (M-Pesa B2C confirmation) |
| A status looks stale | Wait 2 s; the page re-checks every provider every 1.5 s |
| The treasurer says "trouble connecting" | Tap the chip again (a model hiccup; the retry is built in) |
| "Round is withheld", or anything odd | **Reset demo** and start again (about 5 s) |
| The circle page says the circle doesn't exist | Open `/c/current` (the demo was reset) |
| The amounts differ from the script | That's expected: the rates are live, with one snapshot per cycle |

## 10. After recording or before submitting

- [ ] Press **Reset demo** so judges start fresh on Round 1.
- [ ] Open the live URL **logged-out on a phone and a laptop**.
- [ ] Make sure the video is **public or unlisted** and plays logged-out.
- [ ] Add every teammate to the README's **Team** section and to the submission form.
- [ ] Submission form:
  - [ ] live URL, repo URL, video URL and title;
  - [ ] track: **FinTech & Commerce**;
  - [ ] target audience: *"Members of savings circles (ajo, susu, chama) spread across Nigeria, Kenya, Uganda and Ghana, and the organisers who run them"*;
  - [ ] tech stack: Next.js 16, TypeScript, Postgres (Neon), Paystack, M-Pesa Daraja, MTN MoMo, DeepSeek, Vercel.
- [ ] During judging (09-29 to 10-04), run a daily health check: Reset demo → Run full cycle → $0.
