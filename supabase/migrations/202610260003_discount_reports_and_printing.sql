begin;
alter function public.print_order_snapshot(uuid,jsonb) rename to print_order_snapshot_before_discounts;
create function public.print_order_snapshot(p_order_id uuid,p_items jsonb default null) returns jsonb language sql security definer set search_path='' as $$
 select public.print_order_snapshot_before_discounts(p_order_id,p_items)||jsonb_build_object('discount',o.discount_amount,'gross',o.total_amount+o.discount_amount) from public.orders o where o.id=p_order_id;
$$;
revoke all on function public.print_order_snapshot_before_discounts(uuid,jsonb),public.print_order_snapshot(uuid,jsonb) from public,anon,authenticated,service_role;

alter function public.record_order_payments(uuid,uuid,jsonb) rename to record_order_payments_before_discounts;
create function public.record_order_payments(p_order_id uuid,p_request_id uuid,p_lines jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cashier required' using errcode='42501';end if;
 if exists(select 1 from public.orders where id=p_order_id and payment_status='paid') and not exists(select 1 from public.order_payment_submissions where request_id=p_request_id) then raise exception 'Order already paid' using errcode='23514';end if;
 return public.record_order_payments_before_discounts(p_order_id,p_request_id,p_lines);
end $$;
revoke all on function public.record_order_payments_before_discounts(uuid,uuid,jsonb),public.record_order_payments(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_order_payments(uuid,uuid,jsonb) to authenticated;

create function public.audit_adjustments(p_session uuid,p_day date) returns jsonb language sql stable security definer set search_path='' as $$
 with selected as(select * from public.audit_events where (p_session is not null and cash_session_id=p_session) or (p_session is null and business_date=p_day)),
 discounts as(select * from selected where action='discount'),
 cancellations as(select * from selected where action in ('cancel_item','cancel_order') and (before_summary->>'sent')::boolean),
 discount_operators as(select d.actor_id,p.full_name,count(*) count,sum(d.amount_pyg)::bigint amount from discounts d left join public.profiles p on p.id=d.actor_id group by d.actor_id,p.full_name),
 cancel_operators as(select d.actor_id,p.full_name,count(*) count,sum(d.amount_pyg)::bigint amount from cancellations d left join public.profiles p on p.id=d.actor_id group by d.actor_id,p.full_name),
 free_orders as(select distinct o.id,case when o.is_counter then 'counter' else o.order_type::text end type from discounts d join public.orders o on o.id=d.target_id where (d.after_summary->>'free_settled')::boolean and not exists(select 1 from public.payments where order_id=o.id)),
 free_types as(select type,count(*) orders,0::bigint net from free_orders group by type)
 select jsonb_build_object(
  'discounts',jsonb_build_object('count',(select count(*) from discounts),'amount',(select coalesce(sum(amount_pyg),0) from discounts),'operators',(select coalesce(jsonb_agg(to_jsonb(discount_operators)),'[]') from discount_operators)),
  'kitchen_cancellations',jsonb_build_object('count',(select count(*) from cancellations),'amount',(select coalesce(sum(amount_pyg),0) from cancellations),'operators',(select coalesce(jsonb_agg(to_jsonb(cancel_operators)),'[]') from cancel_operators)),
  'fee_adjustment',(select coalesce(sum((after_summary->>'fee_adjustment')::bigint),0) from discounts),
  'free_count',(select count(*) from free_orders),'free_types',(select coalesce(jsonb_agg(to_jsonb(free_types)),'[]') from free_types));
$$;
alter function public.cash_payment_summary(uuid,date) rename to cash_payment_summary_before_discounts;
create function public.cash_payment_summary(p_session uuid,p_day date) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare base jsonb;adjustments jsonb;types jsonb;
begin
 base:=public.cash_payment_summary_before_discounts(p_session,p_day);adjustments:=public.audit_adjustments(p_session,p_day);
 select coalesce(jsonb_agg(to_jsonb(t)),'[]') into types from(select value->>'type' type,sum((value->>'orders')::bigint)::bigint orders,sum((value->>'net')::bigint)::bigint net from jsonb_array_elements((base->'types')||(adjustments->'free_types')) group by 1)t;
 return base||jsonb_build_object('adjustments',adjustments-'free_count'-'free_types'-'fee_adjustment','order_count',(base->>'order_count')::bigint+(adjustments->>'free_count')::bigint,'types',types,'delivery_fees',(base->>'delivery_fees')::bigint+(adjustments->>'fee_adjustment')::bigint);
end $$;
revoke all on function public.audit_adjustments(uuid,date),public.cash_payment_summary_before_discounts(uuid,date),public.cash_payment_summary(uuid,date) from public,anon,authenticated,service_role;

alter function public.cash_day_report(date) rename to cash_day_report_before_discounts;
create function public.cash_day_report(p_day date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare report jsonb;products jsonb;
begin
 if public.current_user_role() is distinct from 'admin' then raise exception 'Admin report access required' using errcode='42501';end if;
 report:=public.cash_day_report_before_discounts(p_day);
 with free_orders as(select distinct e.target_id from public.audit_events e where e.action='discount' and e.business_date=(report->>'day')::date and (e.after_summary->>'free_settled')::boolean and not exists(select 1 from public.payments where order_id=e.target_id)),
 rows as(
  select (r->>'product_id')::uuid product_id,r->>'name' name,(r->>'quantity')::bigint quantity,(r->>'amount')::bigint amount from jsonb_array_elements(report->'products') r
  union all select i.product_id,p.name,i.quantity::bigint,i.quantity::bigint*i.unit_price from free_orders f join public.order_items i on i.order_id=f.target_id join public.products p on p.id=i.product_id
 ), grouped as(select product_id,name,sum(quantity)::bigint quantity,sum(amount)::bigint amount from rows group by product_id,name)
 select coalesce(jsonb_agg(to_jsonb(grouped) order by quantity desc,name),'[]') into products from grouped;
 return report||jsonb_build_object('products',products);
end $$;
revoke all on function public.cash_day_report_before_discounts(date),public.cash_day_report(date) from public,anon,authenticated,service_role;
grant execute on function public.cash_day_report(date) to authenticated;
commit;
