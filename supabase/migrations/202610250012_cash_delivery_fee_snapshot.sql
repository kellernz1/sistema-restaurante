begin;
-- Delivery fees are attributed once, to the receipt that settles the order.
-- Existing test payments retain null metadata and use the last-settlement fallback.
alter table public.payments add column delivery_fee_pyg bigint check(delivery_fee_pyg between 0 and 1000000000000);
create or replace function public.bind_cash_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.cash_sessions;settings public.restaurant_settings;required boolean;o public.orders;paid bigint;
begin
 if new.operator_id is distinct from auth.uid() or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active payment operator required' using errcode='42501'; end if;
 select require_open_session into required from public.cash_session_policy where id;
 select * into s from public.cash_sessions where operator_id=new.operator_id and status='open' for update;
 if s.id is null and required then raise exception 'Open cash session required' using errcode='P0001'; end if;
 select * into o from public.orders where id=new.order_id;
 select coalesce(sum(equivalent_pyg-change_pyg),0) into paid from public.payments where order_id=new.order_id;
 new.delivery_fee_pyg:=case when paid+new.equivalent_pyg-new.change_pyg>=o.total_amount then o.delivery_fee else 0 end;
 new.cash_session_id:=s.id;
 select * into settings from public.restaurant_settings where id;
 new.business_date:=public.business_day_for(new.created_at,settings.business_timezone,settings.business_day_start);
 return new;
end $$;
create or replace function public.cash_payment_summary(p_session uuid,p_day date) returns jsonb language sql stable security definer set search_path='' as $$
 with selected as (
  select p.*,o.order_type,o.is_counter,o.delivery_fee,o.total_amount,(p.equivalent_pyg-p.change_pyg) net,
   coalesce(p.delivery_fee_pyg,case when p.id=(select id from public.payments last_p where last_p.order_id=p.order_id order by created_at desc,id desc limit 1) and (select sum(equivalent_pyg-change_pyg) from public.payments all_p where all_p.order_id=p.order_id)>=o.total_amount then o.delivery_fee else 0 end) fee
  from public.payments p join public.orders o on o.id=p.order_id cross join public.restaurant_settings s
  where s.id and ((p_session is not null and p.cash_session_id=p_session) or (p_session is null and coalesce(p.business_date,public.business_day_for(p.created_at,s.business_timezone,s.business_day_start))=p_day))
 ), methods as (
  select method,currency,sum(original_amount)::bigint original,sum(net)::bigint net,sum(change_pyg)::bigint change,sum(rounding_adjustment_pyg)::bigint rounding,count(*) payments from selected group by method,currency
 ), types as (
  select case when is_counter then 'counter' else order_type::text end type,count(distinct order_id) orders,sum(net)::bigint net from selected group by 1
 ), cancellations as (
  select count(*) count,coalesce(sum(amount),0)::bigint amount,count(*) filter(where rejected) rejected_count,coalesce(sum(amount) filter(where rejected),0)::bigint rejected_amount from public.cash_order_cancellations
  where (p_session is not null and session_id=p_session) or (p_session is null and business_date=p_day)
 )
 select jsonb_build_object('methods',(select coalesce(jsonb_agg(to_jsonb(methods) order by method,currency),'[]') from methods),
  'total',coalesce(sum(net),0)::bigint,'cash_net',coalesce(sum(net) filter(where method='cash'),0)::bigint,
  'rounding_adjustment',coalesce(sum(rounding_adjustment_pyg),0)::bigint,'order_count',count(distinct order_id),
  'delivery_fees',coalesce(sum(fee),0)::bigint,
  'types',(select coalesce(jsonb_agg(to_jsonb(types) order by type),'[]') from types),
  'cancellations',(select to_jsonb(cancellations) from cancellations)) from selected
$$;

