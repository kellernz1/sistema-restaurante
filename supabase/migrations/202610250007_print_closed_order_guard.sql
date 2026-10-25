begin;
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
 update public.print_jobs j set status='failed',reviewed_at=now(),error_message='Order closed or cancelled before dispatch' from public.orders o where o.id=j.order_id and j.status='pending' and j.kind='kitchen' and not j.reprint and o.status in ('closed','cancelled');
 select * into job from public.print_jobs where status='pending' and device->>'driver'=p_driver and (p_driver<>'browser' or public.current_user_role() in ('admin','cashier') or destination='kitchen')
  and (kind<>'kitchen' or reprint or exists(select 1 from public.restaurant_settings where id and kitchen_auto_print_enabled))
  order by created_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.print_processor_lease set owner_id=p_owner_id,expires_at=now()+interval '2 minutes' where id;
 update public.print_jobs set status='processing',owner_id=p_owner_id,claim_token=gen_random_uuid(),claimed_at=now() where id=job.id returning * into job;
 return to_jsonb(job);
end $$;
commit;
