-- Step 10: scoped client-facing feed/data-quality reads and a fixed redacted
-- management projection. No policy here grants a client access to ledgers.

grant select on app.feed_batches, app.data_quality_incidents to app_api;

create policy feed_batches_scoped_read on app.feed_batches for select to app_api using (
  app.is_demo_admin() or exists (
    select 1 from app.provider_memberships membership
    where membership.user_id = app.current_user_id()
      and membership.provider_id = feed_batches.provider_id
      and membership.is_active
  )
);

create or replace function app.has_platform_management_role()
returns boolean
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select app.is_demo_admin() or exists (
    select 1
    from app.provider_memberships membership
    where membership.user_id = app.current_user_id()
      and membership.role = 'PLATFORM_MANAGEMENT'
      and membership.is_active
  )
$$;

revoke all on function app.has_platform_management_role() from public;
grant execute on function app.has_platform_management_role() to app_api;

-- This function intentionally returns only platform-level counts/timestamps. It is
-- security-definer so management users can read the fixed aggregate without gaining
-- access to a provider's raw feed, balance, transaction, or incident rows.
create or replace function app.platform_readiness_aggregate()
returns table (
  generated_at timestamptz,
  providers_reporting bigint,
  providers_degraded bigint,
  providers_unreliable bigint,
  active_incident_count bigint,
  unresolved_outlet_count bigint,
  latest_feed_received_at timestamptz
)
language plpgsql
stable
security definer
set search_path = app, pg_temp
as $$
begin
  if not app.has_platform_management_role() then
    return;
  end if;

  return query
  with active_incidents as (
    select provider_id, outlet_id, category
    from app.data_quality_incidents
    where resolved_at is null
  ), provider_quality as (
    select p.id,
      case
        when bool_or(i.category in ('CONFLICTING_SNAPSHOT', 'BALANCE_MISMATCH', 'OUT_OF_ORDER_SEQUENCE')) then 'unreliable'
        when count(i.category) > 0 then 'degraded'
        else 'healthy'
      end as quality
    from app.providers p
    left join active_incidents i on i.provider_id = p.id
    group by p.id
  )
  select
    now(),
    (select count(distinct provider_id) from app.feed_batches),
    count(*) filter (where quality = 'degraded'),
    count(*) filter (where quality = 'unreliable'),
    (select count(*) from active_incidents),
    (select count(distinct outlet_id) from active_incidents where outlet_id is not null),
    (select max(received_at) from app.feed_batches)
  from provider_quality;
end
$$;

revoke all on function app.platform_readiness_aggregate() from public;
grant execute on function app.platform_readiness_aggregate() to app_api;

create or replace view app.platform_readiness_aggregates as
select * from app.platform_readiness_aggregate();

revoke all on app.platform_readiness_aggregates from public;
grant select on app.platform_readiness_aggregates to app_api;
