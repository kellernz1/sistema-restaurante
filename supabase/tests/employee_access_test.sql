-- Verify old JWTs and null-role RPC paths fail closed. Fixtures roll back.
begin;
insert into public.exchange_rates(rate,rounding,created_by) select 1400,'none',id from public.profiles where role='admin' and is_active limit 1;
create temporary table employee_access_context(admin_id uuid, cashier_id uuid);
grant all on employee_access_context to authenticated, service_role;
insert into employee_access_context select
  (select id from public.profiles where role = 'admin' and is_active limit 1),
  (select id from public.profiles where role = 'cashier' and is_active limit 1);
do $$ begin
  if exists(select 1 from employee_access_context where admin_id is null or cashier_id is null) then raise exception 'Demo profiles required'; end if;
end $$;
update public.profiles set is_active = false where role = 'admin' and id <> (select admin_id from employee_access_context);
do $$ begin
  begin
    update public.profiles set is_active = false where id = (select admin_id from employee_access_context);
    raise exception 'Last administrator was blocked';
  exception when check_violation then null; end;
  begin
    update public.profiles set role = 'waiter' where id = (select admin_id from employee_access_context);
    raise exception 'Last administrator was demoted';
  exception when check_violation then null; end;
end $$;
update public.profiles set is_active = false where id = (select cashier_id from employee_access_context);
select set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',(select cashier_id from employee_access_context))::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select cashier_id::text from employee_access_context), true);
set local role authenticated;
do $$ declare changed integer; begin
  if public.current_user_role() is not null then raise exception 'Blocked user still has an effective role'; end if;
  if exists(select 1 from public.orders) or exists(select 1 from public.products) then raise exception 'Blocked user can read restaurant data'; end if;
  update public.profiles set role = 'admin' where id = (select cashier_id from employee_access_context);
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'Blocked user changed their role'; end if;
  begin perform public.open_table(gen_random_uuid()); raise exception 'Blocked user opened a table'; exception when insufficient_privilege then null; end;
  begin perform public.close_order(gen_random_uuid(),'pix'); raise exception 'Blocked user closed an order'; exception when insufficient_privilege then null; end;
  begin perform public.advance_hub_order(gen_random_uuid(),'accept'); raise exception 'Blocked user changed a hub order'; exception when insufficient_privilege then null; end;
  begin perform public.set_product_photo(gen_random_uuid(),'AAAA'); raise exception 'Blocked user uploaded a photo'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$ begin
  begin perform public.create_cashier_order((select cashier_id from employee_access_context),gen_random_uuid(),'{}'); raise exception 'Service accepted blocked actor'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
