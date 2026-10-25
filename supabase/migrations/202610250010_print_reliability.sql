begin;

alter table public.print_jobs add column reviewed_by uuid references public.profiles(id),
 add column review_decision text check(review_decision in ('printed','reprint','discard')),
 add column archived_at timestamptz,
 add column delivery_counted boolean not null default false;
grant select(reviewed_by,review_decision,archived_at) on public.print_jobs to authenticated;

alter table public.print_item_state rename column reserved_quantity to forwarded_quantity;
alter table public.print_item_state drop column printed_quantity;
alter table public.print_item_state add column printed_copies bigint not null default 0 check(printed_copies>=0);
-- Forwarded units mean committed kitchen queue reservations, never verified paper output.
-- Rebuild acknowledgement/copy counts from immutable sent jobs; reprints do not add units.
update public.print_item_state st set printed_copies=(
 select count(*) from public.print_jobs j where j.kind='kitchen' and j.status='sent'
 and exists(select 1 from jsonb_array_elements(j.snapshot->'items') i where (i->>'id')::uuid=st.item_id)
);
update public.print_jobs set delivery_counted=true where status='sent';

create table public.print_job_reviews (
 id uuid primary key default gen_random_uuid(),request_id uuid not null,
 job_id uuid not null references public.print_jobs(id) on delete cascade,
 actor_id uuid not null references public.profiles(id),
 decision text not null check(decision in ('printed','reprint','discard')),
 reprint_job_id uuid references public.print_jobs(id) on delete set null,
 created_at timestamptz not null default now(),unique(request_id,job_id)
);
alter table public.print_job_reviews enable row level security;
revoke all on public.print_job_reviews from public,anon,authenticated;
grant select on public.print_job_reviews to authenticated;
grant all on public.print_job_reviews to service_role;
create policy print_reviews_read on public.print_job_reviews for select to authenticated
 using(exists(select 1 from public.print_jobs j where j.id=job_id));

create table public.print_worker_heartbeats (
 instance_id uuid primary key,driver text not null check(driver in ('file','browser')),
 version text not null check(length(version) between 1 and 80),user_id uuid references public.profiles(id),
 last_seen_at timestamptz not null default now()
);
create table public.print_settings (
 id boolean primary key default true check(id),stall_seconds integer not null default 60 check(stall_seconds between 10 and 3600)
);
insert into public.print_settings(id) values(true);
alter table public.print_worker_heartbeats enable row level security;
alter table public.print_settings enable row level security;
revoke all on public.print_worker_heartbeats,public.print_settings from public,anon,authenticated;
grant all on public.print_worker_heartbeats,public.print_settings to service_role;
grant select,update(stall_seconds) on public.print_settings to authenticated;
create policy print_settings_read on public.print_settings for select to authenticated using(public.current_user_role() in ('admin','cashier','kitchen'));
create policy print_settings_admin on public.print_settings for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');

