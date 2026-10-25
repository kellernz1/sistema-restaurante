begin;
alter table public.print_jobs add column reviewed_at timestamptz;
alter table public.print_item_state add column printed_quantity integer not null default 0 check(printed_quantity>=0);
grant select(reviewed_at) on public.print_jobs to authenticated;
update public.print_item_state st set printed_quantity=reserved_quantity where printed_at is not null;
create or replace function public.claim_print_job(p_owner_id uuid,p_driver text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lease public.print_processor_lease; job public.print_jobs;
begin
 if p_owner_id is null or p_driver is null or p_driver not in ('browser','file') then raise exception 'Invalid processor' using errcode='22023'; end if;
 if (p_driver='file' and coalesce(auth.role(),'')<>'service_role') or (p_driver='browser' and (auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier'))) then raise exception 'Print processor access required' using errcode='42501'; end if;
 select * into lease from public.print_processor_lease where id for update;
 if lease.expires_at>now() then return null; end if;
 update public.print_jobs set status='uncertain',error_message='Processamento interrompido; conferir antes de reimprimir.' where status='processing';
 if exists(select 1 from public.print_jobs where status='uncertain' and reviewed_at is null) then return null; end if;
 select * into job from public.print_jobs where status='pending' and device->>'driver'=p_driver
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
 if not found or j.owner_id is distinct from p_owner_id or j.claim_token is distinct from p_token or (coalesce(auth.role(),'')<>'service_role' and j.device->>'driver'<>'browser') then raise exception 'Print claim changed' using errcode='23514'; end if;
 if j.status=p_status then return; end if;
 if j.status not in ('processing','uncertain') or (j.status='uncertain' and p_status='failed') then raise exception 'Print result cannot change' using errcode='23514'; end if;
 update public.print_jobs set status=p_status,error_message=left(p_error,300),sent_at=case when p_status='sent' then now() else sent_at end where id=j.id;
 if p_status='sent' then
  update public.print_devices set last_success_at=now() where id=(j.device->>'id')::uuid;
  if j.kind='kitchen' then
   update public.print_item_state st set printed_at=now(),printed_quantity=st.printed_quantity+(item->>'quantity')::integer
    from jsonb_array_elements(j.snapshot->'items') item where st.item_id=(item->>'id')::uuid;
  end if;
 end if;
 -- Uncertain before transport retains the lease until acknowledgement or expiry.
 if p_status<>'uncertain' then update public.print_processor_lease set expires_at='-infinity',owner_id=null where id and owner_id=p_owner_id; end if;
end $$;
create or replace function public.request_print(p_request_id uuid,p_kind text default null,p_order_id uuid default null,p_job_id uuid default null,p_destination text default 'kitchen') returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs; snap jsonb; dev jsonb; k text; dest text; result uuid; is_copy boolean;
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
  if j.status='processing' or (j.status='uncertain' and exists(select 1 from public.print_processor_lease where id and owner_id=j.owner_id and expires_at>now())) then raise exception 'Wait for active transport to stop before reprinting' using errcode='23514'; end if;
  update public.print_jobs set reviewed_at=now() where id=j.id and status in ('uncertain','failed');
  snap:=j.snapshot; k:=j.kind; dest:=j.destination; p_order_id:=j.order_id; is_copy:=true;
 else
  if p_kind not in ('kitchen','receipt','test') or p_kind is null or p_destination is null or p_destination not in ('kitchen','cashier') then raise exception 'Invalid print request' using errcode='22023'; end if;
  k:=p_kind; dest:=case when k='receipt' then 'cashier' else p_destination end;
  perform 1 from public.orders where id=p_order_id for update;
  is_copy:=k='kitchen' or (k='receipt' and exists(select 1 from public.print_jobs where order_id=p_order_id and kind='receipt'));
  if k='test' then
   if public.current_user_role()<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
   snap:='{}';
  else
   snap:=public.print_order_snapshot(p_order_id);
   if snap is null then raise exception 'Order not found' using errcode='P0002'; end if;
  end if;
 end if;
 if public.current_user_role()='waiter' and (k<>'kitchen' or dest<>'kitchen') then raise exception 'Kitchen print access only' using errcode='42501'; end if;
 select to_jsonb(d) into dev from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name=dest;
 insert into public.print_jobs(request_id,order_id,destination,kind,reprint,original_job_id,snapshot,device,created_by)
 values(p_request_id,p_order_id,dest,k,is_copy,p_job_id,snap,dev,auth.uid()) returning id into result;
 return result;
end $$;
commit;
