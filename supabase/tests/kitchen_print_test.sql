begin;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;
-- Existing ordering/payment scenarios use the supported optional-session policy; mandatory binding is covered by cash_sessions_test.
update public.cash_session_policy set require_open_session=false where id;
create temporary table print_context(order_id uuid,product_id uuid,admin_id uuid,kitchen_id uuid,job_id uuid,owner_id uuid,token uuid,request_id uuid);
grant all on print_context to authenticated,service_role;
insert into print_context(product_id,admin_id,kitchen_id,owner_id,request_id) select (select id from public.products where is_active limit 1),(select id from public.profiles where role='admin' and is_active limit 1),(select id from public.profiles where role='kitchen' and is_active limit 1),gen_random_uuid(),gen_random_uuid();
update public.print_jobs set reviewed_at=now() where status='uncertain';
update public.print_jobs set status='sent' where status in ('pending','processing');
update public.print_processor_lease set expires_at='-infinity';
update public.print_devices set driver='browser';
insert into public.orders(order_type,source,status,customer_name,customer_phone) values('pickup','waiter','pending_confirmation','__print_engine__','+595981999901');
update print_context set order_id=(select id from public.orders where customer_name='__print_engine__');
insert into public.order_items(order_id,product_id,quantity,unit_price,notes) select order_id,product_id,2,0,'Sem cebola' from print_context;
set constraints all immediate;
do $$ begin if exists(select 1 from public.print_jobs where order_id=(select order_id from print_context)) then raise exception 'Unconfirmed order printed'; end if; end $$;
set constraints all deferred;
update public.orders set status='open' where id=(select order_id from print_context);
set constraints all immediate;
update print_context set job_id=(select id from public.print_jobs where order_id=print_context.order_id);
do $$ begin if (select count(*) from public.print_jobs where order_id=(select order_id from print_context))<>1 then raise exception 'Initial snapshot not unique'; end if; end $$;
select set_config('request.jwt.claim.sub',(select kitchen_id::text from print_context),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare ctx print_context; claim jsonb; begin
 select * into ctx from print_context;
 claim:=public.claim_print_job(ctx.owner_id,'browser');
 if claim->>'id'<>ctx.job_id::text then raise exception 'Wrong claim'; end if;
 update print_context set token=(claim->>'claim_token')::uuid;
 if public.claim_print_job(gen_random_uuid(),'browser') is not null then raise exception 'Concurrent processor admitted'; end if;
 begin perform claim_token from public.print_jobs; raise exception 'Claim secret readable'; exception when insufficient_privilege then null; end;
 begin perform public.claim_print_job(gen_random_uuid(),'file'); raise exception 'Staff acquired service file driver'; exception when insufficient_privilege then null; end;
 perform public.finish_print_job(ctx.job_id,ctx.owner_id,(claim->>'claim_token')::uuid,'uncertain','Test interrupted transport');
end $$;
reset role;
update public.print_processor_lease set expires_at='-infinity';
set local role authenticated;
do $$ begin if public.claim_print_job(gen_random_uuid(),'browser') is not null then raise exception 'Uncertain job automatically resent'; end if; end $$;
do $$ declare ctx print_context; reviewed timestamptz; begin
 select * into ctx from print_context;
 perform public.review_print_job(ctx.job_id);
 select reviewed_at into reviewed from public.print_jobs where id=ctx.job_id;
 perform public.review_print_job(ctx.job_id);
 if (select reviewed_at is distinct from reviewed or status<>'uncertain' from public.print_jobs where id=ctx.job_id) then raise exception 'Review changed outcome or was not idempotent'; end if;
end $$;
reset role;
-- An addition must be a new immutable delta, not the entire order.
set constraints all deferred;
insert into public.order_items(order_id,product_id,quantity,unit_price,notes) select order_id,product_id,1,0,'Extra' from print_context;
set constraints all immediate;
do $$ declare j public.print_jobs; begin
 select * into j from public.print_jobs where order_id=(select order_id from print_context) and additional;
 if j.id is null or jsonb_array_length(j.snapshot->'items')<>1 or j.snapshot->'items'->0->>'notes'<>'Extra' then raise exception 'Additional is not a delta'; end if;
 if (select snapshot->'items'->0->>'quantity' from public.print_jobs where id=(select job_id from print_context))<>'2' then raise exception 'Original snapshot changed'; end if;
end $$;
set local role authenticated;
do $$ declare ctx print_context; copy uuid; claim jsonb; begin
 select * into ctx from print_context;
 copy:=public.request_print(ctx.request_id,null,null,ctx.job_id,'kitchen');
 if copy<>public.request_print(ctx.request_id,null,null,ctx.job_id,'kitchen') then raise exception 'Duplicate reprint request'; end if;
 if not exists(select 1 from public.print_jobs where id=copy and reprint and original_job_id=ctx.job_id) then raise exception 'Unmarked reprint'; end if;
 claim:=public.claim_print_job(gen_random_uuid(),'browser');
 perform public.finish_print_job((claim->>'id')::uuid,(claim->>'owner_id')::uuid,(claim->>'claim_token')::uuid,'sent');
 begin perform public.finish_print_job((claim->>'id')::uuid,(claim->>'owner_id')::uuid,(claim->>'claim_token')::uuid,'failed'); raise exception 'Sent result mutated'; exception when check_violation then null; end;
 begin update public.print_devices set driver='file'; if found then raise exception 'Kitchen changed device'; end if; exception when insufficient_privilege then null; end;
 begin update public.print_jobs set status='pending'; raise exception 'Direct job mutation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
-- File processing is service-only; processing interrupted by DB restart becomes uncertain.
update public.order_items set status='ready' where order_id=(select order_id from print_context);
update public.restaurant_settings set enabled_payment_methods=array['cash']::public.payment_method[] where id;
update public.print_destinations set receipt_timing='on_payment' where name='cashier';
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='cashier' and is_active limit 1),true);
set local role authenticated;
do $$ declare ctx print_context; total bigint; lines jsonb; begin
 select * into ctx from print_context;
 select total_amount into total from public.orders where id=ctx.order_id;
 lines:=jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',total,'original_amount',total));
 perform public.record_order_payments(ctx.order_id,ctx.request_id,lines);
 perform public.record_order_payments(ctx.order_id,ctx.request_id,lines);
 if (select count(*) from public.print_jobs where order_id=ctx.order_id and kind='receipt' and not reprint)<>1 then raise exception 'Payment receipt duplicated or absent'; end if;
 if (select jsonb_array_length(snapshot->'payments') from public.print_jobs where order_id=ctx.order_id and kind='receipt' and not reprint)<>1 then raise exception 'Receipt lost payment snapshot'; end if;
