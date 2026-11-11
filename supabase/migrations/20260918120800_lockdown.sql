-- Defence in depth around the `app` schema.
--
-- Supabase is used as a database only: the NestJS API connects over the Postgres
-- connection string as the owner, and no browser ever holds a key to this
-- project. The two measures below cost nothing today and mean that turning on
-- PostgREST later — one line in config.toml — cannot silently publish citizens'
-- phone numbers.

-- 1. The Supabase API roles have no business in this schema at all.
revoke all on schema app from anon, authenticated, service_role;
revoke all on all tables in schema app from anon, authenticated, service_role;
revoke all on all sequences in schema app from anon, authenticated, service_role;
revoke all on all functions in schema app from anon, authenticated, service_role;

alter default privileges in schema app
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema app
  revoke all on sequences from anon, authenticated, service_role;

-- 2. RLS on with no policies: deny by default for every role that is not the
-- table owner. The API is unaffected because it connects as the owner; anything
-- else reads an empty table rather than the data.
do $$
declare t record;
begin
  for t in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'app'
      and c.relkind in ('r', 'p')          -- ordinary and partitioned tables
  loop
    execute format('alter table app.%I enable row level security', t.relname);
  end loop;
end;
$$;

comment on schema app is
  'Domain tables. Not exposed through PostgREST; RLS is deny-by-default. The NestJS API, connecting as owner, is the only client.';
