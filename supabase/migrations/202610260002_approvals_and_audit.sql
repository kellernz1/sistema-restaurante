begin;

create table public.approval_policy (
 id boolean primary key default true check(id),
 require_item_approval boolean not null default true,
 require_order_approval boolean not null default true,
 require_discount_approval boolean not null default true,
 discount_limit_pyg bigint not null default 0 check(discount_limit_pyg between 0 and 1000000000000),
 discount_limit_bps integer not null default 0 check(discount_limit_bps between 0 and 10000),
 pin_failures integer not null default 5 check(pin_failures between 1 and 10),
 pin_lock_minutes integer not null default 15 check(pin_lock_minutes between 1 and 60),
 authorization_seconds integer not null default 120 check(authorization_seconds between 30 and 300),
 discount_reasons text[] not null default array['Cortesia','Problema no atendimento','Promoção'],
 version bigint not null default 1,
 check(cardinality(discount_reasons) between 1 and 20 and length(array_to_string(discount_reasons,''))<=1000)
);
insert into public.approval_policy(id) values(true);
create table public.approver_pins (
 user_id uuid primary key references public.profiles(id), pin_hash text not null check(pin_hash ~ '^\$2[aby]\$[0-9]{2}\$[./A-Za-z0-9]{53}$'),
 version bigint not null default 1, failures integer not null default 0,
 blocked_until timestamptz, changed_at timestamptz not null default clock_timestamp()
);
create table public.approval_actor_limits (
 actor_id uuid primary key references public.profiles(id), window_start timestamptz not null default clock_timestamp(), hits integer not null default 0
);
create table public.operation_authorizations (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.profiles(id),
 approver_id uuid not null references public.profiles(id), pin_version bigint not null,
 binding text not null, expires_at timestamptz not null, consumed_at timestamptz,
 request_id uuid not null unique
);
create table public.approval_attempts (
 request_id uuid primary key, actor_id uuid not null, approver_id uuid not null, binding text not null,
 result jsonb not null
);
create table public.sensitive_submissions (
 request_id uuid primary key, actor_id uuid not null, payload jsonb not null, result jsonb
);
create table public.security_action_context (
 backend_id integer not null, transaction_id bigint not null, actor_id uuid not null, approver_id uuid,
 operation jsonb not null, reason text not null, request_id uuid not null,
 primary key(backend_id,transaction_id)
);
create table public.audit_pseudonym_key(id boolean primary key default true check(id), secret bytea not null);
insert into public.audit_pseudonym_key(secret) values(extensions.gen_random_bytes(32));
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), created_at timestamptz not null default clock_timestamp(),
 actor_id uuid, approver_id uuid, action text not null, target_type text not null, target_id uuid,
 amount_pyg bigint not null default 0 check(amount_pyg between -1000000000000 and 1000000000000),
 before_summary jsonb not null default '{}', after_summary jsonb not null default '{}', reason text,
 cash_session_id uuid references public.cash_sessions(id), business_date date not null
);
create index audit_events_day on public.audit_events(business_date,created_at);
create index audit_events_actor on public.audit_events(actor_id,created_at);
create index audit_events_approver on public.audit_events(approver_id,created_at);
create table public.kitchen_cancellations (
 id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
 order_id uuid not null references public.orders(id), actor_id uuid not null,
 created_at timestamptz not null default clock_timestamp(), reason text not null,
 snapshot jsonb not null, print_job_id uuid references public.print_jobs(id)
);
alter table public.orders add column discount_amount bigint not null default 0 check(discount_amount between 0 and 1000000000000);
alter table public.orders add column discount_mode text check(discount_mode in ('amount','percent'));
alter table public.orders add column discount_value bigint;
alter table public.orders add column discount_reason text;
alter table public.print_jobs drop constraint print_jobs_kind_check;
alter table public.print_jobs add constraint print_jobs_kind_check check(kind in ('kitchen','receipt','test','cash_session','cancellation'));
alter table public.print_job_reviews add column cash_session_id uuid references public.cash_sessions(id);
alter table public.print_job_reviews add column business_date date;
alter table public.cash_session_events add column business_date date;

