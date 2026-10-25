-- Run after migrations 001-004 and seed. No network calls; everything rolls back.
begin;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;
insert into public.exchange_rates(rate,rounding,created_by) select 1400,'none',id from public.profiles where role='admin' and is_active limit 1;
insert into public.categories(name) values('__phase10_category__');
insert into public.products(category_id,name,price) select id,'__phase10_product__',1235 from public.categories where name='__phase10_category__';
insert into public.tables(table_number,capacity) values(999994,2);
update public.restaurant_settings set delivery_fee_mode='fixed',is_accepting_orders=true,whatsapp_enabled=true,pickup_enabled=true,delivery_enabled=true,dine_in_qr_enabled=true,require_confirmation_for_qr=false,delivery_fee=550,min_delivery_order=2000 where id=true;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','',true);
set local role service_role;
do $$
declare kind text; actor_phone text; mid uuid; token uuid; payload jsonb; product uuid; table_id uuid; result public.orders; idx integer:=0;
begin
  select id into product from public.products where name='__phase10_product__';
  select id into table_id from public.tables where table_number=999994;
  for kind in select unnest(array['pickup','delivery','dine_in']) loop
    idx:=idx+1; actor_phone:='+551199999999'||idx;
    insert into public.whatsapp_conversations(phone) values(actor_phone);
    insert into public.whatsapp_messages(wa_message_id,direction,phone,payload) values('__phase10_in_'||kind,'in',actor_phone,jsonb_build_object('text','confirm','received_at',now())) returning id into mid;
    insert into public.whatsapp_messages(wa_message_id,direction,phone,payload) values('__phase10_in_'||kind,'in',actor_phone,'{}') on conflict(wa_message_id) do nothing;
    if (select count(*) from public.whatsapp_messages where wa_message_id='__phase10_in_'||kind)<>1 then raise exception 'Duplicate inbound accepted'; end if;
    token:=gen_random_uuid();
    update public.whatsapp_conversations c set lease_token=token,lease_until=now()+interval '2 minutes' where c.phone=actor_phone;
    update public.whatsapp_messages set status='processing',lease_token=token,lease_until=now()+interval '2 minutes' where id=mid;
    payload:=jsonb_build_object('order_type',kind,'customer_name','Teste WhatsApp','payment_method','pix','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2)));
    if kind='dine_in' then payload:=payload||jsonb_build_object('table_id',table_id,'payment_method','cash','cash_change_for',5000); end if;
    if kind='delivery' then payload:=payload||jsonb_build_object('delivery_address',jsonb_build_object('street','Rua Teste','number','10','neighborhood','Centro','city','São Paulo','state','SP','zip_code','01001000')); end if;
    result:=public.commit_whatsapp_turn(mid,token,jsonb_build_object('state','done','context','{}'::jsonb,'needs_human',false,'opted_out',false,'confirmation_text','Pedido #{number} {token} {minutes}','estimated_minutes',30),'[]',payload);
    if result.source<>'whatsapp' or result.status<>'pending_confirmation' or result.customer_phone<>actor_phone then raise exception 'WhatsApp order type/source/status/phone failed'; end if;
    if result.total_amount<>(case when kind='delivery' then 3020 else 2470 end) then raise exception 'DB pricing failed'; end if;
    if (select count(*) from public.whatsapp_messages where wa_message_id='reply:'||mid||':order')<>1 then raise exception 'Atomic reply outbox missing'; end if;
    begin
      perform public.commit_whatsapp_turn(mid,token,'{}','[]',payload);
      raise exception 'Duplicate commit accepted';
    exception when raise_exception then if sqlerrm='Duplicate commit accepted' then raise; end if; end;
  end loop;
end $$;
reset role;

-- Raw tables are admin read-only; anon cannot call queue/order-commit functions.
select set_config('request.jwt.claims','{"role":"anon"}',true);
select set_config('request.jwt.claim.role','anon',true);
set local role anon;
do $$ begin
  begin perform 1 from public.whatsapp_messages; raise exception 'Anon read messages'; exception when insufficient_privilege then null; end;
  begin perform public.claim_whatsapp_message('in'); raise exception 'Anon claimed queue'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('role','authenticated','sub',(select id from public.profiles where role='admin' limit 1))::text,true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='admin' limit 1),true);
set local role authenticated;
do $$ begin
  if not exists(select 1 from public.whatsapp_messages where wa_message_id='__phase10_in_pickup') then raise exception 'Admin cannot read messages; seed admin first'; end if;
  begin update public.whatsapp_conversations set needs_human=true; raise exception 'Admin wrote raw conversation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
