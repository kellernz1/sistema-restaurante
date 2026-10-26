begin;
create table public.refund_submissions(request_id uuid primary key,actor_id uuid not null references public.profiles(id),payload jsonb not null,result jsonb);
create table public.refunds(
 id uuid primary key default gen_random_uuid(),request_id uuid not null references public.refund_submissions(request_id),
 order_id uuid not null references public.orders(id),payment_id uuid not null references public.payments(id),
 amount_pyg bigint not null check(amount_pyg between 1 and 1000000000000),
 original_amount bigint not null check(original_amount between 0 and 1000000000000),
 method public.payment_method not null,currency text not null check(currency in('PYG','BRL')),
 exchange_rate numeric(20,8),rounding_adjustment_pyg bigint not null,delivery_fee_pyg bigint not null check(delivery_fee_pyg>=0),
 operator_id uuid not null references public.profiles(id),approver_id uuid references public.profiles(id),
 cash_session_id uuid not null references public.cash_sessions(id),business_date date not null,
 reason text not null,created_at timestamptz not null default clock_timestamp(),status text not null default 'recorded'check(status='recorded'),
 unique(request_id,payment_id),check((currency='PYG'and exchange_rate is null and rounding_adjustment_pyg=0)or(currency='BRL'and exchange_rate>0))
);
create index refunds_order on public.refunds(order_id);
create index refunds_session on public.refunds(cash_session_id,business_date);
create index refunds_day on public.refunds(business_date);
alter table public.refunds enable row level security;
alter table public.refund_submissions enable row level security;
revoke all on public.refunds,public.refund_submissions from public,anon,authenticated,service_role;
grant select on public.refunds to authenticated;
create policy refunds_read on public.refunds for select to authenticated using(public.current_user_role()in('admin','cashier'));
create trigger refunds_immutable before update or delete on public.refunds for each row execute function public.reject_audit_mutation();
create trigger refunds_no_truncate before truncate on public.refunds execute function public.reject_audit_mutation();

