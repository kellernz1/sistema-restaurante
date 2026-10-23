begin;
create table public.whatsapp_conversations (
  phone text primary key check(phone ~ '^\+[1-9][0-9]{7,14}$'),
  state text not null default 'welcome', context jsonb not null default '{}'::jsonb,
  needs_human boolean not null default false, opted_out boolean not null default false,
  last_message_at timestamptz not null default now(), lease_token uuid, lease_until timestamptz
);
create table public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique, wa_message_id text not null unique,
  direction text not null check(direction in ('in','out','status')), phone text not null references public.whatsapp_conversations(phone),
  payload jsonb not null, status text not null default 'pending' check(status in ('pending','processing','processed','sent','delivered','read','failed','skipped')),
  provider_id text, attempts integer not null default 0, lease_token uuid, lease_until timestamptz,
  created_at timestamptz not null default now()
);
create index whatsapp_queue_idx on public.whatsapp_messages(status, direction, created_at);
create index whatsapp_phone_idx on public.whatsapp_messages(phone, created_at);
create index whatsapp_provider_idx on public.whatsapp_messages(provider_id);
create index whatsapp_human_idx on public.whatsapp_conversations(needs_human) where needs_human;
alter table public.whatsapp_conversations enable row level security;
alter table public.whatsapp_messages enable row level security;
revoke all on public.whatsapp_conversations, public.whatsapp_messages from anon, authenticated;
grant select on public.whatsapp_conversations, public.whatsapp_messages to authenticated;
grant all on public.whatsapp_conversations, public.whatsapp_messages to service_role;
revoke all on sequence public.whatsapp_messages_sequence_seq from anon, authenticated;
grant usage,select on sequence public.whatsapp_messages_sequence_seq to service_role;
create policy whatsapp_conversations_admin_read on public.whatsapp_conversations for select to authenticated
  using(auth.uid() is not null and public.current_user_role() = 'admin');
create policy whatsapp_messages_admin_read on public.whatsapp_messages for select to authenticated
  using(auth.uid() is not null and public.current_user_role() = 'admin');
alter publication supabase_realtime add table public.whatsapp_conversations;

create function public.claim_whatsapp_message(p_direction text)
returns public.whatsapp_messages language plpgsql security definer set search_path = '' as $$
declare conv public.whatsapp_conversations; job public.whatsapp_messages; token uuid := gen_random_uuid();
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_direction not in ('in','out','status') then raise exception 'Invalid direction'; end if;
  select * into conv from public.whatsapp_conversations c where (c.lease_until is null or c.lease_until < now())
    and exists(select 1 from public.whatsapp_messages m where m.phone=c.phone and m.direction=p_direction and (m.status='pending' or (p_direction <> 'out' and m.status='processing' and m.lease_until < now())))
    order by c.last_message_at for update skip locked limit 1;
  if not found then return null; end if;
  select * into job from public.whatsapp_messages where phone=conv.phone and direction=p_direction
    and (status='pending' or (p_direction <> 'out' and status='processing' and lease_until < now())) order by created_at, sequence for update skip locked limit 1;
  if not found then return null; end if;
  update public.whatsapp_conversations set lease_token=token, lease_until=now()+interval '2 minutes' where phone=conv.phone;
  update public.whatsapp_messages set status='processing', attempts=attempts+1, lease_token=token, lease_until=now()+interval '2 minutes' where id=job.id returning * into job;
  return job;
end $$;
revoke all on function public.claim_whatsapp_message(text) from public, anon, authenticated;
grant execute on function public.claim_whatsapp_message(text) to service_role;

