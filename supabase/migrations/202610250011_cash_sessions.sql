begin;
create table public.cash_session_policy (
 id boolean primary key default true check(id),require_open_session boolean not null default true,blind_count boolean not null default true
);
insert into public.cash_session_policy(id) values(true);
create table public.cash_sessions (
 id uuid primary key default gen_random_uuid(),operator_id uuid not null references public.profiles(id),
 business_date date not null,timezone text not null,day_start time not null,
 opening_amount bigint not null check(opening_amount between 0 and 1000000000000),
 blind_count boolean not null,status text not null default 'open' check(status in ('open','closed')),
 opened_at timestamptz not null default now(),closed_at timestamptz,
 counted_amount bigint check(counted_amount between 0 and 1000000000000),
 expected_amount bigint check(expected_amount between -1000000000000 and 1000000000000),
 difference bigint,notes text,denominations jsonb,closed_report jsonb,revision integer not null default 0,
 check((status='open' and closed_at is null and counted_amount is null and expected_amount is null and closed_report is null) or (status='closed' and closed_at is not null and counted_amount is not null and expected_amount is not null and closed_report is not null))
);
create unique index cash_one_open_per_operator on public.cash_sessions(operator_id) where status='open';
create index cash_sessions_business_date on public.cash_sessions(business_date,opened_at);
create table public.cash_movements (
 id uuid primary key default gen_random_uuid(),session_id uuid not null references public.cash_sessions(id),
 operator_id uuid not null references public.profiles(id),kind text not null check(kind in ('supply','withdrawal')),
 amount bigint not null check(amount between 1 and 1000000000000),reason text not null check(length(reason) between 1 and 500),created_at timestamptz not null default now()
);
create table public.cash_session_events (
 id uuid primary key default gen_random_uuid(),request_id uuid not null unique,session_id uuid not null references public.cash_sessions(id),
 actor_id uuid not null references public.profiles(id),action text not null check(action in ('open','movement','close','reopen')),
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now()
);
alter table public.payments add column cash_session_id uuid references public.cash_sessions(id),add column business_date date;
create index payments_cash_session on public.payments(cash_session_id,created_at);
create index payments_business_date on public.payments(business_date,created_at);
create table public.cash_order_cancellations (
 order_id uuid primary key references public.orders(id) on delete cascade,session_id uuid references public.cash_sessions(id),
 actor_id uuid references public.profiles(id),occurred_at timestamptz not null default now(),business_date date not null,
 amount bigint not null,order_type text not null,rejected boolean not null,legacy boolean not null default false
);
alter table public.cash_session_policy enable row level security;
alter table public.cash_sessions enable row level security;
alter table public.cash_movements enable row level security;
alter table public.cash_session_events enable row level security;
alter table public.cash_order_cancellations enable row level security;
revoke all on public.cash_session_policy,public.cash_sessions,public.cash_movements,public.cash_session_events,public.cash_order_cancellations from public,anon,authenticated,service_role;
grant select on public.cash_session_policy,public.cash_sessions,public.cash_movements,public.cash_session_events,public.cash_order_cancellations to authenticated,service_role;
grant update(require_open_session,blind_count) on public.cash_session_policy to authenticated;
create policy cash_policy_read on public.cash_session_policy for select to authenticated using(public.current_user_role() in ('admin','cashier'));
create policy cash_policy_admin on public.cash_session_policy for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');
create policy cash_session_read on public.cash_sessions for select to authenticated using(public.current_user_role()='admin' or (public.current_user_role()='cashier' and operator_id=auth.uid()));
create policy cash_movement_read on public.cash_movements for select to authenticated using(exists(select 1 from public.cash_sessions s where s.id=session_id));
create policy cash_event_read on public.cash_session_events for select to authenticated using(exists(select 1 from public.cash_sessions s where s.id=session_id));
create policy cash_cancellation_read on public.cash_order_cancellations for select to authenticated using(public.current_user_role()='admin' or (public.current_user_role()='cashier' and exists(select 1 from public.cash_sessions s where s.id=session_id)));

create function public.guard_cash_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='cash_sessions' then
  if tg_op='DELETE' and old.status='closed' then raise exception 'Closed session is immutable' using errcode='23514'; end if;
  if tg_op='UPDATE' and old.status='closed' and not (new.status='open' and current_user='postgres' and current_setting('app.cash_reopen',true)=old.id::text) then raise exception 'Closed session is immutable' using errcode='23514'; end if;
 elsif tg_op in ('UPDATE','DELETE') then raise exception 'Cash history is immutable' using errcode='23514'; end if;
 if tg_op='DELETE' then return old; end if;return new;
