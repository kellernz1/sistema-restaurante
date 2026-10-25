begin;
do $$ declare definition text;begin
 definition:=pg_get_functiondef('public.submit_qr_order(text,uuid,jsonb)'::regprocedure);
 definition:=replace(definition,'if jsonb_typeof(p_payload->''items'')<>''array''','if p_payload->''items'' is null or jsonb_typeof(p_payload->''items'')<>''array''');
 definition:=replace(definition,'if qty not between 1 and 99','if qty is null or qty not between 1 and 99');execute definition;
 definition:=pg_get_functiondef('public.set_phone_block(uuid,boolean,text)'::regprocedure);
 definition:=replace(definition,'if r.status not in','if not found or p_block is null or r.status not in');execute definition;
end $$;
commit;
