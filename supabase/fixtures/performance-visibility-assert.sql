do $$
begin
 if exists(select 1 from pg_proc where oid='public.kitchen_queue_page(timestamptz,uuid,integer)'::regprocedure and prosecdef)
  or has_function_privilege('anon','public.kitchen_queue_page(timestamptz,uuid,integer)','execute')
  or has_function_privilege('service_role','public.kitchen_queue_page(timestamptz,uuid,integer)','execute')then
  raise exception 'Kitchen page must preserve invoker RLS and deny public execution';end if;
 if exists(
  (select label,relation,status,keys from perf_fixture.visibility where phase='before'
   except select label,relation,status,keys from perf_fixture.visibility where phase='after')
  union all
  (select label,relation,status,keys from perf_fixture.visibility where phase='after'
   except select label,relation,status,keys from perf_fixture.visibility where phase='before')
 )then raise exception 'RLS visibility changed across the performance migration';end if;
 if (select permissions from perf_fixture.catalog where phase='before')is distinct from
    (select permissions from perf_fixture.catalog where phase='after')then raise exception 'Table/column privileges changed';end if;
 if (select policies from perf_fixture.catalog where phase='before')is distinct from
    (select policies from perf_fixture.catalog where phase='after')then raise exception 'Policy roles/commands/permissiveness changed';end if;
 if (select functions from perf_fixture.catalog where phase='before')is distinct from
    (select functions from perf_fixture.catalog where phase='after')then raise exception 'Function security/owner/privileges changed';end if;
 if (select count(distinct label)from perf_fixture.visibility where phase='after')<>9 then
  raise exception 'Missing security comparison identity';end if;
end $$;