alter table public.approval_policy enable row level security;
alter table public.approver_pins enable row level security;
alter table public.approval_actor_limits enable row level security;
alter table public.operation_authorizations enable row level security;
alter table public.approval_attempts enable row level security;
alter table public.sensitive_submissions enable row level security;
alter table public.security_action_context enable row level security;
alter table public.audit_pseudonym_key enable row level security;
alter table public.audit_events enable row level security;
alter table public.kitchen_cancellations enable row level security;
revoke all on public.approval_policy,public.approver_pins,public.approval_actor_limits,public.operation_authorizations,public.approval_attempts,public.sensitive_submissions,public.security_action_context,public.audit_pseudonym_key,public.audit_events,public.kitchen_cancellations from public,anon,authenticated,service_role;
grant select on public.audit_events,public.kitchen_cancellations to authenticated;
create policy audit_admin_read on public.audit_events for select to authenticated using(public.current_user_role()='admin');
create policy cancellation_staff_read on public.kitchen_cancellations for select to authenticated using(public.current_user_role() in ('admin','cashier','kitchen','supervisor'));

create function public.reject_audit_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Audit history is immutable' using errcode='42501';end $$;
create trigger audit_events_immutable before update or delete on public.audit_events for each row execute function public.reject_audit_mutation();
create trigger audit_events_no_truncate before truncate on public.audit_events for each statement execute function public.reject_audit_mutation();
create trigger kitchen_cancellations_immutable before update or delete on public.kitchen_cancellations for each row execute function public.reject_audit_mutation();

create function public.append_audit(p_action text,p_type text,p_target uuid,p_amount bigint,p_before jsonb,p_after jsonb,p_reason text default null,p_approver uuid default null,p_actor uuid default auth.uid()) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;s public.restaurant_settings;session_id uuid;
begin
 select * into s from public.restaurant_settings where id;
 select id into session_id from public.cash_sessions where operator_id=p_actor and status='open';
 insert into public.audit_events(actor_id,approver_id,action,target_type,target_id,amount_pyg,before_summary,after_summary,reason,cash_session_id,business_date)
 values(p_actor,p_approver,p_action,p_type,p_target,coalesce(p_amount,0),coalesce(p_before,'{}'),coalesce(p_after,'{}'),p_reason,session_id,public.business_day_for(clock_timestamp(),s.business_timezone,s.business_day_start)) returning id into result;
 return result;
end $$;

create function public.current_security_context() returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(c) from public.security_action_context c where backend_id=pg_backend_pid() and transaction_id=txid_current() and actor_id=auth.uid();
$$;
create function public.owner_maintenance() returns boolean language sql stable set search_path='' as $$
 select session_user in ('postgres','supabase_admin') and current_setting('role')='none';
$$;
create function public.guard_sensitive_order() returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb;gross numeric;
begin
 if tg_op='DELETE' then
  if public.owner_maintenance() then return old;end if;
  raise exception 'Orders are cancelled, never deleted' using errcode='42501';
 end if;
 context:=public.current_security_context();
 if tg_op='INSERT' then
  if new.discount_amount<>0 or new.discount_mode is not null or new.discount_value is not null or new.discount_reason is not null then raise exception 'Use sensitive operation service' using errcode='42501';end if;
  return new;
 end if;
 if not public.owner_maintenance() then
  if old.status<>'pending_confirmation' and new.status='pending_confirmation' and not (auth.role()='service_role' and old.created_at=transaction_timestamp() and old.source='whatsapp') then raise exception 'Order confirmation cannot be reverted' using errcode='42501';end if;
  if old.confirmed_at is not null and new.confirmed_at is null and not (auth.role()='service_role' and old.created_at=transaction_timestamp() and old.source='whatsapp') then raise exception 'Order confirmation cannot be removed' using errcode='42501';end if;
  if (new.discount_amount,new.discount_mode,new.discount_value,new.discount_reason) is distinct from (old.discount_amount,old.discount_mode,old.discount_value,old.discount_reason) and
    (context is null or context->'operation'->>'action'<>'discount' or context->'operation'->>'target'<>new.id::text or (context->'operation'->>'amount')::bigint<>new.discount_amount) then raise exception 'Use sensitive operation service' using errcode='42501';end if;
  if new.delivery_fee<>old.delivery_fee and old.status<>'pending_confirmation' then raise exception 'Confirmed delivery fee is immutable' using errcode='42501';end if;
  if new.status='cancelled' and old.status<>'cancelled' then
   if old.status<>'pending_confirmation' and (context is null or context->'operation'->>'action'<>'cancel_order' or context->'operation'->>'target'<>old.id::text) then raise exception 'Use sensitive operation service' using errcode='42501';end if;
   if nullif(btrim(new.cancel_reason),'') is null then raise exception 'Cancellation reason required' using errcode='22023';end if;
  end if;
 end if;
 select coalesce(sum(quantity::numeric*unit_price),0)+new.delivery_fee into gross from public.order_items where order_id=new.id;
 if new.total_amount<>old.total_amount and new.total_amount<>gross-new.discount_amount then raise exception 'Order total must match authoritative items and discount' using errcode='23514';end if;
 if gross<new.discount_amount or gross>1000000000000 then raise exception 'Invalid discounted total' using errcode='23514';end if;
 new.total_amount:=(gross-new.discount_amount)::bigint;
 return new;
