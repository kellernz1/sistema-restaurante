begin;
create or replace function public.create_counter_order(p_request_id uuid,p_payload jsonb,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare submission public.counter_order_submissions; o public.orders; settings public.restaurant_settings; settlement jsonb; response jsonb; item jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501'; end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Invalid counter request' using errcode='22023'; end if;
 if p_payload-'items'-'name' <> '{}'::jsonb then raise exception 'Unexpected counter fields' using errcode='22023'; end if;
 if p_payload->'items' is null or jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'Invalid counter items' using errcode='22023'; end if;
 if p_payload ? 'name' and jsonb_typeof(p_payload->'name') not in ('string','null') then raise exception 'Invalid counter name' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_payload->'items') loop
  if jsonb_typeof(item)<>'object' or item-'product_id'-'quantity'-'notes'<>'{}'::jsonb or coalesce(item->>'quantity','') !~ '^[0-9]{1,2}$' or (item->>'quantity')::integer not between 1 and 99 or (item ? 'notes' and (jsonb_typeof(item->'notes')<>'string' or length(item->>'notes')>500)) then raise exception 'Invalid counter item' using errcode='22023'; end if;
 end loop;
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
create or replace function public.counter_order_lifecycle() returns trigger language plpgsql security definer set search_path='' as $$
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
  if old.is_counter and old.payment_status='paid' and (new.total_amount<>old.total_amount or new.delivery_fee<>old.delivery_fee) then raise exception 'Paid counter total is immutable' using errcode='23514'; end if;
  if row(new.is_counter,new.counter_ticket,new.counter_business_date,new.counter_payment_timing,new.counter_name) is distinct from row(old.is_counter,old.counter_ticket,old.counter_business_date,old.counter_payment_timing,old.counter_name) then raise exception 'Counter identity is immutable' using errcode='42501'; end if;
  if new.is_counter and new.status='ready' and old.status<>'ready' then new.counter_ready_at:=now();
  elsif new.is_counter and new.status='open' then new.counter_ready_at:=null; end if;
 end if;
 return new;
end $$;
create or replace function public.advance_hub_order(p_order_id uuid, p_action text, p_reason text default null, p_payment_method text default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare target public.orders;
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text, '') not in ('admin', 'cashier') then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select * into target from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if target.is_counter then raise exception 'Use counter workflow' using errcode='23514'; end if;
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
