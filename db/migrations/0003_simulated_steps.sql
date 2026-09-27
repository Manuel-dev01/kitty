-- A step completed by simulation because of a documented sandbox limit (never silently).
-- The real provider call is always made first; this column holds the human-readable reason, which the UI
-- shows as a `simulated · sandbox limit` badge next to the real provider reference.
alter table contributions add column simulated text;
alter table payouts add column simulated text;