end $$;
create trigger approval_order_guard before insert or update or delete on public.orders for each row execute function public.guard_sensitive_order();

create function public.guard_sensitive_item() returns trigger language plpgsql security definer set search_path='' as $$
declare context jsonb;
begin
 if public.owner_maintenance() then return case when tg_op='DELETE' then old else new end;end if;
 context:=public.current_security_context();
 if tg_op='DELETE' then
  if context is null or context->'operation'->>'action'<>'cancel_item' or context->'operation'->>'target'<>old.id::text then raise exception 'Use sensitive operation service' using errcode='42501';end if;
  return old;
 end if;
 if (new.order_id,new.product_id,new.unit_price) is distinct from (old.order_id,old.product_id,old.unit_price) or new.quantity<old.quantity then raise exception 'Cancel and replace items through the sensitive operation service' using errcode='42501';end if;
 return new;
end $$;
create trigger approval_item_guard before update or delete on public.order_items for each row execute function public.guard_sensitive_item();

create or replace function public.recompute_order_total(p_order_id uuid) returns numeric language plpgsql security definer set search_path='' as $$
declare total bigint;
begin
 update public.orders o set total_amount=coalesce((select sum(i.quantity::numeric*i.unit_price) from public.order_items i where i.order_id=o.id),0)+o.delivery_fee-o.discount_amount where o.id=p_order_id returning total_amount into total;
 return total;
end $$;

