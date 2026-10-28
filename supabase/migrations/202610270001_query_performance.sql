begin;

-- Keep the same active/waiter semantics and privileges. Identity is statement-stable.
create or replace function public.current_user_role() returns public.user_role
language sql stable security definer set search_path='' as $$
 select case when p.is_active and (p.role<>'waiter' or
   (select uses_waiter from public.service_policy where id)) then p.role else null end
 from public.profiles p where p.id=(select auth.uid())
$$;

-- Preserve policy names, roles, commands and permissiveness. Uncorrelated scalar
-- subqueries let PostgreSQL evaluate stable identity once, rather than per row.
do $$
declare p record; expression text; check_expression text; statement text;
begin
 for p in select c.relname,pol.polname,pg_get_expr(pol.polqual,pol.polrelid) qual,
   pg_get_expr(pol.polwithcheck,pol.polrelid) with_check
   from pg_policy pol join pg_class c on c.oid=pol.polrelid
   join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
 loop
  expression:=regexp_replace(p.qual,'(public\.)?current_user_role\(\)','(select public.current_user_role())','g');
  expression:=regexp_replace(expression,'auth\.uid\(\)','(select auth.uid())','g');
  check_expression:=regexp_replace(p.with_check,'(public\.)?current_user_role\(\)','(select public.current_user_role())','g');
  check_expression:=regexp_replace(check_expression,'auth\.uid\(\)','(select auth.uid())','g');
  if expression is distinct from p.qual or check_expression is distinct from p.with_check then
   statement:=format('alter policy %I on public.%I',p.polname,p.relname);
   if expression is not null then statement:=statement||' using ('||expression||')';end if;
   if check_expression is not null then statement:=statement||' with check ('||check_expression||')';end if;
   execute statement;
  end if;
 end loop;
end $$;

-- Small active-order indexes remain independent of the amount of closed history.
create index orders_active_kitchen_idx on public.orders(id)
 where status in ('open','ready');
create index orders_counter_active_queue_idx on public.orders(counter_ready_at,created_at,id)
 where is_counter and status in ('open','ready');
create index audit_events_cash_session_idx on public.audit_events(cash_session_id,created_at)
 where cash_session_id is not null;

commit;
