begin;

-- Staff creation uses the same service-role-only pricing and validation pipeline.
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

  if requested_source not in ('qr', 'nfc', 'whatsapp', 'web', 'waiter') then
    raise exception 'Invalid customer order source' using errcode = '22023';
  end if;

  if (requested_type = 'dine_in' and requested_source not in ('qr', 'nfc', 'whatsapp', 'waiter'))
    or (requested_type in ('pickup', 'delivery') and requested_source not in ('web', 'whatsapp', 'waiter')) then
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
    if requested_change is not null and requested_change < subtotal + (case when requested_type = 'delivery' then settings.delivery_fee else 0 end) then
      raise exception 'Cash change amount is below order total' using errcode = '23514';
    end if;
    insert into public.customers(phone, name) values (p_payload ->> 'customer_phone', btrim(p_payload ->> 'customer_name'))
      on conflict (phone) do update set name = excluded.name returning id into matched_customer_id;
    if requested_type = 'delivery' then
      if exists (select 1 from jsonb_array_elements_text('["street","number","neighborhood","city","state","zip_code"]'::jsonb) as field(value)
        where nullif(btrim(p_payload -> 'delivery_address' ->> field.value), '') is null) then
        raise exception 'Incomplete delivery address' using errcode = '23514';
      end if;
      insert into public.customer_addresses(customer_id, street, number, complement, neighborhood, city, state, zip_code, reference)
      select matched_customer_id, a->>'street', a->>'number', nullif(a->>'complement',''), a->>'neighborhood', a->>'city', a->>'state', a->>'zip_code', nullif(a->>'reference','')
      from (select p_payload -> 'delivery_address' as a) payload
      where not exists (select 1 from public.customer_addresses saved where saved.customer_id = matched_customer_id
        and saved.street = a->>'street' and saved.number = a->>'number' and saved.zip_code = a->>'zip_code'
        and coalesce(saved.complement, '') = coalesce(a->>'complement', ''));
    end if;
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
        when requested_source <> 'waiter' and settings.require_confirmation_for_qr then 'pending_confirmation'::public.order_status
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
  if requested_type = 'delivery' and target_order.total_amount - target_order.delivery_fee < settings.min_delivery_order then
    raise exception 'Final delivery minimum not reached' using errcode = '23514';
  end if;
  if requested_type in ('pickup', 'delivery') and requested_change is not null and requested_change < target_order.total_amount then
    raise exception 'Final total exceeds cash change amount' using errcode = '23514';
  end if;
  return target_order;
end;
$$;

-- Private idempotency ledger. No browser role can read or write these payloads.
create table public.cashier_order_submissions (
  request_id uuid primary key,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  payload jsonb not null,
  order_id uuid references public.orders(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table public.cashier_order_submissions enable row level security;
revoke all on public.cashier_order_submissions from public, anon, authenticated;

create or replace function public.create_cashier_order(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  submission public.cashier_order_submissions;
  target public.orders;
  existing_order_id uuid;
  actor_role public.user_role;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create cashier orders' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = p_actor_id;
  if actor_role is null or actor_role not in ('admin', 'cashier') then
    raise exception 'Cashier access required' using errcode = '42501';
  end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid cashier order request' using errcode = '22023';
  end if;

  insert into public.cashier_order_submissions(request_id, actor_id, payload)
    values (p_request_id, p_actor_id, p_payload) on conflict (request_id) do nothing;
  select * into submission from public.cashier_order_submissions where request_id = p_request_id for update;
  if submission.actor_id <> p_actor_id or submission.payload <> p_payload then
    raise exception 'Request ID already used for another order' using errcode = '22023';
  end if;
  if submission.order_id is not null then
    select * into target from public.orders where id = submission.order_id;
    return target;
  end if;

  if p_payload ->> 'order_type' = 'dine_in' then
    -- Serialize with public ordering, token rotation, table opening and closing.
    perform 1 from public.tables where id = (p_payload ->> 'table_id')::uuid for update;
    select id into existing_order_id from public.orders
      where table_id = (p_payload ->> 'table_id')::uuid and order_type = 'dine_in'
      and status not in ('closed', 'cancelled') for update;
  end if;

  target := public.create_customer_order(p_payload || jsonb_build_object('source', 'waiter'));
  update public.orders set
    waiter_id = case when existing_order_id is null or waiter_id is null then p_actor_id else waiter_id end,
    status = case when status = 'pending_confirmation' then 'open'::public.order_status else status end,
    confirmed_at = coalesce(confirmed_at, now())
    where id = target.id returning * into target;
  if target.order_type <> 'dine_in' then
    perform public.sync_offsite_ready(target.id);
    select * into target from public.orders where id = target.id;
  end if;
  update public.cashier_order_submissions set order_id = target.id where request_id = p_request_id;
  return target;
end $$;
revoke all on function public.create_cashier_order(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_cashier_order(uuid, uuid, jsonb) to service_role;

commit;
