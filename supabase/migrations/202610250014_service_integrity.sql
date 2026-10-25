begin;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.create_customer_order(jsonb)'::regprocedure);
 definition:=replace(definition,'if requested_source in (''qr'', ''nfc'') and not settings.dine_in_qr_enabled then','if not settings.dine_in_qr_enabled then');
 definition:=replace(definition,'requested_type = ''pickup'' and not settings.pickup_enabled then','requested_type = ''pickup'' and not counter and not settings.pickup_enabled then');
 execute definition;
end $$;
create function public.guard_blocked_order_phone() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.customer_phone is not null and exists(select 1 from public.blocked_phones where phone=new.customer_phone) then raise exception 'Phone blocked' using errcode='23514';end if;
 return new;
end $$;
create trigger orders_blocked_phone before insert on public.orders for each row execute function public.guard_blocked_order_phone();

create or replace function public.reset_qr_account() returns trigger language plpgsql set search_path='' as $$
declare s public.restaurant_settings;
begin
 if current_user in ('authenticated','anon') and (new.qr_account_id<>old.qr_account_id or new.qr_first_confirmed<>old.qr_first_confirmed) then raise exception 'Use service RPCs' using errcode='42501';end if;
 if new.status='available' and old.status<>'available' then
  new.qr_account_id:=gen_random_uuid();new.qr_first_confirmed:=false;
  select * into s from public.restaurant_settings where id;
  update public.qr_requests set status='cancelled',actor_kind='system',reason='Mesa liberada pelo atendimento',reviewed_at=now(),business_date=public.business_day_for(now(),s.business_timezone,s.business_day_start) where table_id=new.id and account_id=old.qr_account_id and status='pending';
 end if;
 return new;
end $$;

-- Public request status and financial snapshots cannot be changed by direct staff writes.
create function public.guard_qr_history() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.status<>'pending' then raise exception 'QR history is immutable' using errcode='23514';end if;
 if row(new.items,new.payload,new.total_amount,new.account_id,new.table_id,new.customer_phone,new.customer_name,new.access_token,new.request_id) is distinct from row(old.items,old.payload,old.total_amount,old.account_id,old.table_id,old.customer_phone,old.customer_name,old.access_token,old.request_id) then raise exception 'QR request identity is immutable' using errcode='23514';end if;
 return new;
end $$;
create trigger qr_history before update or delete on public.qr_requests for each row execute function public.guard_qr_history();
commit;
