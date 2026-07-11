create type app.transaction_type as enum ('CASH_IN', 'CASH_OUT');
create type app.transaction_lifecycle as enum ('PENDING', 'SETTLED', 'FAILED', 'REVERSED');

create table app.outlet_cash_balances (
  outlet_id uuid primary key references app.outlets(id) on delete cascade,
  amount_minor bigint not null check (amount_minor >= 0),
  updated_at timestamptz not null default now()
);

create table app.provider_balances (
  outlet_id uuid not null references app.outlets(id) on delete cascade,
  provider_id uuid not null references app.providers(id) on delete restrict,
  amount_minor bigint not null check (amount_minor >= 0),
  updated_at timestamptz not null default now(),
  primary key (outlet_id, provider_id)
);

create table app.feed_batches (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references app.providers(id),
  sequence bigint not null check (sequence > 0),
  checksum text not null,
  received_at timestamptz not null default now(),
  quality_status text not null default 'healthy',
  unique (provider_id, sequence)
);

create table app.transactions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references app.providers(id),
  outlet_id uuid not null references app.outlets(id),
  feed_batch_id uuid references app.feed_batches(id),
  provider_event_id text not null,
  event_version integer not null default 1 check (event_version > 0),
  type app.transaction_type not null,
  lifecycle app.transaction_lifecycle not null,
  amount_minor bigint not null check (amount_minor > 0),
  occurred_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (provider_id, provider_event_id),
  unique (provider_id, idempotency_key)
);

create table app.balance_snapshots (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references app.providers(id),
  outlet_id uuid not null references app.outlets(id),
  resource text not null check (resource in ('shared_cash', 'provider_efloat')),
  amount_minor bigint not null check (amount_minor >= 0),
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table app.data_quality_incidents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references app.providers(id),
  outlet_id uuid references app.outlets(id),
  category text not null,
  details jsonb not null default '{}'::jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index transactions_provider_outlet_occurred_idx on app.transactions(provider_id, outlet_id, occurred_at desc);
create index transactions_outlet_occurred_idx on app.transactions(outlet_id, occurred_at desc);

alter table app.outlet_cash_balances enable row level security;
alter table app.provider_balances enable row level security;
alter table app.feed_batches enable row level security;
alter table app.transactions enable row level security;
alter table app.balance_snapshots enable row level security;
alter table app.data_quality_incidents enable row level security;
