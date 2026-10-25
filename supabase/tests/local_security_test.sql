begin;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;

do $$
declare
  missing_rls text;
  missing_realtime text;
begin
  select string_agg(expected.table_name, ', ' order by expected.table_name)
  into missing_rls
  from (
    values
      ('profiles'),
      ('tables'),
      ('categories'),
      ('products'),
      ('customers'),
      ('customer_addresses'),
      ('restaurant_settings'),
      ('orders'),
      ('order_items'),
      ('service_requests'),
      ('public_rate_limits'),
      ('whatsapp_conversations'),
      ('whatsapp_messages')
  ) as expected(table_name)
  left join pg_namespace on pg_namespace.nspname = 'public'
  left join pg_class on pg_class.relname = expected.table_name
    and pg_class.relnamespace = pg_namespace.oid
  where pg_class.oid is null or not pg_class.relrowsecurity;

  if missing_rls is not null then
    raise exception 'RLS is missing on: %', missing_rls;
  end if;

  select string_agg(expected.table_name, ', ' order by expected.table_name)
  into missing_realtime
  from (
    values ('order_items'), ('orders'), ('tables'), ('service_requests')
  ) as expected(table_name)
  left join pg_publication_tables published
    on published.pubname = 'supabase_realtime'
    and published.schemaname = 'public'
    and published.tablename = expected.table_name
  where published.tablename is null;

  if missing_realtime is not null then
    raise exception 'Realtime publication is missing: %', missing_realtime;
  end if;
end;
$$;

rollback;
