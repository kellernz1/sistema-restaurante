begin;
create or replace function public.guard_order_payment_fields() returns trigger language plpgsql set search_path='' as $$
declare paid bigint;
begin
 if current_user in ('authenticated','anon') and (new.payment_status is distinct from old.payment_status or new.closed_at is distinct from old.closed_at or (new.status='closed' and old.status<>'closed')) then
  raise exception 'Use the payment service' using errcode='42501';
 end if;
 select coalesce(sum(equivalent_pyg-change_pyg),0) into paid from public.payments where order_id=new.id;
 if new.total_amount<paid or (new.status='cancelled' and paid>0) then raise exception 'Recorded payments cannot be discarded' using errcode='23514'; end if;
 if old.status='closed' and (new.total_amount<>old.total_amount or new.delivery_fee<>old.delivery_fee or new.payment_status<>old.payment_status or new.closed_at is distinct from old.closed_at) then raise exception 'Closed financial order is immutable' using errcode='23514'; end if;
 return new;
end $$;
-- Public and staff order creation must use currently enabled methods. A Pix
-- intent requires a valid configured rate, but never creates a payment record.
create function public.validate_order_payment_intent() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.payment_method is not null and not exists(select 1 from public.restaurant_settings where new.payment_method=any(enabled_payment_methods)) then raise exception 'Payment method disabled' using errcode='22023'; end if;
 if new.payment_method='pix' and not exists(select 1 from public.exchange_rates where valid_from<=now()) then raise exception 'Configure the exchange rate before accepting Pix' using errcode='23514'; end if;
 return new;
end $$;
create trigger orders_payment_intent_check before insert on public.orders for each row execute function public.validate_order_payment_intent();
commit;