end $$;
reset role;
update public.print_jobs set status='sent' where status='pending';
select set_config('request.jwt.claim.sub',(select kitchen_id::text from print_context),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.print_jobs where kind='receipt') then raise exception 'Kitchen read receipt payments'; end if;
 if exists(select 1 from public.print_jobs where kind='kitchen' and snapshot ? 'payments') then raise exception 'Kitchen snapshot leaked payment ledger'; end if;
 begin perform public.request_print(gen_random_uuid(),'receipt',(select order_id from print_context)); raise exception 'Kitchen requested payment receipt'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.print_devices set driver='file';
select set_config('request.jwt.claim.sub',(select admin_id::text from print_context),true);
set local role authenticated;
select public.request_print(gen_random_uuid(),'test',null,null,'cashier');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$ declare j jsonb; begin j:=public.claim_print_job(gen_random_uuid(),'file'); if j is null then raise exception 'File not claimable'; end if; end $$;
reset role;
update public.print_processor_lease set expires_at='-infinity';
set local role service_role;
do $$ begin if public.claim_print_job(gen_random_uuid(),'file') is not null then raise exception 'Expired claim resent'; end if; end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.print_jobs; raise exception 'Anonymous queue access'; exception when insufficient_privilege then null; end;
 begin perform public.request_print(gen_random_uuid(),'test'); raise exception 'Anonymous print request'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
