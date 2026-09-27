-- Treasurer agent (docs/ARCHITECTURE.md §6).
-- pending_actions.created_at: confirm_payment is valid only for a member message sent AFTER the prepare step.
-- pending_actions.circle_id: tokens are scoped to the caller's circle.
alter table pending_actions add column created_at timestamptz not null default now();
alter table pending_actions add column circle_id uuid references circles (id) on delete cascade;
-- agent_messages with member_id NULL are circle announcements (e.g. "Kofi promised to pay by Friday").
create index agent_messages_thread_idx on agent_messages (circle_id, member_id, created_at);
