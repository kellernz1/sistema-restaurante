-- Run after all three migrations and seed. Fixtures roll back.
begin;
create temporary table phase9_context(pickup_id uuid, delivery_id uuid, product_id uuid, table_id uuid, table_status public.table_status);
grant select, update on phase9_context to service_role, authenticated;
insert into public.categories(name) values ('__phase9_category__');
insert into public.products(category_id, name, price) select id, '__phase9_product__', 12.35 from public.categories where name = '__phase9_category__';
insert into public.tables(table_number, capacity) values (999996, 2);
insert into phase9_context(product_id, table_id, table_status)
  select p.id, t.id, t.status from public.products p cross join public.tables t where p.name = '__phase9_product__' and t.table_number = 999996;
insert into public.restaurant_settings(id, is_accepting_orders, pickup_enabled, delivery_enabled, delivery_fee, min_delivery_order)
  values (true, true, true, true, 5.50, 20) on conflict(id) do update set delivery_fee_mode = 'fixed', is_accepting_orders = true, pickup_enabled = true, delivery_enabled = true, delivery_fee = 5.50, min_delivery_order = 20;

do $$ begin
  if not exists(select 1 from public.profiles where role = 'cashier') or not exists(select 1 from public.profiles where role = 'waiter') then raise exception 'Seed cashier and waiter users first'; end if;
end $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$
declare product uuid; result public.orders; payload jsonb;
begin
  select product_id into product from phase9_context;
  payload := jsonb_build_object('order_type','pickup','source','web','customer_name','Phase 9','customer_phone','+5511999999997','payment_method','pix',
    'items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2,'unit_price',0)));
  result := public.create_customer_order(payload);
  if result.status <> 'pending_confirmation' or result.total_amount <> 24.70 or result.table_id is not null or result.customer_id is null then raise exception 'Pickup creation failed'; end if;
  update phase9_context set pickup_id = result.id;
  payload := payload || jsonb_build_object('order_type','delivery','payment_method','cash','cash_change_for',50,'delivery_address',jsonb_build_object('street','Rua Teste','number','10','neighborhood','Centro','city','São Paulo','state','SP','zip_code','01001000'));
  result := public.create_customer_order(payload);
  if result.delivery_fee <> 5.50 or result.total_amount <> 30.20 or result.table_id is not null then raise exception 'Delivery fee or total failed'; end if;
  if not exists(select 1 from public.customer_addresses where customer_id = result.customer_id and street = 'Rua Teste') then raise exception 'Address not saved'; end if;
  update phase9_context set delivery_id = result.id;
  begin
    perform public.create_customer_order(payload || jsonb_build_object('cash_change_for',20));
    raise exception 'Insufficient cash amount accepted';
  exception when check_violation then null; end;
  begin
    perform public.create_customer_order(payload || jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1))));
    raise exception 'Below minimum accepted';
  exception when raise_exception then
    if sqlerrm = 'Below minimum accepted' then raise; end if;
  end;
  begin
    perform public.create_customer_order(payload || jsonb_build_object('delivery_address',jsonb_build_object('street','Rua Teste')));
    raise exception 'Incomplete address accepted';
  exception when check_violation then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',(select id from public.profiles where role = 'waiter' limit 1))::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where role = 'waiter' limit 1), true);
set local role authenticated;
do $$ begin
  begin perform public.advance_hub_order((select pickup_id from phase9_context),'accept'); raise exception 'Waiter changed hub order'; exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('role','authenticated','sub',(select id from public.profiles where role = 'cashier' limit 1))::text, true);
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where role = 'cashier' limit 1), true);
set local role authenticated;
select public.advance_hub_order(pickup_id,'accept') from phase9_context;
select public.advance_hub_order(delivery_id,'accept') from phase9_context;
reset role;

-- Simulate kitchen completion using the SQL Editor's owner role.
update public.order_items set status = 'ready' where order_id in (select pickup_id from phase9_context union all select delivery_id from phase9_context);
do $$ begin
  if (select count(*) from public.orders where id in (select pickup_id from phase9_context union all select delivery_id from phase9_context) and status = 'ready') <> 2 then raise exception 'Automatic ready transition failed'; end if;
end $$;
set local role authenticated;
select public.advance_hub_order(pickup_id,'complete',null,'pix') from phase9_context;
select public.advance_hub_order(delivery_id,'dispatch') from phase9_context;
select public.advance_hub_order(delivery_id,'complete',null,'card') from phase9_context;
do $$ begin
  if exists(select 1 from public.orders where id in (select pickup_id from phase9_context union all select delivery_id from phase9_context) and (status <> 'closed' or payment_status <> 'paid' or closed_at is null)) then raise exception 'Completion failed'; end if;
  if exists(select 1 from public.tables t join phase9_context c on c.table_id = t.id where t.status <> c.table_status) then raise exception 'Offsite completion changed a table'; end if;
  if exists(select 1 from public.orders where id = (select delivery_id from phase9_context) and (payment_method <> 'card' or cash_change_for is not null)) then raise exception 'Changing cash payment method did not clear change'; end if;
  begin perform public.advance_hub_order((select delivery_id from phase9_context),'complete',null,'cash'); raise exception 'Repeated completion accepted'; exception when raise_exception then if sqlerrm = 'Repeated completion accepted' then raise; end if; end;
end $$;
reset role;
rollback;
