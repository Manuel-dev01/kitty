-- Ledger invariants enforced by the database itself (docs/ARCHITECTURE.md §4).
-- The app checks the same rules first; these triggers are the backstop that nothing can bypass.

-- Invariant 1: every journal balances PER CURRENCY. Deferred to commit so a journal can be inserted line by line.
create function kitty_journal_balanced() returns trigger language plpgsql as $$
declare
  bad text;
begin
  select string_agg(ccy || ' ' || total::text, ', ' order by ccy) into bad
  from (
    select ccy, sum(amount_minor) as total
    from journal_lines
    where journal_id = new.journal_id
    group by ccy
    having sum(amount_minor) <> 0
  ) t;
  if bad is not null then
    raise exception 'journal % does not balance per currency (%)', new.journal_id, bad
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger journal_lines_balanced
  after insert on journal_lines
  deferrable initially deferred
  for each row execute function kitty_journal_balanced();

-- A journal must have lines.
create function kitty_journal_has_lines() returns trigger language plpgsql as $$
begin
  if not exists (select 1 from journal_lines where journal_id = new.id) then
    raise exception 'journal % has no lines', new.id using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger journals_have_lines
  after insert on journals
  deferrable initially deferred
  for each row execute function kitty_journal_has_lines();

-- Append-only: corrections are new balanced journals, never edits. (TRUNCATE for "Reset demo" is unaffected.)
create function kitty_append_only() returns trigger language plpgsql as $$
begin
  raise exception '% is append-only; post a correcting journal instead', tg_table_name
    using errcode = 'insufficient_privilege';
end $$;

create trigger journal_lines_append_only
  before update or delete on journal_lines
  for each row execute function kitty_append_only();

create trigger journals_append_only
  before update or delete on journals
  for each row execute function kitty_append_only();

-- Invariant 3 backstop: a cash pool never goes below zero.
-- The app takes an advisory lock per pool and refuses first; this catches anything that skips the app.
create function kitty_pool_non_negative() returns trigger language plpgsql as $$
declare
  bal bigint;
begin
  select coalesce(sum(amount_minor), 0) into bal
  from journal_lines
  where account = new.account and ccy = new.ccy;
  if bal < 0 then
    raise exception 'pool % % would go below zero (%)', new.account, new.ccy, bal
      using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger journal_lines_pool_non_negative
  after insert on journal_lines
  deferrable initially deferred
  for each row
  when (new.account like 'cash:%')
  execute function kitty_pool_non_negative();
