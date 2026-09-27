-- When the current payout attempt was sent to the rail. Daraja B2C has no status query and its sandbox
-- does not reliably deliver result callbacks, so an unconfirmed B2C payout is judged by its age.
alter table payouts add column requested_at timestamptz;
