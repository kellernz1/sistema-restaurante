begin;
create function public.review_legacy_table_order(p_order_id uuid,p_accept boolean,p_reason text default null) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if auth.uid() is null or coalesce(public.current_user_role()::text,'') not in ('admin','cashier') then raise exception 'Cashier required' using errcode='42501';end if;
 if p_accept is null or (not p_accept and (nullif(btrim(p_reason),'') is null or length(p_reason)>500)) then raise exception 'Rejection reason required' using errcode='22023';end if;
 perform 1 from public.tables where id=(select table_id from public.orders where id=p_order_id) for update;
 select * into o from public.orders where id=p_order_id and order_type='dine_in' and source in ('qr','nfc') for update;
 if not found then raise exception 'Legacy QR order not found' using errcode='P0002';end if;
 if o.status<>'pending_confirmation' then
  if (p_accept and o.confirmed_at is not null) or (not p_accept and o.status='cancelled' and o.cancel_reason=btrim(p_reason)) then return;end if;
  raise exception 'Order already reviewed' using errcode='23514';
 end if;
 update public.orders set status=case when p_accept then 'open'::public.order_status else 'cancelled'::public.order_status end,confirmed_at=case when p_accept then now() else null end,cancel_reason=case when p_accept then null else btrim(p_reason) end,waiter_id=case when p_accept then auth.uid() else waiter_id end where id=o.id;
end $$;
revoke all on function public.review_legacy_table_order(uuid,boolean,text) from public,anon;
grant execute on function public.review_legacy_table_order(uuid,boolean,text) to authenticated;
create or replace function public.review_table_order(p_order_id uuid,p_accept boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform public.review_legacy_table_order(p_order_id,p_accept,null);end $$;
commit;