create function public.execute_sensitive_action(p_request_id uuid,p_operation jsonb,p_binding text,p_authorization uuid default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb;op jsonb;o public.orders;old_order public.orders;a public.operation_authorizations;
 prior public.sensitive_submissions;payload jsonb;approver uuid;items jsonb;document jsonb;device jsonb;job uuid;notice uuid;event uuid;action_result jsonb;paid bigint;fee_adjustment bigint:=0;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','supervisor','waiter') then raise exception 'Active staff required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Request key required' using errcode='22023';end if;
 payload:=jsonb_build_object('operation',p_operation,'binding',p_binding,'authorization',p_authorization);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,8128));
 select * into prior from public.sensitive_submissions where request_id=p_request_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.payload<>payload then raise exception 'Sensitive request key changed' using errcode='22023';end if;
  return prior.result;
 end if;
 -- Shared print lease -> table -> order -> items ordering prevents transport/review deadlocks.
 perform 1 from public.print_processor_lease where id for update;
 if p_operation->>'action'='cancel_item' then select order_id into o.id from public.order_items where id=(p_operation->>'target')::uuid;
 else o.id:=(p_operation->>'target')::uuid;end if;
 perform 1 from public.tables where id=(select table_id from public.orders where id=o.id) for update;
 select * into o from public.orders where id=o.id for update;
 perform 1 from public.order_items where order_id=o.id order by id for update;
 perform 1 from public.approval_policy where id for share;
 perform 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','cashier','supervisor','waiter') for share;
 if not found then raise exception 'Active staff required' using errcode='42501';end if;
 quote:=public.sensitive_quote(p_operation);op:=quote->'operation';
 if quote->>'binding' is distinct from p_binding then raise exception 'Stale operation' using errcode='23514';end if;
 if public.current_user_role() in ('admin','supervisor') then
  if p_authorization is not null then raise exception 'Approvers use their own authority' using errcode='22023';end if;
  approver:=auth.uid();
 elsif (quote->>'requires_approval')::boolean or p_authorization is not null then
  select * into a from public.operation_authorizations where id=p_authorization for update;
  if a.id is null or a.actor_id<>auth.uid() or a.binding<>p_binding or a.consumed_at is not null or a.expires_at<=clock_timestamp() or a.approver_id=auth.uid() then raise exception 'Approval missing, used, expired or bound to another operation' using errcode='42501';end if;
  perform 1 from public.profiles where id=a.approver_id and is_active and role in ('admin','supervisor') for share;
  if not found or not exists(select 1 from public.approver_pins where user_id=a.approver_id and version=a.pin_version) then raise exception 'Approver is no longer eligible' using errcode='42501';end if;
  update public.operation_authorizations set consumed_at=clock_timestamp() where id=a.id;
  approver:=a.approver_id;
 end if;
 insert into public.sensitive_submissions(request_id,actor_id,payload) values(p_request_id,auth.uid(),payload);
 insert into public.security_action_context(backend_id,transaction_id,actor_id,approver_id,operation,reason,request_id) values(pg_backend_pid(),txid_current(),auth.uid(),approver,op,op->>'reason',p_request_id);
 old_order:=o;
 if op->>'action'='discount' then
  update public.orders set discount_amount=(op->>'amount')::bigint,discount_mode=op->>'mode',discount_value=(op->>'value')::bigint,discount_reason=op->>'reason' where id=o.id;
  select * into o from public.orders where id=o.id;
  paid:=(quote->>'paid')::bigint;
  if paid=o.total_amount then
   fee_adjustment:=greatest(0,o.delivery_fee-coalesce((select sum(delivery_fee_pyg) from public.payments where order_id=o.id),0));
   update public.orders set payment_status='paid',status=case when is_counter or qr_prepaid_account then status else 'closed'::public.order_status end,closed_at=case when is_counter or qr_prepaid_account then null else clock_timestamp() end where id=o.id;
   if o.table_id is not null and not o.qr_prepaid_account then update public.tables set status='available' where id=o.table_id;end if;
  end if;
  event:=public.append_audit('discount','order',o.id,o.discount_amount-old_order.discount_amount,jsonb_build_object('discount',old_order.discount_amount,'total',old_order.total_amount),jsonb_build_object('discount',o.discount_amount,'total',o.total_amount,'mode',o.discount_mode,'value',o.discount_value,'free_settled',paid=0 and o.total_amount=0,'fee_adjustment',fee_adjustment),op->>'reason',approver);
 else
  select jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity,'price',i.unit_price,'notes',i.notes) order by i.id) into items from public.order_items i join public.products p on p.id=i.product_id where i.order_id=o.id and (op->>'action'='cancel_order' or i.id=(op->>'target')::uuid);
  document:=(public.print_order_snapshot(o.id,items)-'payments')||jsonb_build_object('cancellation',true,'reason',op->>'reason','total',(op->>'amount')::bigint);
  if op->>'action'='cancel_item' then delete from public.order_items where id=(op->>'target')::uuid;
  else
   update public.orders set status='cancelled',cancel_reason=op->>'reason' where id=o.id;
   if o.table_id is not null then update public.tables set status='available' where id=o.table_id;end if;
  end if;
  event:=public.append_audit(op->>'action',case when op->>'action'='cancel_item' then 'order_item' else 'order' end,(op->>'target')::uuid,(op->>'amount')::bigint,jsonb_build_object('order_id',o.id,'sent',op->'sent','total',old_order.total_amount),jsonb_build_object('cancelled',true),op->>'reason',approver);
  if (op->>'sent')::boolean then
   select to_jsonb(d) into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='kitchen';
   insert into public.print_jobs(order_id,destination,kind,snapshot,device,created_by) values(o.id,'kitchen','cancellation',document,device,auth.uid()) returning id into job;
   insert into public.kitchen_cancellations(request_id,order_id,actor_id,reason,snapshot,print_job_id) values(p_request_id,o.id,auth.uid(),op->>'reason',document,job) returning id into notice;
  end if;
 end if;
 delete from public.security_action_context where backend_id=pg_backend_pid() and transaction_id=txid_current();
 action_result:=jsonb_build_object('ok',true,'event_id',event,'order_id',o.id,'print_job_id',job);
 update public.sensitive_submissions set result=action_result where request_id=p_request_id;
 return action_result;
end $$;

create function public.approval_budget() returns boolean language plpgsql security definer set search_path='' as $$
declare q public.approval_actor_limits;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','supervisor','waiter') then raise exception 'Active staff required' using errcode='42501';end if;
 insert into public.approval_actor_limits(actor_id) values(auth.uid()) on conflict do nothing;
 select * into q from public.approval_actor_limits where actor_id=auth.uid() for update;
 if q.window_start<clock_timestamp()-interval '1 minute' then q.window_start:=clock_timestamp();q.hits:=0;end if;
 q.hits:=least(q.hits+1,11);
 update public.approval_actor_limits set hits=q.hits,window_start=q.window_start where actor_id=q.actor_id;
 if q.hits=11 then
  if not exists(select 1 from public.audit_events where actor_id=q.actor_id and action='pin_rate_limited' and created_at>=q.window_start) then perform public.append_audit('pin_rate_limited','profile',auth.uid(),0,'{}','{}');end if;
  return false;
 end if;
 return true;
end $$;

