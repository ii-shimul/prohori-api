-- Deterministic, healthy operational baseline. Every statement is independently
-- executable because cloud seed runners may execute statements in isolated sessions.
-- Catalog UUIDs are always resolved from durable app tables by stable code.
-- Workflow history is deliberately not seeded or asserted globally.

with input(code, name, status) as (values
  ('PROVIDER_A'::app.provider_code, 'bKash', 'ACTIVE'::app.provider_status),
  ('PROVIDER_B'::app.provider_code, 'Nagad', 'ACTIVE'::app.provider_status),
  ('PROVIDER_C'::app.provider_code, 'Rocket', 'ACTIVE'::app.provider_status)
)
insert into app.providers (code, name, status)
select code, name, status from input
on conflict (code) do update set name = excluded.name, status = excluded.status;

with input(code, name) as (values
  ('DHAKA_NORTH', 'Dhaka North'),
  ('DHAKA_SOUTH', 'Dhaka South'),
  ('NARAYANGANJ', 'Narayanganj')
)
insert into app.areas (code, name)
select code, name from input
on conflict (code) do update set name = excluded.name;

with input(code, area_code, name, tier, timezone, status) as (values
  ('DN-001', 'DHAKA_NORTH', 'Uttara Synthetic Outlet', 1::smallint, 'Asia/Dhaka', 'ACTIVE'::app.outlet_status),
  ('DN-002', 'DHAKA_NORTH', 'Mirpur Synthetic Outlet', 2::smallint, 'Asia/Dhaka', 'ACTIVE'::app.outlet_status),
  ('DS-001', 'DHAKA_SOUTH', 'Motijheel Synthetic Outlet', 1::smallint, 'Asia/Dhaka', 'ACTIVE'::app.outlet_status),
  ('DS-002', 'DHAKA_SOUTH', 'Dhanmondi Synthetic Outlet', 2::smallint, 'Asia/Dhaka', 'ACTIVE'::app.outlet_status),
  ('NG-001', 'NARAYANGANJ', 'Chashara Synthetic Outlet', 2::smallint, 'Asia/Dhaka', 'ACTIVE'::app.outlet_status),
  ('NG-002', 'NARAYANGANJ', 'Fatullah Synthetic Outlet', 3::smallint, 'Asia/Dhaka', 'ACTIVE'::app.outlet_status)
)
insert into app.outlets (area_id, code, name, tier, timezone, status)
select area.id, input.code, input.name, input.tier, input.timezone, input.status
from input
join app.areas area on area.code = input.area_code
on conflict (code) do update set
  area_id = excluded.area_id,
  name = excluded.name,
  tier = excluded.tier,
  timezone = excluded.timezone,
  status = excluded.status;

with input(id, display_name, locale, is_active) as (values
  ('40000000-0000-4000-8000-000000000001'::uuid, 'Agent A', 'en', true),
  ('40000000-0000-4000-8000-000000000002'::uuid, 'Operations A', 'en', true),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'Operations B', 'bn', true),
  ('40000000-0000-4000-8000-000000000004'::uuid, 'Data Steward C', 'en', true),
  ('40000000-0000-4000-8000-000000000005'::uuid, 'Validation Auditor', 'en', true),
  ('40000000-0000-4000-8000-000000000006'::uuid, 'Demo Administrator', 'en', true),
  ('40000000-0000-4000-8000-000000000007'::uuid, 'Platform Management', 'en', true)
)
insert into app.profiles (id, display_name, locale, is_active)
select id, display_name, locale, is_active from input
on conflict (id) do update set
  display_name = excluded.display_name,
  locale = excluded.locale,
  is_active = excluded.is_active;

