-- Run after both migrations and seed. All fixtures and mutations roll back.
begin;
create temporary table phase8_context(table_id uuid, token text, product_id uuid, order_id uuid, request_id uuid);
grant select, update on phase8_context to service_role, authenticated;
insert into public.categories(name) values ('__phase8_category__');
insert into public.products(category_id, name, price) select id, '__phase8_product__', 1235 from public.categories where name = '__phase8_category__';
insert into public.tables(table_number, capacity) values (999997, 2);
insert into phase8_context(table_id, token, product_id)
  select t.id, t.qr_token, p.id from public.tables t cross join public.products p
  where t.table_number = 999997 and p.name = '__phase8_product__';
insert into public.restaurant_settings(id, is_accepting_orders, dine_in_qr_enabled, require_confirmation_for_qr)
  values (true, true, true, true) on conflict (id) do update
  set is_accepting_orders = true, dine_in_qr_enabled = true, require_confirmation_for_qr = true;

do $$ begin
  if not exists (select 1 from public.profiles where role = 'waiter') or not exists (select 1 from public.profiles where role = 'admin') then
    raise exception 'Seed a waiter and admin before running this test';
  end if;
end $$;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$
declare ctx record; result public.orders; second_order public.orders; request_one uuid; request_two uuid;
begin
  select * into ctx from phase8_context;
  if not public.consume_public_rate_limit('__phase8_limit__', 2, 600) then raise exception 'First hit denied'; end if;
  if not public.consume_public_rate_limit('__phase8_limit__', 2, 600) then raise exception 'Second hit denied'; end if;
  if public.consume_public_rate_limit('__phase8_limit__', 2, 600) then raise exception 'Limit not enforced'; end if;
  result := public.create_customer_order(jsonb_build_object('order_type', 'dine_in', 'source', 'qr', 'table_id', ctx.table_id, 'table_token', ctx.token,
    'items', jsonb_build_array(jsonb_build_object('product_id', ctx.product_id, 'quantity', 2, 'unit_price', 0))));
  if result.status <> 'pending_confirmation' or result.total_amount <> 2470 then raise exception 'Confirmation or price incorrect'; end if;
  update phase8_context set order_id = result.id;
  second_order := public.create_customer_order(jsonb_build_object('order_type', 'dine_in', 'source', 'nfc', 'table_id', ctx.table_id, 'table_token', ctx.token,
    'items', jsonb_build_array(jsonb_build_object('product_id', ctx.product_id, 'quantity', 1))));
  if second_order.id <> result.id or second_order.total_amount <> 3705 then raise exception 'Did not join existing order'; end if;
  request_one := public.create_table_service_request(ctx.token, 'waiter');
  request_two := public.create_table_service_request(ctx.token, 'waiter');
  if request_one <> request_two then raise exception 'Duplicate open request'; end if;
  update phase8_context set request_id = request_one;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'waiter' limit 1))::text, true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where role = 'waiter' limit 1), true);
set local role authenticated;
select public.review_table_order(order_id, true) from phase8_context;
select public.attend_service_request(request_id) from phase8_context;
do $$ begin
  if not exists (select 1 from public.orders where id = (select order_id from phase8_context) and status = 'open') then raise exception 'Confirmation failed'; end if;
  if not exists (select 1 from public.service_requests where id = (select request_id from phase8_context) and status = 'attended') then raise exception 'Attendance failed'; end if;
  begin
    perform public.rotate_table_token((select table_id from phase8_context));
    raise exception 'Waiter rotated token';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_public_rate_limit('__forbidden__', 1, 600);
    raise exception 'Waiter accessed limiter';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

select set_config('request.jwt.claims', jsonb_build_object('role', 'authenticated', 'sub', (select id from public.profiles where role = 'admin' limit 1))::text, true);
select set_config('request.jwt.claim.sub', (select id::text from public.profiles where role = 'admin' limit 1), true);
set local role authenticated;
select public.rotate_table_token(table_id) from phase8_context;
reset role;

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claim.sub', '', true);
set local role service_role;
do $$
declare ctx record; result public.orders;
begin
  select * into ctx from phase8_context;
  begin
    perform public.create_table_service_request(ctx.token, 'bill');
    raise exception 'Old token accepted for service request';
  exception when no_data_found then null; end;
  begin
    perform public.create_customer_order(jsonb_build_object('order_type', 'dine_in', 'source', 'qr', 'table_id', ctx.table_id, 'table_token', ctx.token,
      'items', jsonb_build_array(jsonb_build_object('product_id', ctx.product_id, 'quantity', 1))));
    raise exception 'Old token accepted for ordering';
  exception when no_data_found then null; end;
  perform public.create_table_service_request((select qr_token from public.tables where id = ctx.table_id), 'bill');
  if not exists (select 1 from public.tables where id = ctx.table_id and status = 'closing') then raise exception 'Bill request did not close table'; end if;
end $$;
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;
do $$ begin
  begin perform 1 from public.service_requests; raise exception 'Anon read requests'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.public_rate_limits; raise exception 'Anon read limits'; exception when insufficient_privilege then null; end;
  begin perform public.consume_public_rate_limit('x', 1, 600); raise exception 'Anon called limiter'; exception when insufficient_privilege then null; end;
  begin perform public.create_table_service_request('x', 'bill'); raise exception 'Anon called request RPC'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
