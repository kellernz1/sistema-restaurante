begin;
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
  select * into j from public.print_jobs where id=p_job_id for update;
  if not found then raise exception 'Job not found' using errcode='P0002'; end if;
  if j.status='processing' or (j.status='uncertain' and exists(select 1 from public.print_processor_lease where id and owner_id=j.owner_id and expires_at>now())) then raise exception 'Wait for active transport to stop before reprinting' using errcode='23514'; end if;
  update public.print_jobs set reviewed_at=now() where id=j.id and status in ('uncertain','failed');
  update public.print_jobs set status='failed',reviewed_at=now(),error_message='Superseded by explicit reprint' where id=j.id and status='pending';
  snap:=j.snapshot; k:=j.kind; dest:=j.destination; p_order_id:=j.order_id; is_copy:=true;
 else
  if p_kind not in ('kitchen','receipt','test') or p_kind is null or p_destination is null or p_destination not in ('kitchen','cashier') then raise exception 'Invalid print request' using errcode='22023'; end if;
  k:=p_kind; dest:=case when k='receipt' then 'cashier' else p_destination end;
  perform 1 from public.orders where id=p_order_id for update;
  perform 1 from public.print_jobs where order_id=p_order_id and kind=k order by id for update;
  if exists(select 1 from public.print_jobs where order_id=p_order_id and kind=k and status='processing') then raise exception 'Print already in progress' using errcode='23514'; end if;
  update public.print_jobs set status='failed',reviewed_at=now(),error_message='Superseded by explicit full-order print' where order_id=p_order_id and kind=k and status='pending';
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
 return result;
end $$;
commit;
