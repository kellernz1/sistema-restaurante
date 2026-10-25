begin;
alter table public.restaurant_settings add column default_phone_country text not null default 'PY' check(default_phone_country in ('PY','BR'));
alter table public.customer_addresses alter column street drop not null, alter column number drop not null, alter column neighborhood drop not null, alter column city drop not null, alter column state drop not null, alter column zip_code drop not null;
alter table public.customer_addresses drop constraint customer_addresses_state_check, drop constraint customer_addresses_zip_code_check;

-- The application uses libphonenumber metadata. This database boundary only
-- canonicalizes structural E.164/PY/BR aliases; it does not infer phone ownership.
create function public.phone_identity(p_value text,p_country text default 'PY') returns text
language plpgsql immutable set search_path='' as $$
declare value text; national text;
begin
 if p_value is null then return null; end if;
 if length(p_value)>40 or p_value !~ '^[+0-9[:space:]().-]+$' then raise exception 'Invalid phone' using errcode='22023'; end if;
 value:=regexp_replace(p_value,'[[:space:]().-]','','g');
 if left(value,1)<>'+' then
  if p_country='BR' then
   if value !~ '^55[0-9]{10,11}$' then value:='55'||value; end if;
  elsif p_country='PY' then
   if value !~ '^595[0-9]{8,9}$' then value:='595'||regexp_replace(value,'^0',''); end if;
  else raise exception 'Unsupported phone country' using errcode='22023'; end if;
  value:='+'||value;
 end if;
 -- Never merge a possible eight-digit Brazilian landline (prefix 2-5).
 if value ~ '^\+55[1-9][0-9][016-9][0-9]{7}$' then value:=left(value,5)||'9'||substr(value,6); end if;
 if value !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid E.164 phone' using errcode='22023'; end if;
 return value;
end $$;
revoke all on function public.phone_identity(text,text) from public,anon,authenticated;
grant execute on function public.phone_identity(text,text) to service_role;

-- Existing test data without a country code follows the previous BR default.
create temporary table contact_map on commit drop as
 select id,public.phone_identity(phone,'BR') canonical,
 first_value(id) over(partition by public.phone_identity(phone,'BR') order by created_at,id) keeper from public.customers;
update public.customer_addresses a set customer_id=m.keeper from contact_map m where a.customer_id=m.id and m.id<>m.keeper;
update public.orders o set customer_id=m.keeper from contact_map m where o.customer_id=m.id and m.id<>m.keeper;
delete from public.customers c using contact_map m where c.id=m.id and m.id<>m.keeper;
update public.customers c set phone=m.canonical from contact_map m where c.id=m.id and m.id=m.keeper;
update public.orders set customer_phone=public.phone_identity(customer_phone,'BR') where customer_phone is not null;
update public.cashier_order_submissions set payload=jsonb_set(payload,'{customer_phone}',to_jsonb(public.phone_identity(payload->>'customer_phone','BR'))) where nullif(payload->>'customer_phone','') is not null;

alter table public.whatsapp_conversations add column provider_recipient text check(provider_recipient ~ '^[1-9][0-9]{7,14}$'), add column provider_recipient_at timestamptz;
create temporary table conversation_map on commit drop as select phone,public.phone_identity(phone,'BR') canonical from public.whatsapp_conversations;
create temporary table merged_conversations on commit drop as
 select distinct on(m.canonical) m.canonical,c.state,c.context,
 bool_or(c.needs_human) over(partition by m.canonical) needs_human,
 bool_or(c.opted_out) over(partition by m.canonical) opted_out,
 max(c.last_message_at) over(partition by m.canonical) last_message_at,
 regexp_replace(c.phone,'^\+','') provider_recipient from public.whatsapp_conversations c join conversation_map m on m.phone=c.phone
 order by m.canonical,c.last_message_at desc,c.phone;
insert into public.whatsapp_conversations(phone,state,context,needs_human,opted_out,last_message_at,provider_recipient,provider_recipient_at)
 select canonical,state,context,needs_human,opted_out,last_message_at,provider_recipient,last_message_at from merged_conversations
 on conflict(phone) do update set state=excluded.state,context=excluded.context,needs_human=excluded.needs_human,opted_out=excluded.opted_out,last_message_at=excluded.last_message_at,provider_recipient=excluded.provider_recipient,provider_recipient_at=excluded.provider_recipient_at,lease_token=null,lease_until=null;
update public.whatsapp_messages w set phone=m.canonical from conversation_map m where w.phone=m.phone and m.phone<>m.canonical;
delete from public.whatsapp_conversations c using conversation_map m where c.phone=m.phone and m.phone<>m.canonical;

create function public.remember_whatsapp_recipient(p_phone text,p_recipient text,p_at timestamptz) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_recipient !~ '^[1-9][0-9]{7,14}$' or public.phone_identity('+'||p_recipient) is distinct from p_phone then raise exception 'Recipient identity mismatch' using errcode='22023'; end if;
 update public.whatsapp_conversations set provider_recipient=p_recipient,provider_recipient_at=p_at where phone=p_phone and (provider_recipient_at is null or provider_recipient_at<=p_at);
end $$;
revoke all on function public.remember_whatsapp_recipient(text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.remember_whatsapp_recipient(text,text,timestamptz) to service_role;

create function public.canonicalize_customer_phone() returns trigger language plpgsql security definer set search_path='' as $$
begin new.phone:=public.phone_identity(new.phone,(select default_phone_country from public.restaurant_settings where id)); return new; end $$;
create trigger customers_canonical_phone before insert or update of phone on public.customers for each row execute function public.canonicalize_customer_phone();

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

commit;
