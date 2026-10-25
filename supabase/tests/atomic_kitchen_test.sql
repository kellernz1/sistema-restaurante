begin;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;
create temporary table kitchen_batch_context(order_id uuid, kitchen_id uuid, request_id uuid, fail_item uuid);
grant all on kitchen_batch_context to authenticated;
insert into public.orders(order_type,source,customer_name,customer_phone,status)
 values('pickup','waiter','Kitchen batch test','+595981123456','open');
insert into kitchen_batch_context select id,(select id from public.profiles where role='kitchen' and is_active limit 1),gen_random_uuid(),null from public.orders where customer_name='Kitchen batch test';
insert into public.order_items(order_id,product_id,quantity,unit_price)
 select c.order_id,p.id,1,0 from kitchen_batch_context c cross join (select id from public.products where is_active limit 1) p cross join generate_series(1,3);
update kitchen_batch_context set fail_item=(select id from public.order_items where order_id=kitchen_batch_context.order_id order by id desc limit 1);
create function pg_temp.fail_kitchen_batch() returns trigger language plpgsql as $$
begin
 if new.status='ready' and new.id=(select fail_item from kitchen_batch_context) then raise exception 'Injected failure' using errcode='P0001'; end if;
 return new;
end $$;
create trigger test_fail_kitchen_batch before update on public.order_items for each row execute function pg_temp.fail_kitchen_batch();
select set_config('request.jwt.claim.sub',(select kitchen_id::text from kitchen_batch_context),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare ctx kitchen_batch_context; begin
 select * into ctx from kitchen_batch_context;
 begin perform public.advance_kitchen_order(ctx.order_id,ctx.request_id,'ready'); raise exception 'Failure injection did not run' using errcode='23514'; exception when raise_exception then null; end;
 if exists(select 1 from public.order_items where order_id=ctx.order_id and status<>'pending') then raise exception 'Partial batch survived'; end if;
 begin perform * from public.kitchen_action_submissions; raise exception 'Private ledger readable'; exception when insufficient_privilege then null; end;
end $$;
reset role;
drop trigger test_fail_kitchen_batch on public.order_items;
set local role authenticated;
do $$ declare ctx kitchen_batch_context; result jsonb; begin
 select * into ctx from kitchen_batch_context;
 result:=public.advance_kitchen_order(ctx.order_id,ctx.request_id,'start');
 if exists(select 1 from public.order_items where order_id=ctx.order_id and status<>'preparing') then raise exception 'Start incomplete'; end if;
 if result<>public.advance_kitchen_order(ctx.order_id,ctx.request_id,'start') then raise exception 'Retry response changed'; end if;
 begin perform public.advance_kitchen_order(ctx.order_id,ctx.request_id,'ready'); raise exception 'Changed action accepted'; exception when invalid_parameter_value then null; end;
 perform public.advance_kitchen_order(ctx.order_id,gen_random_uuid(),'ready');
 if exists(select 1 from public.order_items where order_id=ctx.order_id and status<>'ready') then raise exception 'Ready incomplete'; end if;
 if (select status from public.orders where id=ctx.order_id)<>'ready' then raise exception 'Aggregate status incorrect'; end if;
 -- A retry of start must never regress ready items.
 perform public.advance_kitchen_order(ctx.order_id,ctx.request_id,'start');
 if exists(select 1 from public.order_items where order_id=ctx.order_id and status<>'ready') then raise exception 'Retry regressed items'; end if;
end $$;
reset role;
update public.orders set status='cancelled',cancel_reason='Test' where id=(select order_id from kitchen_batch_context);
set local role authenticated;
do $$ begin
 begin perform public.advance_kitchen_order((select order_id from kitchen_batch_context),gen_random_uuid(),'ready'); raise exception 'Cancelled order accepted'; exception when check_violation then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='cashier' and is_active limit 1),true);
set local role authenticated;
do $$ begin
 begin perform public.advance_kitchen_order((select order_id from kitchen_batch_context),gen_random_uuid(),'start'); raise exception 'Cashier allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set is_active=false where id=(select kitchen_id from kitchen_batch_context);
select set_config('request.jwt.claim.sub',(select kitchen_id::text from kitchen_batch_context),true);
set local role authenticated;
do $$ begin
 begin perform public.advance_kitchen_order((select order_id from kitchen_batch_context),gen_random_uuid(),'start'); raise exception 'Inactive kitchen allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.advance_kitchen_order(gen_random_uuid(),gen_random_uuid(),'start'); raise exception 'Anonymous allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
