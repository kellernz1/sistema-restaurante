-- Isolated fixtures; all order creation and updates roll back.
begin;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;
-- Legacy order scenarios use the configurable optional-session mode.
update public.cash_session_policy set require_open_session=false where id;
insert into public.exchange_rates(rate,rounding,created_by) select 1400,'none',id from public.profiles where role='admin' and is_active limit 1;
create temporary table cashier_test_context(actor_id uuid, waiter_id uuid, product_id uuid, table_id uuid, pickup_id uuid, delivery_id uuid);
grant all on cashier_test_context to service_role, authenticated;
insert into public.categories(name) values ('__cashier_test_category__');
insert into public.products(category_id, name, price)
  select id, '__cashier_test_product__', 1235 from public.categories where name = '__cashier_test_category__';
insert into public.tables(table_number, capacity) values (999993, 2);
insert into cashier_test_context(actor_id, waiter_id, product_id, table_id)
  select (select id from public.profiles where role = 'cashier' limit 1),
    (select id from public.profiles where role = 'waiter' limit 1), p.id, t.id
    from public.products p cross join public.tables t where p.name = '__cashier_test_product__' and t.table_number = 999993;
update public.restaurant_settings set delivery_fee_mode = 'fixed', is_accepting_orders = true, pickup_enabled = true, delivery_enabled = true,
  dine_in_qr_enabled = true, require_confirmation_for_qr = true, delivery_fee = 550, min_delivery_order = 2000 where id = true;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$
declare ctx cashier_test_context; result public.orders; again public.orders; payload jsonb; request uuid := gen_random_uuid(); item_count integer;
begin
  select * into ctx from cashier_test_context;
  if ctx.actor_id is null or ctx.waiter_id is null then raise exception 'Demo profiles required'; end if;
  payload := jsonb_build_object('order_type','dine_in','table_id',ctx.table_id,
    'items',jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',2,'notes','No onions')));
  result := public.create_cashier_order(ctx.actor_id,request,payload);
  if result.total_amount <> 2470 or result.status <> 'open' or result.waiter_id <> ctx.actor_id or result.source <> 'waiter' then
    raise exception 'Table order failed';
  end if;
  again := public.create_cashier_order(ctx.actor_id,request,payload);
  select count(*) into item_count from public.order_items where order_id = result.id;
  if again.id <> result.id or item_count <> 1 then raise exception 'Retry duplicated the order'; end if;
  begin
    perform public.create_cashier_order(ctx.actor_id,request,payload || jsonb_build_object('notes','Different request'));
    raise exception 'Changed payload reused request ID';
  exception when invalid_parameter_value then null; end;
  again := public.create_cashier_order(ctx.actor_id,gen_random_uuid(),payload);
  if again.id <> result.id or again.total_amount <> 4940 then raise exception 'Occupied table did not receive items'; end if;
  update public.tables set status = 'closing' where id = ctx.table_id;
  begin
    perform public.create_cashier_order(ctx.actor_id,gen_random_uuid(),payload);
    raise exception 'Closing table accepted an order';
  exception when raise_exception then
    if sqlerrm = 'Closing table accepted an order' then raise; end if;
  end;
  begin
    perform public.create_cashier_order(ctx.waiter_id,gen_random_uuid(),payload);
    raise exception 'Waiter impersonated cashier';
  exception when insufficient_privilege then null; end;
  payload := jsonb_build_object('order_type','pickup','customer_name','Cashier test','customer_phone','+5511999990086','payment_method','pix',
    'items',jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',2)));
  result := public.create_cashier_order(ctx.actor_id,gen_random_uuid(),payload);
  if result.status <> 'open' or result.total_amount <> 2470 or result.payment_status <> 'pending' then raise exception 'Pickup not confirmed or marked paid early'; end if;
  update cashier_test_context set pickup_id = result.id;
  payload := payload || jsonb_build_object('order_type','delivery','payment_method','cash','cash_change_for',5000,
    'delivery_address',jsonb_build_object('street','Rua Teste','number','10','neighborhood','Centro','city','São Paulo','state','SP','zip_code','01001000'));
  result := public.create_cashier_order(ctx.actor_id,gen_random_uuid(),payload);
  if result.status <> 'open' or result.total_amount <> 3020 or result.delivery_fee <> 550 then raise exception 'Delivery total failed'; end if;
  update cashier_test_context set delivery_id = result.id;
  begin
    perform public.create_cashier_order(ctx.actor_id,gen_random_uuid(),payload || jsonb_build_object('cash_change_for',10));
    raise exception 'Insufficient change accepted';
  exception when check_violation then null; end;
  begin
    perform public.create_cashier_order(ctx.actor_id,gen_random_uuid(),payload || jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',1))));
    raise exception 'Delivery minimum bypassed';
  exception when raise_exception then
    if sqlerrm = 'Delivery minimum bypassed' then raise; end if;
  end;
end $$;
reset role;
update public.order_items set status = 'ready' where order_id in (select pickup_id from cashier_test_context union all select delivery_id from cashier_test_context);
do $$ begin
  if (select count(*) from public.orders where id in (select pickup_id from cashier_test_context union all select delivery_id from cashier_test_context) and status = 'ready') <> 2 then raise exception 'Kitchen readiness not propagated'; end if;
end $$;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select actor_id::text from cashier_test_context), true);
select set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',(select actor_id from cashier_test_context))::text, true);
set local role authenticated;
do $$ begin
  begin perform public.create_cashier_order((select actor_id from cashier_test_context),gen_random_uuid(),'{}'); raise exception 'Browser executed privileged RPC'; exception when insufficient_privilege then null; end;
  begin perform * from public.cashier_order_submissions; raise exception 'Browser read private payloads'; exception when insufficient_privilege then null; end;
end $$;
select public.advance_hub_order(pickup_id,'complete',null,'pix') from cashier_test_context;
select public.advance_hub_order(delivery_id,'dispatch') from cashier_test_context;
select public.advance_hub_order(delivery_id,'complete',null,'cash') from cashier_test_context;
reset role;
do $$ begin
  if (select count(*) from public.orders where id in (select pickup_id from cashier_test_context union all select delivery_id from cashier_test_context) and status = 'closed' and payment_status = 'paid') <> 2 then raise exception 'Cashier completion failed'; end if;
end $$;
rollback;
