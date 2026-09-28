-- Reusable card authorizations (Paystack), learned from a member's first REAL successful checkout.
-- Later collections can charge the saved card server-side with transaction/charge_authorization: a real
-- test-mode charge with its own reference, instead of replaying a recorded response.
-- Keyed by customer email (Paystack binds an authorization to the customer), so it survives "Reset demo".
create table saved_authorizations (
  provider           text not null,
  email              text not null,
  authorization_code text not null,
  card               text,           -- e.g. "visa ····4081 12/2030", for display
  source_ref         text,           -- the real transaction it was learned from
  created_at         timestamptz not null default now(),
  primary key (provider, email)
);
