begin;
create table public.service_policy (
 id boolean primary key default true check(id),counter_enabled boolean not null default true,
 uses_waiter boolean not null default false,
 qr_confirmation text not null default 'manual' check(qr_confirmation in ('manual','after_first','payment')),
 qr_phone text not null default 'optional' check(qr_phone in ('required','optional','off')),
 pending_per_table integer not null default 2 check(pending_per_table between 1 and 20),
 pending_per_phone integer not null default 2 check(pending_per_phone between 1 and 20)
);
insert into public.service_policy(id) values(true);
alter table public.service_policy enable row level security;
revoke all on public.service_policy from public,anon,authenticated;
grant select on public.service_policy to authenticated,service_role;
grant update on public.service_policy to authenticated;
create policy service_policy_read on public.service_policy for select to authenticated using(auth.uid() is not null);
create policy service_policy_admin on public.service_policy for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');

alter table public.tables add column qr_account_id uuid not null default gen_random_uuid(),add column qr_first_confirmed boolean not null default false;
alter table public.orders add column qr_prepaid_account boolean not null default false;
create table public.qr_requests (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,
 access_token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
 table_id uuid not null references public.tables(id),account_id uuid not null,
 customer_name text not null check(length(customer_name) between 1 and 80),customer_phone text,
 source public.order_source not null check(source in ('qr','nfc')),payload jsonb not null,items jsonb not null,
 total_amount bigint not null check(total_amount between 0 and 1000000000000),
 confirmation_mode text not null check(confirmation_mode in ('manual','after_first','payment')),
 status text not null default 'pending' check(status in ('pending','confirmed','refused','cancelled')),
 order_id uuid references public.orders(id),created_at timestamptz not null default now(),reviewed_at timestamptz,
 reviewed_by uuid references public.profiles(id),reason text,actor_kind text,session_id uuid references public.cash_sessions(id),business_date date,
 check(customer_phone is null or customer_phone ~ '^\+[1-9][0-9]{7,14}$')
);
create index qr_pending_table on public.qr_requests(table_id,status,created_at);
create index qr_pending_phone on public.qr_requests(customer_phone) where status='pending';
create table public.blocked_phones(phone text primary key check(phone ~ '^\+[1-9][0-9]{7,14}$'),reason text not null,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now());
create table public.qr_review_commands(request_id uuid primary key,actor_id uuid not null references public.profiles(id),payload jsonb not null,result jsonb not null);
alter table public.qr_requests enable row level security;
alter table public.blocked_phones enable row level security;
alter table public.qr_review_commands enable row level security;
revoke all on public.qr_requests,public.blocked_phones,public.qr_review_commands from public,anon,authenticated;
grant select on public.qr_requests,public.blocked_phones to authenticated,service_role;
create policy qr_staff_read on public.qr_requests for select to authenticated using(public.current_user_role() in ('admin','cashier'));
create policy blocked_admin_read on public.blocked_phones for select to authenticated using(public.current_user_role()='admin');
alter publication supabase_realtime add table public.qr_requests;

-- Disabled waiter accounts remain stored, but all existing role-based RPCs/RLS deny them.
create or replace function public.current_user_role() returns public.user_role language sql stable security definer set search_path='' as $$
 select case when p.is_active and (p.role<>'waiter' or (select uses_waiter from public.service_policy where id)) then p.role else null end from public.profiles p where p.id=auth.uid()
$$;

create function public.guard_service_mode() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.restaurant_settings;p public.service_policy;
begin
 select * into s from public.restaurant_settings where id;select * into p from public.service_policy where id;
 if tg_table_name='orders' then
  if tg_op='INSERT' and ((new.order_type='dine_in' and not s.dine_in_qr_enabled) or (new.is_counter and not p.counter_enabled) or (new.order_type='pickup' and not new.is_counter and not s.pickup_enabled) or (new.order_type='delivery' and not s.delivery_enabled)) then raise exception 'Service mode disabled' using errcode='23514';end if;
 elsif tg_table_name='profiles' then
  if new.role='waiter' and old.role<>'waiter' and not p.uses_waiter then raise exception 'Waiter mode disabled' using errcode='23514';end if;
 end if;
 return new;