with input(user_id, provider_code, role, is_active) as (values
  ('40000000-0000-4000-8000-000000000001'::uuid, 'PROVIDER_A'::app.provider_code, 'OUTLET_AGENT'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000002'::uuid, 'PROVIDER_A'::app.provider_code, 'PROVIDER_OPERATIONS'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'PROVIDER_B'::app.provider_code, 'PROVIDER_OPERATIONS'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000004'::uuid, 'PROVIDER_C'::app.provider_code, 'DATA_STEWARD'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000005'::uuid, 'PROVIDER_A'::app.provider_code, 'VALIDATION_AUDITOR'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000006'::uuid, 'PROVIDER_A'::app.provider_code, 'DEMO_ADMIN'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000007'::uuid, 'PROVIDER_A'::app.provider_code, 'PLATFORM_MANAGEMENT'::app.user_role, true)
)
insert into app.provider_memberships (user_id, provider_id, role, is_active)
select input.user_id, provider.id, input.role, input.is_active
from input
join app.providers provider on provider.code = input.provider_code
on conflict (user_id, provider_id, role) do update set is_active = excluded.is_active;

-- outlet_assignments has no natural unique constraint. Both statements carry their
-- own identical input and resolve all foreign keys from durable catalog tables.
with input(user_id, outlet_code, provider_code, role, is_active) as (values
  ('40000000-0000-4000-8000-000000000001'::uuid, 'DN-001', 'PROVIDER_A'::app.provider_code, 'OUTLET_AGENT'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000002'::uuid, 'DN-001', 'PROVIDER_A'::app.provider_code, 'PROVIDER_OPERATIONS'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'DS-001', 'PROVIDER_B'::app.provider_code, 'PROVIDER_OPERATIONS'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000004'::uuid, 'NG-001', 'PROVIDER_C'::app.provider_code, 'DATA_STEWARD'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000006'::uuid, 'DN-001', null::app.provider_code, 'DEMO_ADMIN'::app.user_role, true)
)
update app.outlet_assignments assignment
set is_active = input.is_active
from input
join app.outlets outlet on outlet.code = input.outlet_code
join app.areas area on area.id = outlet.area_id
left join app.providers provider on provider.code = input.provider_code
where assignment.user_id = input.user_id
  and assignment.outlet_id = outlet.id
  and assignment.area_id = area.id
  and assignment.provider_id is not distinct from provider.id
  and assignment.role = input.role;

with input(user_id, outlet_code, provider_code, role, is_active) as (values
  ('40000000-0000-4000-8000-000000000001'::uuid, 'DN-001', 'PROVIDER_A'::app.provider_code, 'OUTLET_AGENT'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000002'::uuid, 'DN-001', 'PROVIDER_A'::app.provider_code, 'PROVIDER_OPERATIONS'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000003'::uuid, 'DS-001', 'PROVIDER_B'::app.provider_code, 'PROVIDER_OPERATIONS'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000004'::uuid, 'NG-001', 'PROVIDER_C'::app.provider_code, 'DATA_STEWARD'::app.user_role, true),
  ('40000000-0000-4000-8000-000000000006'::uuid, 'DN-001', null::app.provider_code, 'DEMO_ADMIN'::app.user_role, true)
)
insert into app.outlet_assignments (user_id, outlet_id, area_id, provider_id, role, is_active)
select input.user_id, outlet.id, area.id, provider.id, input.role, input.is_active
from input
join app.outlets outlet on outlet.code = input.outlet_code
join app.areas area on area.id = outlet.area_id
left join app.providers provider on provider.code = input.provider_code
where not exists (
  select 1 from app.outlet_assignments assignment
  where assignment.user_id = input.user_id
    and assignment.outlet_id = outlet.id
    and assignment.area_id = area.id
    and assignment.provider_id is not distinct from provider.id
    and assignment.role = input.role
);

with input(outlet_code, amount_minor) as (values
  ('DN-001', 850000::bigint), ('DN-002', 620000::bigint), ('DS-001', 910000::bigint),
  ('DS-002', 740000::bigint), ('NG-001', 560000::bigint), ('NG-002', 480000::bigint)
)
insert into app.outlet_cash_balances (outlet_id, amount_minor, updated_at)
select outlet.id, input.amount_minor, '2025-12-31T09:00:00Z'::timestamptz
from input
join app.outlets outlet on outlet.code = input.outlet_code
on conflict (outlet_id) do update set amount_minor = excluded.amount_minor, updated_at = excluded.updated_at;

with input(outlet_code, provider_code, amount_minor) as (values
  ('DN-001', 'PROVIDER_A'::app.provider_code, 300000::bigint), ('DN-001', 'PROVIDER_B'::app.provider_code, 420000::bigint), ('DN-001', 'PROVIDER_C'::app.provider_code, 390000::bigint),
  ('DN-002', 'PROVIDER_A'::app.provider_code, 275000::bigint), ('DN-002', 'PROVIDER_B'::app.provider_code, 360000::bigint), ('DN-002', 'PROVIDER_C'::app.provider_code, 335000::bigint),
  ('DS-001', 'PROVIDER_A'::app.provider_code, 455000::bigint), ('DS-001', 'PROVIDER_B'::app.provider_code, 510000::bigint), ('DS-001', 'PROVIDER_C'::app.provider_code, 485000::bigint),
  ('DS-002', 'PROVIDER_A'::app.provider_code, 320000::bigint), ('DS-002', 'PROVIDER_B'::app.provider_code, 410000::bigint), ('DS-002', 'PROVIDER_C'::app.provider_code, 375000::bigint),
  ('NG-001', 'PROVIDER_A'::app.provider_code, 245000::bigint), ('NG-001', 'PROVIDER_B'::app.provider_code, 295000::bigint), ('NG-001', 'PROVIDER_C'::app.provider_code, 270000::bigint),
  ('NG-002', 'PROVIDER_A'::app.provider_code, 210000::bigint), ('NG-002', 'PROVIDER_B'::app.provider_code, 255000::bigint), ('NG-002', 'PROVIDER_C'::app.provider_code, 230000::bigint)
)
insert into app.provider_balances (outlet_id, provider_id, amount_minor, updated_at)
select outlet.id, provider.id, input.amount_minor, '2025-12-31T09:00:00Z'::timestamptz
from input
join app.outlets outlet on outlet.code = input.outlet_code
join app.providers provider on provider.code = input.provider_code
on conflict (outlet_id, provider_id) do update set amount_minor = excluded.amount_minor, updated_at = excluded.updated_at;

with input(outlet_code, provider_code, resource, amount_minor) as (values
  ('DN-001', null::app.provider_code, 'shared_cash', 850000::bigint), ('DN-002', null::app.provider_code, 'shared_cash', 620000::bigint),
  ('DS-001', null::app.provider_code, 'shared_cash', 910000::bigint), ('DS-002', null::app.provider_code, 'shared_cash', 740000::bigint),
  ('NG-001', null::app.provider_code, 'shared_cash', 560000::bigint), ('NG-002', null::app.provider_code, 'shared_cash', 480000::bigint),
  ('DN-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 300000::bigint), ('DN-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 420000::bigint), ('DN-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 390000::bigint),
  ('DN-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 275000::bigint), ('DN-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 360000::bigint), ('DN-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 335000::bigint),
  ('DS-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 455000::bigint), ('DS-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 510000::bigint), ('DS-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 485000::bigint),
  ('DS-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 320000::bigint), ('DS-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 410000::bigint), ('DS-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 375000::bigint),
  ('NG-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 245000::bigint), ('NG-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 295000::bigint), ('NG-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 270000::bigint),
  ('NG-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 210000::bigint), ('NG-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 255000::bigint), ('NG-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 230000::bigint)
)
insert into app.simulation_balance_baselines (id, outlet_id, provider_id, resource, amount_minor)
select md5('baseline:' || outlet.id || ':' || coalesce(provider.id::text, 'cash'))::uuid,
  outlet.id, provider.id, input.resource, input.amount_minor
from input
join app.outlets outlet on outlet.code = input.outlet_code
left join app.providers provider on provider.code = input.provider_code
on conflict (outlet_id, provider_id, resource) do update set amount_minor = excluded.amount_minor;

with input(id, scenario, step) as (values ('default', 'A', 0))
insert into app.simulation_state (id, scenario, step)
select id, scenario, step from input
on conflict (id) do update set scenario = excluded.scenario, step = excluded.step;

with input(id, provider_code, sequence, checksum) as (values
  ('50000000-0000-4000-8000-000000000001'::uuid, 'PROVIDER_A'::app.provider_code, 10::bigint, repeat('a', 64)),
  ('50000000-0000-4000-8000-000000000002'::uuid, 'PROVIDER_B'::app.provider_code, 10::bigint, repeat('b', 64)),
  ('50000000-0000-4000-8000-000000000003'::uuid, 'PROVIDER_C'::app.provider_code, 10::bigint, repeat('c', 64))
)
insert into app.feed_batches (id, provider_id, sequence, checksum, received_at, source_at, event_count, quality_status)
select input.id, provider.id, input.sequence, input.checksum,
  '2025-12-31T09:00:00Z'::timestamptz, '2025-12-31T08:59:00Z'::timestamptz, 12, 'healthy'
from input
join app.providers provider on provider.code = input.provider_code
on conflict (provider_id, sequence) do update set
  checksum = excluded.checksum, received_at = excluded.received_at, source_at = excluded.source_at,
  event_count = excluded.event_count, quality_status = excluded.quality_status;

with input(outlet_code, provider_code, outlet_position, provider_position) as (values
  ('DN-001', 'PROVIDER_A'::app.provider_code, 1, 1), ('DN-001', 'PROVIDER_B'::app.provider_code, 1, 2), ('DN-001', 'PROVIDER_C'::app.provider_code, 1, 3),
  ('DN-002', 'PROVIDER_A'::app.provider_code, 2, 1), ('DN-002', 'PROVIDER_B'::app.provider_code, 2, 2), ('DN-002', 'PROVIDER_C'::app.provider_code, 2, 3),
  ('DS-001', 'PROVIDER_A'::app.provider_code, 3, 1), ('DS-001', 'PROVIDER_B'::app.provider_code, 3, 2), ('DS-001', 'PROVIDER_C'::app.provider_code, 3, 3),
  ('DS-002', 'PROVIDER_A'::app.provider_code, 4, 1), ('DS-002', 'PROVIDER_B'::app.provider_code, 4, 2), ('DS-002', 'PROVIDER_C'::app.provider_code, 4, 3),
  ('NG-001', 'PROVIDER_A'::app.provider_code, 5, 1), ('NG-001', 'PROVIDER_B'::app.provider_code, 5, 2), ('NG-001', 'PROVIDER_C'::app.provider_code, 5, 3),
  ('NG-002', 'PROVIDER_A'::app.provider_code, 6, 1), ('NG-002', 'PROVIDER_B'::app.provider_code, 6, 2), ('NG-002', 'PROVIDER_C'::app.provider_code, 6, 3)
)
insert into app.transactions (
  id, provider_id, outlet_id, feed_batch_id, provider_event_id, event_version,
  type, lifecycle, amount_minor, occurred_at, idempotency_key, created_at
)
select md5('baseline:transaction:' || outlet.id || ':' || provider.id || ':' || event_number)::uuid,
  provider.id, outlet.id, feed.id,
  'baseline-' || outlet.id || '-' || provider.id || '-' || event_number, 1,
  case when event_number = 1 then 'CASH_IN'::app.transaction_type else 'CASH_OUT'::app.transaction_type end,
  'SETTLED'::app.transaction_lifecycle,
  12000 + input.outlet_position * 1300 + input.provider_position * 700 + event_number * 900,
  case when event_number = 1 then '2025-12-31T07:30:00Z'::timestamptz else '2025-12-31T08:30:00Z'::timestamptz end,
  'baseline-' || outlet.id || '-' || provider.id || '-' || event_number,
  '2025-12-31T09:00:00Z'::timestamptz
from input
join app.outlets outlet on outlet.code = input.outlet_code
join app.providers provider on provider.code = input.provider_code
join app.feed_batches feed on feed.provider_id = provider.id and feed.sequence = 10
cross join generate_series(1, 2) event_number
on conflict (provider_id, provider_event_id) do update set
  outlet_id = excluded.outlet_id, feed_batch_id = excluded.feed_batch_id, event_version = excluded.event_version,
  type = excluded.type, lifecycle = excluded.lifecycle, amount_minor = excluded.amount_minor,
  occurred_at = excluded.occurred_at, idempotency_key = excluded.idempotency_key, created_at = excluded.created_at;

with input(outlet_code, provider_code, resource, amount_minor) as (values
  ('DN-001', null::app.provider_code, 'shared_cash', 850000::bigint), ('DN-002', null::app.provider_code, 'shared_cash', 620000::bigint),
  ('DS-001', null::app.provider_code, 'shared_cash', 910000::bigint), ('DS-002', null::app.provider_code, 'shared_cash', 740000::bigint),
  ('NG-001', null::app.provider_code, 'shared_cash', 560000::bigint), ('NG-002', null::app.provider_code, 'shared_cash', 480000::bigint),
  ('DN-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 300000::bigint), ('DN-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 420000::bigint), ('DN-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 390000::bigint),
  ('DN-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 275000::bigint), ('DN-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 360000::bigint), ('DN-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 335000::bigint),
  ('DS-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 455000::bigint), ('DS-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 510000::bigint), ('DS-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 485000::bigint),
  ('DS-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 320000::bigint), ('DS-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 410000::bigint), ('DS-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 375000::bigint),
  ('NG-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 245000::bigint), ('NG-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 295000::bigint), ('NG-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 270000::bigint),
  ('NG-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 210000::bigint), ('NG-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 255000::bigint), ('NG-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 230000::bigint)
)
insert into app.balance_snapshots (id, provider_id, outlet_id, resource, amount_minor, observed_at, created_at)
select md5('baseline:snapshot:' || outlet.id || ':' || coalesce(provider.id::text, 'cash'))::uuid,
  provider.id, outlet.id, input.resource, input.amount_minor,
  '2025-12-31T09:00:00Z'::timestamptz, '2025-12-31T09:00:00Z'::timestamptz
from input
join app.outlets outlet on outlet.code = input.outlet_code
left join app.providers provider on provider.code = input.provider_code
on conflict (id) do update set
  provider_id = excluded.provider_id, outlet_id = excluded.outlet_id, resource = excluded.resource,
  amount_minor = excluded.amount_minor, observed_at = excluded.observed_at, created_at = excluded.created_at;

with input(id, outlet_code) as (values
  ('60000000-0000-4000-8000-000000000001'::uuid, 'DN-001'),
  ('60000000-0000-4000-8000-000000000002'::uuid, 'DN-002'),
  ('60000000-0000-4000-8000-000000000003'::uuid, 'DS-001'),
  ('60000000-0000-4000-8000-000000000004'::uuid, 'DS-002'),
  ('60000000-0000-4000-8000-000000000005'::uuid, 'NG-001'),
  ('60000000-0000-4000-8000-000000000006'::uuid, 'NG-002')
)
insert into app.forecast_runs (id, outlet_id, generated_at, data_quality, model_confidence, limiting_resource, evidence, output)
select input.id, outlet.id, '2025-12-31T09:00:00Z'::timestamptz, 'healthy', 0.2813, 'shared_cash',
  jsonb_build_object('activeIncidents', jsonb_build_array(), 'historyCount', 6, 'historyWindowMinutes', 240),
  jsonb_build_object('dataQuality', 'healthy', 'generatedAt', '2025-12-31T09:00:00.000Z', 'modelConfidence', 0.2813, 'outletId', outlet.id, 'resources', jsonb_build_array())
from input
join app.outlets outlet on outlet.code = input.outlet_code
on conflict (id) do update set
  outlet_id = excluded.outlet_id, generated_at = excluded.generated_at, data_quality = excluded.data_quality,
  model_confidence = excluded.model_confidence, limiting_resource = excluded.limiting_resource,
  evidence = excluded.evidence, output = excluded.output;

with input(run_id, outlet_code, provider_code, resource, amount_minor) as (values
  ('60000000-0000-4000-8000-000000000001'::uuid, 'DN-001', null::app.provider_code, 'shared_cash', 850000::bigint),
  ('60000000-0000-4000-8000-000000000002'::uuid, 'DN-002', null::app.provider_code, 'shared_cash', 620000::bigint),
  ('60000000-0000-4000-8000-000000000003'::uuid, 'DS-001', null::app.provider_code, 'shared_cash', 910000::bigint),
  ('60000000-0000-4000-8000-000000000004'::uuid, 'DS-002', null::app.provider_code, 'shared_cash', 740000::bigint),
  ('60000000-0000-4000-8000-000000000005'::uuid, 'NG-001', null::app.provider_code, 'shared_cash', 560000::bigint),
  ('60000000-0000-4000-8000-000000000006'::uuid, 'NG-002', null::app.provider_code, 'shared_cash', 480000::bigint),
  ('60000000-0000-4000-8000-000000000001'::uuid, 'DN-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 300000::bigint), ('60000000-0000-4000-8000-000000000001'::uuid, 'DN-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 420000::bigint), ('60000000-0000-4000-8000-000000000001'::uuid, 'DN-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 390000::bigint),
  ('60000000-0000-4000-8000-000000000002'::uuid, 'DN-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 275000::bigint), ('60000000-0000-4000-8000-000000000002'::uuid, 'DN-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 360000::bigint), ('60000000-0000-4000-8000-000000000002'::uuid, 'DN-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 335000::bigint),
  ('60000000-0000-4000-8000-000000000003'::uuid, 'DS-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 455000::bigint), ('60000000-0000-4000-8000-000000000003'::uuid, 'DS-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 510000::bigint), ('60000000-0000-4000-8000-000000000003'::uuid, 'DS-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 485000::bigint),
  ('60000000-0000-4000-8000-000000000004'::uuid, 'DS-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 320000::bigint), ('60000000-0000-4000-8000-000000000004'::uuid, 'DS-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 410000::bigint), ('60000000-0000-4000-8000-000000000004'::uuid, 'DS-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 375000::bigint),
  ('60000000-0000-4000-8000-000000000005'::uuid, 'NG-001', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 245000::bigint), ('60000000-0000-4000-8000-000000000005'::uuid, 'NG-001', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 295000::bigint), ('60000000-0000-4000-8000-000000000005'::uuid, 'NG-001', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 270000::bigint),
  ('60000000-0000-4000-8000-000000000006'::uuid, 'NG-002', 'PROVIDER_A'::app.provider_code, 'provider_efloat', 210000::bigint), ('60000000-0000-4000-8000-000000000006'::uuid, 'NG-002', 'PROVIDER_B'::app.provider_code, 'provider_efloat', 255000::bigint), ('60000000-0000-4000-8000-000000000006'::uuid, 'NG-002', 'PROVIDER_C'::app.provider_code, 'provider_efloat', 230000::bigint)
)
insert into app.forecast_points (
  id, forecast_run_id, provider_id, resource, horizon_minutes,
  projected_low_minor, projected_high_minor, projected_mid_minor, risk_band,
  reserve_eta_minutes, likely_depletion_eta_minutes
)
select md5('baseline:forecast-point:' || input.run_id || ':' || coalesce(provider.id::text, 'cash') || ':' || horizon.minutes)::uuid,
  input.run_id, provider.id, input.resource, horizon.minutes,
  input.amount_minor - horizon.minutes * 150, input.amount_minor - horizon.minutes * 50,
  input.amount_minor - horizon.minutes * 100, 'low', null, null
from input
join app.outlets outlet on outlet.code = input.outlet_code
join app.forecast_runs run on run.id = input.run_id and run.outlet_id = outlet.id
left join app.providers provider on provider.code = input.provider_code
cross join (values (30), (60), (120), (240)) horizon(minutes)
on conflict (id) do update set
  forecast_run_id = excluded.forecast_run_id, provider_id = excluded.provider_id, resource = excluded.resource,
  horizon_minutes = excluded.horizon_minutes, projected_low_minor = excluded.projected_low_minor,
  projected_high_minor = excluded.projected_high_minor, projected_mid_minor = excluded.projected_mid_minor,
  risk_band = excluded.risk_band, reserve_eta_minutes = excluded.reserve_eta_minutes,
  likely_depletion_eta_minutes = excluded.likely_depletion_eta_minutes;

-- Assertions are deliberately scoped to stable synthetic identities so manual catalog
-- records and workflow history do not make a cloud seed application fail.
do $$
begin
  if (select count(*) from app.providers where code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C')) <> 3
    or (select count(*) from app.areas where code in ('DHAKA_NORTH', 'DHAKA_SOUTH', 'NARAYANGANJ')) <> 3
    or (select count(*) from app.outlets where code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')) <> 6 then
    raise exception 'seed scope integrity failed';
  end if;

  if (select count(*) from app.outlet_cash_balances cash
      join app.outlets outlet on outlet.id = cash.outlet_id
      where outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')) <> 6
    or (select count(*) from app.provider_balances balance
        join app.outlets outlet on outlet.id = balance.outlet_id
        join app.providers provider on provider.id = balance.provider_id
        where outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')
          and provider.code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C')) <> 18
    or (select count(*) from app.simulation_balance_baselines baseline
        join app.outlets outlet on outlet.id = baseline.outlet_id
        where outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')
          and baseline.resource = 'shared_cash') <> 6
    or (select count(*) from app.simulation_balance_baselines baseline
        join app.outlets outlet on outlet.id = baseline.outlet_id
        join app.providers provider on provider.id = baseline.provider_id
        where outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')
          and provider.code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C')
          and baseline.resource = 'provider_efloat') <> 18 then
    raise exception 'seed balance integrity failed';
  end if;

  if exists (
    select 1
    from app.simulation_balance_baselines baseline
    join app.outlets outlet on outlet.id = baseline.outlet_id
    left join app.outlet_cash_balances cash
      on baseline.resource = 'shared_cash' and cash.outlet_id = baseline.outlet_id
    left join app.provider_balances efloat
      on baseline.resource = 'provider_efloat' and efloat.outlet_id = baseline.outlet_id and efloat.provider_id = baseline.provider_id
    where outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')
      and ((baseline.resource = 'shared_cash' and cash.amount_minor is distinct from baseline.amount_minor)
        or (baseline.resource = 'provider_efloat' and efloat.amount_minor is distinct from baseline.amount_minor))
  ) then
    raise exception 'seed baseline amounts do not match current balances';
  end if;

  if (select count(*) from app.feed_batches feed
      join app.providers provider on provider.id = feed.provider_id
      where provider.code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C') and feed.sequence = 10) <> 3
    or (select count(*) from app.transactions transaction_row
        join app.outlets outlet on outlet.id = transaction_row.outlet_id
        join app.providers provider on provider.id = transaction_row.provider_id
        where transaction_row.provider_event_id like 'baseline-%'
          and outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')
          and provider.code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C')) <> 36
    or (select count(*) from app.balance_snapshots snapshot
        join app.outlets outlet on outlet.id = snapshot.outlet_id
        left join app.providers provider on provider.id = snapshot.provider_id
        where snapshot.id = md5('baseline:snapshot:' || outlet.id || ':' || coalesce(provider.id::text, 'cash'))::uuid
          and outlet.code in ('DN-001', 'DN-002', 'DS-001', 'DS-002', 'NG-001', 'NG-002')
          and (provider.code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C') or provider.id is null)) <> 24 then
    raise exception 'seed feed integrity failed';
  end if;

  if exists (select 1 from app.feed_batches feed
      join app.providers provider on provider.id = feed.provider_id
      where provider.code in ('PROVIDER_A', 'PROVIDER_B', 'PROVIDER_C')
        and feed.sequence = 10 and feed.quality_status <> 'healthy') then
    raise exception 'seed must contain healthy feed data';
  end if;

  if (select count(*) from app.forecast_runs where id in (
      '60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004',
      '60000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000006')) <> 6
    or (select count(*) from app.forecast_points where forecast_run_id in (
      '60000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000004',
      '60000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000006')) <> 96
    or exists (
      select 1 from (values
        ('60000000-0000-4000-8000-000000000001'::uuid), ('60000000-0000-4000-8000-000000000002'::uuid),
        ('60000000-0000-4000-8000-000000000003'::uuid), ('60000000-0000-4000-8000-000000000004'::uuid),
        ('60000000-0000-4000-8000-000000000005'::uuid), ('60000000-0000-4000-8000-000000000006'::uuid)
      ) run(id)
      where (select count(*) from app.forecast_points point where point.forecast_run_id = run.id) <> 16
    ) then
    raise exception 'seed forecast integrity failed';
  end if;
end $$;
