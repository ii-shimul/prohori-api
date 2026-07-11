-- Step 9: review-only case workflow. These append-only records cannot mutate financial ledgers.
create table app.cases (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references app.outlets(id) on delete restrict,
  provider_id uuid references app.providers(id) on delete restrict,
  state text not null default 'OPEN' check (state in ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'ESCALATED', 'RESOLVED', 'CLOSED')),
  version integer not null default 1 check (version > 0),
  owner_user_id uuid references app.profiles(id) on delete set null,
  resolution_code text check (resolution_code in ('VERIFIED_NORMAL_ACTIVITY', 'DATA_QUALITY_CONFIRMED', 'ESCALATED_TO_OPERATIONS', 'NO_FURTHER_REVIEW_REQUIRED')),
  resolution_summary text,
  created_by uuid not null references app.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  closed_at timestamptz,
  check ((state in ('RESOLVED', 'CLOSED')) = (resolution_code is not null and resolution_summary is not null))
);

create table app.case_alert_links (
  case_id uuid not null references app.cases(id) on delete restrict,
  alert_id uuid not null unique references app.alerts(id) on delete restrict,
  linked_at timestamptz not null default now(),
  linked_by uuid not null references app.profiles(id) on delete restrict,
  primary key (case_id, alert_id)
);

create table app.case_events (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.cases(id) on delete restrict,
  event_type text not null check (event_type in ('CASE_CREATED', 'ACKNOWLEDGED', 'ASSIGNED', 'REASSIGNED', 'NOTE_ADDED', 'VERIFICATION_REQUESTED', 'ESCALATED', 'DISPOSITION_RECORDED', 'RESOLVED', 'CLOSED', 'REOPENED')),
  actor_user_id uuid references app.profiles(id) on delete restrict,
  old_state text,
  new_state text,
  metadata jsonb not null default '{}',
  wall_at timestamptz not null,
  simulated_at timestamptz,
  correlation_id uuid not null
);

create table app.case_notes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references app.cases(id) on delete restrict,
  author_user_id uuid not null references app.profiles(id) on delete restrict,
  body text not null check (length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table app.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references app.profiles(id) on delete restrict,
  actor_type text not null check (actor_type in ('USER', 'SYSTEM')),
  action text not null,
  target_type text not null,
  target_id uuid not null,
  provider_id uuid references app.providers(id) on delete restrict,
  outlet_id uuid references app.outlets(id) on delete restrict,
  old_state text,
  new_state text,
  safe_metadata jsonb not null default '{}',
  wall_at timestamptz not null,
  simulated_at timestamptz,
  correlation_id uuid not null
);

create table app.case_command_idempotency (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid not null references app.profiles(id) on delete cascade,
  action text not null,
  idempotency_key text not null,
  case_id uuid not null references app.cases(id) on delete restrict,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_user_id, action, idempotency_key)
);

create index cases_scope_state_idx on app.cases(outlet_id, provider_id, state, updated_at desc);
create index case_events_timeline_idx on app.case_events(case_id, wall_at, id);
create index case_notes_timeline_idx on app.case_notes(case_id, created_at, id);
create index audit_events_target_idx on app.audit_events(target_type, target_id, wall_at, id);

alter table app.cases enable row level security;
alter table app.case_alert_links enable row level security;
alter table app.case_events enable row level security;
alter table app.case_notes enable row level security;
alter table app.audit_events enable row level security;
alter table app.case_command_idempotency enable row level security;

grant select, insert, update on app.cases to app_api;
grant select, insert on app.case_alert_links, app.case_events, app.case_notes, app.audit_events, app.case_command_idempotency to app_api;

create policy cases_scoped_read on app.cases for select to app_api using (
  app.is_demo_admin() or exists (
    select 1 from app.case_alert_links link join app.alert_routes route on route.alert_id = link.alert_id
    where link.case_id = cases.id and route.recipient_user_id = app.current_user_id()
  )
);
create policy cases_scoped_insert on app.cases for insert to app_api with check (
  app.is_demo_admin() or exists (
    select 1 from app.outlet_assignments assignment
    where assignment.user_id = app.current_user_id() and assignment.outlet_id = cases.outlet_id and assignment.is_active
  )
);
create policy cases_scoped_update on app.cases for update to app_api using (
  app.is_demo_admin() or exists (select 1 from app.case_alert_links link join app.alert_routes route on route.alert_id = link.alert_id where link.case_id = cases.id and route.recipient_user_id = app.current_user_id())
) with check (true);
create policy case_links_scoped_read on app.case_alert_links for select to app_api using (exists (select 1 from app.cases c where c.id = case_id));
create policy case_links_scoped_insert on app.case_alert_links for insert to app_api with check (exists (select 1 from app.alerts a where a.id = alert_id));
create policy case_events_scoped_read on app.case_events for select to app_api using (exists (select 1 from app.cases c where c.id = case_id));
create policy case_events_scoped_insert on app.case_events for insert to app_api with check (exists (select 1 from app.cases c where c.id = case_id));
create policy case_notes_scoped_read on app.case_notes for select to app_api using (exists (select 1 from app.cases c where c.id = case_id));
create policy case_notes_scoped_insert on app.case_notes for insert to app_api with check (exists (select 1 from app.cases c where c.id = case_id));
create policy audit_events_scoped_read on app.audit_events for select to app_api using (app.is_demo_admin() or exists (select 1 from app.cases c where c.id = audit_events.target_id));
create policy audit_events_scoped_insert on app.audit_events for insert to app_api with check (actor_user_id = app.current_user_id() or actor_type = 'SYSTEM');
create policy case_idempotency_scoped_all on app.case_command_idempotency for all to app_api using (actor_user_id = app.current_user_id()) with check (actor_user_id = app.current_user_id());

create or replace function app.case_assignee_allowed(target_case_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select exists (
    select 1 from app.cases c join app.outlet_assignments a on a.outlet_id = c.outlet_id
    where c.id = target_case_id and a.user_id = target_user_id and a.is_active
      and (c.provider_id is null or exists (
        select 1 from app.provider_memberships m
        where m.user_id = target_user_id and m.provider_id = c.provider_id and m.is_active
      ))
  )
$$;
revoke all on function app.case_assignee_allowed(uuid, uuid) from public;
grant execute on function app.case_assignee_allowed(uuid, uuid) to app_api;

create or replace function app.prevent_workflow_history_mutation()
returns trigger language plpgsql as $$ begin
  raise exception 'workflow history is append-only';
end $$;
create trigger case_events_append_only before update or delete on app.case_events for each row execute function app.prevent_workflow_history_mutation();
create trigger case_notes_append_only before update or delete on app.case_notes for each row execute function app.prevent_workflow_history_mutation();
create trigger audit_events_append_only before update or delete on app.audit_events for each row execute function app.prevent_workflow_history_mutation();
