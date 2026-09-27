-- Replay (docs/ARCHITECTURE.md §7): a step served from a recorded REAL provider response, never silently.
-- rounds.replay_allowed: set by judge mode ("Run full cycle", or the judge choosing "use the recorded payment")
--   when nobody is there to complete a Paystack test checkout.
-- contributions.replay: the reason and the recorded provider_calls row it came from, shown as a `replay` badge.
alter table rounds add column replay_allowed boolean not null default false;
alter table contributions add column replay text;