end $$;
create trigger orders_service_mode before insert on public.orders for each row execute function public.guard_service_mode();
create trigger profiles_service_mode before update of role on public.profiles for each row execute function public.guard_service_mode();

-- Shared creation remains authoritative; direct legacy QR creation cannot bypass staging.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.create_customer_order(jsonb)'::regprocedure);
 definition:=replace(definition,'  if jsonb_typeof(p_payload) <> ''object'' then',
 '  if p_payload->>''source'' in (''qr'',''nfc'') then raise exception ''Use the QR submission service'' using errcode=''42501'';end if;
  if p_payload->>''order_type''=''dine_in'' and coalesce(auth.role(),'''')<>''service_role'' and public.current_user_role() not in (''admin'',''cashier'') then raise exception ''Not authorized'' using errcode=''42501'';end if;
  if jsonb_typeof(p_payload) <> ''object'' then');
 definition:=replace(definition,'and not (counter and coalesce(public.current_user_role()::text,'''') in (''admin'',''cashier''))','and not ((counter or p_payload->>''order_type''=''dine_in'') and coalesce(public.current_user_role()::text,'''') in (''admin'',''cashier''))');
 definition:=replace(definition,'when settings.require_confirmation_for_qr then','when settings.require_confirmation_for_qr and requested_source<>''waiter'' then');
 execute definition;
end $$;

create function public.qr_review(p_id uuid,p_request_id uuid,p_action text,p_reason text default null,p_lines jsonb default '[]') returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.qr_requests;t public.tables;o public.orders;s public.restaurant_settings;c public.qr_review_commands;result jsonb;payload jsonb;before_total bigint;paid bigint;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501';end if;
 if p_request_id is null or p_action not in ('confirm','reject') or (p_action='reject' and (nullif(btrim(p_reason),'') is null or length(p_reason)>500)) then raise exception 'Invalid review' using errcode='22023';end if;
 payload:=jsonb_build_object('id',p_id,'action',p_action,'reason',p_reason,'lines',p_lines);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,6));
 select * into c from public.qr_review_commands where request_id=p_request_id;
 if found then if c.actor_id<>auth.uid() or c.payload<>payload then raise exception 'Idempotency conflict' using errcode='22023';end if;return c.result;end if;
 select * into s from public.restaurant_settings where id for share;
 if not s.dine_in_qr_enabled then raise exception 'Table service disabled' using errcode='23514';end if;
 select * into t from public.tables where id=(select table_id from public.qr_requests where id=p_id) for update;
 select * into r from public.qr_requests where id=p_id for update;
 if not found or r.status<>'pending' then raise exception 'Request already reviewed' using errcode='23514';end if;
 if p_action='confirm' then
  if t.qr_account_id<>r.account_id or t.status='closing' then raise exception 'Table account changed or closing' using errcode='23514';end if;
  select coalesce(total_amount,0) into before_total from public.orders where table_id=t.id and order_type='dine_in' and status not in ('closed','cancelled');before_total:=coalesce(before_total,0);
  o:=public.create_customer_order(jsonb_build_object('order_type','dine_in','source','waiter','table_id',t.id,'customer_name',r.customer_name,'items',r.payload->'items'));
  if o.total_amount-before_total<>r.total_amount then raise exception 'Prices changed; reject and ask the customer to resend' using errcode='23514';end if;
  update public.orders set status='open',confirmed_at=coalesce(confirmed_at,now()),payment_status=case when total_amount>(select coalesce(sum(equivalent_pyg-change_pyg),0) from public.payments where order_id=o.id) then 'pending'::public.payment_status else payment_status end,qr_prepaid_account=qr_prepaid_account or r.confirmation_mode='payment' where id=o.id;
  if r.confirmation_mode='payment' then
   perform public.record_order_payments(o.id,p_request_id,p_lines);
   select coalesce(sum(equivalent_pyg-change_pyg),0) into paid from public.payments where order_id=o.id;
   if paid<(select total_amount from public.orders where id=o.id) then raise exception 'Full balance required before confirmation' using errcode='23514';end if;
  elsif p_lines<>'[]'::jsonb then raise exception 'Unexpected payments' using errcode='22023';end if;
  update public.tables set qr_first_confirmed=true where id=t.id;
 end if;
 update public.qr_requests set status=case when p_action='confirm' then 'confirmed' else 'refused' end,order_id=case when p_action='confirm' then o.id else null end,reviewed_at=now(),reviewed_by=auth.uid(),reason=nullif(btrim(p_reason),''),actor_kind='staff',session_id=(select id from public.cash_sessions where operator_id=auth.uid() and status='open'),business_date=public.business_day_for(now(),s.business_timezone,s.business_day_start) where id=r.id;
 result:=jsonb_build_object('id',r.id,'order_id',o.id,'status',case when p_action='confirm' then 'confirmed' else 'refused' end);
 insert into public.qr_review_commands values(p_request_id,auth.uid(),payload,result);return result;
end $$;
revoke all on function public.qr_review(uuid,uuid,text,text,jsonb) from public,anon;
grant execute on function public.qr_review(uuid,uuid,text,text,jsonb) to authenticated;

create function public.submit_qr_order(p_token text,p_request_id uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare t public.tables;p public.service_policy;s public.restaurant_settings;r public.qr_requests;item jsonb;product public.products;total bigint:=0;snapshot jsonb:='[]';phone text;qty integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 if p_request_id is null or jsonb_typeof(p_payload)<>'object' or p_payload->>'source' not in ('qr','nfc') then raise exception 'Invalid QR payload' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,6));
 select * into r from public.qr_requests where request_id=p_request_id;
 if found then
  if r.payload<>p_payload or not exists(select 1 from public.tables where id=r.table_id and qr_token=p_token and qr_account_id=r.account_id) then raise exception 'Idempotency conflict or rotated token' using errcode='22023';end if;
  return jsonb_build_object('order_id',r.id,'order_number',null,'access_token',r.access_token,'status',r.status);
 end if;
 select * into s from public.restaurant_settings where id for share;select * into p from public.service_policy where id for share;
 if not s.is_accepting_orders or not s.dine_in_qr_enabled then raise exception 'Table service disabled' using errcode='23514';end if;
 if nullif(btrim(p_payload->>'customer_name'),'') is null or length(p_payload->>'customer_name')>80 then raise exception 'Customer name required' using errcode='22023';end if;
 phone:=nullif(p_payload->>'customer_phone','');
 if p.qr_phone='off' then phone:=null;elsif p.qr_phone='required' and phone is null then raise exception 'Customer phone required' using errcode='22023';end if;
 if phone is not null then
  if phone !~ '^\+[1-9][0-9]{7,14}$' then raise exception 'Invalid normalized phone' using errcode='22023';end if;
  perform pg_advisory_xact_lock(hashtextextended(phone,7));
  if exists(select 1 from public.blocked_phones where blocked_phones.phone=phone) then raise exception 'Phone blocked' using errcode='23514';end if;
  if (select count(*) from public.qr_requests where customer_phone=phone and status='pending')>=p.pending_per_phone then raise exception 'Pending phone limit reached' using errcode='23514';end if;
 end if;
 select * into t from public.tables where qr_token=p_token for update;
 if not found or t.status='closing' then raise exception 'Invalid token or table closing' using errcode='23514';end if;
 if (select count(*) from public.qr_requests where table_id=t.id and status='pending')>=p.pending_per_table then raise exception 'Pending table limit reached' using errcode='23514';end if;
 if jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'Invalid items' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_payload->'items') loop
  qty:=(item->>'quantity')::integer;if qty not between 1 and 99 or length(coalesce(item->>'notes',''))>500 then raise exception 'Invalid item' using errcode='22023';end if;
  select * into product from public.products where id=(item->>'product_id')::uuid and is_active for share;
  if not found then raise exception 'Product unavailable' using errcode='23514';end if;
  total:=total+product.price*qty;if total>1000000000000 then raise exception 'Amount limit' using errcode='22023';end if;
  snapshot:=snapshot||jsonb_build_array(jsonb_build_object('product_id',product.id,'name',product.name,'quantity',qty,'unit_price',product.price,'notes',item->>'notes'));
 end loop;
 insert into public.qr_requests(request_id,table_id,account_id,customer_name,customer_phone,source,payload,items,total_amount,confirmation_mode)
 values(p_request_id,t.id,t.qr_account_id,btrim(p_payload->>'customer_name'),phone,(p_payload->>'source')::public.order_source,p_payload,snapshot,total,p.qr_confirmation) returning * into r;
 -- Automatic approval reuses the exact manual materialization, with an explicit internal actor.
 if p.qr_confirmation='after_first' and t.qr_first_confirmed then
  perform public.materialize_auto_qr(r.id);
 end if;
 return jsonb_build_object('order_id',r.id,'order_number',null,'access_token',r.access_token,'status',(select status from public.qr_requests where id=r.id));
end $$;
revoke all on function public.submit_qr_order(text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.submit_qr_order(text,uuid,jsonb) to service_role;

-- Automatic submissions use the shared creator with service-role context, never a staff payment path.
create function public.materialize_auto_qr(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare r public.qr_requests;o public.orders;before_total bigint;
begin
 select * into r from public.qr_requests where id=p_id for update;
 if r.status<>'pending' or r.confirmation_mode<>'after_first' or not exists(select 1 from public.tables where id=r.table_id and qr_account_id=r.account_id and qr_first_confirmed and status<>'closing') then raise exception 'Manual confirmation required' using errcode='23514';end if;
 select coalesce(total_amount,0) into before_total from public.orders where table_id=r.table_id and order_type='dine_in' and status not in ('closed','cancelled');
 o:=public.create_customer_order(jsonb_build_object('order_type','dine_in','source','waiter','table_id',r.table_id,'customer_name',r.customer_name,'items',r.payload->'items'));
 if o.total_amount-coalesce(before_total,0)<>r.total_amount then raise exception 'Prices changed' using errcode='23514';end if;
 update public.qr_requests set status='confirmed',order_id=o.id,reviewed_at=now(),actor_kind='automatic' where id=r.id;
end $$;
revoke all on function public.materialize_auto_qr(uuid) from public,anon,authenticated,service_role;

create function public.cancel_qr_request(p_token text,p_id uuid,p_access text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.qr_requests;s public.restaurant_settings;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception 'Not authorized' using errcode='42501';end if;
 if nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'Cancellation reason required' using errcode='22023';end if;
 perform 1 from public.tables where qr_token=p_token and id=(select table_id from public.qr_requests where id=p_id) for update;
 if not found then raise exception 'Invalid table token' using errcode='23514';end if;
 select * into r from public.qr_requests where id=p_id and access_token=p_access for update;
 if not found then raise exception 'Request not found' using errcode='P0002';end if;
 if r.status='cancelled' and r.actor_kind='customer' then return;end if;
 if r.status<>'pending' then raise exception 'Only pending requests can be cancelled' using errcode='23514';end if;
 select * into s from public.restaurant_settings where id;
 update public.qr_requests set status='cancelled',reason=btrim(p_reason),actor_kind='customer',reviewed_at=now(),business_date=public.business_day_for(now(),s.business_timezone,s.business_day_start) where id=r.id;
end $$;
revoke all on function public.cancel_qr_request(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.cancel_qr_request(text,uuid,text,text) to service_role;

create function public.set_phone_block(p_request uuid,p_block boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare r public.qr_requests;
begin
 if coalesce(public.current_user_role()::text,'')<>'admin' then raise exception 'Admin required' using errcode='42501';end if;
 select * into r from public.qr_requests where id=p_request;
 if r.status not in ('refused','cancelled') or r.customer_phone is null or nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'Invalid phone block' using errcode='22023';end if;
 if p_block then insert into public.blocked_phones values(r.customer_phone,btrim(p_reason),auth.uid(),now()) on conflict(phone) do nothing;else delete from public.blocked_phones where phone=r.customer_phone;end if;
end $$;
revoke all on function public.set_phone_block(uuid,boolean,text) from public,anon;
grant execute on function public.set_phone_block(uuid,boolean,text) to authenticated;

-- Keep a prepaid table account active until staff explicitly releases it.
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.record_order_payments(uuid,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'when o.is_counter then','when (o.is_counter or o.qr_prepaid_account) then');
 definition:=replace(definition,'if o.table_id is not null then','if o.table_id is not null and not o.qr_prepaid_account then');execute definition;
end $$;
create function public.release_paid_table(p_table uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Cashier required' using errcode='42501';end if;
 perform 1 from public.tables where id=p_table for update;
 select * into o from public.orders where table_id=p_table and order_type='dine_in' and status not in ('closed','cancelled') for update;
 if not found then return;end if;
 if not o.qr_prepaid_account or o.payment_status<>'paid' or exists(select 1 from public.qr_requests where table_id=p_table and status='pending') then raise exception 'Payment or review pending' using errcode='23514';end if;
 update public.orders set status='closed',closed_at=now() where id=o.id;
end $$;
revoke all on function public.release_paid_table(uuid) from public,anon;
grant execute on function public.release_paid_table(uuid) to authenticated;

create function public.reset_qr_account() returns trigger language plpgsql set search_path='' as $$
begin
 if new.status='available' and old.status<>'available' then new.qr_account_id:=gen_random_uuid();new.qr_first_confirmed:=false;end if;
 if current_user in ('authenticated','anon') and (new.qr_account_id<>old.qr_account_id or new.qr_first_confirmed<>old.qr_first_confirmed) then raise exception 'Use service RPCs' using errcode='42501';end if;
 return new;
end $$;
create trigger tables_qr_account before update on public.tables for each row execute function public.reset_qr_account();

-- Include staged refusals/customer cancellations in existing financial reports, without fake orders.
create view public.cash_cancellation_source as
 select session_id,business_date,amount,rejected from public.cash_order_cancellations
 union all select session_id,business_date,total_amount,status='refused' from public.qr_requests where status in ('refused','cancelled');
revoke all on public.cash_cancellation_source from public,anon,authenticated,service_role;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.cash_payment_summary(uuid,date)'::regprocedure);
 execute replace(definition,'from public.cash_order_cancellations','from public.cash_cancellation_source');
end $$;

alter table public.cash_session_policy add column single_open_session boolean not null default true;
grant update(single_open_session) on public.cash_session_policy to authenticated;
create function public.guard_single_cash_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(606060);
 if tg_table_name='cash_sessions' then
  if new.status='open' and (select single_open_session from public.cash_session_policy where id) and exists(select 1 from public.cash_sessions where status='open' and id<>new.id) then raise exception 'Close the current cash session before opening another' using errcode='23514';end if;
 elsif new.single_open_session and (select count(*) from public.cash_sessions where status='open')>1 then raise exception 'Close extra cash sessions before enabling single-session mode' using errcode='23514';end if;
 return new;
end $$;
create trigger cash_single_open before insert or update on public.cash_sessions for each row execute function public.guard_single_cash_session();
create trigger cash_single_policy before update on public.cash_session_policy for each row execute function public.guard_single_cash_session();

do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.create_table_service_request(text,text)'::regprocedure);
 definition:=replace(definition,'  if p_type = ''bill'' then',
 '  if exists(select 1 from public.service_requests where table_id=selected_table.id and created_at>now()-interval ''1 minute'') then raise exception ''One request per minute per table'' using errcode=''23514'';end if;
  if p_type = ''bill'' then');execute definition;
 definition:=pg_get_functiondef('public.attend_service_request(uuid)'::regprocedure);
 execute replace(definition,'''admin'', ''waiter''','''admin'', ''cashier'', ''waiter''');
 definition:=pg_get_functiondef('public.review_table_order(uuid,boolean)'::regprocedure);
 execute replace(definition,'''admin'', ''waiter''','''admin'', ''cashier''');
end $$;
create policy service_requests_cashier_update on public.service_requests for update to authenticated using(public.current_user_role()='cashier') with check(public.current_user_role()='cashier');
commit;