create function public.set_approval_pin(p_pin text,p_password text) returns jsonb language plpgsql security definer set search_path='' as $$
declare password_hash text;v bigint;
begin
 if coalesce(public.current_user_role()::text,'') not in ('admin','supervisor') then raise exception 'Approver required' using errcode='42501';end if;
 if not public.approval_budget() then return jsonb_build_object('ok',false,'code','limited');end if;
 if p_pin is null or p_pin!~'^[0-9]{4,6}$' or p_password is null or octet_length(p_password)>256 then return jsonb_build_object('ok',false,'code','invalid');end if;
 perform 1 from public.profiles where id=auth.uid() and is_active and role in ('admin','supervisor') for share;
 if not found then raise exception 'Active approver required' using errcode='42501';end if;
 select encrypted_password into password_hash from auth.users where id=auth.uid();
 if password_hash is null or password_hash='' or extensions.crypt(p_password,password_hash) is distinct from password_hash then
  perform public.append_audit('pin_reauthentication_failed','profile',auth.uid(),0,'{}','{}');
  return jsonb_build_object('ok',false,'code','reauthentication');
 end if;
 insert into public.approver_pins(user_id,pin_hash) values(auth.uid(),extensions.crypt(p_pin,extensions.gen_salt('bf',12)))
 on conflict(user_id) do update set pin_hash=excluded.pin_hash,version=public.approver_pins.version+1,failures=0,blocked_until=null,changed_at=clock_timestamp() returning version into v;
 perform public.append_audit('pin_changed','profile',auth.uid(),0,'{}',jsonb_build_object('version',v),null,auth.uid());
 return jsonb_build_object('ok',true);
end $$;

create function public.sensitive_quote(p_operation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders;i public.order_items;p public.approval_policy;action text;target uuid;mode text;v bigint;amount bigint;gross bigint;paid bigint;sent boolean;reason text;required boolean;binding text;operation jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','supervisor','waiter') then raise exception 'Active staff required' using errcode='42501';end if;
 if jsonb_typeof(p_operation)<>'object' or exists(select 1 from jsonb_object_keys(p_operation) k where k not in ('action','target','mode','value','reason')) then raise exception 'Invalid operation' using errcode='22023';end if;
 action:=p_operation->>'action';target:=(p_operation->>'target')::uuid;mode:=p_operation->>'mode';
 reason:=nullif(btrim(regexp_replace(p_operation->>'reason','[[:space:]]+',' ','g')),'');
 if action not in ('discount','cancel_item','cancel_order') or action is null or target is null or reason is null or length(reason) not between 2 and 500 then raise exception 'Action and reason required' using errcode='22023';end if;
 select * into p from public.approval_policy where id;
 if action='cancel_item' then select * into i from public.order_items where id=target;select * into o from public.orders where id=i.order_id;
 else select * into o from public.orders where id=target;end if;
 if o.id is null or o.status in ('closed','cancelled') then raise exception 'Order unavailable' using errcode='23514';end if;
 if public.current_user_role()='waiter' and (o.waiter_id is distinct from auth.uid() or action='discount') then raise exception 'Cashier required' using errcode='42501';end if;
 select coalesce(sum(equivalent_pyg-change_pyg),0) into paid from public.payments where order_id=o.id;
 if o.payment_status='paid' or (o.total_amount>0 and paid>=o.total_amount) then raise exception 'Paid order requires refund workflow (8B)' using errcode='23514';end if;
 gross:=o.total_amount+o.discount_amount;
 sent:=o.status<>'pending_confirmation' or o.confirmed_at is not null or exists(select 1 from public.print_item_state where item_id=i.id and forwarded_quantity>0);
 if action='discount' then
  if o.status='pending_confirmation' then raise exception 'Confirm the order before discounting' using errcode='23514';end if;
  v:=public.require_pyg(p_operation->>'value');
  if mode not in ('amount','percent') or mode is null or v is null or (mode='percent' and v>10000) then raise exception 'Invalid discount' using errcode='22023';end if;
  amount:=case when mode='percent' then round(gross::numeric*v/10000)::bigint else v end;
  if amount>gross or gross-amount<paid then raise exception 'Discount exceeds unpaid balance' using errcode='23514';end if;
  if gross-amount=paid and not o.is_counter and o.order_type in ('pickup','delivery') and not((o.order_type='pickup' and o.status='ready') or(o.order_type='delivery' and o.status='out_for_delivery')) then raise exception 'Complete preparation before a settling discount' using errcode='23514';end if;
  required:=p.require_discount_approval or amount>p.discount_limit_pyg or (gross>0 and amount::numeric*10000>gross::numeric*p.discount_limit_bps);
 elsif action='cancel_item' then
  amount:=i.quantity::bigint*i.unit_price;v:=amount;mode:='amount';required:=sent and p.require_item_approval;
  if paid>0 then raise exception 'Paid order requires refund workflow (8B)' using errcode='23514';end if;
  if gross-amount<o.discount_amount then raise exception 'Review discount before removing this item' using errcode='23514';end if;
 else
  amount:=o.total_amount;v:=amount;mode:='amount';required:=sent and p.require_order_approval;
  if paid>0 then raise exception 'Paid order requires refund workflow (8B)' using errcode='23514';end if;
 end if;
 operation:=jsonb_build_object('action',action,'target',target,'order_id',o.id,'mode',mode,'value',v,'amount',amount,'reason',reason,'sent',sent);
 binding:=encode(extensions.digest(convert_to(jsonb_build_object('actor',auth.uid(),'operation',operation,'policy',p.version,'total',o.total_amount,'discount',o.discount_amount,'paid',paid,'status',o.status,'confirmed_at',o.confirmed_at,'items',(select coalesce(jsonb_agg(jsonb_build_array(id,quantity,unit_price,status) order by id),'[]') from public.order_items where order_id=o.id))::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('operation',operation,'binding',binding,'gross',gross,'total',o.total_amount,'paid',paid,'requires_approval',required and public.current_user_role() not in ('admin','supervisor'));
end $$;

create function public.request_operation_approval(p_request_id uuid,p_approver uuid,p_pin text,p_operation jsonb,p_binding text) returns jsonb language plpgsql security definer set search_path='' as $$
declare quote jsonb;pin public.approver_pins;policy public.approval_policy;prior public.approval_attempts;authorization_id uuid;result jsonb;blocked boolean;eligible boolean;
begin
 quote:=public.sensitive_quote(p_operation);
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
  perform public.append_audit('approval_granted','order',(quote->'operation'->>'order_id')::uuid,(quote->'operation'->>'amount')::bigint,jsonb_build_object('action',quote->'operation'->>'action'),'{}',quote->'operation'->>'reason',p_approver);
  result:=jsonb_build_object('ok',true,'authorization',authorization_id,'expires_seconds',policy.authorization_seconds);
 end if;
 insert into public.approval_attempts(request_id,actor_id,approver_id,binding,result) values(p_request_id,auth.uid(),p_approver,p_binding,result);
 return result;
end $$;

create function public.security_configuration() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.current_user_role()::text,'') not in ('admin','cashier','supervisor','waiter') then raise exception 'Staff required' using errcode='42501';end if;
 return jsonb_build_object('policy',(select to_jsonb(p)-'id' from public.approval_policy p where id),'own_pin',exists(select 1 from public.approver_pins where user_id=auth.uid()),'approvers',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.full_name,'role',p.role) order by p.full_name),'[]') from public.profiles p join public.approver_pins pin on pin.user_id=p.id where p.is_active and p.role in ('admin','supervisor')));
