begin;
create table public.print_devices (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 80),
 driver text not null default 'browser' check(driver in ('browser','file')),
 paper_mm integer not null default 80 check(paper_mm in (58,80)),
 columns integer not null default 48 check(columns between 24 and 64),
 codepage text not null default 'cp860' check(codepage in ('cp860','cp850')),
 codepage_number integer not null default 3 check(codepage_number between 0 and 255),
 locale text not null default 'pt-BR' check(locale in ('pt-BR','es')),
 last_success_at timestamptz
);
insert into public.print_devices(name) values('Impressora principal');
create table public.print_destinations (
 name text primary key check(name in ('kitchen','cashier')),
 device_id uuid not null references public.print_devices(id),
 receipt_timing text not null default 'on_demand' check(receipt_timing in ('on_demand','on_payment'))
);
insert into public.print_destinations(name,device_id) select dest.name,device.id from public.print_devices device cross join (values('kitchen'),('cashier')) dest(name);
create table public.print_jobs (
 id uuid primary key default gen_random_uuid(), request_id uuid unique,
 order_id uuid references public.orders(id) on delete cascade,
 destination text not null references public.print_destinations(name),
 kind text not null check(kind in ('kitchen','receipt','test')),
 additional boolean not null default false, reprint boolean not null default false,
 original_job_id uuid references public.print_jobs(id) on delete set null,
 snapshot jsonb not null, device jsonb not null,
 status text not null default 'pending' check(status in ('pending','processing','sent','failed','uncertain')),
 owner_id uuid, claim_token uuid, claimed_at timestamptz,
 sent_at timestamptz, error_message text,
 created_by uuid references public.profiles(id), created_at timestamptz not null default now()
);
create unique index print_receipt_once on public.print_jobs(order_id) where kind='receipt' and not reprint;
create index print_jobs_pending on public.print_jobs(created_at,id) where status='pending';
create table public.print_item_state (
 item_id uuid primary key references public.order_items(id) on delete cascade,
 reserved_quantity integer not null,
 job_id uuid not null references public.print_jobs(id) on delete cascade,
 printed_at timestamptz
);
create table public.print_processor_lease (
 id boolean primary key default true check(id), owner_id uuid, expires_at timestamptz not null default '-infinity'
);
insert into public.print_processor_lease(id) values(true);
alter table public.print_devices enable row level security;
alter table public.print_destinations enable row level security;
alter table public.print_jobs enable row level security;
alter table public.print_item_state enable row level security;
alter table public.print_processor_lease enable row level security;
revoke all on public.print_devices,public.print_destinations,public.print_jobs,public.print_item_state,public.print_processor_lease from public,anon,authenticated;
grant select on public.print_devices,public.print_destinations,public.print_item_state to authenticated;
grant select(id,request_id,order_id,destination,kind,additional,reprint,original_job_id,snapshot,device,status,sent_at,error_message,created_by,created_at) on public.print_jobs to authenticated;
grant update(name,driver,paper_mm,columns,codepage,codepage_number,locale) on public.print_devices to authenticated;
grant insert(id,name,driver,paper_mm,columns,codepage,codepage_number,locale) on public.print_devices to authenticated;
grant update(device_id,receipt_timing) on public.print_destinations to authenticated;
grant all on public.print_devices,public.print_destinations,public.print_jobs,public.print_item_state,public.print_processor_lease to service_role;
create policy print_device_read on public.print_devices for select to authenticated using(public.current_user_role() in ('admin','kitchen','cashier'));
create policy print_device_admin on public.print_devices for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');
create policy print_device_admin_insert on public.print_devices for insert to authenticated with check(public.current_user_role()='admin');
create policy print_destination_read on public.print_destinations for select to authenticated using(public.current_user_role() in ('admin','kitchen','cashier'));
create policy print_destination_admin on public.print_destinations for update to authenticated using(public.current_user_role()='admin') with check(public.current_user_role()='admin');
create policy print_jobs_read on public.print_jobs for select to authenticated using(public.current_user_role() in ('admin','kitchen','cashier'));
create policy print_items_read on public.print_item_state for select to authenticated using(public.current_user_role() in ('admin','kitchen','cashier'));

create function public.print_order_snapshot(p_order_id uuid, p_items jsonb default null) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('restaurant',s.restaurant_name,'timezone',s.business_timezone,'date',now(),
 'number',o.order_number,'ticket',o.counter_ticket,'name',coalesce(o.counter_name,o.customer_name),
 'table',(select table_number from public.tables where id=o.table_id),'total',o.total_amount,
 'token',o.public_token,'items',coalesce(p_items,(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity,'notes',i.notes,'price',i.unit_price) order by i.created_at,i.id),'[]') from public.order_items i join public.products p on p.id=i.product_id where i.order_id=o.id)),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('method',method,'currency',currency,'original',original_amount,'rate',exchange_rate::text,'equivalent',equivalent_pyg-change_pyg,'change',change_pyg) order by created_at,line_number),'[]') from public.payments where order_id=o.id))
 from public.orders o cross join public.restaurant_settings s where o.id=p_order_id and s.id
