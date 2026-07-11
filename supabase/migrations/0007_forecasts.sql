create table app.forecast_runs (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references app.outlets(id) on delete cascade,
  generated_at timestamptz not null default now(),
  data_quality text not null check (data_quality in ('healthy', 'degraded', 'unreliable')),
  model_confidence numeric(5,4) not null check (model_confidence >= 0 and model_confidence <= 1),
  limiting_resource text,
  evidence jsonb not null,
  output jsonb not null
);

create table app.forecast_points (
  id uuid primary key default gen_random_uuid(),
  forecast_run_id uuid not null references app.forecast_runs(id) on delete cascade,
  provider_id uuid references app.providers(id) on delete restrict,
  resource text not null check (resource in ('shared_cash', 'provider_efloat')),
  horizon_minutes integer not null check (horizon_minutes in (30, 60, 120, 240)),
  projected_low_minor bigint not null check (projected_low_minor >= 0),
  projected_high_minor bigint not null check (projected_high_minor >= 0),
  projected_mid_minor bigint not null check (projected_mid_minor >= 0),
  risk_band text not null check (risk_band in ('low', 'moderate', 'high', 'critical')),
  reserve_eta_minutes integer,
  likely_depletion_eta_minutes integer,
  check ((resource = 'shared_cash' and provider_id is null) or (resource = 'provider_efloat' and provider_id is not null))
);

create index forecast_runs_outlet_generated_idx on app.forecast_runs(outlet_id, generated_at desc);
create index forecast_points_run_resource_idx on app.forecast_points(forecast_run_id, resource, provider_id);

alter table app.forecast_runs enable row level security;
alter table app.forecast_points enable row level security;

grant select, insert on app.forecast_runs, app.forecast_points to app_api;

-- A caller can access an outlet only through an active assignment; provider-specific
-- rows require an active membership in that provider. Demo administrators retain their
-- explicitly scoped outlet access while being able to view all resources at it.
create policy cash_balances_assigned_read on app.outlet_cash_balances for select to app_api
  using (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = outlet_cash_balances.outlet_id
        and assignment.is_active
    )
  );

create policy provider_balances_scoped_read on app.provider_balances for select to app_api
  using (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      join app.provider_memberships membership
        on membership.user_id = assignment.user_id
       and membership.provider_id = provider_balances.provider_id
       and membership.is_active
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = provider_balances.outlet_id
        and assignment.is_active
    )
  );

create policy transactions_scoped_read on app.transactions for select to app_api
  using (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      join app.provider_memberships membership
        on membership.user_id = assignment.user_id
       and membership.provider_id = transactions.provider_id
       and membership.is_active
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = transactions.outlet_id
        and assignment.is_active
    )
  );

create policy quality_incidents_scoped_read on app.data_quality_incidents for select to app_api
  using (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = data_quality_incidents.outlet_id
        and assignment.is_active
    ) or (
      outlet_id is null and exists (
        select 1 from app.provider_memberships membership
        where membership.user_id = app.current_user_id()
          and membership.provider_id = data_quality_incidents.provider_id
          and membership.is_active
      )
    )
  );

create policy forecast_runs_assigned_read on app.forecast_runs for select to app_api
  using (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = forecast_runs.outlet_id
        and assignment.is_active
    )
  );

create policy forecast_runs_assigned_insert on app.forecast_runs for insert to app_api
  with check (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = forecast_runs.outlet_id
        and assignment.is_active
    )
  );

create policy forecast_points_scoped_read on app.forecast_points for select to app_api
  using (
    exists (
      select 1 from app.forecast_runs run
      where run.id = forecast_points.forecast_run_id
    )
    and (
      app.is_demo_admin() or provider_id is null or exists (
        select 1 from app.provider_memberships membership
        where membership.user_id = app.current_user_id()
          and membership.provider_id = forecast_points.provider_id
          and membership.is_active
      )
    )
  );

create policy forecast_points_scoped_insert on app.forecast_points for insert to app_api
  with check (
    exists (
      select 1 from app.forecast_runs run
      where run.id = forecast_points.forecast_run_id
    )
  );