end $$;

create function public.set_security_policy(p_policy jsonb) returns void language plpgsql security definer set search_path='' as $$
declare p public.approval_policy;
begin
 if public.current_user_role() is distinct from 'admin' then raise exception 'Admin required' using errcode='42501';end if;
 if jsonb_typeof(p_policy)<>'object' or exists(select 1 from jsonb_object_keys(p_policy) k where k not in ('require_item_approval','require_order_approval','require_discount_approval','discount_limit_pyg','discount_limit_bps','pin_failures','pin_lock_minutes','authorization_seconds','discount_reasons')) then raise exception 'Invalid policy' using errcode='22023';end if;
 select * into p from public.approval_policy where id for update;
 p:=jsonb_populate_record(p,p_policy);
 if exists(select 1 from unnest(p.discount_reasons) r where length(btrim(r)) not between 1 and 80) then raise exception 'Invalid reason list' using errcode='22023';end if;
 update public.approval_policy set require_item_approval=p.require_item_approval,require_order_approval=p.require_order_approval,require_discount_approval=p.require_discount_approval,discount_limit_pyg=p.discount_limit_pyg,discount_limit_bps=p.discount_limit_bps,pin_failures=p.pin_failures,pin_lock_minutes=p.pin_lock_minutes,authorization_seconds=p.authorization_seconds,discount_reasons=p.discount_reasons where id;
end $$;
create function public.bump_approval_policy() returns trigger language plpgsql set search_path='' as $$
begin
 if to_jsonb(new)-'version'<>to_jsonb(old)-'version' then new.version:=old.version+1;else new.version:=old.version;end if;
 return new;
end $$;
create trigger approval_policy_version before update on public.approval_policy for each row execute function public.bump_approval_policy();

create function public.approval_workbench() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.current_user_role()::text,'') not in ('admin','supervisor','cashier') then raise exception 'Supervisor/cashier required' using errcode='42501';end if;
 return (select coalesce(jsonb_agg(v),'[]') from(select o.id,o.order_number,o.counter_ticket,o.order_type,o.status,o.payment_status,o.total_amount,o.discount_amount,(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity,'price',i.unit_price) order by i.created_at),'[]') from public.order_items i join public.products p on p.id=i.product_id where i.order_id=o.id) items from public.orders o where o.status not in ('closed','cancelled') order by o.created_at desc limit 100)v);