create function public.refund_quote(p_operation jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare o public.orders;p public.payments;policy public.approval_policy;action text;reason text;requested bigint;paid bigint;returned bigint;available bigint;remaining bigint;
 used bigint;original_used bigint;adjustment_used bigint;fee_used bigint;net bigint;take bigint;original bigint;adjustment bigint;fee bigint;source_fee bigint;
 lines jsonb:='[]';operation jsonb;binding text;
begin
 if auth.uid()is null or coalesce(public.current_user_role()::text,'')not in('admin','cashier')then raise exception 'Active cashier required'using errcode='42501';end if;
 if p_operation is null or jsonb_typeof(p_operation)<>'object'or p_operation-'action'-'target'-'amount'-'reason'<>'{}'then raise exception 'Invalid refund operation'using errcode='22023';end if;
 action:=p_operation->>'action';reason:=nullif(btrim(regexp_replace(p_operation->>'reason','[[:space:]]+',' ','g')),'');
 if action is null or action not in('refund','cancel_refund')or reason is null or length(reason)not between 2 and 300 then raise exception 'Refund action and reason required'using errcode='22023';end if;
 select *into o from public.orders where id=(p_operation->>'target')::uuid;
 if o.id is null or o.status='cancelled'then raise exception 'Order unavailable'using errcode='23514';end if;
 select coalesce(sum(equivalent_pyg-change_pyg),0)into paid from public.payments where order_id=o.id;
 select coalesce(sum(amount_pyg),0)into returned from public.refunds where order_id=o.id;
 -- The discounted order total is a hard ceiling; neither gross items nor cash tender are refundable credit.
 available:=greatest(0,least(o.total_amount,paid)-returned);
 if paid>o.total_amount then raise exception 'Inconsistent paid order; manual reconciliation required'using errcode='23514';end if;
 requested:=case when action='cancel_refund'then available else public.require_pyg(p_operation->>'amount')end;
 if requested is null or requested<0 or requested>available or(action='refund'and requested=0)then raise exception 'Refund exceeds discounted paid balance'using errcode='23514';end if;
 if action='refund'and(o.payment_status<>'paid'or(o.status<>'closed'and requested=available))then raise exception 'Use cancel and refund for unpaid or fully refunded active orders'using errcode='23514';end if;
 if action='cancel_refund'and o.table_id is not null and o.status<>'closed'and exists(select 1 from public.qr_requests where table_id=o.table_id and status='pending')then raise exception 'Resolve pending table requests before cancellation'using errcode='23514';end if;
 if action='cancel_refund'and available=0 and paid=0 and o.total_amount>0 then raise exception 'Use ordinary unpaid cancellation'using errcode='23514';end if;
 remaining:=requested;
 for p in select *from public.payments where order_id=o.id order by created_at,id loop
  net:=p.equivalent_pyg-p.change_pyg;
  select coalesce(sum(amount_pyg),0),coalesce(sum(original_amount),0),coalesce(sum(rounding_adjustment_pyg),0),coalesce(sum(delivery_fee_pyg),0)into used,original_used,adjustment_used,fee_used from public.refunds where payment_id=p.id;
  if used>net then raise exception 'Inconsistent refund ledger'using errcode='23514';end if;
  take:=least(remaining,net-used);if take<=0 then continue;end if;
  -- Cumulative proportional cents distribute rounding once. A full refund restores exactly the original BRL cents.
  original:=case when p.currency='PYG'then take else floor(p.original_amount::numeric*(used+take)/net)::bigint-original_used end;
  if original=0 then raise exception 'Refund is below the original currency smallest unit'using errcode='23514';end if;
  adjustment:=case when p.currency='BRL'then round(p.rounding_adjustment_pyg::numeric*(used+take)/net)::bigint-adjustment_used else 0 end;
  source_fee:=coalesce(p.delivery_fee_pyg,case when p.id=(select id from public.payments where order_id=o.id order by created_at desc,id desc limit 1)and paid>=o.total_amount then o.delivery_fee else 0 end);
  fee:=floor(source_fee::numeric*(used+take)/net)::bigint-fee_used;
  if original<0 or original+original_used>(p.original_amount-case when p.currency='PYG'then p.change_pyg else 0 end)then raise exception 'Refund exceeds original currency receipt'using errcode='23514';end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('payment_id',p.id,'method',p.method,'currency',p.currency,'original',original,'amount',take,'rate',p.exchange_rate::text,'rounding',adjustment,'fee',fee));remaining:=remaining-take;
 end loop;
 if remaining<>0 then raise exception 'Insufficient payment balance'using errcode='23514';end if;
 select *into policy from public.approval_policy where id;
 operation:=jsonb_build_object('action',action,'target',o.id,'order_id',o.id,'amount',requested,'reason',reason);
 binding:=encode(extensions.digest(convert_to(jsonb_build_object('actor',auth.uid(),'operation',operation,'policy',policy.version,'total',o.total_amount,'discount',o.discount_amount,'status',o.status,'paid',paid,'returned',returned,'lines',lines,'payments',(select jsonb_agg(to_jsonb(v)order by v.id)from public.payments v where order_id=o.id),'refunds',(select coalesce(jsonb_agg(jsonb_build_array(id,amount_pyg,original_amount)order by id),'[]')from public.refunds where order_id=o.id))::text,'UTF8'),'sha256'),'hex');
 return jsonb_build_object('operation',operation,'binding',binding,'number',o.order_number,'ticket',o.counter_ticket,'total',o.total_amount,'discount',o.discount_amount,'paid',paid,'refunded',returned,'available',available,'amount',requested,'lines',lines,'requires_approval',public.current_user_role()<>'admin');
end $$;
create function public.request_refund_approval(p_request_id uuid,p_approver uuid,p_pin text,p_operation jsonb,p_binding text)returns jsonb language plpgsql security definer set search_path=''as $$
begin return public.issue_operation_approval(p_request_id,p_approver,p_pin,public.refund_quote(p_operation),p_binding);end $$;

