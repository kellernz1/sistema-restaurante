-- Prerequisites:
--   1. Run supabase/migrations/202610220001_initial_schema.sql.
--   2. Create the four Auth users documented in supabase/seed.sql.
--   3. Run supabase/seed.sql and confirm their roles.
--
-- This test always rolls back. A successful run ends with ROLLBACK and no error.

begin;

do $$
begin
  if (select count(distinct role) from public.profiles) < 4 then
    raise exception 'RLS smoke test requires at least one profile for every staff role';
  end if;
end;
$$;

-- Admin: full access is allowed; database integrity still rejects invalid data.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from public.profiles where role = 'admin' limit 1),
    'role', 'authenticated'
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'admin' limit 1),
  true
);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

insert into public.categories (name, sort_order)
values ('__rls_test_category__', 9999);

insert into public.products (category_id, name, price, is_active)
select id, '__rls_test_product__', 25.50, true
from public.categories
where name = '__rls_test_category__';

insert into public.tables (table_number, capacity)
values (999999, 4);

do $$
begin
  begin
    insert into public.products (category_id, name, price)
    select id, '__invalid_negative_price__', -1
    from public.categories
    where name = '__rls_test_category__';
    raise exception 'FAIL: admin integrity test accepted a negative product price';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.orders (order_type, source, status)
    values ('dine_in', 'waiter', 'open');
    raise exception 'FAIL: dine-in order without table was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.orders (order_type, source, status)
    values ('pickup', 'web', 'open');
    raise exception 'FAIL: pickup order without customer data was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.orders (
      order_type,
      source,
      customer_name,
      customer_phone,
      status
    ) values ('delivery', 'web', 'Cliente', '+5511999999999', 'open');
    raise exception 'FAIL: delivery order without address was accepted';
  exception
    when check_violation then null;
  end;

  begin
    insert into public.orders (
      order_type,
      source,
      customer_name,
      customer_phone,
      status
    ) values ('pickup', 'web', 'Cliente', '+5511999999999', 'out_for_delivery');
    raise exception 'FAIL: pickup order with out_for_delivery status was accepted';
  exception
    when check_violation then null;
  end;
end;
$$;

reset role;

-- Waiter: can read tables and insert a dine-in order/item, but cannot manage categories.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from public.profiles where role = 'waiter' limit 1),
    'role', 'authenticated'
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'waiter' limit 1),
  true
);
set local role authenticated;

do $$
begin
  if not exists (select 1 from public.tables where table_number = 999999) then
    raise exception 'FAIL: waiter could not read tables';
  end if;
end;
$$;

insert into public.orders (
  order_type,
  source,
  table_id,
  waiter_id,
  status,
  notes
)
select
  'dine_in',
  'waiter',
  table_record.id,
  auth.uid(),
  'open',
  '__rls_test_order__'
from public.tables as table_record
where table_record.table_number = 999999;

insert into public.order_items (
  order_id,
  product_id,
  quantity,
  unit_price,
  notes
)
select
  test_order.id,
  test_product.id,
  2,
  0.01,
  '__rls_test_item__'
from public.orders as test_order
cross join public.products as test_product
where test_order.notes = '__rls_test_order__'
  and test_product.name = '__rls_test_product__';

do $$
declare
  stored_price numeric(10, 2);
begin
  select unit_price into stored_price
  from public.order_items
  where notes = '__rls_test_item__';

  if stored_price <> 25.50 then
    raise exception 'FAIL: client unit_price was not overwritten; got %', stored_price;
  end if;

  begin
    update public.orders
    set payment_method = 'cash'
    where notes = '__rls_test_order__';
    raise exception 'FAIL: waiter changed payment fields';
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.categories (name) values ('__waiter_forbidden_category__');
    raise exception 'FAIL: waiter inserted a category';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Kitchen: can read and update only item status; table updates are invisible to UPDATE.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from public.profiles where role = 'kitchen' limit 1),
    'role', 'authenticated'
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'kitchen' limit 1),
  true
);
set local role authenticated;

update public.order_items
set status = 'preparing'
where notes = '__rls_test_item__';

do $$
declare
  affected_rows integer;
begin
  if not exists (
    select 1
    from public.order_items
    where notes = '__rls_test_item__' and status = 'preparing'
  ) then
    raise exception 'FAIL: kitchen could not update item status';
  end if;

  update public.tables
  set status = 'closing'
  where table_number = 999999;
  get diagnostics affected_rows = row_count;

  if affected_rows <> 0 then
    raise exception 'FAIL: kitchen updated a table';
  end if;

  begin
    update public.order_items
    set quantity = 99
    where notes = '__rls_test_item__';
    raise exception 'FAIL: kitchen changed a field other than item status';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Cashier: can read and close the order, but cannot create products.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from public.profiles where role = 'cashier' limit 1),
    'role', 'authenticated'
  )::text,
  true
);
select set_config(
  'request.jwt.claim.sub',
  (select id::text from public.profiles where role = 'cashier' limit 1),
  true
);
set local role authenticated;

select public.close_order(
  (select id from public.orders where notes = '__rls_test_order__'),
  'card'
);

do $$
begin
  if not exists (
    select 1
    from public.orders
    where notes = '__rls_test_order__'
      and status = 'closed'
      and payment_status = 'paid'
  ) then
    raise exception 'FAIL: cashier could not close the order';
  end if;

  begin
    insert into public.products (category_id, name, price)
    select id, '__cashier_forbidden_product__', 10
    from public.categories
    where name = '__rls_test_category__';
    raise exception 'FAIL: cashier inserted a product';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;

-- Anon: no reads, writes, or access to the service-role order RPC.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
set local role anon;

do $$
declare
  visible_rows integer;
begin
  begin
    select count(*) into visible_rows from public.products;
    if visible_rows <> 0 then
      raise exception 'FAIL: anon can read products';
    end if;
  exception
    when insufficient_privilege then null;
  end;

  begin
    insert into public.tables (table_number, capacity) values (999998, 2);
    raise exception 'FAIL: anon inserted a table';
  exception
    when insufficient_privilege then null;
  end;

  begin
    perform public.create_customer_order('{}'::jsonb);
    raise exception 'FAIL: anon called create_customer_order';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;

reset role;
rollback;
