do $$
begin
  create role app_api nologin noinherit nobypassrls;
exception
  when duplicate_object then null;
end
$$;

grant app_api to postgres;
grant usage on schema app to app_api;
grant select on app.providers, app.areas, app.outlets, app.profiles,
  app.provider_memberships, app.outlet_assignments to app_api;

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function app.is_demo_admin()
returns boolean
language sql
stable
security definer
set search_path = app, pg_temp
as $$
  select exists (
    select 1
    from app.provider_memberships membership
    where membership.user_id = app.current_user_id()
      and membership.role = 'DEMO_ADMIN'
      and membership.is_active
  )
$$;

revoke all on function app.current_user_id() from public;
revoke all on function app.is_demo_admin() from public;
grant execute on function app.current_user_id(), app.is_demo_admin() to app_api;

create policy profiles_self_read on app.profiles
  for select to app_api
  using (id = app.current_user_id());

create policy memberships_self_read on app.provider_memberships
  for select to app_api
  using (user_id = app.current_user_id());

create policy assignments_self_read on app.outlet_assignments
  for select to app_api
  using (user_id = app.current_user_id());

create policy providers_scoped_read on app.providers
  for select to app_api
  using (
    app.is_demo_admin()
    or exists (
      select 1
      from app.provider_memberships membership
      where membership.user_id = app.current_user_id()
        and membership.provider_id = providers.id
        and membership.is_active
    )
  );

create policy areas_assigned_read on app.areas
  for select to app_api
  using (
    app.is_demo_admin()
    or exists (
      select 1
      from app.outlet_assignments assignment
      where assignment.user_id = app.current_user_id()
        and assignment.area_id = areas.id
        and assignment.is_active
    )
  );

create policy outlets_assigned_read on app.outlets
  for select to app_api
  using (
    app.is_demo_admin()
    or exists (
      select 1
      from app.outlet_assignments assignment
      where assignment.user_id = app.current_user_id()
        and assignment.outlet_id = outlets.id
        and assignment.is_active
    )
  );
