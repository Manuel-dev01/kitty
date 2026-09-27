# Competitive landscape

## Inside this hackathon (public repos found 2026-09-24)

| Project | What | Stack | Signal |
|---|---|---|---|
| [PayProof](https://github.com/Kvngsw/payproof) | Escrow payment links to replace fakeable transfer screenshots ("Screenshots can be faked. Bank records can't.") | Next.js, TS, shadcn, Bun | 3 commits at the time; single country, single rail |
| [Discover / Skilxpress](https://github.com/skilxpresshackathon/stacstart-project) | Video-first marketplace for local service providers | React, Vite, Supabase, Tailwind; on Vercel | 6 commits; marketplace CRUD |

**Read:** the bar is one country, one payment integration, CRUD. Kitty clears it on three axes at once:
multi-country, multi-provider, and a ledger with provable invariants.

## Outside the hackathon

- **Single-country ajo/susu apps** (ajomoney.ng, ajo-app.com for NG + GH, Naa Sika susu in GH). They digitise
  the circle inside one country's payment system. None run a single circle across four countries' payment services.
- **On-chain ROSCAs** (several Stellar/Soroban projects). They replace the organiser with a contract. Different
  problem: they need members to hold crypto. Kitty uses the mobile money and bank accounts people already have.
- **Remittance providers** move money across borders one transfer at a time and charge per transfer. Kitty's point is that
  a circle doesn't need to move most of it at all.
- **PAPSS** (Afreximbank) nets cross-border payments between banks and central banks in local currency. Kitty borrows the
  principle for consumer savings circles. **Cite PAPSS as inspiration; never claim to be integrated with it.**

## Lines to never say

- "Nobody has digitised ajo." False, and a judge will know an app.
- "We do cross-border payments." We deliberately *don't*. That is the point.
- "Real money." Everything is sandbox/test. Say so first.
