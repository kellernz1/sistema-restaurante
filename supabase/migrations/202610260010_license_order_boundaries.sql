begin;
create function public.assert_order_license(p_type text,p_source text,p_table uuid default null)returns void language plpgsql security definer set search_path=''as $$
declare v jsonb;begin
 -- Only a trusted review of an already accepted QR request can materialize during restriction.
 if p_table is not null and exists(select 1 from public.license_continuations where backend_id=pg_backend_pid()and transaction_id=txid_current()and table_id=p_table)then return;end if;
 v:=public.license_snapshot();
 if not(v->>'orders_enabled')::boolean then raise exception 'License temporarily restricts new orders'using errcode='L0001';end if;
 if(p_type='delivery'and not(v->>'delivery_enabled')::boolean)or(p_source='whatsapp'and not(v->>'whatsapp_enabled')::boolean)then raise exception 'License feature unavailable'using errcode='L0002';end if;
end $$;
create function public.guard_license_order_insert()returns trigger language plpgsql security definer set search_path=''as $$
declare o public.orders;begin
 if tg_table_name='orders'then
  if not public.owner_maintenance()then new.created_at:=transaction_timestamp();end if;
  perform public.assert_order_license(new.order_type::text,new.source::text,new.table_id);
 elsif tg_table_name='qr_requests'then perform public.assert_order_license('dine_in',new.source::text,new.table_id);
 else select *into o from public.orders where id=new.order_id;perform public.assert_order_license(o.order_type::text,o.source::text,o.table_id);end if;
 return new;
end $$;
create trigger orders_license before insert on public.orders for each row execute function public.guard_license_order_insert();
create trigger order_items_license before insert on public.order_items for each row execute function public.guard_license_order_insert();
create trigger qr_requests_license before insert on public.qr_requests for each row execute function public.guard_license_order_insert();
create function public.guard_license_clock_source()returns trigger language plpgsql security definer set search_path=''as $$
begin if new.created_at is distinct from old.created_at and not public.owner_maintenance()then raise exception 'Order clock source is server-owned'using errcode='42501';end if;return new;end $$;
create trigger orders_license_clock before update on public.orders for each row execute function public.guard_license_clock_source();

alter function public.cash_session_command(uuid,text,jsonb)rename to cash_session_command_before_license;
create function public.cash_session_command(p_request_id uuid,p_action text,p_payload jsonb)returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;begin
 if auth.uid()is null or coalesce(public.current_user_role()::text,'')not in('admin','cashier')then raise exception 'Active cash operator required'using errcode='42501';end if;
 if p_action in('open','reopen')and not exists(select 1 from public.cash_session_events where request_id=p_request_id)then perform public.license_refresh(true);end if;
 result:=public.cash_session_command_before_license(p_request_id,p_action,p_payload);
 return result;
end $$;
create function public.license_cash_boundary()returns trigger language plpgsql security definer set search_path=''as $$
begin perform public.license_refresh(true);return new;end $$;
create trigger cash_license_boundary before insert on public.cash_sessions for each row execute function public.license_cash_boundary();

alter function public.qr_review(uuid,uuid,text,text,jsonb)rename to qr_review_before_license;
create function public.qr_review(p_id uuid,p_request_id uuid,p_action text,p_reason text default null,p_lines jsonb default '[]')returns jsonb language plpgsql security definer set search_path=''as $$
declare result jsonb;r public.qr_requests;begin
 if auth.uid()is null or coalesce(public.current_user_role()::text,'')not in('admin','cashier')then raise exception 'Active cashier required'using errcode='42501';end if;
 select *into r from public.qr_requests where id=p_id;
 -- A request cannot enter this queue after restriction; the insert trigger already enforces it.
 if r.id is not null then insert into public.license_continuations(backend_id,transaction_id,table_id)values(pg_backend_pid(),txid_current(),r.table_id);end if;
 result:=public.qr_review_before_license(p_id,p_request_id,p_action,p_reason,p_lines);
 delete from public.license_continuations where backend_id=pg_backend_pid()and transaction_id=txid_current();return result;
end $$;
-- Automatic materialization is in the same transaction as its licensed submission.
revoke all on function public.assert_order_license(text,text,uuid),public.guard_license_order_insert(),public.cash_session_command_before_license(uuid,text,jsonb),public.cash_session_command(uuid,text,jsonb),public.license_cash_boundary(),public.qr_review_before_license(uuid,uuid,text,text,jsonb),public.qr_review(uuid,uuid,text,text,jsonb)from public,anon,authenticated,service_role;
revoke all on function public.guard_license_clock_source()from public,anon,authenticated,service_role;
grant execute on function public.cash_session_command(uuid,text,jsonb),public.qr_review(uuid,uuid,text,text,jsonb)to authenticated;
commit;
