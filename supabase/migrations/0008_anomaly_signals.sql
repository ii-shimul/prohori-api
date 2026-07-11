-- Step 7: deterministic unusual-activity review signals and non-causal liquidity correlation.
create table app.anomaly_signals (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references app.outlets(id) on delete cascade,
  provider_id uuid not null references app.providers(id) on delete restrict,
  detector_type text not null check (detector_type in ('repeated_amount', 'abnormal_velocity')),
  detector_version text not null,
  threshold numeric not null check (threshold >= 0),
  observed_value numeric not null check (observed_value >= 0),
  baseline_value numeric not null check (baseline_value >= 0),
  score numeric(5,4) not null check (score >= 0 and score <= 1),
  source_transaction_ids jsonb not null,
  evidence_window_start timestamptz not null,
  evidence_window_end timestamptz not null,
  possible_benign_explanation text not null,
  model_confidence numeric(5,4) not null check (model_confidence >= 0 and model_confidence <= 1),
  data_quality text not null check (data_quality in ('healthy', 'degraded', 'unreliable')),
  created_at timestamptz not null default now(),
  check (evidence_window_end >= evidence_window_start),
  unique (outlet_id, provider_id, detector_type, detector_version, evidence_window_end)
);

create table app.liquidity_anomaly_correlations (
  id uuid primary key default gen_random_uuid(),
  anomaly_signal_id uuid not null unique references app.anomaly_signals(id) on delete cascade,
  forecast_run_id uuid not null references app.forecast_runs(id) on delete cascade,
  correlation_threshold numeric(5,4) not null check (correlation_threshold >= 0 and correlation_threshold <= 1),
  correlation_score numeric(5,4) not null check (correlation_score >= 0 and correlation_score <= 1),
  context text not null,
  created_at timestamptz not null default now()
);

create index anomaly_signals_outlet_provider_window_idx on app.anomaly_signals(outlet_id, provider_id, evidence_window_end desc);
create index liquidity_anomaly_correlations_forecast_idx on app.liquidity_anomaly_correlations(forecast_run_id);

alter table app.anomaly_signals enable row level security;
alter table app.liquidity_anomaly_correlations enable row level security;

grant select, insert on app.anomaly_signals, app.liquidity_anomaly_correlations to app_api;

create policy anomaly_signals_scoped_read on app.anomaly_signals for select to app_api
  using (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      join app.provider_memberships membership
        on membership.user_id = assignment.user_id
       and membership.provider_id = anomaly_signals.provider_id
       and membership.is_active
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = anomaly_signals.outlet_id
        and assignment.is_active
    )
  );

create policy anomaly_signals_scoped_insert on app.anomaly_signals for insert to app_api
  with check (
    app.is_demo_admin() or exists (
      select 1 from app.outlet_assignments assignment
      join app.provider_memberships membership
        on membership.user_id = assignment.user_id
       and membership.provider_id = anomaly_signals.provider_id
       and membership.is_active
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = anomaly_signals.outlet_id
        and assignment.is_active
    )
  );

create policy liquidity_anomaly_correlations_scoped_read on app.liquidity_anomaly_correlations for select to app_api
  using (exists (select 1 from app.anomaly_signals signal where signal.id = anomaly_signal_id));

create policy liquidity_anomaly_correlations_scoped_insert on app.liquidity_anomaly_correlations for insert to app_api
  with check (exists (select 1 from app.anomaly_signals signal where signal.id = anomaly_signal_id));