end $$;

create function public.capture_administrative_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare before_value jsonb:='{}';after_value jsonb:='{}';actor uuid:=auth.uid();target uuid;amount bigint:=0;action text;phone text;key bytea;
begin
 if tg_op<>'INSERT' then before_value:=to_jsonb(old);end if;
 if tg_op<>'DELETE' then after_value:=to_jsonb(new);end if;
 if tg_table_name='products' then
  if tg_op='UPDATE' and (old.price,old.is_active) is not distinct from (new.price,new.is_active) then return null;end if;
  target:=new.id;action:='product_changed';amount:=new.price-coalesce((before_value->>'price')::bigint,0);
  before_value:=jsonb_build_object('price',before_value->'price','available',before_value->'is_active');after_value:=jsonb_build_object('price',new.price,'available',new.is_active);
 elsif tg_table_name='profiles' then
  if tg_op='UPDATE' and (old.role,old.is_active) is not distinct from (new.role,new.is_active) then return null;end if;
  target:=new.id;action:=case when tg_op='INSERT' then 'employee_created' else 'employee_changed' end;
  if tg_op='INSERT' and actor is null then
   select p.id into actor from auth.users u join public.profiles p on p.id=nullif(u.raw_user_meta_data->>'staff_created_by','')::uuid where u.id=new.id and p.role='admin' and p.is_active;
  end if;
  if tg_op='UPDATE' then update public.approver_pins set version=version+1 where user_id=new.id;end if;
  before_value:=jsonb_build_object('role',before_value->'role','active',before_value->'is_active');after_value:=jsonb_build_object('role',new.role,'active',new.is_active);
 elsif tg_table_name='restaurant_settings' then
  before_value:=jsonb_build_object('payment_methods',old.enabled_payment_methods,'accepting',old.is_accepting_orders,'pickup',old.pickup_enabled,'delivery',old.delivery_enabled,'qr',old.dine_in_qr_enabled);
  after_value:=jsonb_build_object('payment_methods',new.enabled_payment_methods,'accepting',new.is_accepting_orders,'pickup',new.pickup_enabled,'delivery',new.delivery_enabled,'qr',new.dine_in_qr_enabled);action:='restaurant_security_changed';
 elsif tg_table_name in ('service_policy','approval_policy','cash_session_policy') then
  action:=tg_table_name||'_changed';
 elsif tg_table_name='blocked_phones' then
  phone:=coalesce(after_value->>'phone',before_value->>'phone');select secret into key from public.audit_pseudonym_key where id;
  before_value:=jsonb_build_object('blocked',tg_op<>'INSERT');after_value:=jsonb_build_object('blocked',tg_op<>'DELETE','phone_key',encode(extensions.hmac(convert_to(phone,'UTF8'),key,'sha256'),'hex'));action:='phone_block_changed';
 else return null;
 end if;
 if tg_op='UPDATE' and before_value=after_value then return null;end if;
 perform public.append_audit(action,tg_table_name,target,amount,before_value,after_value,null,case when public.current_user_role() in ('admin','supervisor') then actor else null end,actor);
 return null;
end $$;
create trigger product_audit after insert or update on public.products for each row execute function public.capture_administrative_audit();
create trigger employee_audit after insert or update on public.profiles for each row execute function public.capture_administrative_audit();
create trigger restaurant_security_audit after update on public.restaurant_settings for each row execute function public.capture_administrative_audit();
create trigger service_policy_audit after update on public.service_policy for each row execute function public.capture_administrative_audit();
create trigger approval_policy_audit after update on public.approval_policy for each row execute function public.capture_administrative_audit();
create trigger cash_policy_audit after update on public.cash_session_policy for each row execute function public.capture_administrative_audit();
create trigger phone_block_audit after insert or delete or update on public.blocked_phones for each row execute function public.capture_administrative_audit();

create function public.capture_pending_cancellation_audit() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status='cancelled' and old.status<>'cancelled' and public.current_security_context() is null then
  perform public.append_audit('cancel_order','order',new.id,old.total_amount,jsonb_build_object('status',old.status,'sent',old.status<>'pending_confirmation'),'{}',new.cancel_reason,case when public.current_user_role() in ('admin','supervisor') then auth.uid() else null end);
 end if;
 return null;