create function public.commit_whatsapp_turn(p_message_id uuid, p_lease uuid, p_session jsonb, p_replies jsonb, p_order jsonb default null)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare job public.whatsapp_messages; conv public.whatsapp_conversations; result public.orders; reply jsonb; ordinal integer := 0; payload jsonb; active_before uuid;
begin
  if coalesce(auth.role(),'') <> 'service_role' then raise exception 'Not authorized' using errcode='42501'; end if;
  select * into job from public.whatsapp_messages where id=p_message_id;
  select * into conv from public.whatsapp_conversations where phone=job.phone for update;
  select * into job from public.whatsapp_messages where id=p_message_id for update;
  if p_lease is null or job.id is null or conv.phone is null or job.status <> 'processing' or job.lease_token is distinct from p_lease or conv.lease_token is distinct from p_lease or conv.lease_until < now() then raise exception 'Lease expired'; end if;
  if p_order is not null then
    if not exists(select 1 from public.restaurant_settings where id=true and whatsapp_enabled and is_accepting_orders) then raise exception 'WhatsApp ordering unavailable'; end if;
    payload := p_order || jsonb_build_object('source','whatsapp','customer_phone',job.phone);
    if payload->>'order_type' = 'dine_in' and coalesce(payload->>'table_token','') <> '' then
      perform 1 from public.tables where id=(payload->>'table_id')::uuid and qr_token=payload->>'table_token' for update;
      if not found then raise exception 'Invalid table token'; end if;
    end if;
    if payload->>'order_type' = 'dine_in' and coalesce(payload->>'table_token','') = '' then
      perform 1 from public.tables where id=(payload->>'table_id')::uuid for update;
      if exists(select 1 from public.orders where table_id=(payload->>'table_id')::uuid and status not in ('closed','cancelled')) then
        raise exception 'Number-only table requires staff assistance';
      end if;
    end if;
    if payload->>'order_type'='dine_in' then
      select id into active_before from public.orders where table_id=(payload->>'table_id')::uuid and order_type='dine_in' and status not in ('closed','cancelled');
    end if;
    result := public.create_customer_order(payload);
    if result.source='whatsapp' and result.customer_phone is null then
      update public.orders set customer_phone=job.phone where id=result.id returning * into result;
    end if;
    if result.order_type='dine_in' and active_before is null then
      if payload->>'cash_change_for' is not null and (payload->>'cash_change_for')::numeric < result.total_amount then raise exception 'Insufficient cash amount' using errcode='23514'; end if;
      update public.orders set status='pending_confirmation',confirmed_at=null,payment_method=(payload->>'payment_method')::public.payment_method,
        cash_change_for=(payload->>'cash_change_for')::numeric where id=result.id returning * into result;
    end if;
    reply := jsonb_build_object('kind','text','body',replace(replace(replace(p_session->>'confirmation_text','{number}',result.order_number::text),'{token}',result.public_token),'{minutes}',coalesce(p_session->>'estimated_minutes','30')));
    insert into public.whatsapp_messages(wa_message_id,direction,phone,payload) values('reply:'||job.id||':order','out',job.phone,reply) on conflict do nothing;
  else
    for reply in select value from jsonb_array_elements(p_replies) loop
      insert into public.whatsapp_messages(wa_message_id,direction,phone,payload) values('reply:'||job.id||':'||ordinal,'out',job.phone,reply) on conflict do nothing;
      ordinal := ordinal+1;
    end loop;
  end if;
  update public.whatsapp_conversations set state=p_session->>'state',context=coalesce(p_session->'context','{}'),
    needs_human=coalesce((p_session->>'needs_human')::boolean,false),opted_out=coalesce((p_session->>'opted_out')::boolean,false),
    last_message_at=greatest(last_message_at,coalesce((job.payload->>'received_at')::timestamptz,now())),lease_token=null,lease_until=null where phone=job.phone;
  update public.whatsapp_messages set status='processed',lease_until=null where id=job.id;
  return result;
end $$;
revoke all on function public.commit_whatsapp_turn(uuid,uuid,jsonb,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.commit_whatsapp_turn(uuid,uuid,jsonb,jsonb,jsonb) to service_role;

create function public.whatsapp_handoffs()
returns table(phone text, last_message_at timestamptz) language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Not authorized' using errcode='42501'; end if;
  return query select c.phone,c.last_message_at from public.whatsapp_conversations c where c.needs_human order by c.last_message_at;
end $$;
create function public.resolve_whatsapp_handoff(p_phone text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Not authorized' using errcode='42501'; end if;
  update public.whatsapp_conversations set needs_human=false,state='welcome',context='{}' where phone=p_phone and (lease_until is null or lease_until<now());
  if not found then raise exception 'Conversation busy'; end if;
end $$;
revoke all on function public.whatsapp_handoffs(),public.resolve_whatsapp_handoff(text) from public, anon;
grant execute on function public.whatsapp_handoffs(),public.resolve_whatsapp_handoff(text) to authenticated;
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
  if auth.uid() is null or actor_role not in ('admin', 'cashier') then
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


commit;
