begin;
alter table public.restaurant_settings
 add column restaurant_name text not null default 'Mesa Certa' check(length(btrim(restaurant_name)) between 1 and 80),
 add column business_timezone text not null default 'America/Asuncion',
 add column business_day_start time not null default '05:00' check(business_day_start<'24:00'),
 add column counter_payment_timing text not null default 'at_order' check(counter_payment_timing in ('at_order','at_end')),
 add column counter_green_minutes integer not null default 2 check(counter_green_minutes between 0 and 120),
 add column counter_yellow_minutes integer not null default 5 check(counter_yellow_minutes between 0 and 1440),
 add constraint counter_wait_thresholds check(counter_yellow_minutes>=counter_green_minutes);
create function public.validate_business_timezone() returns trigger language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.business_timezone) then raise exception 'Invalid business timezone' using errcode='22023'; end if;
 return new;
end $$;
create trigger restaurant_business_timezone before insert or update of business_timezone on public.restaurant_settings for each row execute function public.validate_business_timezone();

create function public.business_day_for(p_at timestamptz,p_zone text,p_start time) returns date language sql stable set search_path='' as $$
 select ((p_at at time zone p_zone)-(p_start-time '00:00'))::date;
$$;
create function public.business_day_window(p_at timestamptz default now()) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('date',d.business_date,'start',((d.business_date+s.business_day_start) at time zone s.business_timezone),'end',((d.business_date+1+s.business_day_start) at time zone s.business_timezone))
 from public.restaurant_settings s cross join lateral(select public.business_day_for(p_at,s.business_timezone,s.business_day_start) as business_date) d where s.id;
$$;
revoke all on function public.business_day_window(timestamptz) from public,anon;
grant execute on function public.business_day_window(timestamptz) to authenticated;

alter table public.orders add column is_counter boolean not null default false,
 add column counter_ticket integer,
 add column counter_business_date date,
 add column counter_name text check(counter_name is null or length(counter_name)<=30),
 add column counter_payment_timing text check(counter_payment_timing in ('at_order','at_end')),
 add column counter_ready_at timestamptz;
alter table public.orders drop constraint orders_type_fields;
alter table public.orders add constraint orders_type_fields check(
 (order_type='dine_in' and table_id is not null and not is_counter) or
 (order_type='pickup' and ((is_counter and table_id is null and source='waiter' and customer_phone is null and customer_id is null) or (not is_counter and customer_name is not null and customer_phone is not null))) or
 (order_type='delivery' and not is_counter and customer_name is not null and customer_phone is not null and delivery_address is not null and jsonb_typeof(delivery_address)='object'));
alter table public.orders add constraint counter_ticket_fields check(
 (is_counter and counter_ticket>0 and counter_business_date is not null and counter_payment_timing is not null) or
 (not is_counter and counter_ticket is null and counter_business_date is null and counter_name is null and counter_payment_timing is null and counter_ready_at is null));
create unique index counter_daily_ticket_unique on public.orders(counter_business_date,counter_ticket) where is_counter;
create index counter_ready_queue on public.orders(counter_ready_at,id) where is_counter and status='ready';

create table public.counter_daily_numbers(business_date date primary key,last_ticket integer not null check(last_ticket>0));
alter table public.counter_daily_numbers enable row level security;
revoke all on public.counter_daily_numbers from public,anon,authenticated;
create function public.next_counter_ticket(p_day date) returns integer language plpgsql security definer set search_path='' as $$
declare ticket integer;
begin
 insert into public.counter_daily_numbers(business_date,last_ticket) values(p_day,1)
 on conflict(business_date) do update set last_ticket=public.counter_daily_numbers.last_ticket+1 returning last_ticket into ticket;
 return ticket;
end $$;
revoke all on function public.next_counter_ticket(date) from public,anon,authenticated;

