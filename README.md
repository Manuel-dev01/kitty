# Kitty

**One savings circle across four countries' payment systems, and almost no money crosses a border.**

In Lagos it's *ajo*. In Accra, *susu*. In Nairobi, *chama*. The rotating savings circle is the most common savings
institution across Nigeria, Kenya, Uganda and Ghana. But circles are now spread across borders, and sending $200 to
sub-Saharan Africa costs **8.78% on average**, with 3 in 4 corridors above 10% (World Bank RPW, Q1 2025).

Kitty lets each member contribute on the payment service they already use, and pays each pot out on the recipient's own
service:

| Country | Rail |
|---|---|
| 🇳🇬 Nigeria | Paystack |
| 🇰🇪 Kenya | M-Pesa (Daraja) |
| 🇺🇬 Uganda | MTN MoMo |
| 🇬🇭 Ghana | MTN MoMo |

**The insight:** in a balanced circle, each member pays in N contributions and receives one pot of equal value. Over a full
cycle, **zero net value crosses any border.** Kitty's double-entry ledger records every cross-border fact in explicit
FX-position accounts, and those accounts are the netting engine. The naira stays in Nigeria, the shillings in Kenya, and
only the float imbalance would ever settle through a licensed partner. It's the principle behind PAPSS, applied to
people's savings circles.

A **treasurer agent** (Claude) answers "when is my turn?", records promises like "I go pay Friday", and sends a payment
prompt only after the member confirms. It never sets amounts or moves money itself.

> Built for StacStart **Build Without Borders** · FinTech & Commerce track.

## Status

🚧 In active development. Live URL, judge guide and architecture diagram land here before submission.

## Honest limits

- Sandbox/test money only. The MTN MoMo sandbox only handles EUR; the ledger holds UGX/GHS and converts at the round's FX snapshot.
- Kitty does not perform cross-border settlement. It produces the net settlement report a licensed partner would execute.

## Docs

`docs/STRATEGY.md` · `docs/ARCHITECTURE.md` · `docs/ROADMAP.md` · `docs/DEMO.md`

## License

MIT
