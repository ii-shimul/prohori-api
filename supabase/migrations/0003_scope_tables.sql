create type app.provider_code as enum (
  'PROVIDER_A',
  'PROVIDER_B',
  'PROVIDER_C'
);

create type app.user_role as enum (
  'OUTLET_AGENT',
  'PROVIDER_OPERATIONS',
  'PLATFORM_MANAGEMENT',
  'DATA_STEWARD',
  'VALIDATION_AUDITOR',
  'DEMO_ADMIN'
);

create type app.provider_status as enum ('ACTIVE', 'INACTIVE');
create type app.outlet_status as enum ('ACTIVE', 'INACTIVE');

create table app.providers (
  id uuid primary key default gen_random_uuid(),
  code app.provider_code not null unique,
  name text not null unique,
  status app.provider_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

create table app.areas (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  parent_id uuid references app.areas(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (parent_id, name)
);

create table app.outlets (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references app.areas(id) on delete restrict,
  code text not null unique,
  name text not null,
  tier smallint not null check (tier between 1 and 5),
  timezone text not null default 'Asia/Dhaka',
  status app.outlet_status not null default 'ACTIVE',
  created_at timestamptz not null default now()
);

-- `id` becomes a foreign key to auth.users when demo Auth users are provisioned in Step 3.
create table app.profiles (
  id uuid primary key,
  display_name text not null,
  locale text not null default 'en' check (locale in ('en', 'bn')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table app.provider_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  provider_id uuid not null references app.providers(id) on delete restrict,
  role app.user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, provider_id, role)
);

create table app.outlet_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app.profiles(id) on delete cascade,
  outlet_id uuid not null references app.outlets(id) on delete cascade,
  area_id uuid not null references app.areas(id) on delete restrict,
  provider_id uuid references app.providers(id) on delete restrict,
  role app.user_role not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (provider_id is not null or role in ('OUTLET_AGENT', 'DEMO_ADMIN'))
);

create index outlet_assignments_user_id_idx on app.outlet_assignments(user_id);
create index outlet_assignments_outlet_id_idx on app.outlet_assignments(outlet_id);
create index outlet_assignments_area_id_idx on app.outlet_assignments(area_id);
create index outlet_assignments_provider_id_idx on app.outlet_assignments(provider_id);
create index provider_memberships_user_id_idx on app.provider_memberships(user_id);
create index provider_memberships_provider_id_idx on app.provider_memberships(provider_id);

alter table app.providers enable row level security;
alter table app.areas enable row level security;
alter table app.outlets enable row level security;
alter table app.profiles enable row level security;
alter table app.provider_memberships enable row level security;
alter table app.outlet_assignments enable row level security;