create function public.counter_order_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
declare settings public.restaurant_settings;
begin
 if tg_op='INSERT' and new.is_counter then
  select * into settings from public.restaurant_settings where id;
  new.counter_business_date:=public.business_day_for(now(),settings.business_timezone,settings.business_day_start);
  new.counter_ticket:=public.next_counter_ticket(new.counter_business_date);
  new.counter_payment_timing:=settings.counter_payment_timing;
  new.counter_name:=nullif(btrim(regexp_replace(replace(coalesce(new.counter_name,''),chr(160),' '),'[[:space:][:cntrl:]]+',' ','g')),'');
  if length(new.counter_name)>30 then raise exception 'Counter name exceeds 30 characters' using errcode='22023'; end if;
  new.customer_name:=new.counter_name;
 elsif tg_op='UPDATE' then
  if row(new.is_counter,new.counter_ticket,new.counter_business_date,new.counter_payment_timing,new.counter_name) is distinct from row(old.is_counter,old.counter_ticket,old.counter_business_date,old.counter_payment_timing,old.counter_name) then raise exception 'Counter identity is immutable' using errcode='42501'; end if;
  if new.is_counter and new.status='ready' and old.status<>'ready' then new.counter_ready_at:=now();
  elsif new.is_counter and new.status='open' then new.counter_ready_at:=null; end if;
 end if;
 return new;
end $$;
create trigger counter_lifecycle before insert or update on public.orders for each row execute function public.counter_order_lifecycle();
create function public.counter_write_boundary() returns trigger language plpgsql set search_path='' as $$
begin
 if new.is_counter and current_user in ('authenticated','anon') then raise exception 'Use counter RPCs' using errcode='42501'; end if;
 return new;
end $$;
create trigger counter_rpc_only before insert or update on public.orders for each row execute function public.counter_write_boundary();

create table public.counter_order_submissions(
 request_id uuid primary key,actor_id uuid not null references public.profiles(id),payload jsonb not null,lines jsonb not null,
 order_id uuid references public.orders(id),result jsonb,created_at timestamptz not null default now());
alter table public.counter_order_submissions enable row level security;
revoke all on public.counter_order_submissions from public,anon,authenticated;

