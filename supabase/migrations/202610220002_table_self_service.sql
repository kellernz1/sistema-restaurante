begin;

-- Phase 8: staff-only service requests and database-backed public throttling.
create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  table_id uuid not null references public.tables(id) on delete cascade,
  type text not null check (type in ('waiter', 'bill')),
  status text not null default 'open' check (status in ('open', 'attended')),
  created_at timestamptz not null default now()
);
create index service_requests_table_idx on public.service_requests(table_id);
create index service_requests_status_idx on public.service_requests(status, created_at);
create unique index service_requests_one_open_type_idx on public.service_requests(table_id, type) where status = 'open';
alter table public.service_requests enable row level security;
revoke all on public.service_requests from anon, authenticated;
grant select on public.service_requests to authenticated;
grant all on public.service_requests to service_role;
create policy service_requests_staff_read on public.service_requests for select to authenticated
  using (auth.uid() is not null and public.current_user_role() in ('admin', 'waiter', 'cashier'));
alter publication supabase_realtime add table public.service_requests;

create table public.public_rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null check (hits > 0),
  primary key (key, window_start)
);
create index public_rate_limits_expiry_idx on public.public_rate_limits(window_start);
alter table public.public_rate_limits enable row level security;
revoke all on public.public_rate_limits from anon, authenticated;
grant all on public.public_rate_limits to service_role;

create or replace function public.consume_public_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare bucket timestamptz; hit_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_limit < 1 or p_window_seconds not between 1 and 3600 or length(p_key) > 200 then raise exception 'Invalid rate limit'; end if;
  bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  delete from public.public_rate_limits where window_start < now() - interval '2 hours';
  insert into public.public_rate_limits(key, window_start, hits) values (p_key, bucket, 1)
    on conflict (key, window_start) do update set hits = public.public_rate_limits.hits + 1
    returning hits into hit_count;
  return hit_count <= p_limit;
end;
$$;
revoke all on function public.consume_public_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_public_rate_limit(text, integer, integer) to service_role;

