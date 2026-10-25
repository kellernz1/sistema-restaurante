begin;
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
 if o.order_type='pickup' and o.status<>'ready' or o.order_type='delivery' and o.status<>'out_for_delivery' then raise exception 'Order is not ready for completion' using errcode='23514'; end if;
 perform public.recompute_order_total(o.id);
 select * into o from public.orders where id=o.id;
 select * into config from public.restaurant_settings where id for share;
 select id into latest_rate from public.exchange_rates where valid_from<=now() order by valid_from desc,sequence desc limit 1;
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
 select jsonb_build_object('order',to_jsonb(x),'paid_pyg',paid,'remaining_pyg',greatest(0,x.total_amount-paid),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by created_at,line_number),'[]') from public.payments p where p.order_id=x.id)) into response from public.orders x where x.id=o.id;
 update public.order_payment_submissions set result=response where request_id=p_request_id;
 return response;
end $$;

commit;
