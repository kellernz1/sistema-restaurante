begin;

create table public.counter_discount_claims(draft_id uuid primary key,actor_id uuid not null,order_id uuid references public.orders(id) on delete cascade,created_at timestamptz not null default clock_timestamp());
alter table public.counter_discount_claims enable row level security;
revoke all on public.counter_discount_claims from public,anon,authenticated,service_role;

-- A quote has no order yet. Bind the approver to the actor, draft identity and server-priced cart.
create function public.counter_discount_quote(p_draft_id uuid,p_payload jsonb,p_discount jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare settings public.restaurant_settings;policy public.approval_policy;item jsonb;product public.products;
 priced jsonb:='[]';normalized jsonb;name text;reason text;mode text;value bigint;gross numeric:=0;amount bigint;required boolean;binding text;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501';end if;
 if p_draft_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload-'name'-'items'<>'{}' or p_discount is null or jsonb_typeof(p_discount)<>'object' or p_discount-'mode'-'value'-'reason'<>'{}' then raise exception 'Invalid counter discount quote' using errcode='22023';end if;
 if p_payload->'items' is null or jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'Invalid counter items' using errcode='22023';end if;
 if p_payload ? 'name' and jsonb_typeof(p_payload->'name') not in ('string','null') then raise exception 'Invalid counter name' using errcode='22023';end if;
 name:=nullif(btrim(regexp_replace(replace(coalesce(p_payload->>'name',''),chr(160),' '),'[[:space:][:cntrl:]]+',' ','g')),'');
 if length(name)>30 then raise exception 'Counter name exceeds 30 characters' using errcode='22023';end if;
 select * into settings from public.restaurant_settings where id for share;
 if not settings.is_accepting_orders or not exists(select 1 from public.service_policy where id and counter_enabled) then raise exception 'Counter temporarily closed' using errcode='23514';end if;
 -- Stable lock order also prevents a product price/availability change between quote verification and insertion.
 perform 1 from public.products where id in(select (entry.value->>'product_id')::uuid from jsonb_array_elements(p_payload->'items')entry) order by id for share;
 for item in select entry.value from jsonb_array_elements(p_payload->'items')entry loop
  if jsonb_typeof(item)<>'object' or item-'product_id'-'quantity'-'notes'<>'{}' or jsonb_typeof(item->'quantity')<>'number' or coalesce(item->>'quantity','')!~'^[0-9]{1,2}$' or (item->>'quantity')::integer not between 1 and 99 or (item ? 'notes' and (jsonb_typeof(item->'notes')<>'string' or length(item->>'notes')>500)) then raise exception 'Invalid counter item' using errcode='22023';end if;
  select * into product from public.products where id=(item->>'product_id')::uuid and is_active;
  if not found then raise exception 'Product unavailable' using errcode='23514';end if;
  gross:=gross+product.price::numeric*(item->>'quantity')::integer;
  priced:=priced||jsonb_build_array(jsonb_build_object('product_id',product.id,'quantity',(item->>'quantity')::integer,'notes',btrim(coalesce(item->>'notes','')),'price',product.price));
 end loop;
 if gross>1000000000000 then raise exception 'Counter total exceeds limit' using errcode='23514';end if;
 mode:=p_discount->>'mode';value:=public.require_pyg(p_discount->>'value');
 reason:=nullif(btrim(regexp_replace(p_discount->>'reason','[[:space:]]+',' ','g')),'');
 if mode is null or mode not in ('amount','percent') or value is null or value<1 or (mode='percent' and value>10000) or reason is null or length(reason) not between 2 and 300 then raise exception 'Invalid counter discount' using errcode='22023';end if;
 amount:=case when mode='percent' then round(gross*value/10000)::bigint else value end;
 if amount>gross then raise exception 'Discount exceeds cart total' using errcode='23514';end if;
 select * into policy from public.approval_policy where id for share;
 required:=policy.require_discount_approval or amount>policy.discount_limit_pyg or (gross>0 and amount::numeric*10000>gross*policy.discount_limit_bps);
 normalized:=jsonb_build_object('action','counter_discount','target',p_draft_id,'mode',mode,'value',value,'amount',amount,'reason',reason);
 binding:=encode(extensions.digest(convert_to(jsonb_build_object('actor',auth.uid(),'draft',p_draft_id,'name',name,'items',priced,'operation',normalized,'policy',policy.version,'timing',settings.counter_payment_timing)::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('operation',normalized,'binding',binding,'gross',gross::bigint,'discount',amount,'total',gross::bigint-amount,'requires_approval',required and public.current_user_role()<>'admin');
end $$;

create function public.issue_operation_approval(p_request_id uuid,p_approver uuid,p_pin text,p_quote jsonb,p_binding text) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb;pin public.approver_pins;policy public.approval_policy;prior public.approval_attempts;authorization_id uuid;result jsonb;blocked boolean;eligible boolean;
begin
 quote:=p_quote;
 if p_request_id is null or quote->>'binding' is distinct from p_binding then raise exception 'Stale operation' using errcode='23514';end if;
 if p_approver=auth.uid() then raise exception 'Self approval is forbidden; approvers use their own authority' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,7128));
 select * into prior from public.approval_attempts where request_id=p_request_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.approver_id is distinct from p_approver or prior.binding<>p_binding then raise exception 'Approval request key changed' using errcode='22023';end if;
  return prior.result;
 end if;
 if not public.approval_budget() then return jsonb_build_object('ok',false,'code','limited');end if;
 select * into policy from public.approval_policy where id;
 perform 1 from public.profiles where id=p_approver and is_active and role in ('admin','supervisor') for share;
 eligible:=found;
 select * into pin from public.approver_pins where user_id=p_approver for update;
 if not eligible or pin.user_id is null then perform public.append_audit('pin_failed','profile',p_approver,0,'{}','{}');result:=jsonb_build_object('ok',false,'code','pin');
 elsif pin.blocked_until>clock_timestamp() then
  perform public.append_audit('pin_blocked_attempt','profile',p_approver,0,'{}','{}');result:=jsonb_build_object('ok',false,'code','locked');
 elsif p_pin is null or p_pin!~'^[0-9]{4,6}$' or extensions.crypt(p_pin,pin.pin_hash) is distinct from pin.pin_hash then
  if pin.blocked_until is not null then pin.failures:=0;end if;
  pin.failures:=pin.failures+1;blocked:=pin.failures>=policy.pin_failures;
  update public.approver_pins set failures=pin.failures,blocked_until=case when blocked then clock_timestamp()+make_interval(mins=>policy.pin_lock_minutes) else null end where user_id=p_approver;
  perform public.append_audit('pin_failed','profile',p_approver,0,'{}',jsonb_build_object('failures',pin.failures));
  if blocked then perform public.append_audit('pin_locked','profile',p_approver,0,'{}',jsonb_build_object('minutes',policy.pin_lock_minutes));end if;
  result:=jsonb_build_object('ok',false,'code',case when blocked then 'locked' else 'pin' end);
 else
  update public.approver_pins set failures=0,blocked_until=null where user_id=p_approver;
  insert into public.operation_authorizations(actor_id,approver_id,pin_version,binding,expires_at,request_id) values(auth.uid(),p_approver,pin.version,p_binding,clock_timestamp()+make_interval(secs=>policy.authorization_seconds),p_request_id) returning id into authorization_id;
  perform public.append_audit('approval_granted',case when quote->'operation'->>'action'='counter_discount' then 'counter_draft' else 'order' end,coalesce(quote->'operation'->>'order_id',quote->'operation'->>'target')::uuid,(quote->'operation'->>'amount')::bigint,jsonb_build_object('action',quote->'operation'->>'action'),'{}',quote->'operation'->>'reason',p_approver);
  result:=jsonb_build_object('ok',true,'authorization',authorization_id,'expires_seconds',policy.authorization_seconds);
 end if;
 insert into public.approval_attempts(request_id,actor_id,approver_id,binding,result) values(p_request_id,auth.uid(),p_approver,p_binding,result);
 return result;
end $$;

revoke all on function public.issue_operation_approval(uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
create or replace function public.request_operation_approval(p_request_id uuid,p_approver uuid,p_pin text,p_operation jsonb,p_binding text) returns jsonb language plpgsql security definer set search_path='' as $$ begin return public.issue_operation_approval(p_request_id,p_approver,p_pin,public.sensitive_quote(p_operation),p_binding);end $$;

create function public.request_counter_discount_approval(p_request_id uuid,p_approver uuid,p_pin text,p_draft_id uuid,p_payload jsonb,p_discount jsonb,p_binding text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 return public.issue_operation_approval(p_request_id,p_approver,p_pin,public.counter_discount_quote(p_draft_id,p_payload,p_discount),p_binding);
end $$;

create or replace function public.create_counter_order(p_request_id uuid,p_payload jsonb,p_lines jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare submission public.counter_order_submissions;o public.orders;settings public.restaurant_settings;response jsonb;item jsonb;
 discount jsonb;quote jsonb;grant_row public.operation_authorizations;approver uuid;amount bigint;event uuid;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501';end if;
 if p_request_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object' or p_lines is null or jsonb_typeof(p_lines)<>'array' then raise exception 'Invalid counter request' using errcode='22023';end if;
 if p_payload-'items'-'name'-'discount'<>'{}' then raise exception 'Unexpected counter fields' using errcode='22023';end if;
 if p_payload->'items' is null or jsonb_typeof(p_payload->'items')<>'array' or jsonb_array_length(p_payload->'items') not between 1 and 50 then raise exception 'Invalid counter items' using errcode='22023';end if;
 if p_payload ? 'name' and jsonb_typeof(p_payload->'name') not in ('string','null') then raise exception 'Invalid counter name' using errcode='22023';end if;
 for item in select value from jsonb_array_elements(p_payload->'items') loop
  if jsonb_typeof(item)<>'object' or item-'product_id'-'quantity'-'notes'<>'{}' or coalesce(item->>'quantity','')!~'^[0-9]{1,2}$' or (item->>'quantity')::integer not between 1 and 99 or (item ? 'notes' and (jsonb_typeof(item->'notes')<>'string' or length(item->>'notes')>500)) then raise exception 'Invalid counter item' using errcode='22023';end if;
 end loop;
 -- Replay is checked before quote expiry or product changes, preserving recovery of a committed order.
 insert into public.counter_order_submissions(request_id,actor_id,payload,lines) values(p_request_id,auth.uid(),p_payload,p_lines) on conflict do nothing;
 select * into submission from public.counter_order_submissions where request_id=p_request_id for update;
 if submission.actor_id<>auth.uid() or submission.payload<>p_payload or submission.lines<>p_lines then raise exception 'Idempotency key already used' using errcode='22023';end if;
 if submission.result is not null then return submission.result;end if;
 perform 1 from public.print_processor_lease where id for update;
 perform 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','cashier') for share;
 if not found then raise exception 'Active cashier required' using errcode='42501';end if;
 select * into settings from public.restaurant_settings where id for update;
 if not settings.is_accepting_orders then raise exception 'Counter temporarily closed' using errcode='23514';end if;
 if p_payload ? 'discount' then
  discount:=p_payload->'discount';
  if jsonb_typeof(discount)<>'object' or discount-'draft_id'-'mode'-'value'-'reason'-'binding'-'authorization'<>'{}' then raise exception 'Invalid counter discount' using errcode='22023';end if;
  quote:=public.counter_discount_quote((discount->>'draft_id')::uuid,p_payload-'discount',discount-'draft_id'-'binding'-'authorization');
  if quote->>'binding' is distinct from discount->>'binding' then raise exception 'Stale counter discount' using errcode='23514';end if;
  insert into public.counter_discount_claims(draft_id,actor_id)values((discount->>'draft_id')::uuid,auth.uid());
  if public.current_user_role()='admin' then
   if nullif(discount->>'authorization','') is not null then raise exception 'Approvers use their own authority' using errcode='22023';end if;approver:=auth.uid();
  elsif (quote->>'requires_approval')::boolean or nullif(discount->>'authorization','') is not null then
   select * into grant_row from public.operation_authorizations where id=(discount->>'authorization')::uuid for update;
   if grant_row.id is null or grant_row.actor_id<>auth.uid() or grant_row.binding<>quote->>'binding' or grant_row.consumed_at is not null or grant_row.expires_at<=clock_timestamp() or grant_row.approver_id=auth.uid() then raise exception 'Approval missing, used, expired or bound to another cart' using errcode='42501';end if;
   perform 1 from public.profiles where id=grant_row.approver_id and is_active and role in ('admin','supervisor') for share;
   if not found or not exists(select 1 from public.approver_pins where user_id=grant_row.approver_id and version=grant_row.pin_version) then raise exception 'Approver is no longer eligible' using errcode='42501';end if;
   update public.operation_authorizations set consumed_at=clock_timestamp() where id=grant_row.id;approver:=grant_row.approver_id;
  end if;
 end if;
 o:=public.create_customer_order(jsonb_build_object('order_type','pickup','source','waiter','counter_entry',true,'customer_name',p_payload->>'name','items',p_payload->'items'));
 update public.orders set status='open',confirmed_at=now(),waiter_id=auth.uid() where id=o.id returning * into o;
 if quote is not null then
  update public.counter_discount_claims set order_id=o.id where draft_id=(discount->>'draft_id')::uuid;
  if o.total_amount<>(quote->>'gross')::bigint then raise exception 'Counter prices changed' using errcode='23514';end if;
  amount:=(quote->>'discount')::bigint;
  insert into public.security_action_context(backend_id,transaction_id,actor_id,approver_id,operation,reason,request_id)
   values(pg_backend_pid(),txid_current(),auth.uid(),approver,jsonb_build_object('action','discount','target',o.id,'amount',amount),quote->'operation'->>'reason',p_request_id);
  update public.orders set discount_amount=amount,discount_mode=quote->'operation'->>'mode',discount_value=(quote->'operation'->>'value')::bigint,discount_reason=quote->'operation'->>'reason' where id=o.id returning * into o;
  delete from public.security_action_context where backend_id=pg_backend_pid() and transaction_id=txid_current();
  if o.total_amount=0 then
   if jsonb_array_length(p_lines)<>0 then raise exception 'Free order accepts no payments' using errcode='23514';end if;
   update public.orders set payment_status='paid' where id=o.id returning * into o;
  end if;
  event:=public.append_audit('discount','order',o.id,amount,jsonb_build_object('discount',0,'total',(quote->>'gross')::bigint),jsonb_build_object('discount',amount,'total',o.total_amount,'mode',o.discount_mode,'value',o.discount_value,'free_settled',o.total_amount=0,'fee_adjustment',0,'counter_creation',true),o.discount_reason,approver);
 end if;
 if settings.counter_payment_timing='at_order' then
  if o.payment_status<>'paid' then perform public.record_order_payments(o.id,p_request_id,p_lines);select * into o from public.orders where id=o.id;end if;
  if o.payment_status<>'paid' then raise exception 'Full payment required before preparation' using errcode='23514';end if;
 elsif jsonb_array_length(p_lines)<>0 then raise exception 'Pay-at-end does not accept upfront lines' using errcode='22023';end if;
 response:=jsonb_build_object('order',to_jsonb(o),'receipt_path','/print/counter/'||o.id,'tracking_path','/track/'||o.public_token);
 update public.counter_order_submissions set order_id=o.id,result=response where request_id=p_request_id;
 return response;
end $$;

revoke all on function public.counter_discount_quote(uuid,jsonb,jsonb),public.request_counter_discount_approval(uuid,uuid,text,uuid,jsonb,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.counter_discount_quote(uuid,jsonb,jsonb),public.request_counter_discount_approval(uuid,uuid,text,uuid,jsonb,jsonb,text) to authenticated;
create or replace function public.print_order_snapshot(p_order_id uuid,p_items jsonb default null) returns jsonb language sql security definer set search_path='' as $$
 select public.print_order_snapshot_before_discounts(p_order_id,p_items)||jsonb_build_object('discount',o.discount_amount,'gross',o.total_amount+o.discount_amount,'payment_status',o.payment_status)from public.orders o where o.id=p_order_id;
$$;
commit;
