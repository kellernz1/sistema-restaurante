begin;
create table public.kitchen_action_submissions (
  request_id uuid primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  action text not null check (action in ('start','ready')),
  result jsonb,
  created_at timestamptz not null default now()
);
alter table public.kitchen_action_submissions enable row level security;
revoke all on public.kitchen_action_submissions from public, anon, authenticated;

create function public.advance_kitchen_order(p_order_id uuid, p_request_id uuid, p_action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare target public.orders; submission public.kitchen_action_submissions; response jsonb;
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','kitchen') then
    raise exception 'Active kitchen operator required' using errcode='42501';
  end if;
  if p_order_id is null or p_request_id is null or p_action is null or p_action not in ('start','ready') then
    raise exception 'Invalid kitchen action' using errcode='22023';
  end if;
  perform 1 from public.tables where id=(select table_id from public.orders where id=p_order_id) for update;
  select * into target from public.orders where id=p_order_id for update;
  if not found then raise exception 'Order not found' using errcode='P0002'; end if;
  insert into public.kitchen_action_submissions(request_id,order_id,actor_id,action)
    values(p_request_id,p_order_id,auth.uid(),p_action) on conflict do nothing;
  select * into submission from public.kitchen_action_submissions where request_id=p_request_id for update;
  if submission.order_id<>p_order_id or submission.actor_id<>auth.uid() or submission.action<>p_action then
    raise exception 'Idempotency key already used' using errcode='22023';
  end if;
  if submission.result is not null then return submission.result; end if;
  if target.status not in ('open','ready') then raise exception 'Order unavailable' using errcode='23514'; end if;
  -- Serialize the full item set; item triggers retain aggregate readiness rules.
  perform 1 from public.order_items where order_id=p_order_id order by id for update;
  if not exists(select 1 from public.order_items where order_id=p_order_id) then
    raise exception 'Order has no items' using errcode='23514';
  end if;
  update public.order_items set status='preparing' where order_id=p_order_id and status='pending';
  if p_action='ready' then
    update public.order_items set status='ready' where order_id=p_order_id and status='preparing';
  end if;
  response:=jsonb_build_object('success',true,'order_id',p_order_id,'action',p_action);
  update public.kitchen_action_submissions set result=response where request_id=p_request_id;
  return response;
end $$;
revoke all on function public.advance_kitchen_order(uuid,uuid,text) from public,anon;
grant execute on function public.advance_kitchen_order(uuid,uuid,text) to authenticated;
commit;
