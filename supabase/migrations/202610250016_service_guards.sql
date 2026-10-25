begin;
create function public.guard_prepaid_table_identity() returns trigger language plpgsql set search_path='' as $$
begin
 if current_user in ('authenticated','anon') and new.qr_prepaid_account<>old.qr_prepaid_account then raise exception 'Use QR payment service' using errcode='42501';end if;
 return new;
end $$;
create trigger orders_prepaid_identity before update on public.orders for each row execute function public.guard_prepaid_table_identity();
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.qr_review(uuid,uuid,text,text,jsonb)'::regprocedure);
 definition:=replace(definition,'if p_request_id is null or p_action not in','if p_id is null or p_request_id is null or p_action is null or p_action not in');execute definition;
 definition:=pg_get_functiondef('public.materialize_auto_qr(uuid)'::regprocedure);
 definition:=replace(definition,'  update public.qr_requests','  update public.qr_requests');
 definition:=replace(definition,'update public.qr_requests set status=''confirmed''',
 'update public.orders set payment_status=case when total_amount>(select coalesce(sum(equivalent_pyg-change_pyg),0) from public.payments where order_id=o.id) then ''pending''::public.payment_status else payment_status end where id=o.id;
 update public.qr_requests set status=''confirmed''');execute definition;
 definition:=pg_get_functiondef('public.attend_service_request(uuid)'::regprocedure);
 definition:=replace(definition,'if not found then raise exception ''Request already attended'' using errcode = ''P0001''; end if;',
 'if not found and not exists(select 1 from public.service_requests where id=p_request_id and status=''attended'') then raise exception ''Request not found'' using errcode=''P0002'';end if;');execute definition;
end $$;
commit;
