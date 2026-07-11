-- Step 8: provider-aware, review-only alert episodes. These records never initiate financial actions.
create table app.alerts (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references app.outlets(id) on delete cascade,
  provider_id uuid references app.providers(id) on delete restrict,
  resource text check (resource in ('shared_cash', 'provider_efloat')),
  type text not null check (type in ('provider_emoney_pressure', 'shared_cash_pressure', 'unusual_activity_review', 'data_quality_issue', 'combined_review')),
  severity text not null check (severity in ('low', 'moderate', 'high', 'critical')),
  status text not null default 'open' check (status in ('open', 'acknowledged', 'assigned', 'case_created', 'resolved')),
  fingerprint text not null unique,
  episode_started_at timestamptz not null,
  last_observed_at timestamptz not null,
  occurrence_count integer not null default 1 check (occurrence_count > 0),
  message_key text not null,
  message_params jsonb not null default '{}',
  evidence jsonb not null default '{}',
  data_quality text not null check (data_quality in ('healthy', 'degraded', 'unreliable')),
  model_confidence numeric(5,4) not null check (model_confidence >= 0 and model_confidence <= 1),
  owner_user_id uuid references app.profiles(id) on delete set null,
  acknowledged_at timestamptz,
  acknowledged_by uuid references app.profiles(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((resource = 'shared_cash' and provider_id is null) or (resource = 'provider_efloat' and provider_id is not null) or resource is null)
);

create table app.alert_evidence_snapshots (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references app.alerts(id) on delete cascade,
  observed_at timestamptz not null,
  kind text not null check (kind in ('forecast', 'anomaly_signal', 'data_quality_incident', 'correlation')),
  snapshot jsonb not null
);

create table app.alert_routes (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references app.alerts(id) on delete cascade,
  recipient_user_id uuid not null references app.profiles(id) on delete cascade,
  route_kind text not null check (route_kind in ('provider_assignment', 'outlet_assignment', 'owner')),
  redacted boolean not null default false,
  created_at timestamptz not null default now(),
  unique (alert_id, recipient_user_id)
);

-- This small Step 8 coordination record is intentionally not a workflow case. Step 9
-- expands case state, notes, events, and immutable audit history.
create table app.alert_case_requests (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null unique references app.alerts(id) on delete restrict,
  requested_by uuid not null references app.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table app.alert_action_idempotency (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references app.alerts(id) on delete cascade,
  actor_user_id uuid not null references app.profiles(id) on delete cascade,
  action text not null check (action in ('acknowledge', 'assign', 'create_case')),
  idempotency_key text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (actor_user_id, action, idempotency_key)
);

create index alerts_scope_status_idx on app.alerts(outlet_id, provider_id, active, last_observed_at desc);
create index alert_routes_recipient_idx on app.alert_routes(recipient_user_id, alert_id);
create index alert_evidence_alert_idx on app.alert_evidence_snapshots(alert_id, observed_at desc);

alter table app.alerts enable row level security;
alter table app.alert_evidence_snapshots enable row level security;
alter table app.alert_routes enable row level security;
alter table app.alert_case_requests enable row level security;
alter table app.alert_action_idempotency enable row level security;

grant select, insert, update on app.alerts, app.alert_evidence_snapshots, app.alert_routes, app.alert_case_requests, app.alert_action_idempotency to app_api;

create policy alerts_scoped_read on app.alerts for select to app_api using (
  app.is_demo_admin() or exists (
    select 1 from app.alert_routes route
    where route.alert_id = alerts.id and route.recipient_user_id = app.current_user_id()
  )
);
create policy alerts_scoped_insert on app.alerts for insert to app_api with check (
  app.is_demo_admin() or exists (
    select 1 from app.outlet_assignments assignment
    where assignment.user_id = app.current_user_id() and assignment.outlet_id = alerts.outlet_id and assignment.is_active
  )
);
create policy alerts_scoped_update on app.alerts for update to app_api using (
  app.is_demo_admin() or exists (select 1 from app.alert_routes route where route.alert_id = alerts.id and route.recipient_user_id = app.current_user_id())
) with check (true);
create policy alert_evidence_scoped_read on app.alert_evidence_snapshots for select to app_api using (
  exists (select 1 from app.alerts alert where alert.id = alert_id)
);
create policy alert_evidence_scoped_insert on app.alert_evidence_snapshots for insert to app_api with check (
  exists (select 1 from app.alerts alert where alert.id = alert_id)
);
create policy alert_routes_scoped_read on app.alert_routes for select to app_api using (
  recipient_user_id = app.current_user_id() or app.is_demo_admin()
);
create policy alert_routes_scoped_insert on app.alert_routes for insert to app_api with check (
  exists (select 1 from app.alerts alert where alert.id = alert_id)
);
create policy alert_case_requests_scoped_read on app.alert_case_requests for select to app_api using (
  exists (select 1 from app.alerts alert where alert.id = alert_id)
);
create policy alert_case_requests_scoped_insert on app.alert_case_requests for insert to app_api with check (
  exists (select 1 from app.alerts alert where alert.id = alert_id)
);
create policy alert_idempotency_scoped_all on app.alert_action_idempotency for all to app_api using (
  actor_user_id = app.current_user_id()
) with check (actor_user_id = app.current_user_id());

-- Routing is derived exclusively from stored memberships and assignments, not callers.
create or replace function app.route_alert(target_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = app, pg_temp
as $$
declare
  target_provider_id uuid;
  target_outlet_id uuid;
begin
  select provider_id, outlet_id into target_provider_id, target_outlet_id
  from app.alerts where id = target_alert_id;

  insert into app.alert_routes (alert_id, recipient_user_id, route_kind, redacted)
  select target_alert_id, assignment.user_id,
    case when target_provider_id is null then 'outlet_assignment' else 'provider_assignment' end,
    target_provider_id is null
  from app.outlet_assignments assignment
  where assignment.outlet_id = target_outlet_id and assignment.is_active
    and (target_provider_id is null or exists (
      select 1 from app.provider_memberships membership
      where membership.user_id = assignment.user_id and membership.provider_id = target_provider_id and membership.is_active
    ))
  on conflict (alert_id, recipient_user_id) do nothing;
end
$$;
revoke all on function app.route_alert(uuid) from public;
grant execute on function app.route_alert(uuid) to app_api;

create or replace function app.alert_recipient_allowed(target_alert_id uuid, target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select exists (
    select 1 from app.alert_routes
    where alert_id = target_alert_id and recipient_user_id = target_user_id
  )
$$;
revoke all on function app.alert_recipient_allowed(uuid, uuid) from public;
grant execute on function app.alert_recipient_allowed(uuid, uuid) to app_api;
