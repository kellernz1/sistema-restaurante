begin;

alter table public.profiles add column is_active boolean not null default true;

-- Existing JWTs lose their application privileges immediately when blocked.
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = '' as $$
  select role from public.profiles where id = auth.uid() and is_active;
$$;

create or replace function public.protect_administrator_access()
returns trigger language plpgsql security definer set search_path = '' as $$
declare remains_admin boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock(741932001);
  if tg_op = 'DELETE' then
    remains_admin := false;
  else
    remains_admin := new.role = 'admin' and new.is_active;
    if old.id = auth.uid() and old.role = 'admin' and not remains_admin then
      raise exception 'Cannot remove your own administrator access' using errcode = '23514';
    end if;
  end if;
  if old.role = 'admin' and old.is_active and not remains_admin
    and not exists(select 1 from public.profiles where id <> old.id and role = 'admin' and is_active) then
    raise exception 'At least one active administrator is required' using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_administrator_access() from public, anon, authenticated;
create trigger protect_administrator_access_before_write before update or delete on public.profiles
  for each row execute function public.protect_administrator_access();

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles') then
    alter publication supabase_realtime add table public.profiles;
  end if;
end $$;

-- Fail closed when a blocked profile has no effective role.
create or replace function public.open_table(p_table_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_table public.tables;
  created_order public.orders;
  actor_role public.user_role;
begin
  actor_role := public.current_user_role();
  if auth.uid() is null or actor_role is null or actor_role not in ('admin', 'waiter') then
    raise exception 'Not authorized to open a table' using errcode = '42501';
  end if;

  select * into selected_table
  from public.tables
  where id = p_table_id
  for update;

  if not found then
    raise exception 'Table not found' using errcode = 'P0002';
  end if;

  if selected_table.status <> 'available' then
    raise exception 'Table is not available' using errcode = 'P0001';
  end if;

  insert into public.orders (order_type, source, table_id, waiter_id, status, confirmed_at)
  values ('dine_in', 'waiter', p_table_id, auth.uid(), 'open', now())
  returning * into created_order;

  update public.tables set status = 'occupied' where id = p_table_id;

  return created_order;
exception
  when unique_violation then
    raise exception 'Table already has an active order' using errcode = 'P0001';
end;
$$;

create or replace function public.close_order(p_order_id uuid, p_payment_method text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
  closed_order public.orders;
  selected_payment_method public.payment_method;
  actor_role public.user_role;
begin
  actor_role := public.current_user_role();
  if auth.uid() is null or actor_role is null or actor_role not in ('admin', 'cashier') then
    raise exception 'Not authorized to close orders' using errcode = '42501';
  end if;

  begin
    selected_payment_method := p_payment_method::public.payment_method;
    if selected_payment_method is null then raise exception 'Payment method required' using errcode = '22023'; end if;
  exception
    when invalid_text_representation then
      raise exception 'Invalid payment method' using errcode = '22023';
  end;

  select * into target_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if target_order.status in ('closed', 'cancelled') then
    raise exception 'Order is already closed or cancelled' using errcode = 'P0001';
  end if;

  perform public.recompute_order_total(p_order_id);

  update public.orders
  set status = 'closed',
      payment_method = selected_payment_method,
      cash_change_for = case when selected_payment_method = 'cash' then cash_change_for else null end,
      payment_status = 'paid',
      closed_at = now()
  where id = p_order_id
  returning * into closed_order;

  if closed_order.order_type = 'dine_in' then
    update public.tables set status = 'available' where id = closed_order.table_id;
  end if;

  return closed_order;
end;
$$;

create or replace function public.create_cashier_order(p_actor_id uuid, p_request_id uuid, p_payload jsonb)
returns public.orders
language plpgsql security definer set search_path = '' as $$
declare
  submission public.cashier_order_submissions;
  target public.orders;
  existing_order_id uuid;
  actor_role public.user_role;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can create cashier orders' using errcode = '42501';
  end if;
  select role into actor_role from public.profiles where id = p_actor_id and is_active;
  if actor_role is null or actor_role not in ('admin', 'cashier') then
    raise exception 'Cashier access required' using errcode = '42501';
  end if;
  if p_request_id is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Invalid cashier order request' using errcode = '22023';
  end if;

  insert into public.cashier_order_submissions(request_id, actor_id, payload)
    values (p_request_id, p_actor_id, p_payload) on conflict (request_id) do nothing;
  select * into submission from public.cashier_order_submissions where request_id = p_request_id for update;
  if submission.actor_id <> p_actor_id or submission.payload <> p_payload then
    raise exception 'Request ID already used for another order' using errcode = '22023';
  end if;
  if submission.order_id is not null then
    select * into target from public.orders where id = submission.order_id;
    return target;
  end if;

  if p_payload ->> 'order_type' = 'dine_in' then
    -- Serialize with public ordering, token rotation, table opening and closing.
    perform 1 from public.tables where id = (p_payload ->> 'table_id')::uuid for update;
    select id into existing_order_id from public.orders
      where table_id = (p_payload ->> 'table_id')::uuid and order_type = 'dine_in'
      and status not in ('closed', 'cancelled') for update;
  end if;

  target := public.create_customer_order(p_payload || jsonb_build_object('source', 'waiter'));
  update public.orders set
    waiter_id = case when existing_order_id is null or waiter_id is null then p_actor_id else waiter_id end,
    status = case when status = 'pending_confirmation' then 'open'::public.order_status else status end,
    confirmed_at = coalesce(confirmed_at, now())
    where id = target.id returning * into target;
  if target.order_type <> 'dine_in' then
    perform public.sync_offsite_ready(target.id);
    select * into target from public.orders where id = target.id;
  end if;
  update public.cashier_order_submissions set order_id = target.id where request_id = p_request_id;
  return target;
end $$;

commit;