create function public.create_counter_order(p_request_id uuid,p_payload jsonb,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare submission public.counter_order_submissions; o public.orders; settings public.restaurant_settings; settlement jsonb; response jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Invalid counter request' using errcode='22023'; end if;
 if p_payload-'items'-'name' <> '{}'::jsonb then raise exception 'Unexpected counter fields' using errcode='22023'; end if;
 insert into public.counter_order_submissions(request_id,actor_id,payload,lines) values(p_request_id,auth.uid(),p_payload,p_lines) on conflict do nothing;
 select * into submission from public.counter_order_submissions where request_id=p_request_id for update;
 if submission.actor_id<>auth.uid() or submission.payload<>p_payload or submission.lines<>p_lines then raise exception 'Idempotency key already used' using errcode='22023'; end if;
 if submission.result is not null then return submission.result; end if;
 select * into settings from public.restaurant_settings where id for update;
 if not settings.is_accepting_orders then raise exception 'Counter temporarily closed' using errcode='23514'; end if;
 o:=public.create_customer_order(jsonb_build_object('order_type','pickup','source','waiter','counter_entry',true,'customer_name',p_payload->>'name','items',p_payload->'items'));
 update public.orders set status='open',confirmed_at=now(),waiter_id=auth.uid() where id=o.id returning * into o;
 if settings.counter_payment_timing='at_order' then
  settlement:=public.record_order_payments(o.id,p_request_id,p_lines);
  select * into o from public.orders where id=o.id;
  if o.payment_status<>'paid' then raise exception 'Full payment required before preparation' using errcode='23514'; end if;
 elsif jsonb_array_length(p_lines)<>0 then raise exception 'Pay-at-end does not accept upfront lines' using errcode='22023'; end if;
 response:=jsonb_build_object('order',to_jsonb(o),'receipt_path','/print/counter/'||o.id,'tracking_path','/track/'||o.public_token);
 update public.counter_order_submissions set order_id=o.id,result=response where request_id=p_request_id;
 return response;
end $$;
revoke all on function public.create_counter_order(uuid,jsonb,jsonb) from public,anon;
grant execute on function public.create_counter_order(uuid,jsonb,jsonb) to authenticated;

create function public.deliver_counter_order(p_order_id uuid) returns public.orders language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501'; end if;
 select * into o from public.orders where id=p_order_id and is_counter for update;
 if not found then raise exception 'Counter order not found' using errcode='P0002'; end if;
 if o.status='closed' then return o; end if;
 if o.status<>'ready' or o.payment_status<>'paid' then raise exception 'Order must be ready and paid' using errcode='23514'; end if;
 update public.orders set status='closed',closed_at=now() where id=o.id returning * into o;
 update public.order_items set status='delivered' where order_id=o.id;
 return o;
end $$;
revoke all on function public.deliver_counter_order(uuid) from public,anon;
grant execute on function public.deliver_counter_order(uuid) to authenticated;

create or replace function public.create_customer_order(p_payload jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  settings public.restaurant_settings;
  counter boolean:=coalesce((p_payload->>'counter_entry')::boolean,false);
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

  if requested_type in ('pickup', 'delivery') and not counter then
    p_payload:=jsonb_set(p_payload,'{customer_phone}',to_jsonb(public.phone_identity(p_payload->>'customer_phone',settings.default_phone_country)));
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

  if requested_type in ('pickup', 'delivery') and not counter then
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
      if nullif(btrim(p_payload->'delivery_address'->>'street'),'') is null and nullif(btrim(p_payload->'delivery_address'->>'location_url'),'') is null then
        raise exception 'Delivery requires written address or map location' using errcode='23514';
      end if;
      if nullif(btrim(p_payload->'delivery_address'->>'street'),'') is not null then
        insert into public.customer_addresses(customer_id,street,number,complement,neighborhood,city,state,zip_code,reference)
        select matched_customer_id,nullif(btrim(a->>'street'),''),nullif(btrim(a->>'number'),''),nullif(btrim(a->>'complement'),''),nullif(btrim(a->>'neighborhood'),''),nullif(btrim(a->>'city'),''),nullif(btrim(a->>'state'),''),nullif(btrim(a->>'zip_code'),''),nullif(btrim(a->>'reference'),'')
        from (select p_payload->'delivery_address' a) payload
        where not exists(select 1 from public.customer_addresses saved where saved.customer_id=matched_customer_id and saved.street=a->>'street' and coalesce(saved.number,'')=coalesce(a->>'number','') and coalesce(saved.city,'')=coalesce(a->>'city','') and coalesce(saved.reference,'')=coalesce(a->>'reference',''));
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
      is_counter,
      counter_name,
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
      counter,
      case when counter then p_payload->>'customer_name' else null end,
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


create or replace function public.record_order_payments(p_order_id uuid,p_request_id uuid,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o public.orders; submission public.order_payment_submissions; config public.restaurant_settings;
 line jsonb; method public.payment_method; currency text; original bigint; allocated bigint; credited bigint; converted bigint; change bigint; expected bigint;
 paid bigint; rate public.exchange_rates; latest_rate uuid; ordinal integer:=0; response jsonb;
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
 if (not o.is_counter and o.order_type='pickup' and o.status<>'ready') or (o.order_type='delivery' and o.status<>'out_for_delivery') then raise exception 'Order is not ready for completion' using errcode='23514'; end if;
 perform public.recompute_order_total(o.id);
 select * into o from public.orders where id=o.id;
 select * into config from public.restaurant_settings where id for share;
 select id into latest_rate from public.exchange_rates where valid_from<=now() order by valid_from desc,sequence desc limit 1;
 select coalesce(sum(equivalent_pyg-change_pyg),0) into paid from public.payments where order_id=o.id;
 for line in select value from jsonb_array_elements(p_lines) loop
  ordinal:=ordinal+1;
  method:=(line->>'method')::public.payment_method; currency:=line->>'currency';
  original:=public.require_pyg(line->>'original_amount'); allocated:=public.require_pyg(line->>'amount_pyg');
  if method is null or not(method=any(config.enabled_payment_methods)) or currency is null or currency not in ('PYG','BRL') or (method='pix' and currency<>'BRL') or original is null or allocated is null or allocated>o.total_amount-paid or (allocated=0 and o.total_amount<>0) then raise exception 'Invalid or disabled payment' using errcode='22023'; end if;
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
  update public.orders set status=case when o.is_counter then o.status else 'closed'::public.order_status end,payment_status='paid',closed_at=case when o.is_counter then null else now() end,payment_method=case when (select count(*) from public.payments where order_id=o.id)=1 then method else null end where id=o.id;
  if o.table_id is not null then update public.tables set status='available' where id=o.table_id; end if;
 end if;
 select jsonb_build_object('order',to_jsonb(x),'paid_pyg',paid,'remaining_pyg',greatest(0,x.total_amount-paid),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at,line_number),'[]') from public.payments p where p.order_id=x.id)) into response from public.orders x where x.id=o.id;
 update public.order_payment_submissions set result=response where request_id=p_request_id;
 return response;
end $$;



commit;
