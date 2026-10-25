begin;
drop trigger recompute_order_total_after_fee_update on public.orders;
-- Test data only: round numerical values, do not perform FX conversion.
-- Invalidate expiring delivery quotes; their pricing snapshots use old units.
delete from public.delivery_quotes;
alter table public.products alter column price type bigint using round(price)::bigint;
alter table public.products add constraint products_price_safe_pyg check (price between 0 and 1000000000000);
alter table public.order_items alter column unit_price type bigint using round(unit_price)::bigint;
alter table public.order_items add constraint order_items_unit_price_safe_pyg check (unit_price between 0 and 1000000000000);
alter table public.orders alter column total_amount type bigint using round(total_amount)::bigint;
alter table public.orders add constraint orders_total_amount_safe_pyg check (total_amount between 0 and 1000000000000);
alter table public.orders alter column delivery_fee type bigint using round(delivery_fee)::bigint;
alter table public.orders add constraint orders_delivery_fee_safe_pyg check (delivery_fee between 0 and 1000000000000);
alter table public.orders alter column cash_change_for type bigint using round(cash_change_for)::bigint;
alter table public.orders add constraint orders_cash_change_for_safe_pyg check (cash_change_for between 0 and 1000000000000);
alter table public.restaurant_settings alter column delivery_fee type bigint using round(delivery_fee)::bigint;
alter table public.restaurant_settings add constraint restaurant_settings_delivery_fee_safe_pyg check (delivery_fee between 0 and 1000000000000);
alter table public.restaurant_settings alter column min_delivery_order type bigint using round(min_delivery_order)::bigint;
alter table public.restaurant_settings add constraint restaurant_settings_min_delivery_order_safe_pyg check (min_delivery_order between 0 and 1000000000000);
alter table public.restaurant_settings alter column delivery_distance_step_fee type bigint using round(delivery_distance_step_fee)::bigint;
alter table public.restaurant_settings add constraint restaurant_settings_delivery_distance_step_fee_safe_pyg check (delivery_distance_step_fee between 0 and 1000000000000);
alter table public.delivery_quotes alter column fee type bigint using round(fee)::bigint;
alter table public.delivery_quotes add constraint delivery_quotes_fee_safe_pyg check (fee between 0 and 1000000000000);
create trigger recompute_order_total_after_fee_update after update of delivery_fee on public.orders for each row when (old.delivery_fee is distinct from new.delivery_fee) execute function public.recompute_order_total_from_fee();
update public.orders o set total_amount = coalesce((select sum(i.unit_price::numeric*i.quantity) from public.order_items i where i.order_id=o.id),0)+o.delivery_fee;
alter table public.restaurant_settings drop constraint if exists restaurant_settings_delivery_distance_step_fee_check;
alter table public.delivery_quotes drop constraint if exists delivery_quotes_fee_check;
alter table public.restaurant_settings add column enabled_payment_methods public.payment_method[] not null default array['cash','transfer','card','pix']::public.payment_method[];
alter table public.restaurant_settings add constraint enabled_methods_valid check (cardinality(enabled_payment_methods)>0 and array_position(enabled_payment_methods,null) is null);
create function public.require_pyg(p_value text) returns bigint language plpgsql immutable set search_path='' as $$
declare n numeric;
begin
 if p_value is null then return null; end if;
 n:=p_value::numeric;
 if n < 0 or n > 1000000000000 or n <> trunc(n) or n::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid integer PYG amount' using errcode='22023'; end if;
 return n::bigint;