end $$;
create trigger pending_cancellation_audit after update of status on public.orders for each row execute function public.capture_pending_cancellation_audit();
create function public.link_print_review_session() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.restaurant_settings;
begin
 select * into s from public.restaurant_settings where id;
 new.created_at:=clock_timestamp();new.business_date:=public.business_day_for(new.created_at,s.business_timezone,s.business_day_start);
 select id into new.cash_session_id from public.cash_sessions where operator_id=new.actor_id and status='open';return new;
end $$;
create trigger print_review_session before insert on public.print_job_reviews for each row execute function public.link_print_review_session();
create trigger print_reviews_immutable before update or delete on public.print_job_reviews for each row execute function public.reject_audit_mutation();
create trigger print_reviews_no_truncate before truncate on public.print_job_reviews for each statement execute function public.reject_audit_mutation();
create trigger cash_events_no_truncate before truncate on public.cash_session_events for each statement execute function public.reject_audit_mutation();
create function public.date_cash_session_event() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.restaurant_settings;
begin
 select * into s from public.restaurant_settings where id;new.created_at:=clock_timestamp();new.business_date:=public.business_day_for(new.created_at,s.business_timezone,s.business_day_start);return new;
end $$;
create trigger cash_event_business_date before insert on public.cash_session_events for each row execute function public.date_cash_session_event();

create function public.audit_timeline(p_day date default null,p_action text default null,p_actor uuid default null,p_approver uuid default null,p_offset integer default 0) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare day date;settings public.restaurant_settings;result jsonb;
begin
 if public.current_user_role() is distinct from 'admin' then raise exception 'Admin audit access required' using errcode='42501';end if;
 if p_offset is null or p_offset<0 or p_offset>100000 then raise exception 'Invalid audit page' using errcode='22023';end if;
 select * into settings from public.restaurant_settings where id;
 day:=coalesce(p_day,public.business_day_for(clock_timestamp(),settings.business_timezone,settings.business_day_start));
 with events as(
  select id,created_at,actor_id,approver_id,action,target_type,target_id,amount_pyg,before_summary,after_summary,reason,cash_session_id,business_date from public.audit_events
  union all select id,created_at,actor_id,actor_id,'cash_reopened','cash_session',session_id,0,'{}',jsonb_build_object('reopened',true),payload->>'reason',session_id,coalesce(business_date,public.business_day_for(created_at,settings.business_timezone,settings.business_day_start)) from public.cash_session_events where action='reopen'
  union all select id,created_at,actor_id,actor_id,'print_archived','print_job',job_id,0,'{}',jsonb_build_object('decision',decision),null,cash_session_id,coalesce(business_date,public.business_day_for(created_at,settings.business_timezone,settings.business_day_start)) from public.print_job_reviews where decision='discard'
 ), selected as(select e.*,a.full_name actor_name,p.full_name approver_name from events e left join public.profiles a on a.id=e.actor_id left join public.profiles p on p.id=e.approver_id where e.business_date=day and (p_action is null or e.action=p_action) and (p_actor is null or e.actor_id=p_actor) and(p_approver is null or e.approver_id=p_approver) order by e.created_at desc,e.id limit 101 offset p_offset)
 select coalesce(jsonb_agg(to_jsonb(selected)),'[]') into result from selected;
 return jsonb_build_object('day',day,'events',result-100,'limit',100,'offset',p_offset,'has_more',jsonb_array_length(result)>100);
end $$;

-- Secrets, context, write helpers and report internals are never executable by clients.
revoke all on function public.append_audit(text,text,uuid,bigint,jsonb,jsonb,text,uuid,uuid),public.approval_budget(),public.current_security_context(),public.owner_maintenance(),public.guard_sensitive_order(),public.guard_sensitive_item(),public.reject_audit_mutation(),public.capture_administrative_audit(),public.capture_pending_cancellation_audit(),public.link_print_review_session(),public.date_cash_session_event(),public.bump_approval_policy() from public,anon,authenticated,service_role;
revoke all on function public.set_approval_pin(text,text),public.sensitive_quote(jsonb),public.request_operation_approval(uuid,uuid,text,jsonb,text),public.execute_sensitive_action(uuid,jsonb,text,uuid),public.security_configuration(),public.set_security_policy(jsonb),public.approval_workbench(),public.audit_timeline(date,text,uuid,uuid,integer) from public,anon,authenticated,service_role;
grant execute on function public.set_approval_pin(text,text),public.sensitive_quote(jsonb),public.request_operation_approval(uuid,uuid,text,jsonb,text),public.execute_sensitive_action(uuid,jsonb,text,uuid),public.security_configuration(),public.set_security_policy(jsonb),public.approval_workbench(),public.audit_timeline(date,text,uuid,uuid,integer) to authenticated;
commit;