$$;
revoke all on function public.print_order_snapshot(uuid,jsonb) from public,anon,authenticated;
create function public.preview_print_order(p_order_id uuid,p_kind text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare snap jsonb; dev jsonb;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier','waiter') or p_kind is null or p_kind not in ('kitchen','receipt') or (p_kind='receipt' and public.current_user_role() not in ('admin','cashier')) then raise exception 'Staff print access required' using errcode='42501'; end if;
 snap:=public.print_order_snapshot(p_order_id);
 if public.current_user_role()='waiter' then snap:=snap-'payments'; end if;
 select to_jsonb(d) into dev from public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name=case when p_kind='receipt' then 'cashier' else 'kitchen' end;
 return jsonb_build_object('snapshot',snap,'device',dev);
end $$;
revoke all on function public.preview_print_order(uuid,text) from public,anon;
grant execute on function public.preview_print_order(uuid,text) to authenticated;

create function public.capture_print_order(p_order_id uuid) returns void
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
   insert into public.print_jobs(order_id,destination,kind,additional,snapshot,device) values(o.id,'kitchen','kitchen',extra,public.print_order_snapshot(o.id,items),device) returning id into job;
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
revoke all on function public.capture_print_order(uuid) from public,anon,authenticated;
create function public.capture_print_trigger() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='orders' then perform public.capture_print_order(new.id);
 elsif tg_op='DELETE' then perform public.capture_print_order(old.order_id);
 else perform public.capture_print_order(new.order_id); end if;
 return null;
end $$;
revoke all on function public.capture_print_trigger() from public,anon,authenticated;
create constraint trigger capture_print_order after insert or update on public.orders deferrable initially deferred for each row execute function public.capture_print_trigger();
create constraint trigger capture_print_items after insert or update or delete on public.order_items deferrable initially deferred for each row execute function public.capture_print_trigger();

create function public.request_print(p_request_id uuid,p_kind text default null,p_order_id uuid default null,p_job_id uuid default null,p_destination text default 'kitchen') returns uuid
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
revoke all on function public.request_print(uuid,text,uuid,uuid,text) from public,anon;
grant execute on function public.request_print(uuid,text,uuid,uuid,text) to authenticated;

create function public.claim_print_job(p_owner_id uuid,p_driver text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare lease public.print_processor_lease; job public.print_jobs;
begin
 if p_owner_id is null or p_driver is null or p_driver not in ('browser','file') then raise exception 'Invalid processor' using errcode='22023'; end if;
 if (p_driver='file' and coalesce(auth.role(),'')<>'service_role') or (p_driver='browser' and (auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen','cashier'))) then raise exception 'Print processor access required' using errcode='42501'; end if;
 select * into lease from public.print_processor_lease where id for update;
 if lease.expires_at>now() then return null; end if;
 update public.print_jobs set status='uncertain',error_message='Processamento interrompido; conferir antes de reimprimir.' where status='processing';
 select * into job from public.print_jobs where status='pending' and device->>'driver'=p_driver
  and (kind<>'kitchen' or reprint or exists(select 1 from public.restaurant_settings where id and kitchen_auto_print_enabled))
  order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.print_processor_lease set owner_id=p_owner_id,expires_at=now()+interval '2 minutes' where id;
 update public.print_jobs set status='processing',owner_id=p_owner_id,claim_token=gen_random_uuid(),claimed_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
create function public.finish_print_job(p_job_id uuid,p_owner_id uuid,p_token uuid,p_status text,p_error text default null) returns void
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
  update public.print_item_state set printed_at=now() where job_id=j.id;
 end if;
 -- Uncertain before transport retains the lease until acknowledgement or expiry.
 if p_status<>'uncertain' then update public.print_processor_lease set expires_at='-infinity',owner_id=null where id and owner_id=p_owner_id; end if;
end $$;
revoke all on function public.claim_print_job(uuid,text),public.finish_print_job(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.claim_print_job(uuid,text),public.finish_print_job(uuid,uuid,uuid,text,text) to authenticated,service_role;

-- Retire the original browser queue, including stale tabs, without discarding its audit history.
insert into public.print_jobs(id,order_id,destination,kind,snapshot,device,status,sent_at,error_message)
 select j.id,j.order_id,'kitchen','kitchen',public.print_order_snapshot(j.order_id),to_jsonb(d),
 case when j.status='dispatched' then 'sent' when j.status in ('claimed','error') then 'uncertain' when j.status='skipped' then 'failed' else 'pending' end,
 j.dispatched_at,j.error_message from public.kitchen_print_jobs j cross join public.print_destinations t join public.print_devices d on d.id=t.device_id where t.name='kitchen';
insert into public.print_item_state(item_id,reserved_quantity,job_id,printed_at)
 select i.id,i.quantity,j.id,j.sent_at from public.order_items i join public.print_jobs j on j.order_id=i.order_id where j.kind='kitchen';
drop trigger orders_enqueue_kitchen_print on public.orders;
update public.kitchen_print_jobs set status='error',error_message='Fila anterior desativada; conferir manualmente.' where status in ('pending','claimed');
revoke execute on function public.claim_kitchen_print_job(uuid),public.finish_kitchen_print_job(uuid,uuid,uuid,text),public.mark_manual_kitchen_print(uuid) from authenticated;
commit;
