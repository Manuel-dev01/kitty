-- Kitty schema. Tables exactly as docs/ARCHITECTURE.md §3.
-- Money is bigint minor units. Enums are text + CHECK so they stay easy to read and to migrate.

create table circles (
  id                      uuid primary key default gen_random_uuid(),
  name                    text not null,
  unit_ccy                text not null default 'USD' check (unit_ccy ~ '^[A-Z]{3}$'),
  contribution_unit_minor bigint not null check (contribution_unit_minor > 0),
  period                  text not null,
  status                  text not null default 'draft' check (status in ('draft', 'active', 'completed')),
  created_at              timestamptz not null default now()
);

create table members (
  id               uuid primary key default gen_random_uuid(),
  circle_id        uuid not null references circles (id) on delete cascade,
  name             text not null,
  country          text not null check (country in ('NG', 'KE', 'UG', 'GH')),
  phone            text,
  email            text,
  rail             text not null check (rail in ('paystack', 'daraja', 'momo')),
  payout_position  integer,
  reputation_score integer not null default 500 check (reputation_score between 0 and 1000),
  -- Not in §3's column list, but §5 breaks payout-order ties by join time.
  created_at       timestamptz not null default now(),
  unique (circle_id, payout_position)
);

create table fx_snapshots (
  id       uuid primary key default gen_random_uuid(),
  taken_at timestamptz not null default now(),
  source   text not null,
  -- USD -> NGN/KES/UGX/GHS as exact decimal STRINGS, never JSON numbers.
  rates    jsonb not null
);

create table rounds (
  id                  uuid primary key default gen_random_uuid(),
  circle_id           uuid not null references circles (id) on delete cascade,
  index               integer not null check (index >= 1),
  recipient_member_id uuid not null references members (id),
  fx_snapshot_id      uuid references fx_snapshots (id),
  status              text not null default 'open'
                      check (status in ('open', 'collecting', 'funded', 'paying', 'paid', 'withheld')),
  unique (circle_id, index)
);

create table contributions (
  id                uuid primary key default gen_random_uuid(),
  round_id          uuid not null references rounds (id) on delete cascade,
  member_id         uuid not null references members (id),
  ccy               text not null check (ccy in ('NGN', 'KES', 'UGX', 'GHS')),
  amount_minor      bigint not null check (amount_minor > 0),
  rail_amount_minor bigint check (rail_amount_minor > 0),
  rail_ccy          text check (rail_ccy ~ '^[A-Z]{3}$'),
  provider_ref      text,
  status            text not null default 'unpaid' check (status in ('unpaid', 'pending', 'succeeded', 'failed')),
  promised_for      date,
  unique (round_id, member_id)
);

create table payouts (
  id           uuid primary key default gen_random_uuid(),
  round_id     uuid not null references rounds (id) on delete cascade,
  member_id    uuid not null references members (id),
  ccy          text not null check (ccy in ('NGN', 'KES', 'UGX', 'GHS')),
  amount_minor bigint not null check (amount_minor > 0),
  provider_ref text,
  status       text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  unique (round_id)
);

create table journals (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('contribution', 'conversion', 'payout', 'float_seed', 'fee')),
  ref_type   text not null,
  ref_id     text not null,
  created_at timestamptz not null default now(),
  -- Second idempotency layer: one journal per (kind, ref).
  unique (kind, ref_type, ref_id)
);

create table journal_lines (
  id           bigint generated always as identity primary key,
  journal_id   uuid not null references journals (id),
  account      text not null,
  ccy          text not null check (ccy in ('NGN', 'KES', 'UGX', 'GHS')),
  amount_minor bigint not null check (amount_minor <> 0) -- +debit / -credit
);
create index journal_lines_journal_idx on journal_lines (journal_id);
create index journal_lines_account_idx on journal_lines (account, ccy);

create table provider_events (
  provider    text not null,
  event_id    text not null,
  received_at timestamptz not null default now(),
  payload     jsonb,
  primary key (provider, event_id) -- idempotency
);

create table provider_calls (
  id          bigint generated always as identity primary key,
  provider    text not null,
  op          text not null,
  request     jsonb,
  response    jsonb,
  status_code integer,
  ms          integer,
  created_at  timestamptz not null default now()
);

create table agent_messages (
  id         uuid primary key default gen_random_uuid(),
  circle_id  uuid not null references circles (id) on delete cascade,
  member_id  uuid references members (id),
  role       text not null check (role in ('user', 'assistant', 'tool')),
  content    text not null,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create table pending_actions (
  token        text primary key,
  member_id    uuid not null references members (id),
  action       text not null,
  args         jsonb not null default '{}',
  expires_at   timestamptz not null,
  confirmed_at timestamptz
);