create function public.execute_refund(p_request_id uuid,p_operation jsonb,p_binding text,p_authorization uuid default null,p_confirmed boolean default false)returns jsonb language plpgsql security definer set search_path=''as $$
declare prior public.refund_submissions;payload jsonb;q jsonb;o public.orders;s public.cash_sessions;settings public.restaurant_settings;a public.operation_authorizations;
 approver uuid;line jsonb;event uuid;v_result jsonb;items jsonb;document jsonb;device jsonb;job uuid;day date;
begin
 if auth.uid()is null or coalesce(public.current_user_role()::text,'')not in('admin','cashier')then raise exception 'Active cashier required'using errcode='42501';end if;
 if p_request_id is null or p_confirmed is distinct from true then raise exception 'Manual refund confirmation required'using errcode='22023';end if;
 payload:=jsonb_build_object('operation',p_operation,'binding',p_binding,'authorization',p_authorization,'confirmed',p_confirmed);
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,8828));
 select *into prior from public.refund_submissions where request_id=p_request_id;
 if found then if prior.actor_id<>auth.uid()or prior.payload<>payload then raise exception 'Refund request key changed'using errcode='22023';end if;return prior.result;end if;
 perform 1 from public.print_processor_lease where id for update;
 perform 1 from public.tables where id=(select table_id from public.orders where id=(p_operation->>'target')::uuid)for update;
 select *into o from public.orders where id=(p_operation->>'target')::uuid for update;
 perform 1 from public.payments where order_id=o.id order by id for update;
 perform 1 from public.approval_policy where id for share;
 perform 1 from public.profiles where id=auth.uid()and is_active and role in('admin','cashier')for share;
 if not found then raise exception 'Active cashier required'using errcode='42501';end if;
 q:=public.refund_quote(p_operation);if q->>'binding'is distinct from p_binding then raise exception 'Stale refund quote'using errcode='23514';end if;
 select *into s from public.cash_sessions where operator_id=auth.uid()and status='open'for update;
 if s.id is null then raise exception 'Open cash session required for refund'using errcode='23514';end if;
 if public.current_user_role()='admin'then
  if p_authorization is not null then raise exception 'Approvers use their own authority'using errcode='22023';end if;approver:=auth.uid();
 else
  select *into a from public.operation_authorizations where id=p_authorization for update;
  if a.id is null or a.actor_id<>auth.uid()or a.binding<>p_binding or a.expires_at<=clock_timestamp()or a.consumed_at is not null or a.approver_id=auth.uid()then raise exception 'Refund approval missing, used or expired'using errcode='42501';end if;
  perform 1 from public.profiles where id=a.approver_id and is_active and role in('admin','supervisor')for share;
  if not found or not exists(select 1 from public.approver_pins where user_id=a.approver_id and version=a.pin_version)then raise exception 'Approver unavailable'using errcode='42501';end if;
  approver:=a.approver_id;update public.operation_authorizations set consumed_at=clock_timestamp()where id=a.id;
 end if;
 select *into settings from public.restaurant_settings where id;
 day:=public.business_day_for(clock_timestamp(),settings.business_timezone,settings.business_day_start);
 insert into public.refund_submissions(request_id,actor_id,payload)values(p_request_id,auth.uid(),payload);
 for line in select value from jsonb_array_elements(q->'lines')loop
  insert into public.refunds(request_id,order_id,payment_id,amount_pyg,original_amount,method,currency,exchange_rate,rounding_adjustment_pyg,delivery_fee_pyg,operator_id,approver_id,cash_session_id,business_date,reason)
  values(p_request_id,o.id,(line->>'payment_id')::uuid,(line->>'amount')::bigint,(line->>'original')::bigint,(line->>'method')::public.payment_method,line->>'currency',(line->>'rate')::numeric,(line->>'rounding')::bigint,(line->>'fee')::bigint,auth.uid(),approver,s.id,day,q->'operation'->>'reason');
 end loop;
 event:=public.append_audit('refund','order',o.id,(q->>'amount')::bigint,jsonb_build_object('total',o.total_amount,'discount',o.discount_amount,'paid',q->'paid','refunded',q->'refunded'),jsonb_build_object('refunded',(q->>'refunded')::bigint+(q->>'amount')::bigint,'manual',true),q->'operation'->>'reason',approver);
 if p_operation->>'action'='cancel_refund'then
  insert into public.security_action_context(backend_id,transaction_id,actor_id,approver_id,operation,reason,request_id)values(pg_backend_pid(),txid_current(),auth.uid(),approver,jsonb_build_object('action','cancel_order','target',o.id),q->'operation'->>'reason',p_request_id);
  select jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity,'price',i.unit_price,'notes',i.notes)order by i.id)into items from public.order_items i join public.products p on p.id=i.product_id where i.order_id=o.id;
  document:=(public.print_order_snapshot(o.id,items)-'payments')||jsonb_build_object('cancellation',true,'reason',q->'operation'->>'reason');
  update public.orders set status='cancelled',cancel_reason=q->'operation'->>'reason'where id=o.id;
  if o.table_id is not null and o.status<>'closed'then update public.tables set status='available'where id=o.table_id;end if;
  perform public.append_audit('cancel_order','order',o.id,o.total_amount,jsonb_build_object('sent',true,'order_id',o.id,'total',o.total_amount),jsonb_build_object('cancelled',true,'refunded',true),q->'operation'->>'reason',approver);
  select to_jsonb(d)into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='kitchen';
  insert into public.print_jobs(order_id,destination,kind,snapshot,device,created_by)values(o.id,'kitchen','cancellation',document,device,auth.uid())returning id into job;
  insert into public.kitchen_cancellations(request_id,order_id,actor_id,reason,snapshot,print_job_id)values(p_request_id,o.id,auth.uid(),q->'operation'->>'reason',document,job);
  delete from public.security_action_context where backend_id=pg_backend_pid()and transaction_id=txid_current();
 end if;
 v_result:=jsonb_build_object('ok',true,'order_id',o.id,'amount',q->'amount','lines',q->'lines','cancelled',p_operation->>'action'='cancel_refund','event_id',event);
 update public.refund_submissions set result=v_result where request_id=p_request_id;
 return v_result;
