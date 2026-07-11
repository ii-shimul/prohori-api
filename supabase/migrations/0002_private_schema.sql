create schema if not exists app;

revoke all on schema app from public, anon, authenticated;
revoke all on all tables in schema app from anon, authenticated;
revoke all on all sequences in schema app from anon, authenticated;

alter default privileges in schema app revoke all on tables from anon, authenticated;
alter default privileges in schema app revoke all on sequences from anon, authenticated;
