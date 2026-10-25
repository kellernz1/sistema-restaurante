begin;
drop policy print_jobs_read on public.print_jobs;
create policy print_jobs_read on public.print_jobs for select to authenticated using(public.current_user_role() in ('admin','cashier') or (public.current_user_role()='kitchen' and destination='kitchen'));
update public.print_jobs set snapshot=snapshot-'payments' where kind='kitchen';
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
 select * into job from public.print_jobs where status='pending' and device->>'driver'=p_driver and (p_driver<>'browser' or public.current_user_role() in ('admin','cashier') or destination='kitchen')
  and (kind<>'kitchen' or reprint or exists(select 1 from public.restaurant_settings where id and kitchen_auto_print_enabled))
  order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.print_processor_lease set owner_id=p_owner_id,expires_at=now()+interval '2 minutes' where id;
 update public.print_jobs set status='processing',owner_id=p_owner_id,claim_token=gen_random_uuid(),claimed_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
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
 if public.current_user_role() in ('waiter','kitchen') and (k<>'kitchen' or dest<>'kitchen') then raise exception 'Kitchen print access only' using errcode='42501'; end if;
 if k='kitchen' then snap:=snap-'payments'; end if;
 select to_jsonb(d) into dev from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name=dest;
 insert into public.print_jobs(request_id,order_id,destination,kind,reprint,original_job_id,snapshot,device,created_by)
 values(p_request_id,p_order_id,dest,k,is_copy,p_job_id,snap,dev,auth.uid()) returning id into result;
 return result;
end $$;
create or replace function public.capture_print_order(p_order_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o public.orders; items jsonb; job uuid; device jsonb; extra boolean;
begin
 select * into o from public.orders where id=p_order_id for update;
 if not found then return; end if;
 if o.status in ('open','ready','out_for_delivery') then
  select jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity-coalesce(st.reserved_quantity,0),'notes',i.notes,'price',i.unit_price) order by i.created_at,i.id)
   into items from public.order_items i join public.products p on p.id=i.product_id left join public.print_item_state st on st.item_id=i.id
   where i.order_id=o.id and i.quantity>coalesce(st.reserved_quantity,0);
  if items is not null then
   select to_jsonb(d) into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='kitchen';
   select exists(select 1 from public.print_jobs where order_id=o.id and kind='kitchen') into extra;
   insert into public.print_jobs(order_id,destination,kind,additional,snapshot,device) values(o.id,'kitchen','kitchen',extra,public.print_order_snapshot(o.id,items)-'payments',device) returning id into job;
   insert into public.print_item_state(item_id,reserved_quantity,job_id)
    select i.id,i.quantity,job from public.order_items i where i.order_id=o.id and i.quantity>coalesce((select reserved_quantity from public.print_item_state where item_id=i.id),0)
    on conflict(item_id) do update set reserved_quantity=excluded.reserved_quantity,job_id=excluded.job_id,printed_at=null;
  end if;
 end if;
 if o.payment_status='paid' and exists(select 1 from public.print_destinations where name='cashier' and receipt_timing='on_payment') then
  select to_jsonb(d) into device from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='cashier';
  insert into public.print_jobs(order_id,destination,kind,snapshot,device) values(o.id,'cashier','receipt',public.print_order_snapshot(o.id),device)
   on conflict(order_id) where kind='receipt' and not reprint do nothing;
 end if;
end $$;
create or replace function public.preview_print_order(p_order_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snap jsonb; dev jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier','waiter') or p_kind is null or p_kind not in ('kitchen','receipt') or (p_kind='receipt' and public.current_user_role() not in ('admin','cashier')) then raise exception 'Staff print access required' using errcode='42501'; end if;
 snap:=public.print_order_snapshot(p_order_id);
 if p_kind='kitchen' then snap:=snap-'payments'; end if;
 select to_jsonb(d) into dev from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name=case when p_kind='receipt' then 'cashier' else 'kitchen' end;
 return jsonb_build_object('snapshot',snap,'device',dev);
end $$;
create or replace function public.review_print_job(p_job_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare j public.print_jobs;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier') then raise exception 'Staff print access required' using errcode='42501'; end if;
 perform 1 from public.print_processor_lease where id for update;
 select * into j from public.print_jobs where id=p_job_id for update;
 if public.current_user_role()='kitchen' and j.destination<>'kitchen' then raise exception 'Cashier review required' using errcode='42501'; end if;
 if not found or j.status not in ('failed','uncertain') then raise exception 'Job is not awaiting review' using errcode='23514'; end if;
 if exists(select 1 from public.print_processor_lease where id and owner_id=j.owner_id and expires_at>now()) then raise exception 'Transport may still be active' using errcode='23514'; end if;
 update public.print_jobs set reviewed_at=coalesce(reviewed_at,now()) where id=j.id;
end $$;
create function public.print_issue_count() returns bigint language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier') then raise exception 'Staff required' using errcode='42501'; end if;
 return (select count(*) from public.print_jobs where status in ('failed','uncertain') and reviewed_at is null);
end $$;
revoke all on function public.print_issue_count() from public,anon;
grant execute on function public.print_issue_count() to authenticated;
commit;
