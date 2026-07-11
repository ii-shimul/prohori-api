-- Step 5: provider-feed quality receipts and deterministic simulator baseline/state.
alter table app.feed_batches
  add column source_at timestamptz,
  add column event_count integer not null default 0 check (event_count >= 0);

create table app.simulation_balance_baselines (
  id uuid primary key default gen_random_uuid(),
  outlet_id uuid not null references app.outlets(id) on delete cascade,
  provider_id uuid references app.providers(id) on delete cascade,
  resource text not null check (resource in ('shared_cash', 'provider_efloat')),
  amount_minor bigint not null check (amount_minor >= 0),
  check ((resource = 'shared_cash' and provider_id is null) or (resource = 'provider_efloat' and provider_id is not null)),
  unique nulls not distinct (outlet_id, provider_id, resource)
);

create table app.simulation_state (
  id text primary key check (id = 'default'),
  scenario text not null check (scenario in ('A', 'B', 'C', 'D')),
  step integer not null check (step >= 0)
);

create index feed_batches_provider_received_idx on app.feed_batches(provider_id, received_at desc);
create index data_quality_incidents_provider_detected_idx on app.data_quality_incidents(provider_id, detected_at desc);

alter table app.simulation_balance_baselines enable row level security;
alter table app.simulation_state enable row level security;

grant select, insert, update, delete on app.outlet_cash_balances, app.provider_balances,
  app.feed_batches, app.transactions, app.balance_snapshots, app.data_quality_incidents,
  app.simulation_balance_baselines, app.simulation_state to app_api;

-- Provider ingestion is service-to-service. API credentials are validated before this role
-- enters a transaction; these policies retain least-privilege DB access for future scoped reads.
create policy feed_batches_demo_admin_read on app.feed_batches for select to app_api using (app.is_demo_admin());
create policy quality_incidents_demo_admin_read on app.data_quality_incidents for select to app_api using (app.is_demo_admin());
create policy simulation_state_demo_admin_all on app.simulation_state for all to app_api using (app.is_demo_admin()) with check (app.is_demo_admin());
