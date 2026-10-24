begin;
create temporary table kitchen_print_test_context(order_id uuid, kitchen_id uuid, cashier_id uuid, terminal uuid, other_terminal uuid);
grant select,update on kitchen_print_test_context to authenticated;
update public.restaurant_settings set kitchen_auto_print_enabled = true where id;
update public.kitchen_print_jobs set status = 'dispatched' where status in ('pending','claimed');
update public.kitchen_printer_lease set expires_at = '-infinity';
insert into kitchen_print_test_context(kitchen_id,cashier_id,terminal,other_terminal)
  select (select id from public.profiles where role='kitchen' and is_active limit 1),
    (select id from public.profiles where role='cashier' and is_active limit 1),gen_random_uuid(),gen_random_uuid();
do $$
declare test_order_id uuid; product uuid;
begin
  select id into product from public.products where is_active limit 1;
  insert into public.orders(order_type,source,status,customer_name,customer_phone)
    values ('pickup','web','pending_confirmation','__print_test__','+5511999990071') returning id into test_order_id;
  insert into public.order_items(order_id,product_id,quantity,unit_price,notes) values(test_order_id,product,2,0,'Sem cebola');
  if exists(select 1 from public.kitchen_print_jobs where kitchen_print_jobs.order_id = test_order_id) then raise exception 'Unconfirmed order queued'; end if;
  update public.orders set status='open' where id=test_order_id;
  update public.orders set status='open' where id=test_order_id;
  if (select count(*) from public.kitchen_print_jobs where kitchen_print_jobs.order_id = test_order_id) <> 1 then raise exception 'Confirmation did not enqueue exactly once'; end if;
  update kitchen_print_test_context set order_id=test_order_id;
end; $$;
select set_config('request.jwt.claims', jsonb_build_object('sub',kitchen_id,'role','authenticated')::text,true) from kitchen_print_test_context;
select set_config('request.jwt.claim.sub',kitchen_id::text,true) from kitchen_print_test_context;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$
declare ctx kitchen_print_test_context; claim jsonb; second jsonb;
begin
  select * into ctx from kitchen_print_test_context;
  claim := public.claim_kitchen_print_job(ctx.terminal);
  if claim->>'order_id' is distinct from ctx.order_id::text then raise exception 'Wrong print job claimed'; end if;
  second := public.claim_kitchen_print_job(ctx.other_terminal);
  if second->>'busy' is distinct from 'true' then raise exception 'Two terminals acquired printing'; end if;
  if public.claim_kitchen_print_job(ctx.terminal) ? 'id' then raise exception 'Same job claimed twice'; end if;
  begin
    perform public.finish_kitchen_print_job((claim->>'id')::uuid,ctx.terminal,gen_random_uuid());
    raise exception 'Wrong token accepted';
  exception when check_violation then null; end;
  begin
    perform public.mark_manual_kitchen_print(ctx.order_id);
    raise exception 'Manual printing raced an automatic attempt';
  exception when check_violation then null; end;
  perform public.finish_kitchen_print_job((claim->>'id')::uuid,ctx.terminal,(claim->>'claim_token')::uuid);
  if public.claim_kitchen_print_job(ctx.terminal) ? 'id' then raise exception 'Dispatched print retried automatically'; end if;
  perform public.finish_kitchen_print_job((claim->>'id')::uuid,ctx.terminal,(claim->>'claim_token')::uuid,'Impressora indisponível');
  if public.claim_kitchen_print_job(ctx.terminal) ? 'id' then raise exception 'Failed print retried automatically'; end if;
  perform public.mark_manual_kitchen_print(ctx.order_id);
  if not exists (select 1 from public.kitchen_print_jobs where order_id=ctx.order_id and status='dispatched') then raise exception 'Manual retry not recorded'; end if;
  perform public.release_kitchen_printer(ctx.terminal);
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',cashier_id,'role','authenticated')::text,true) from kitchen_print_test_context;
select set_config('request.jwt.claim.sub',cashier_id::text,true) from kitchen_print_test_context;
set local role authenticated;
do $$ begin
  begin
    perform public.claim_kitchen_print_job(gen_random_uuid());
    raise exception 'Cashier acquired automatic kitchen printer';
  exception when insufficient_privilege then null; end;
  begin
    update public.kitchen_print_jobs set status='pending';
    raise exception 'Browser changed print jobs directly';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.kitchen_print_jobs;
    raise exception 'Anonymous print queue access';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