end $$;
revoke all on function public.require_pyg(text) from public,anon;
grant execute on function public.require_pyg(text) to authenticated,service_role;
create or replace function public.create_customer_order(p_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.restaurant_settings;
  resolved_delivery_fee bigint;
  quote public.delivery_quotes;
  requested_type public.order_type;
  requested_source public.order_source;
  requested_table_id uuid;
  requested_payment_method public.payment_method;
  requested_change bigint;
  matched_customer_id uuid;
  item jsonb;
  item_product_id uuid;
  item_quantity integer;
  item_price bigint;
  subtotal bigint := 0;
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
    requested_change := public.require_pyg(nullif(p_payload ->> 'cash_change_for', ''));
    if requested_payment_method is not null and not exists(select 1 from public.restaurant_settings where requested_payment_method = any(enabled_payment_methods)) then raise exception 'Payment method disabled' using errcode='22023'; end if;
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

  resolved_delivery_fee := settings.delivery_fee;
  if requested_type = 'delivery' and settings.delivery_fee_mode = 'distance' then
    select * into quote from public.delivery_quotes
      where id = (p_payload -> 'delivery_address' ->> 'delivery_quote_id')::uuid
        and location_url = p_payload -> 'delivery_address' ->> 'location_url'
        and expires_at > now()
        and pricing = public.delivery_pricing_snapshot(settings);
    if not found then
      raise exception 'Recalculate delivery route before submitting' using errcode = '23514';
    end if;
    resolved_delivery_fee := quote.fee;
    p_payload := jsonb_set(p_payload, '{delivery_address,delivery_distance_meters}', to_jsonb(quote.distance_meters));
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
    if requested_change is not null and requested_change < subtotal + (case when requested_type = 'delivery' then resolved_delivery_fee else 0 end) then
      raise exception 'Cash change amount is below order total' using errcode = '23514';
    end if;
    insert into public.customers(phone, name) values (p_payload ->> 'customer_phone', btrim(p_payload ->> 'customer_name'))
      on conflict (phone) do update set name = excluded.name returning id into matched_customer_id;
    if requested_type = 'delivery' then
      if nullif(btrim(p_payload -> 'delivery_address' ->> 'location_url'), '') is not null and (
        jsonb_typeof(p_payload -> 'delivery_address' -> 'location_url') <> 'string'
        or length(p_payload -> 'delivery_address' ->> 'location_url') > 2048
        or (p_payload -> 'delivery_address' ->> 'location_url') !~ '^https://(maps[.]app[.]goo[.]gl/|maps[.]apple[.]com/|maps[.]google[.]com([.]br)?/|((www[.])?google[.]com([.]br)?)/maps|goo[.]gl/maps/|((www[.]|ul[.])?waze[.]com)/)'
      ) then
        raise exception 'Invalid delivery map link' using errcode = '23514';
      end if;
      if exists (select 1 from jsonb_array_elements_text('["street","number","neighborhood","city","state","zip_code"]'::jsonb) as field(value)
        where nullif(btrim(p_payload -> 'delivery_address' ->> field.value), '') is null) then
        if nullif(btrim(p_payload -> 'delivery_address' ->> 'location_url'), '') is null then
          raise exception 'Delivery requires a written address or map location' using errcode = '23514';
        end if;
      else
      insert into public.customer_addresses(customer_id, street, number, complement, neighborhood, city, state, zip_code, reference)
      select matched_customer_id, a->>'street', a->>'number', nullif(a->>'complement',''), a->>'neighborhood', a->>'city', a->>'state', a->>'zip_code', nullif(a->>'reference','')
      from (select p_payload -> 'delivery_address' as a) payload
      where not exists (select 1 from public.customer_addresses saved where saved.customer_id = matched_customer_id
        and saved.street = a->>'street' and saved.number = a->>'number' and saved.zip_code = a->>'zip_code'
        and coalesce(saved.complement, '') = coalesce(a->>'complement', ''));
      end if;
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
      case when requested_type = 'delivery' then resolved_delivery_fee else 0 end,
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

revoke all on function public.create_customer_order(jsonb) from public, anon, authenticated;
grant execute on function public.create_customer_order(jsonb) to service_role;
create or replace function public.set_order_item_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  product_price bigint;
begin
  select price
    into product_price
  from public.products
  where id = new.product_id
    and is_active;

  if not found then
    raise exception 'Product is inactive or does not exist'
      using errcode = '23514';
  end if;

  new.unit_price := product_price;
  return new;
end;
$$;
create or replace function public.recompute_order_total(p_order_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  computed_total bigint;
begin
  update public.orders as target
  set total_amount = coalesce(
    (
      select sum(item.quantity * item.unit_price)
      from public.order_items as item
      where item.order_id = p_order_id
    ),
    0
  ) + target.delivery_fee
  where target.id = p_order_id
  returning target.total_amount into computed_total;

  return computed_total;
end;
$$;

create table public.exchange_rates (
 id uuid primary key default gen_random_uuid(),
 rate numeric(20,8) not null check (rate between 0.01 and 100000000),
 rounding text not null check (rounding in ('none','half_real','whole_real')),
 valid_from timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now()
);
alter table public.exchange_rates enable row level security;
revoke all on public.exchange_rates from anon,authenticated;
grant select on public.exchange_rates to authenticated;
create policy rates_staff_read on public.exchange_rates for select to authenticated using (public.current_user_role() is not null);
create function public.reject_financial_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Financial history is immutable' using errcode='42501'; end $$;
create trigger exchange_rates_immutable before update or delete on public.exchange_rates for each row execute function public.reject_financial_mutation();

create function public.set_exchange_rate(p_rate text, p_rounding text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if public.current_user_role() is distinct from 'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_rate::numeric<>round(p_rate::numeric,8) then raise exception 'Rate precision exceeds 8 decimals' using errcode='22023'; end if;
 insert into public.exchange_rates(rate,rounding,created_by) values(p_rate::numeric,p_rounding,auth.uid()) returning id into result;
 return result;
end $$;
revoke all on function public.set_exchange_rate(text,text) from public,anon;
grant execute on function public.set_exchange_rate(text,text) to authenticated;

create function public.payment_configuration() returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('enabled_methods',s.enabled_payment_methods,'rate',(
 select jsonb_build_object('id',r.id,'rate',r.rate::text,'rounding',r.rounding) from public.exchange_rates r
 where r.valid_from<=now() order by r.valid_from desc,r.created_at desc,r.id desc limit 1)) from public.restaurant_settings s where s.id;
$$;
revoke all on function public.payment_configuration() from public,anon;
grant execute on function public.payment_configuration() to authenticated,service_role;

create function public.brl_cents_for(p_pyg bigint,p_rate numeric,p_rounding text) returns bigint
language plpgsql immutable set search_path='' as $$
declare step integer;
begin
 if p_pyg<0 or p_pyg>1000000000000 or p_rate is null or p_rate<0.01 or p_rate>100000000 or p_rounding not in ('none','half_real','whole_real') then raise exception 'Invalid conversion' using errcode='22023'; end if;
 step:=case p_rounding when 'half_real' then 50 when 'whole_real' then 100 else 1 end;
 return ceil(p_pyg::numeric*100/p_rate/step)*step;
end $$;
revoke all on function public.brl_cents_for(bigint,numeric,text) from public,anon;
grant execute on function public.brl_cents_for(bigint,numeric,text) to authenticated,service_role;

create table public.order_payment_submissions (
 request_id uuid primary key,
 order_id uuid not null references public.orders(id),
 actor_id uuid not null references public.profiles(id),
 payload jsonb not null,
 result jsonb
);
alter table public.order_payment_submissions enable row level security;
revoke all on public.order_payment_submissions from anon,authenticated;

create table public.payments (
 id uuid primary key default gen_random_uuid(),
 order_id uuid not null references public.orders(id),
 method public.payment_method not null,
 currency text not null check (currency in ('PYG','BRL')),
 original_amount bigint not null check (original_amount between 0 and 1000000000000),
 exchange_rate_id uuid references public.exchange_rates(id),
 exchange_rate numeric(20,8),
 rounding text,
 equivalent_pyg bigint not null check (equivalent_pyg between 0 and 1000000000000),
 rounding_adjustment_pyg bigint not null default 0,
 change_pyg bigint not null default 0 check(change_pyg>=0),
 operator_id uuid not null references public.profiles(id),
 created_at timestamptz not null default now(),
 status text not null default 'recorded' check(status='recorded'),
 idempotency_key uuid not null references public.order_payment_submissions(request_id),
 line_number integer not null,
 unique(idempotency_key,line_number),
 check ((currency='PYG' and exchange_rate is null and exchange_rate_id is null and rounding is null and rounding_adjustment_pyg=0) or (currency='BRL' and exchange_rate>0 and exchange_rate_id is not null and rounding in ('none','half_real','whole_real'))),
 check (change_pyg=0 or method='cash')
);
create index payments_order_idx on public.payments(order_id);
alter table public.payments enable row level security;
revoke all on public.payments from anon,authenticated;
grant select on public.payments to authenticated;
create policy payments_staff_read on public.payments for select to authenticated using(public.current_user_role() in ('admin','cashier'));
create trigger payments_immutable before update or delete on public.payments for each row execute function public.reject_financial_mutation();

-- Browser roles cannot bypass the payment ledger via direct order updates.
create function public.guard_order_payment_fields() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and (new.payment_status is distinct from old.payment_status or new.closed_at is distinct from old.closed_at or (new.status='closed' and old.status<>'closed')) then
 raise exception 'Use the payment service' using errcode='42501'; end if;
 return new;
end $$;
create trigger orders_payment_service_only before update on public.orders for each row execute function public.guard_order_payment_fields();

create function public.record_order_payments(p_order_id uuid,p_request_id uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; submission public.order_payment_submissions; config public.restaurant_settings;
 line jsonb; method public.payment_method; currency text; original bigint; allocated bigint; credited bigint; converted bigint; change bigint; expected bigint;
 paid bigint; rate public.exchange_rates; latest_rate uuid; ordinal integer:=0; result jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501'; end if;
 if p_request_id is null or p_lines is null or jsonb_typeof(p_lines)<>'array' or jsonb_array_length(p_lines) not between 1 and 20 then raise exception 'Invalid payment request' using errcode='22023'; end if;
 -- Reuse existing table-first lock ordering for dine-in ordering.
 perform 1 from public.tables where id=(select table_id from public.orders where id=p_order_id) for update;
 select * into o from public.orders where id=p_order_id for update;
 if not found then raise exception 'Order not found' using errcode='P0002'; end if;
 insert into public.order_payment_submissions(request_id,order_id,actor_id,payload) values(p_request_id,p_order_id,auth.uid(),p_lines) on conflict do nothing;
 select * into submission from public.order_payment_submissions where request_id=p_request_id for update;
 if submission.order_id<>p_order_id or submission.actor_id<>auth.uid() or submission.payload<>p_lines then raise exception 'Idempotency key already used' using errcode='22023'; end if;
 if submission.result is not null then return submission.result; end if;
 if o.status in ('closed','cancelled','pending_confirmation') then raise exception 'Order cannot receive payments' using errcode='23514'; end if;
 if o.order_type='pickup' and o.status<>'ready' or o.order_type='delivery' and o.status<>'out_for_delivery' then raise exception 'Order is not ready for completion' using errcode='23514'; end if;
 perform public.recompute_order_total(o.id);
 select * into o from public.orders where id=o.id;
 select * into config from public.restaurant_settings where id for share;
 select id into latest_rate from public.exchange_rates where valid_from<=now() order by valid_from desc,created_at desc,id desc limit 1;
 select coalesce(sum(equivalent_pyg-change_pyg),0) into paid from public.payments where order_id=o.id;
 for line in select value from jsonb_array_elements(p_lines) loop
  ordinal:=ordinal+1;
  method:=(line->>'method')::public.payment_method; currency:=line->>'currency';
  original:=public.require_pyg(line->>'original_amount'); allocated:=public.require_pyg(line->>'amount_pyg');
  if method is null or not(method=any(config.enabled_payment_methods)) or currency is null or currency not in ('PYG','BRL') or original is null or allocated is null or allocated>o.total_amount-paid or (allocated=0 and o.total_amount<>0) then raise exception 'Invalid or disabled payment' using errcode='22023'; end if;
  rate:=null; change:=0;
  if currency='BRL' then
   select * into rate from public.exchange_rates where id=(line->>'rate_id')::uuid and id=latest_rate;
   if not found then raise exception 'Exchange rate changed; review payment' using errcode='23514'; end if;
   expected:=public.brl_cents_for(allocated,rate.rate,rate.rounding);
   if expected>1000000000000 or original<expected or (method<>'cash' and original<>expected) then raise exception 'Invalid BRL payment amount' using errcode='23514'; end if;
   converted:=round(original::numeric*rate.rate/100);
   if method='cash' then credited:=converted; change:=credited-allocated; else credited:=allocated; end if;
  else
   if nullif(line->>'rate_id','') is not null or original<allocated or (method<>'cash' and original<>allocated) then raise exception 'Overpayment only allowed in cash' using errcode='23514'; end if;
   converted:=original; credited:=original; change:=original-allocated;
  end if;
  insert into public.payments(order_id,method,currency,original_amount,exchange_rate_id,exchange_rate,rounding,equivalent_pyg,rounding_adjustment_pyg,change_pyg,operator_id,idempotency_key,line_number)
  values(o.id,method,currency,original,rate.id,rate.rate,rate.rounding,credited,case when currency='BRL' then converted-credited else 0 end,change,auth.uid(),p_request_id,ordinal);
  paid:=paid+credited-change;
 end loop;
 if paid>=o.total_amount then
  update public.orders set status='closed',payment_status='paid',closed_at=now(),payment_method=case when (select count(*) from public.payments where order_id=o.id)=1 then method else null end where id=o.id;
  if o.table_id is not null then update public.tables set status='available' where id=o.table_id; end if;
 end if;
 select jsonb_build_object('order',to_jsonb(x),'paid_pyg',paid,'remaining_pyg',greatest(0,x.total_amount-paid),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at,line_number),'[]') from public.payments p where p.order_id=x.id)) into result from public.orders x where x.id=o.id;
 update public.order_payment_submissions set result=record_order_payments.result where request_id=p_request_id;
 return result;
end $$;
revoke all on function public.record_order_payments(uuid,uuid,jsonb) from public,anon;
grant execute on function public.record_order_payments(uuid,uuid,jsonb) to authenticated;

-- Legacy completion routes share the same ledger. They cannot bypass conversion.
create or replace function public.close_order(p_order_id uuid,p_payment_method text) returns public.orders
language plpgsql security definer set search_path='' as $$
declare o public.orders; configuration jsonb; lines jsonb; remaining bigint; result jsonb;
begin
 if coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order_id;
 if o.status='closed' then return o; end if;
 select o.total_amount-coalesce(sum(equivalent_pyg-change_pyg),0) into remaining from public.payments where order_id=o.id;
 configuration:=public.payment_configuration();
 lines:=jsonb_build_array(jsonb_build_object('method',p_payment_method,'currency',case when p_payment_method='pix' then 'BRL' else 'PYG' end,'amount_pyg',remaining,'original_amount',case when p_payment_method='pix' then public.brl_cents_for(remaining,(configuration->'rate'->>'rate')::numeric,configuration->'rate'->>'rounding') else remaining end,'rate_id',case when p_payment_method='pix' then configuration->'rate'->>'id' else null end));
 result:=public.record_order_payments(p_order_id,md5(p_order_id::text||auth.uid()::text||p_payment_method)::uuid,lines);
 return jsonb_populate_record(null::public.orders,result->'order');
end $$;

create function public.set_payment_methods(p_methods text[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if public.current_user_role() is distinct from 'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if cardinality(p_methods) not between 1 and 4 or cardinality(p_methods)<>(select count(distinct m) from unnest(p_methods) m) or array_position(p_methods,null) is not null then raise exception 'Invalid methods' using errcode='22023'; end if;
 update public.restaurant_settings set enabled_payment_methods=p_methods::public.payment_method[] where id;
end $$;
revoke all on function public.set_payment_methods(text[]) from public,anon;
grant execute on function public.set_payment_methods(text[]) to authenticated;
create or replace function public.advance_hub_order(p_order_id uuid, p_action text, p_reason text default null, p_payment_method text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare target public.orders;
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text, '') not in ('admin', 'cashier') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if p_action = 'accept' and target.status = 'pending_confirmation' then
    update public.orders set status = 'open' where id = target.id;
  elsif p_action = 'reject' and target.status = 'pending_confirmation' and nullif(btrim(p_reason), '') is not null and length(p_reason) <= 300 then
    update public.orders set status = 'cancelled', cancel_reason = btrim(p_reason) where id = target.id;
  elsif p_action = 'ready' and target.order_type <> 'dine_in' and target.status = 'open' then
    update public.orders set status = 'ready' where id = target.id;
  elsif p_action = 'dispatch' and target.order_type = 'delivery' and target.status = 'ready' then
    update public.orders set status = 'out_for_delivery' where id = target.id;
  elsif p_action = 'complete' and p_payment_method in ('cash', 'transfer', 'card', 'pix') and ((target.order_type = 'pickup' and target.status = 'ready') or (target.order_type = 'delivery' and target.status = 'out_for_delivery')) then
    if p_payment_method <> 'cash' then update public.orders set cash_change_for = null where id = target.id; end if;
    return public.close_order(target.id, p_payment_method);
  else
    raise exception 'Invalid or stale transition' using errcode = 'P0001';
  end if;
  select * into target from public.orders where id = p_order_id;
  return target;
end $$;
revoke all on function public.advance_hub_order(uuid, text, text, text) from public, anon;
grant execute on function public.advance_hub_order(uuid, text, text, text) to authenticated;


commit;