end $$;
create trigger cash_session_immutable before update or delete on public.cash_sessions for each row execute function public.guard_cash_history();
create trigger cash_movements_immutable before update or delete on public.cash_movements for each row execute function public.guard_cash_history();
create trigger cash_events_immutable before update or delete on public.cash_session_events for each row execute function public.guard_cash_history();
create trigger cash_cancellations_immutable before update or delete on public.cash_order_cancellations for each row execute function public.guard_cash_history();
revoke all on function public.guard_cash_history() from public,anon,authenticated;

create function public.bind_cash_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare s public.cash_sessions;settings public.restaurant_settings;required boolean;
begin
 if new.operator_id is distinct from auth.uid() or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active payment operator required' using errcode='42501'; end if;
 select require_open_session into required from public.cash_session_policy where id;
 select * into s from public.cash_sessions where operator_id=new.operator_id and status='open' for update;
 if s.id is null and required then raise exception 'Open cash session required' using errcode='P0001'; end if;
 new.cash_session_id:=s.id;
 select * into settings from public.restaurant_settings where id;
 new.business_date:=public.business_day_for(new.created_at,settings.business_timezone,settings.business_day_start);
 return new;
end $$;
create trigger cash_bind_payment before insert on public.payments for each row execute function public.bind_cash_payment();
revoke all on function public.bind_cash_payment() from public,anon,authenticated;

create function public.capture_cash_cancellation() returns trigger language plpgsql security definer set search_path='' as $$
declare settings public.restaurant_settings;session uuid;
begin
 if new.status='cancelled' and old.status<>'cancelled' then
  select * into settings from public.restaurant_settings where id;
  select id into session from public.cash_sessions where operator_id=auth.uid() and status='open' for update;
  insert into public.cash_order_cancellations(order_id,session_id,actor_id,business_date,amount,order_type,rejected)
   values(new.id,session,auth.uid(),public.business_day_for(now(),settings.business_timezone,settings.business_day_start),new.total_amount,case when new.is_counter then 'counter' else new.order_type::text end,old.status='pending_confirmation') on conflict do nothing;
 end if;
 return new;
end $$;
create trigger cash_cancellation_capture after update of status on public.orders for each row execute function public.capture_cash_cancellation();
revoke all on function public.capture_cash_cancellation() from public,anon,authenticated;
insert into public.cash_order_cancellations(order_id,occurred_at,business_date,amount,order_type,rejected,legacy)
 select o.id,o.created_at,public.business_day_for(o.created_at,s.business_timezone,s.business_day_start),o.total_amount,case when o.is_counter then 'counter' else o.order_type::text end,o.confirmed_at is null,true
 from public.orders o cross join public.restaurant_settings s where o.status='cancelled' and s.id;

create function public.cash_payment_summary(p_session uuid,p_day date) returns jsonb language sql stable security definer set search_path='' as $$
 with selected as (
  select p.*,o.order_type,o.is_counter,o.delivery_fee,o.total_amount,(p.equivalent_pyg-p.change_pyg) net
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
  'delivery_fees',coalesce(round(sum(net::numeric*delivery_fee/nullif(total_amount,0))),0)::bigint,
  'types',(select coalesce(jsonb_agg(to_jsonb(types) order by type),'[]') from types),
  'cancellations',(select to_jsonb(cancellations) from cancellations)) from selected
$$;
revoke all on function public.cash_payment_summary(uuid,date) from public,anon,authenticated;