create or replace function public.create_table_service_request(p_token text, p_type text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare selected_table public.tables; request_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p_type not in ('waiter', 'bill') then raise exception 'Invalid request type'; end if;
  select * into selected_table from public.tables where qr_token = p_token for update;
  if not found then raise exception 'Invalid table token' using errcode = 'P0002'; end if;
  if not exists (select 1 from public.restaurant_settings where id = true and dine_in_qr_enabled) then
    raise exception 'Self-service disabled' using errcode = 'P0001';
  end if;
  if p_type = 'bill' then
    if not exists (select 1 from public.orders where table_id = selected_table.id and order_type = 'dine_in' and status not in ('closed', 'cancelled')) then
      raise exception 'No active order' using errcode = 'P0001';
    end if;
    update public.tables set status = 'closing' where id = selected_table.id;
  end if;
  insert into public.service_requests(table_id, type) values (selected_table.id, p_type)
    on conflict (table_id, type) where status = 'open' do update set type = excluded.type
    returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.create_table_service_request(text, text) from public, anon, authenticated;
grant execute on function public.create_table_service_request(text, text) to service_role;

create or replace function public.attend_service_request(p_request_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text, '') not in ('admin', 'waiter') then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.service_requests set status = 'attended' where id = p_request_id and status = 'open';
  if not found then raise exception 'Request already attended' using errcode = 'P0001'; end if;
end;
$$;
revoke all on function public.attend_service_request(uuid) from public, anon;
grant execute on function public.attend_service_request(uuid) to authenticated;

create or replace function public.review_table_order(p_order_id uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.orders; target_table_id uuid;
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text, '') not in ('admin', 'waiter') then raise exception 'Not authorized' using errcode = '42501'; end if;
  select table_id into target_table_id from public.orders where id = p_order_id and order_type = 'dine_in';
  perform 1 from public.tables where id = target_table_id for update;
  select * into target from public.orders where id = p_order_id and order_type = 'dine_in' and source in ('qr', 'nfc') and status = 'pending_confirmation' for update;
  if not found then raise exception 'Order already reviewed' using errcode = 'P0001'; end if;
  update public.orders set status = case when p_accept then 'open'::public.order_status else 'cancelled'::public.order_status end,
    cancel_reason = case when p_accept then null else 'Pedido não confirmado pelo atendimento' end,
    waiter_id = case when p_accept then auth.uid() else waiter_id end
    where id = target.id;
end;
$$;
revoke all on function public.review_table_order(uuid, boolean) from public, anon;
grant execute on function public.review_table_order(uuid, boolean) to authenticated;

create or replace function public.rotate_table_token(p_table_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text, '') <> 'admin' then raise exception 'Not authorized' using errcode = '42501'; end if;
  update public.tables set qr_token = encode(extensions.gen_random_bytes(32), 'hex') where id = p_table_id returning qr_token into token;
  if not found then raise exception 'Table not found' using errcode = 'P0002'; end if;
  return token;
end;
$$;
revoke all on function public.rotate_table_token(uuid) from public, anon;
grant execute on function public.rotate_table_token(uuid) to authenticated;

create or replace function public.create_customer_order(p_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.restaurant_settings;
  requested_type public.order_type;
  requested_source public.order_source;
  requested_table_id uuid;
  requested_payment_method public.payment_method;
  requested_change numeric(10, 2);
  matched_customer_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity integer;
  item_price numeric(10, 2);
  subtotal numeric(10, 2) := 0;
  target_order public.orders;
  selected_table public.tables;
  initial_status public.order_status;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create customer orders' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Payload must be a JSON object' using errcode = '22023';
  end if;

  begin
    requested_type := (p_payload ->> 'order_type')::public.order_type;
    requested_source := (p_payload ->> 'source')::public.order_source;
    requested_table_id := nullif(p_payload ->> 'table_id', '')::uuid;
    requested_payment_method := nullif(p_payload ->> 'payment_method', '')::public.payment_method;
    requested_change := nullif(p_payload ->> 'cash_change_for', '')::numeric(10, 2);
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Payload contains an invalid enum, UUID, or numeric value' using errcode = '22023';
  end;

  if requested_type is null or requested_source is null then
    raise exception 'Order type and source are required' using errcode = '22023';
  end if;

  if requested_source not in ('qr', 'nfc', 'whatsapp', 'web') then
    raise exception 'Invalid customer order source' using errcode = '22023';
  end if;

  if (requested_type = 'dine_in' and requested_source not in ('qr', 'nfc', 'whatsapp'))
    or (requested_type in ('pickup', 'delivery') and requested_source not in ('web', 'whatsapp')) then
    raise exception 'Order type and source are incompatible' using errcode = '22023';
  end if;

  if jsonb_typeof(p_payload -> 'items') <> 'array'
    or jsonb_array_length(p_payload -> 'items') = 0
    or jsonb_array_length(p_payload -> 'items') > 100 then
    raise exception 'An order must contain between 1 and 100 items' using errcode = '22023';
  end if;

  select * into settings
  from public.restaurant_settings
  where id = true
  for share;

  if not found or not settings.is_accepting_orders then
    raise exception 'Restaurant is not accepting orders' using errcode = 'P0001';
  end if;

  if requested_type = 'dine_in' then
    if requested_table_id is null then
      raise exception 'Dine-in orders require a table' using errcode = '22023';
    end if;
    if requested_source in ('qr', 'nfc') and not settings.dine_in_qr_enabled then
      raise exception 'Table self-service is disabled' using errcode = 'P0001';
    end if;
  elsif requested_type = 'pickup' and not settings.pickup_enabled then
    raise exception 'Pickup orders are disabled' using errcode = 'P0001';
  elsif requested_type = 'delivery' and not settings.delivery_enabled then
    raise exception 'Delivery orders are disabled' using errcode = 'P0001';
  end if;

  if requested_type in ('pickup', 'delivery') then
    if nullif(btrim(p_payload ->> 'customer_name'), '') is null
      or nullif(btrim(p_payload ->> 'customer_phone'), '') is null then
      raise exception 'Customer name and phone are required' using errcode = '22023';
    end if;
    if (p_payload ->> 'customer_phone') !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'Customer phone must use E.164 format' using errcode = '22023';
    end if;
  end if;

  if requested_type = 'delivery'
    and (
      p_payload -> 'delivery_address' is null
      or jsonb_typeof(p_payload -> 'delivery_address') <> 'object'
    ) then
    raise exception 'Delivery orders require an address' using errcode = '22023';
  end if;

  if requested_change is not null
    and (requested_payment_method is distinct from 'cash' or requested_change < 0) then
    raise exception 'Change amount is only valid for cash payments' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(p_payload -> 'items')
  loop
    begin
      item_product_id := (item ->> 'product_id')::uuid;
      item_quantity := (item ->> 'quantity')::integer;
    exception
      when invalid_text_representation or numeric_value_out_of_range then
        raise exception 'Invalid product or quantity' using errcode = '22023';
    end;

    if item_quantity <= 0 then
      raise exception 'Item quantity must be positive' using errcode = '22023';
    end if;

    select price into item_price
    from public.products
    where id = item_product_id and is_active;

    if not found then
      raise exception 'Product % is inactive or does not exist', item_product_id using errcode = '23514';
    end if;

    subtotal := subtotal + (item_price * item_quantity);
  end loop;

  if requested_type = 'delivery' and subtotal < settings.min_delivery_order then
    raise exception 'Delivery minimum order value was not reached' using errcode = 'P0001';
  end if;

  if requested_type in ('pickup', 'delivery') then
    select id into matched_customer_id
    from public.customers
    where phone = p_payload ->> 'customer_phone';
  end if;

  if requested_type = 'dine_in' then
    select * into selected_table
    from public.tables
    where id = requested_table_id
      and (requested_source not in ('qr', 'nfc') or qr_token = p_payload ->> 'table_token')
    for update;

    if not found then
      raise exception 'Table not found' using errcode = 'P0002';
    end if;

    if selected_table.status = 'closing' then
      raise exception 'Table is closing and cannot receive new items' using errcode = 'P0001';
    end if;

    select * into target_order
    from public.orders
    where table_id = requested_table_id
      and order_type = 'dine_in'
      and status not in ('closed', 'cancelled')
    for update;

    if not found then
      initial_status := case
        when settings.require_confirmation_for_qr then 'pending_confirmation'::public.order_status
        else 'open'::public.order_status
      end;

      insert into public.orders (
        order_type,
        source,
        table_id,
        customer_name,
        notes,
        status,
        confirmed_at
      ) values (
        'dine_in',
        requested_source,
        requested_table_id,
        nullif(btrim(p_payload ->> 'customer_name'), ''),
        nullif(btrim(p_payload ->> 'notes'), ''),
        initial_status,
        case when initial_status = 'open' then now() else null end
      )
      returning * into target_order;
    elsif target_order.status = 'ready' then
      update public.orders
      set status = 'open'
      where id = target_order.id
      returning * into target_order;
    end if;
  else
    insert into public.orders (
      order_type,
      source,
      customer_id,
      customer_name,
      customer_phone,
      delivery_address,
      delivery_fee,
      notes,
      payment_method,
      cash_change_for,
      status
    ) values (
      requested_type,
      requested_source,
      matched_customer_id,
      btrim(p_payload ->> 'customer_name'),
      p_payload ->> 'customer_phone',
      case when requested_type = 'delivery' then p_payload -> 'delivery_address' else null end,
      case when requested_type = 'delivery' then settings.delivery_fee else 0 end,
      nullif(btrim(p_payload ->> 'notes'), ''),
      requested_payment_method,
      requested_change,
      'pending_confirmation'
    )
    returning * into target_order;
  end if;

  for item in select value from jsonb_array_elements(p_payload -> 'items')
  loop
    insert into public.order_items (order_id, product_id, quantity, unit_price, notes)
    values (
      target_order.id,
      (item ->> 'product_id')::uuid,
      (item ->> 'quantity')::integer,
      0,
      nullif(btrim(item ->> 'notes'), '')
    );
  end loop;

  select * into target_order from public.orders where id = target_order.id;
  return target_order;
end;
$$;


commit;
