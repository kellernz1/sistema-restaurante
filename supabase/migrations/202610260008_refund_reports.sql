begin;
alter function public.cash_payment_summary(uuid,date)rename to cash_payment_summary_before_refunds;
create function public.cash_payment_summary(p_session uuid,p_day date)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare base jsonb;summary jsonb;methods jsonb;types jsonb;
begin
 base:=public.cash_payment_summary_before_refunds(p_session,p_day);
 with selected as(select r.*,case when o.is_counter then 'counter'else o.order_type::text end service_type from public.refunds r join public.orders o on o.id=r.order_id where(p_session is not null and r.cash_session_id=p_session)or(p_session is null and r.business_date=p_day)),
 grouped as(select method,currency,sum(original_amount)::bigint original,sum(amount_pyg)::bigint amount,count(*) count from selected group by method,currency),
 operators as(select r.operator_id,p.full_name,sum(r.amount_pyg)::bigint amount,count(distinct r.request_id)count from selected r left join public.profiles p on p.id=r.operator_id group by r.operator_id,p.full_name),
 service as(select service_type type,sum(amount_pyg)::bigint amount from selected group by service_type)
 select jsonb_build_object('amount',coalesce(sum(amount_pyg),0),'cash',coalesce(sum(amount_pyg)filter(where method='cash'),0),'rounding',coalesce(sum(rounding_adjustment_pyg),0),'fees',coalesce(sum(delivery_fee_pyg),0),'count',count(distinct request_id),'methods',(select coalesce(jsonb_agg(to_jsonb(grouped)),'[]')from grouped),'operators',(select coalesce(jsonb_agg(to_jsonb(operators)),'[]')from operators),'types',(select coalesce(jsonb_agg(to_jsonb(service)),'[]')from service))into summary from selected;
 with rows as(
  select value->>'method'method,value->>'currency'currency,(value->>'original')::bigint original,(value->>'net')::bigint net,(value->>'change')::bigint change,(value->>'rounding')::bigint rounding,(value->>'payments')::bigint payments from jsonb_array_elements(base->'methods')
  union all select value->>'method',value->>'currency',0,-(value->>'amount')::bigint,0,0,0 from jsonb_array_elements(summary->'methods')
 ),grouped as(select method,currency,sum(original)::bigint original,sum(net)::bigint net,sum(change)::bigint change,sum(rounding)::bigint rounding,sum(payments)::bigint payments from rows group by method,currency)
 select coalesce(jsonb_agg(to_jsonb(grouped)order by method,currency),'[]')into methods from grouped;
 with rows as(select value->>'type'type,(value->>'orders')::bigint orders,(value->>'net')::bigint net from jsonb_array_elements(base->'types') union all select value->>'type',0,-(value->>'amount')::bigint from jsonb_array_elements(summary->'types')),grouped as(select type,sum(orders)::bigint orders,sum(net)::bigint net from rows group by type)
 select coalesce(jsonb_agg(to_jsonb(grouped)),'[]')into types from grouped;
 return base||jsonb_build_object('refunds',summary-'types','gross_receipts',base->'total','total',(base->>'total')::bigint-(summary->>'amount')::bigint,'cash_net',(base->>'cash_net')::bigint-(summary->>'cash')::bigint,'delivery_fees',(base->>'delivery_fees')::bigint-(summary->>'fees')::bigint,'rounding_adjustment',(base->>'rounding_adjustment')::bigint-(summary->>'rounding')::bigint,'methods',methods,'types',types);
end $$;
revoke all on function public.cash_payment_summary_before_refunds(uuid,date),public.cash_payment_summary(uuid,date)from public,anon,authenticated,service_role;
alter function public.cash_day_report(date)rename to cash_day_report_before_refunds;
create function public.cash_day_report(p_day date default null)returns jsonb language plpgsql stable security definer set search_path=''as $$
declare report jsonb;hours jsonb;sessions jsonb;
begin
 if public.current_user_role()is distinct from 'admin'then raise exception 'Admin report required'using errcode='42501';end if;
 report:=public.cash_day_report_before_refunds(p_day);
 with rows as(select(value->>'hour')::timestamptz as hour,(value->>'amount')::bigint amount,(value->>'orders')::bigint orders from jsonb_array_elements(report->'hours')union all select date_trunc('hour',created_at),-amount_pyg,0 from public.refunds where business_date=(report->>'day')::date),grouped as(select hour,sum(amount)::bigint amount,sum(orders)::bigint orders from rows group by hour)
 select coalesce(jsonb_agg(to_jsonb(grouped)order by hour),'[]')into hours from grouped;
 select coalesce(jsonb_agg(to_jsonb(s)order by s.opened_at),'[]')into sessions from public.cash_sessions s where s.business_date=(report->>'day')::date or exists(select 1 from public.payments p where p.cash_session_id=s.id and p.business_date=(report->>'day')::date)or exists(select 1 from public.refunds r where r.cash_session_id=s.id and r.business_date=(report->>'day')::date);
 return report||jsonb_build_object('hours',hours,'sessions',sessions);
end $$;
revoke all on function public.cash_day_report_before_refunds(date),public.cash_day_report(date)from public,anon,authenticated,service_role;
grant execute on function public.cash_day_report(date)to authenticated;

-- Dynamic previews show refunds; previously dispatched immutable snapshots are never rewritten.
create or replace function public.print_order_snapshot(p_order_id uuid,p_items jsonb default null)returns jsonb language sql security definer set search_path=''as $$
 select public.print_order_snapshot_before_discounts(p_order_id,p_items)||jsonb_build_object('discount',o.discount_amount,'gross',o.total_amount+o.discount_amount,'payment_status',o.payment_status,'refunded',(select coalesce(sum(amount_pyg),0)from public.refunds where order_id=o.id),'refunds',(select coalesce(jsonb_agg(jsonb_build_object('method',method,'currency',currency,'original',original_amount,'amount',amount_pyg,'rate',exchange_rate::text,'reason',reason)order by created_at,id),'[]')from public.refunds where order_id=o.id))from public.orders o where o.id=p_order_id;
$$;
commit;