create function public.cash_session_full_report(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.cash_sessions;summary jsonb;supply bigint;withdrawal bigint;expected bigint;unpaid jsonb;
begin
 select * into s from public.cash_sessions where id=p_session;
 if not found then raise exception 'Session not found' using errcode='P0002'; end if;
 summary:=public.cash_payment_summary(s.id,null);
 select coalesce(sum(amount) filter(where kind='supply'),0),coalesce(sum(amount) filter(where kind='withdrawal'),0) into supply,withdrawal from public.cash_movements where session_id=s.id;
 expected:=s.opening_amount+(summary->>'cash_net')::bigint+supply-withdrawal;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'number',order_number,'ticket',counter_ticket,'name',coalesce(counter_name,customer_name),'total',total_amount) order by created_at),'[]') into unpaid from public.orders where status not in ('closed','cancelled') and payment_status<>'paid';
 return jsonb_build_object('session',to_jsonb(s)-'closed_report','operator_name',(select full_name from public.profiles where id=s.operator_id),'payments',summary,'supply',supply,'withdrawal',withdrawal,'expected',expected,'unpaid',unpaid,
  'movements',(select coalesce(jsonb_agg(to_jsonb(m) order by created_at,id),'[]') from public.cash_movements m where session_id=s.id));
end $$;
revoke all on function public.cash_session_full_report(uuid) from public,anon,authenticated;

