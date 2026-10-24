begin;

alter table public.restaurant_settings add column kitchen_auto_print_enabled boolean not null default true;

create table public.kitchen_print_jobs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','claimed','dispatched','error','skipped')),
  claim_token uuid,
  terminal_id uuid,
  claimed_by uuid references public.profiles(id) on delete set null,
  claimed_at timestamptz,
  dispatched_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);
alter table public.kitchen_print_jobs enable row level security;
revoke all on public.kitchen_print_jobs from public, anon, authenticated;
grant select on public.kitchen_print_jobs to authenticated;
grant all on public.kitchen_print_jobs to service_role;
create policy kitchen_print_jobs_staff_read on public.kitchen_print_jobs for select to authenticated
  using (public.current_user_role() in ('admin','kitchen','cashier'));
create index kitchen_print_jobs_pending on public.kitchen_print_jobs(created_at) where status = 'pending';

create table public.kitchen_printer_lease (
  id boolean primary key default true check (id),
  terminal_id uuid,
  user_id uuid references public.profiles(id) on delete set null,
  expires_at timestamptz not null default '-infinity'
);
insert into public.kitchen_printer_lease(id) values (true);
alter table public.kitchen_printer_lease enable row level security;
revoke all on public.kitchen_printer_lease from public, anon, authenticated;
grant all on public.kitchen_printer_lease to service_role;

create function public.enqueue_kitchen_print() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('open','ready') and (tg_op = 'INSERT' or old.status = 'pending_confirmation') then
    insert into public.kitchen_print_jobs(order_id) values (new.id) on conflict (order_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.enqueue_kitchen_print() from public, anon, authenticated;
create trigger orders_enqueue_kitchen_print after insert or update of status on public.orders
  for each row execute function public.enqueue_kitchen_print();

create function public.claim_kitchen_print_job(p_terminal_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare lease public.kitchen_printer_lease; job public.kitchen_print_jobs;
begin
  if public.current_user_role() is null or public.current_user_role() not in ('admin','kitchen') or p_terminal_id is null then
    raise exception 'Kitchen print access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.restaurant_settings where id and kitchen_auto_print_enabled) then
    return jsonb_build_object('disabled', true);
  end if;
  select * into lease from public.kitchen_printer_lease where id for update;
  if lease.expires_at > now() and (lease.terminal_id is distinct from p_terminal_id or lease.user_id is distinct from auth.uid()) then
    return jsonb_build_object('busy', true);
  end if;
  update public.kitchen_printer_lease set terminal_id = p_terminal_id, user_id = auth.uid(), expires_at = now() + interval '60 seconds' where id;
  -- Uncertain attempts require manual review; never automatically print them twice.
  update public.kitchen_print_jobs set status = 'error', error_message = 'Tentativa interrompida. Confira a impressão e use o botão manual se necessário.'
    where status = 'claimed' and claimed_at < now() - interval '2 minutes';
  update public.kitchen_print_jobs j set status = 'skipped'
    from public.orders o where o.id = j.order_id and j.status = 'pending' and o.status in ('cancelled','closed');
  if exists (select 1 from public.kitchen_print_jobs where status = 'claimed') then return '{}'::jsonb; end if;
  select j.* into job from public.kitchen_print_jobs j join public.orders o on o.id = j.order_id
    where j.status = 'pending' and o.status in ('open','ready','out_for_delivery')
      and exists (select 1 from public.order_items i where i.order_id = j.order_id)
    order by j.created_at, j.id limit 1 for update of j skip locked;
  if not found then return '{}'::jsonb; end if;
  update public.kitchen_print_jobs set status = 'claimed', claim_token = gen_random_uuid(), terminal_id = p_terminal_id,
    claimed_by = auth.uid(), claimed_at = now(), error_message = null where id = job.id returning * into job;
  return jsonb_build_object('id',job.id,'order_id',job.order_id,'claim_token',job.claim_token);
end;
$$;

create function public.finish_kitchen_print_job(p_job_id uuid, p_terminal_id uuid, p_claim_token uuid, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_user_role() is null or public.current_user_role() not in ('admin','kitchen') then
    raise exception 'Kitchen print access required' using errcode = '42501';
  end if;
  update public.kitchen_print_jobs set status = case when p_error is null then 'dispatched' else 'error' end,
    dispatched_at = case when p_error is null then now() else dispatched_at end,
    error_message = left(p_error,300)
    where id = p_job_id and terminal_id = p_terminal_id and claim_token = p_claim_token and claimed_by = auth.uid()
      and (status = 'claimed' or (p_error is not null and status = 'dispatched'));
  if not found then raise exception 'Print claim expired or changed' using errcode = '23514'; end if;
end;
$$;

create function public.release_kitchen_printer(p_terminal_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_user_role() is null or public.current_user_role() not in ('admin','kitchen') then
    raise exception 'Kitchen print access required' using errcode = '42501';
  end if;
  update public.kitchen_printer_lease set expires_at = '-infinity', terminal_id = null, user_id = null
    where id and terminal_id = p_terminal_id and user_id = auth.uid();
end;
$$;

revoke all on function public.claim_kitchen_print_job(uuid) from public, anon;
revoke all on function public.finish_kitchen_print_job(uuid,uuid,uuid,text) from public, anon;
revoke all on function public.release_kitchen_printer(uuid) from public, anon;
grant execute on function public.claim_kitchen_print_job(uuid) to authenticated;
grant execute on function public.finish_kitchen_print_job(uuid,uuid,uuid,text) to authenticated;
grant execute on function public.release_kitchen_printer(uuid) to authenticated;

commit;