create function public.assert_print_document_idle(p_order_id uuid,p_kind text,p_job_id uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- The same global lease -> order -> jobs lock ordering is used by both request paths.
 perform 1 from public.print_processor_lease where id for update;
 perform 1 from public.orders where id=p_order_id for update;
 perform 1 from public.print_jobs where (p_order_id is not null and order_id=p_order_id and kind=p_kind) or (p_order_id is null and id=p_job_id) order by id for update;
 if exists(select 1 from public.print_jobs j where j.archived_at is null
  and ((p_order_id is not null and j.order_id=p_order_id and j.kind=p_kind) or (p_order_id is null and j.id=p_job_id))
  and (j.status='processing' or (j.status='uncertain' and exists(select 1 from public.print_processor_lease l where l.id and l.owner_id=j.owner_id and l.expires_at>now())))) then
  raise exception 'Document transport is active' using errcode='23514';
 end if;
end $$;
revoke all on function public.assert_print_document_idle(uuid,text,uuid) from public,anon,authenticated;

create function public.count_print_delivery(p_job_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs;
begin
 select * into j from public.print_jobs where id=p_job_id for update;
 if j.delivery_counted then return; end if;
 if j.kind='kitchen' then
  update public.print_item_state st set printed_at=now(),printed_copies=printed_copies+1
   where exists(select 1 from jsonb_array_elements(j.snapshot->'items') i where (i->>'id')::uuid=st.item_id);
 end if;
 update public.print_jobs set delivery_counted=true where id=j.id;
end $$;
revoke all on function public.count_print_delivery(uuid) from public,anon,authenticated;

create function public.print_worker_heartbeat(p_instance uuid,p_version text,p_driver text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_instance is null or p_version is null or length(p_version) not between 1 and 80 or p_driver is null or p_driver not in ('file','browser') then raise exception 'Invalid worker heartbeat' using errcode='22023'; end if;
 if (p_driver='file' and coalesce(auth.role(),'')<>'service_role') or (p_driver='browser' and (auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','kitchen'))) then raise exception 'Worker access required' using errcode='42501'; end if;
 if exists(select 1 from public.print_worker_heartbeats where instance_id=p_instance and (driver<>p_driver or user_id is distinct from case when p_driver='browser' then auth.uid() else null end)) then raise exception 'Worker identity changed' using errcode='42501'; end if;
 insert into public.print_worker_heartbeats(instance_id,driver,version,user_id) values(p_instance,p_driver,p_version,case when p_driver='browser' then auth.uid() else null end)
 on conflict(instance_id) do update set version=excluded.version,last_seen_at=now();
end $$;
revoke all on function public.print_worker_heartbeat(uuid,text,text) from public,anon;
grant execute on function public.print_worker_heartbeat(uuid,text,text) to authenticated,service_role;

create function public.print_worker_health() returns jsonb
language plpgsql security definer set search_path='' as $$
declare seconds integer; stalled bigint; workers jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier','kitchen') then raise exception 'Staff access required' using errcode='42501'; end if;
 select stall_seconds into seconds from public.print_settings where id;
 select count(*) into stalled from public.print_jobs j where j.status='pending' and j.archived_at is null and j.created_at<now()-make_interval(secs=>seconds)
 and not exists(select 1 from public.print_worker_heartbeats h left join public.profiles p on p.id=h.user_id where h.driver=j.device->>'driver'
  and h.last_seen_at>now()-interval '30 seconds' and (h.driver='file' or (p.is_active and (p.role in ('admin','cashier') or (p.role='kitchen' and j.destination='kitchen')))));
 select coalesce(jsonb_agg(jsonb_build_object('instance',instance_id,'driver',driver,'version',version,'last_seen',last_seen_at,'active',last_seen_at>now()-interval '30 seconds') order by last_seen_at desc),'[]') into workers
  from (select * from public.print_worker_heartbeats order by last_seen_at desc limit 20) h;
 return jsonb_build_object('status',case when stalled>0 then 'degraded' else 'ok' end,'stalled_jobs',stalled,'stall_seconds',seconds,'workers',workers,'checked_at',now());
end $$;
revoke all on function public.print_worker_health() from public,anon;
grant execute on function public.print_worker_health() to authenticated;

create function public.decide_print_job(p_job_id uuid,p_decision text,p_request_id uuid) returns uuid
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
revoke all on function public.decide_print_job(uuid,text,uuid) from public,anon;
grant execute on function public.decide_print_job(uuid,text,uuid) to authenticated;

create or replace function public.review_print_job(p_job_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform public.decide_print_job(p_job_id,'printed',md5(p_job_id::text||coalesce(auth.uid()::text,'')||'printed')::uuid);
end $$;

-- Remaining queue functions are replaced below in this migration.

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
 insert into public.print_jobs(request_id,order_id,destination,kind,reprint,additional,original_job_id,snapshot,device,created_by)
 values(p_request_id,p_order_id,dest,k,is_copy,case when p_job_id is not null then j.additional else false end,p_job_id,snap,dev,auth.uid()) returning id into result;
 if replaced is not null then
  insert into public.print_job_reviews(request_id,job_id,actor_id,decision,reprint_job_id)
   select p_request_id,id,auth.uid(),'reprint',result from unnest(replaced) id;
 end if;
 return result;
end $$;
create or replace function public.capture_print_order(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; items jsonb; job uuid; device jsonb; extra boolean;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then return; end if;
 if o.status in ('open','ready','out_for_delivery') then
  select jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity-coalesce(st.forwarded_quantity,0),'notes',i.notes,'price',i.unit_price) order by i.created_at,i.id)
   into items from public.order_items i join public.products p on p.id=i.product_id left join public.print_item_state st on st.item_id=i.id
   where i.order_id=o.id and i.quantity>coalesce(st.forwarded_quantity,0);
  if items is not null then
   select to_jsonb(d) into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='kitchen';
   select exists(select 1 from public.print_jobs where order_id=o.id and kind='kitchen') into extra;
   insert into public.print_jobs(order_id,destination,kind,additional,snapshot,device) values(o.id,'kitchen','kitchen',extra,public.print_order_snapshot(o.id,items)-'payments',device) returning id into job;
   insert into public.print_item_state(item_id,forwarded_quantity,job_id)
    select i.id,i.quantity,job from public.order_items i where i.order_id=o.id and i.quantity>coalesce((select forwarded_quantity from public.print_item_state where item_id=i.id),0)
    on conflict(item_id) do update set forwarded_quantity=excluded.forwarded_quantity,job_id=excluded.job_id,printed_at=null;
  end if;
 end if;
 if o.payment_status='paid' and exists(select 1 from public.print_destinations where name='cashier' and receipt_timing='on_payment') then
  select to_jsonb(d) into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='cashier';
  insert into public.print_jobs(order_id,destination,kind,snapshot,device) values(o.id,'cashier','receipt',public.print_order_snapshot(o.id),device)
   on conflict(order_id) where kind='receipt' and not reprint do nothing;
 end if;
end $$;
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
 select * into job from public.print_jobs where status='pending' and archived_at is null and device->>'driver'=p_driver and (p_driver<>'browser' or public.current_user_role() in ('admin','cashier') or destination='kitchen')
  and (kind<>'kitchen' or reprint or exists(select 1 from public.restaurant_settings where id and kitchen_auto_print_enabled))
  order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.print_processor_lease set owner_id=p_owner_id,expires_at=now()+interval '2 minutes' where id;
 update public.print_jobs set status='processing',owner_id=p_owner_id,claim_token=gen_random_uuid(),claimed_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
create or replace function public.finish_print_job(p_job_id uuid,p_owner_id uuid,p_token uuid,p_status text,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs;
begin
 if coalesce(auth.role(),'')<>'service_role' and (auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier')) then raise exception 'Print processor access required' using errcode='42501'; end if;
 if p_status is null or p_status not in ('sent','failed','uncertain') then raise exception 'Invalid result' using errcode='22023'; end if;
 perform 1 from public.print_processor_lease where id for update;
 select * into j from public.print_jobs where id=p_job_id for update;
 if not found or j.archived_at is not null or j.owner_id is distinct from p_owner_id or j.claim_token is distinct from p_token or (coalesce(auth.role(),'')<>'service_role' and j.device->>'driver'<>'browser') then raise exception 'Print claim changed' using errcode='23514'; end if;
 if j.status=p_status then return; end if;
 if j.status not in ('processing','uncertain') or (j.status='uncertain' and p_status='failed') then raise exception 'Print result cannot change' using errcode='23514'; end if;
 update public.print_jobs set status=p_status,error_message=left(p_error,300),sent_at=case when p_status='sent' then now() else sent_at end where id=j.id;
 if p_status='sent' then
  update public.print_devices set last_success_at=now() where id=(j.device->>'id')::uuid;
  perform public.count_print_delivery(j.id);
 end if;
 -- Uncertain before transport retains the lease until acknowledgement or expiry.
 if p_status<>'uncertain' then update public.print_processor_lease set expires_at='-infinity',owner_id=null where id and owner_id=p_owner_id; end if;
end $$;
commit;