create function public.cash_session_report(p_session uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.cash_sessions;r jsonb;
begin
 select * into s from public.cash_sessions where id=p_session;
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') or (public.current_user_role()<>'admin' and s.operator_id is distinct from auth.uid()) then raise exception 'Cash report access required' using errcode='42501'; end if;
 if s.id is null then raise exception 'Session not found' using errcode='P0002'; end if;
 if s.status='closed' then return s.closed_report; end if;
 r:=public.cash_session_full_report(s.id);
 if s.blind_count and s.operator_id=auth.uid() then return jsonb_build_object('session',to_jsonb(s)-'closed_report','blind',true,'unpaid',r->'unpaid'); end if;
 return r||jsonb_build_object('blind',false);
end $$;
revoke all on function public.cash_session_report(uuid) from public,anon;
grant execute on function public.cash_session_report(uuid) to authenticated;

create function public.cash_session_command(p_request_id uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s public.cash_sessions;prior public.cash_session_events;policy public.cash_session_policy;settings public.restaurant_settings;
 amount bigint;counted bigint;reason text;report jsonb;result jsonb;entry jsonb;denom_total numeric:=0;target uuid;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Active cash operator required' using errcode='42501'; end if;
 if p_request_id is null or p_action is null or p_action not in ('open','movement','close','reopen') or p_payload is null or jsonb_typeof(p_payload)<>'object' then raise exception 'Invalid session command' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,1));
 select * into prior from public.cash_session_events where request_id=p_request_id;
 if found then
  if prior.actor_id<>auth.uid() or prior.action<>p_action or prior.payload<>p_payload then raise exception 'Session request key changed' using errcode='22023'; end if;
  return prior.result;
 end if;
 if exists(select 1 from jsonb_object_keys(p_payload) k where not (k=any(case p_action when 'open' then array['opening_amount'] when 'movement' then array['session_id','kind','amount','reason'] when 'close' then array['session_id','counted_amount','notes','denominations'] else array['session_id','reason'] end))) then raise exception 'Unexpected session fields' using errcode='22023'; end if;
 if p_action='open' then
  perform 1 from public.profiles where id=auth.uid() for update;
  if exists(select 1 from public.cash_sessions where operator_id=auth.uid() and status='open') then raise exception 'Cash session already open' using errcode='23514'; end if;
  amount:=public.require_pyg(p_payload->>'opening_amount');if amount is null then raise exception 'Opening amount required' using errcode='22023'; end if;
  select * into settings from public.restaurant_settings where id;
  select * into policy from public.cash_session_policy where id;
  insert into public.cash_sessions(operator_id,business_date,timezone,day_start,opening_amount,blind_count)
   values(auth.uid(),public.business_day_for(now(),settings.business_timezone,settings.business_day_start),settings.business_timezone,settings.business_day_start,amount,policy.blind_count) returning * into s;
 else
  target:=(p_payload->>'session_id')::uuid;
  if p_action='reopen' then
   if public.current_user_role()<>'admin' then raise exception 'Admin required to reopen' using errcode='42501'; end if;
   perform 1 from public.profiles where id=(select operator_id from public.cash_sessions where id=target) for update;
  end if;
  select * into s from public.cash_sessions where id=target for update;
  if not found then raise exception 'Session not found' using errcode='P0002'; end if;
  if p_action<>'reopen' and s.operator_id<>auth.uid() then raise exception 'Operator may mutate own session only' using errcode='42501'; end if;
  if p_action='reopen' then
   reason:=nullif(btrim(regexp_replace(p_payload->>'reason','[[:space:]]+',' ','g')),'');
   if s.status<>'closed' or reason is null or length(reason)>500 then raise exception 'Closed session and reason required' using errcode='22023'; end if;
   if exists(select 1 from public.cash_sessions where operator_id=s.operator_id and status='open') then raise exception 'Operator already has an open session' using errcode='23514'; end if;
   perform set_config('app.cash_reopen',s.id::text,true);
   update public.cash_sessions set status='open',closed_at=null,counted_amount=null,expected_amount=null,difference=null,notes=null,denominations=null,closed_report=null where id=s.id returning * into s;
   perform set_config('app.cash_reopen','',true);
  else
   if s.status<>'open' then raise exception 'Cash session is closed' using errcode='23514'; end if;
   if p_action='movement' then
    reason:=nullif(btrim(regexp_replace(p_payload->>'reason','[[:space:]]+',' ','g')),'');amount:=public.require_pyg(p_payload->>'amount');
    if amount is null or amount=0 or reason is null or length(reason)>500 or p_payload->>'kind' is null or p_payload->>'kind' not in ('supply','withdrawal') then raise exception 'Valid movement and reason required' using errcode='22023'; end if;
    insert into public.cash_movements(session_id,operator_id,kind,amount,reason) values(s.id,auth.uid(),p_payload->>'kind',amount,reason);
   elsif p_action='close' then
    counted:=public.require_pyg(p_payload->>'counted_amount');
    if counted is null or length(coalesce(p_payload->>'notes',''))>500 then raise exception 'Counted amount required' using errcode='22023'; end if;
    if p_payload ? 'denominations' and p_payload->'denominations'<>'null' then
     if jsonb_typeof(p_payload->'denominations')<>'array' or jsonb_array_length(p_payload->'denominations')>30 then raise exception 'Invalid denominations' using errcode='22023'; end if;
     for entry in select value from jsonb_array_elements(p_payload->'denominations') loop
      if jsonb_typeof(entry)<>'object' or (entry-array['value','quantity'])<>'{}' or public.require_pyg(entry->>'value') is null or public.require_pyg(entry->>'value')=0 or public.require_pyg(entry->>'quantity') is null or public.require_pyg(entry->>'quantity')>100000 then raise exception 'Invalid denomination row' using errcode='22023'; end if;
      denom_total:=denom_total+public.require_pyg(entry->>'value')::numeric*public.require_pyg(entry->>'quantity');
     end loop;
     if denom_total<>counted then raise exception 'Denomination total does not match count' using errcode='23514'; end if;
    end if;
    report:=public.cash_session_full_report(s.id);
    update public.cash_sessions set status='closed',closed_at=now(),counted_amount=counted,expected_amount=(report->>'expected')::bigint,difference=counted-(report->>'expected')::bigint,notes=p_payload->>'notes',denominations=p_payload->'denominations',revision=revision+1,
     closed_report=report||jsonb_build_object('session',(report->'session')||jsonb_build_object('status','closed','closed_at',now(),'counted_amount',counted,'expected_amount',(report->>'expected')::bigint,'difference',counted-(report->>'expected')::bigint,'revision',s.revision+1),'closed_at',now(),'counted',counted,'difference',counted-(report->>'expected')::bigint,'notes',p_payload->>'notes','revision',s.revision+1) where id=s.id returning * into s;
   end if;
  end if;
 end if;
 result:=jsonb_build_object('session_id',s.id,'action',p_action,'status',s.status,'revision',s.revision);
 if p_action='close' then result:=result||jsonb_build_object('report',s.closed_report); end if;
 insert into public.cash_session_events(request_id,session_id,actor_id,action,payload,result) values(p_request_id,s.id,auth.uid(),p_action,p_payload,result);
 return result;
end $$;
revoke all on function public.cash_session_command(uuid,text,jsonb) from public,anon;
grant execute on function public.cash_session_command(uuid,text,jsonb) to authenticated;