end $$;

-- Recorded receipts remain immutable. Cancellation is allowed only once every net receipt has a matching refund.
create or replace function public.guard_order_payment_fields()returns trigger language plpgsql set search_path=''as $$
declare paid bigint;returned bigint;
begin
 if current_user in('authenticated','anon')and(new.payment_status is distinct from old.payment_status or new.closed_at is distinct from old.closed_at or(new.status='closed'and old.status<>'closed'))then raise exception 'Use the payment service'using errcode='42501';end if;
 select coalesce(sum(equivalent_pyg-change_pyg),0)into paid from public.payments where order_id=new.id;
 select coalesce(sum(amount_pyg),0)into returned from public.refunds where order_id=new.id;
 if new.total_amount<paid or(new.status='cancelled'and paid>returned)then raise exception 'Recorded payments cannot be discarded'using errcode='23514';end if;
 if old.status='closed'and(new.total_amount<>old.total_amount or new.delivery_fee<>old.delivery_fee or new.payment_status<>old.payment_status or new.closed_at is distinct from old.closed_at)then raise exception 'Closed financial order is immutable'using errcode='23514';end if;
 return new;
end $$;
revoke all on function public.refund_quote(jsonb),public.request_refund_approval(uuid,uuid,text,jsonb,text),public.execute_refund(uuid,jsonb,text,uuid,boolean)from public,anon,authenticated,service_role;
grant execute on function public.refund_quote(jsonb),public.request_refund_approval(uuid,uuid,text,jsonb,text),public.execute_refund(uuid,jsonb,text,uuid,boolean)to authenticated;
commit;
