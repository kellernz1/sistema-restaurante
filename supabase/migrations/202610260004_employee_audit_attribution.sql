begin;
-- Auth user metadata is user-editable; only server-controlled app metadata may attribute account creation.
do $$
declare definition text;old_expression text;new_expression text;
begin
 definition:=pg_get_functiondef('public.capture_administrative_audit()'::regprocedure);
 old_expression:=$old$nullif(u.raw_user_meta_data->>'staff_created_by','')::uuid$old$;
 new_expression:=$new$case when u.raw_app_meta_data->>'staff_created_by' ~ '^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$' then (u.raw_app_meta_data->>'staff_created_by')::uuid end$new$;
 if position(old_expression in definition)=0 then raise exception 'Unexpected audit attribution definition';end if;
 execute replace(definition,old_expression,new_expression);
end $$;
commit;