create function public.cash_day_report(p_day date default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_day date;settings public.restaurant_settings;summary jsonb;products jsonb;hours jsonb;sessions jsonb;
begin
 if auth.uid() is null or public.current_user_role() is distinct from 'admin' then raise exception 'Admin report access required' using errcode='42501'; end if;
 select * into settings from public.restaurant_settings where id;
 v_day:=coalesce(p_day,public.business_day_for(now(),settings.business_timezone,settings.business_day_start));
 summary:=public.cash_payment_summary(null,v_day);
 with last_payment as(select distinct on(order_id) order_id,coalesce(business_date,public.business_day_for(created_at,settings.business_timezone,settings.business_day_start)) as payment_day from public.payments order by order_id,created_at desc,id desc), sold as(
  select i.product_id,p.name,sum(i.quantity)::bigint quantity,sum(i.quantity::numeric*i.unit_price)::bigint amount from last_payment l join public.orders o on o.id=l.order_id join public.order_items i on i.order_id=o.id join public.products p on p.id=i.product_id where l.payment_day=v_day and o.payment_status='paid' group by i.product_id,p.name)
 select coalesce(jsonb_agg(to_jsonb(sold) order by quantity desc,name),'[]') into products from sold;
 with hourly as(select date_trunc('hour',created_at) as hour,sum(equivalent_pyg-change_pyg)::bigint amount,count(distinct order_id) orders from public.payments where coalesce(business_date,public.business_day_for(created_at,settings.business_timezone,settings.business_day_start))=v_day group by 1)
 select coalesce(jsonb_agg(to_jsonb(hourly) order by hour),'[]') into hours from hourly;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'operator_id',s.operator_id,'status',s.status,'opened_at',s.opened_at,'closed_at',s.closed_at,'difference',s.difference) order by s.opened_at),'[]') into sessions from public.cash_sessions s where s.business_date=v_day or exists(select 1 from public.payments p where p.cash_session_id=s.id and p.business_date=v_day);
 return jsonb_build_object('day',v_day,'timezone',settings.business_timezone,'payments',summary,'average_ticket',case when (summary->>'order_count')::bigint>0 then round((summary->>'total')::numeric/(summary->>'order_count')::numeric)::bigint else 0 end,'products',products,'hours',hours,'sessions',sessions);
end $$;
revoke all on function public.cash_day_report(date) from public,anon;
grant execute on function public.cash_day_report(date) to authenticated;

