begin;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.submit_qr_order(text,uuid,jsonb)'::regprocedure);
 definition:=regexp_replace(definition,'\mphone\M','v_phone','g');
 definition:=replace(definition,'blocked_phones.v_phone','blocked_phones.phone');
 definition:=replace(definition,'submit_qr_order.v_phone','v_phone');
 execute definition;
end $$;
commit;
