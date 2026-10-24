begin;
create function public.mark_manual_kitchen_print(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if public.current_user_role() is null or public.current_user_role() not in ('admin','kitchen','cashier','waiter') then
    raise exception 'Staff print access required' using errcode = '42501';
  end if;
  if not exists (select 1 from public.orders where id = p_order_id) then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  update public.kitchen_print_jobs set status = 'dispatched', dispatched_at = now(), claimed_by = auth.uid(),
    claim_token = null, terminal_id = null, error_message = null where order_id = p_order_id and status <> 'claimed';
  if not found and exists (select 1 from public.kitchen_print_jobs where order_id = p_order_id and status = 'claimed') then
    raise exception 'Automatic printing is in progress; wait before reprinting' using errcode = '23514';
  end if;
end;
$$;
revoke all on function public.mark_manual_kitchen_print(uuid) from public, anon;
grant execute on function public.mark_manual_kitchen_print(uuid) to authenticated;
commit;