alter table public.print_jobs add column cash_session_id uuid references public.cash_sessions(id);
grant select(cash_session_id) on public.print_jobs to authenticated;
alter table public.print_jobs drop constraint print_jobs_kind_check;
alter table public.print_jobs add constraint print_jobs_kind_check check(kind in ('kitchen','receipt','test','cash_session'));
alter table public.print_jobs add constraint print_cash_session_document check((kind='cash_session')=(cash_session_id is not null));
drop policy print_jobs_read on public.print_jobs;
create policy print_jobs_read on public.print_jobs for select to authenticated using(public.current_user_role()='admin' or (public.current_user_role()='cashier' and (kind<>'cash_session' or exists(select 1 from public.cash_sessions s where s.id=cash_session_id and s.operator_id=auth.uid()))) or (public.current_user_role()='kitchen' and destination='kitchen'));
create or replace function public.request_print(p_request_id uuid,p_kind text default null,p_order_id uuid default null,p_job_id uuid default null,p_destination text default 'kitchen') returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs; snap jsonb; dev jsonb; k text; dest text; result uuid; is_copy boolean; replaced uuid[];
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier','waiter') then raise exception 'Staff print access required' using errcode='42501'; end if;
 if p_request_id is null then raise exception 'Request key required' using errcode='22023'; end if;
 if p_job_id is null and p_kind='receipt' then p_destination:='cashier'; end if;
 -- Serialize request keys before resolving a retry.
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into j from public.print_jobs where request_id=p_request_id;
 if found then
  if j.created_by<>auth.uid() or j.original_job_id is distinct from p_job_id or (p_job_id is null and (j.order_id is distinct from p_order_id or j.kind is distinct from p_kind or j.destination is distinct from p_destination)) then raise exception 'Request key changed' using errcode='22023'; end if;
  return j.id;
 end if;
 if p_job_id is not null then
  select * into j from public.print_jobs where id=p_job_id;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if j.kind='cash_session' and public.current_user_role()<>'admin' and not exists(select 1 from public.cash_sessions where id=j.cash_session_id and operator_id=auth.uid()) then raise exception 'Own cash report required' using errcode='42501'; end if;
  perform public.assert_print_document_idle(j.order_id,j.kind,j.id);
  select * into j from public.print_jobs where id=p_job_id for update;
  if j.archived_at is not null then raise exception 'Archived job cannot be reprinted' using errcode='23514'; end if;
  replaced:=array[j.id];
  update public.print_jobs set reviewed_at=now(),reviewed_by=auth.uid(),review_decision='reprint',
   status=case when status='pending' then 'failed' else status end,
   error_message=case when status='pending' then 'Superseded by explicit reprint' else error_message end where id=j.id;
  snap:=j.snapshot; k:=j.kind; dest:=j.destination; p_order_id:=j.order_id; is_copy:=true;
 else
  if p_kind not in ('kitchen','receipt','test') or p_kind is null or p_destination is null or p_destination not in ('kitchen','cashier') then raise exception 'Invalid print request' using errcode='22023'; end if;
  k:=p_kind; dest:=case when k='receipt' then 'cashier' else p_destination end;
  perform public.assert_print_document_idle(p_order_id,k,null);
  select array_agg(id) into replaced from public.print_jobs where order_id=p_order_id and kind=k and status='pending' and archived_at is null;
  update public.print_jobs set status='failed',reviewed_at=now(),reviewed_by=auth.uid(),review_decision='reprint',error_message='Superseded by explicit full-order print' where id=any(replaced);
  is_copy:=k='kitchen' or (k='receipt' and exists(select 1 from public.print_jobs where order_id=p_order_id and kind='receipt'));
  if k='test' then
   if public.current_user_role()<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
   snap:='{}';
  else
   snap:=public.print_order_snapshot(p_order_id);
   if snap is null then raise exception 'Order not found' using errcode='P0002'; end if;
  end if;
 end if;
 if public.current_user_role() in ('waiter','kitchen') and (k<>'kitchen' or dest<>'kitchen') then raise exception 'Kitchen print access only' using errcode='42501'; end if;
 if k='kitchen' then snap:=snap-'payments'; end if;
 select to_jsonb(d) into dev from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name=dest;
 insert into public.print_jobs(request_id,order_id,destination,kind,reprint,additional,original_job_id,snapshot,device,created_by,cash_session_id)
 values(p_request_id,p_order_id,dest,k,is_copy,case when p_job_id is not null then j.additional else false end,p_job_id,snap,dev,auth.uid(),case when p_job_id is not null then j.cash_session_id else null end) returning id into result;
 if replaced is not null then
  insert into public.print_job_reviews(request_id,job_id,actor_id,decision,reprint_job_id)
   select p_request_id,id,auth.uid(),'reprint',result from unnest(replaced) id;
 end if;
 return result;
end $$;

create function public.request_cash_session_print(p_session uuid,p_request_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.cash_sessions;j public.print_jobs;device jsonb;settings public.restaurant_settings;result uuid;entry public.print_jobs;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Cash print access required' using errcode='42501';end if;
 if p_request_id is null then raise exception 'Print request key required' using errcode='22023';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request_id::text,0));
 select * into j from public.print_jobs where request_id=p_request_id;
 if found then if j.created_by<>auth.uid() or j.cash_session_id is distinct from p_session or j.kind<>'cash_session' then raise exception 'Print key changed' using errcode='22023';end if;return j.id;end if;
 perform 1 from public.print_processor_lease where id for update;
 select * into s from public.cash_sessions where id=p_session for update;
 if not found or (public.current_user_role()<>'admin' and s.operator_id<>auth.uid()) then raise exception 'Own cash report required' using errcode='42501';end if;
 if s.status<>'closed' then raise exception 'Close session before printing' using errcode='23514';end if;
 for entry in select * from public.print_jobs where cash_session_id=s.id order by id loop perform public.assert_print_document_idle(null,'cash_session',entry.id);end loop;
 select * into settings from public.restaurant_settings where id;
 select to_jsonb(d) into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='cashier';
 insert into public.print_jobs(request_id,cash_session_id,destination,kind,snapshot,device,created_by,reprint)
  values(p_request_id,s.id,'cashier','cash_session',jsonb_build_object('restaurant',settings.restaurant_name,'timezone',s.timezone,'date',s.closed_at,'cash_report',s.closed_report),device,auth.uid(),exists(select 1 from public.print_jobs where cash_session_id=s.id and kind='cash_session')) returning id into result;
 return result;
end $$;
revoke all on function public.request_cash_session_print(uuid,uuid) from public,anon;
grant execute on function public.request_cash_session_print(uuid,uuid) to authenticated;
commit;