create or replace function public.claim_print_job(p_owner_id uuid,p_driver text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lease public.print_processor_lease; job public.print_jobs;
begin
 if p_owner_id is null or p_driver is null or p_driver not in ('browser','file') then raise exception 'Invalid processor' using errcode='22023'; end if;
 if (p_driver='file' and coalesce(auth.role(),'')<>'service_role') or (p_driver='browser' and (auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier'))) then raise exception 'Print processor access required' using errcode='42501'; end if;
 select * into lease from public.print_processor_lease where id for update;
 if lease.expires_at>now() then return null; end if;
 update public.print_jobs set status='uncertain',error_message='Processamento interrompido; conferir antes de reimprimir.' where status='processing' and archived_at is null;
 if exists(select 1 from public.print_jobs where status='uncertain' and reviewed_at is null and archived_at is null) then return null; end if;
 update public.print_jobs j set status='failed',reviewed_at=now(),error_message='Order closed or cancelled before dispatch' from public.orders o where o.id=j.order_id and j.archived_at is null and j.status='pending' and j.kind='kitchen' and not j.reprint and o.status in ('closed','cancelled');
 select * into job from public.print_jobs where status='pending' and archived_at is null and (kind<>'cash_session' or p_driver='file' or public.current_user_role()='admin' or exists(select 1 from public.cash_sessions s where s.id=cash_session_id and s.operator_id=auth.uid())) and device->>'driver'=p_driver and (p_driver<>'browser' or public.current_user_role() in ('admin','cashier') or destination='kitchen')
  and (kind<>'kitchen' or reprint or exists(select 1 from public.restaurant_settings where id and kitchen_auto_print_enabled))
  order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.print_processor_lease set owner_id=p_owner_id,expires_at=now()+interval '2 minutes' where id;
 update public.print_jobs set status='processing',owner_id=p_owner_id,claim_token=gen_random_uuid(),claimed_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
create or replace function public.decide_print_job(p_job_id uuid,p_decision text,p_request_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs; prior public.print_job_reviews;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','kitchen') then raise exception 'Staff review access required' using errcode='42501'; end if;
 if p_decision is null or p_decision not in ('printed','reprint','discard') or p_request_id is null then raise exception 'Invalid review decision' using errcode='22023'; end if;
 if p_decision='discard' and public.current_user_role()<>'admin' then raise exception 'Administrator required to discard' using errcode='42501'; end if;
 if p_decision='reprint' then return public.request_print(p_request_id,null,null,p_job_id,'kitchen'); end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into prior from public.print_job_reviews where request_id=p_request_id and job_id=p_job_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.decision<>p_decision then raise exception 'Review request changed' using errcode='22023'; end if;
  return p_job_id;
 end if;
 select * into j from public.print_jobs where id=p_job_id;
 if not found then raise exception 'Job not found' using errcode='P0002'; end if;
 if j.kind='cash_session' and public.current_user_role()<>'admin' and not exists(select 1 from public.cash_sessions s where s.id=j.cash_session_id and s.operator_id=auth.uid()) then raise exception 'Own cash report required' using errcode='42501'; end if;
 if public.current_user_role()='kitchen' and j.destination<>'kitchen' then raise exception 'Cashier review required' using errcode='42501'; end if;
 perform public.assert_print_document_idle(j.order_id,j.kind,j.id);
 select * into j from public.print_jobs where id=p_job_id for update;
 if j.archived_at is not null then return j.id; end if;
 if p_decision='printed' and j.status not in ('uncertain','failed') then raise exception 'Job is not awaiting review' using errcode='23514'; end if;
 insert into public.print_job_reviews(request_id,job_id,actor_id,decision) values(p_request_id,j.id,auth.uid(),p_decision);
 update public.print_jobs set reviewed_at=now(),reviewed_by=auth.uid(),review_decision=p_decision,archived_at=case when p_decision='discard' then now() else null end where id=j.id;
 if p_decision='printed' then perform public.count_print_delivery(j.id); end if;
 return j.id;
end $$;
create or replace function public.print_worker_health() returns jsonb
language plpgsql security definer set search_path='' as $$
declare seconds integer; stalled bigint; workers jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','kitchen') then raise exception 'Staff access required' using errcode='42501'; end if;
 select stall_seconds into seconds from public.print_settings where id;
 select count(*) into stalled from public.print_jobs j where j.status='pending' and j.archived_at is null and j.created_at<now()-make_interval(secs=>seconds)
 and not exists(select 1 from public.print_worker_heartbeats h left join public.profiles p on p.id=h.user_id where h.driver=j.device->>'driver'
  and (j.kind<>'cash_session' or h.driver='file' or p.role='admin' or p.id=(select operator_id from public.cash_sessions where id=j.cash_session_id)) and h.last_seen_at>now()-interval '30 seconds' and (h.driver='file' or (p.is_active and (p.role in ('admin','cashier') or (p.role='kitchen' and j.destination='kitchen')))));
 select coalesce(jsonb_agg(jsonb_build_object('instance',instance_id,'driver',driver,'version',version,'last_seen',last_seen_at,'active',last_seen_at>now()-interval '30 seconds') order by last_seen_at desc),'[]') into workers
  from (select * from public.print_worker_heartbeats order by last_seen_at desc limit 20) h;
 return jsonb_build_object('status',case when stalled>0 then 'degraded' else 'ok' end,'stalled_jobs',stalled,'stall_seconds',seconds,'workers',workers,'checked_at',now());
end $$;
commit;
