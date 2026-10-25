begin;
-- Existing ordering/payment scenarios use the supported optional-session policy; mandatory binding is covered by cash_sessions_test.
update public.cash_session_policy set require_open_session=false where id;
create temporary table counter_test_context(cashier_id uuid,kitchen_id uuid,product_id uuid,order_id uuid,request_id uuid);
grant all on counter_test_context to authenticated,service_role;
insert into public.categories(name) values('__counter_test__');
with p as(insert into public.products(category_id,name,price) select id,'__counter_test__',22000 from public.categories where name='__counter_test__' returning id)
insert into counter_test_context(cashier_id,kitchen_id,product_id,request_id) select (select id from public.profiles where role='cashier' and is_active limit 1),(select id from public.profiles where role='kitchen' and is_active limit 1),id,gen_random_uuid() from p;
update public.restaurant_settings set is_accepting_orders=true,counter_payment_timing='at_order',enabled_payment_methods=array['cash','card']::public.payment_method[],business_timezone='America/Asuncion',business_day_start='05:00' where id;
do $$ begin
 if public.business_day_for('2026-10-25 00:30 America/Asuncion','America/Asuncion','05:00')<>date '2026-10-24' then raise exception 'Midnight rollover incorrect'; end if;
 if public.business_day_for('2026-10-25 04:59:59 America/Asuncion','America/Asuncion','05:00')<>date '2026-10-24' then raise exception 'Before cutoff incorrect'; end if;
 if public.business_day_for('2026-10-25 05:00 America/Asuncion','America/Asuncion','05:00')<>date '2026-10-25' then raise exception 'Business day rollover incorrect'; end if;
 if public.next_counter_ticket('9998-01-01')<>1 or public.next_counter_ticket('9998-01-01')<>2 or public.next_counter_ticket('9998-01-02')<>1 then raise exception 'Daily sequence reset failed'; end if;
end $$;
select set_config('request.jwt.claim.sub',(select cashier_id::text from counter_test_context),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
do $$ declare ctx counter_test_context; payload jsonb; result jsonb; again jsonb; before_count integer; before_ticket integer; lines jsonb; begin
 select * into ctx from counter_test_context;
 payload:=jsonb_build_object('name',E'  Ana\n  María ','items',jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',2,'notes','Sem cebola')));
 select count(*) into before_count from public.orders;
 begin perform public.create_counter_order(gen_random_uuid(),payload,jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',1,'original_amount',1))); raise exception 'Underpayment released kitchen order'; exception when check_violation then null; end;
 if (select count(*) from public.orders)<>before_count then raise exception 'Atomic rollback failed'; end if;
 lines:=jsonb_build_array(jsonb_build_object('method','card','currency','PYG','amount_pyg',20000,'original_amount',20000),jsonb_build_object('method','cash','currency','PYG','amount_pyg',24000,'original_amount',30000));
 result:=public.create_counter_order(ctx.request_id,payload,lines);
 if result->'order'->>'status'<>'open' or result->'order'->>'payment_status'<>'paid' or result->'order'->>'counter_name'<>'Ana María' or (result->'order'->>'counter_ticket')::integer<1 then raise exception 'Atomic counter creation failed'; end if;
 update counter_test_context set order_id=(result->'order'->>'id')::uuid;
 again:=public.create_counter_order(ctx.request_id,payload,lines);
 if result<>again then raise exception 'Counter idempotency response changed'; end if;
 begin perform public.create_counter_order(ctx.request_id,payload||jsonb_build_object('name','Other'),lines); raise exception 'Changed request accepted'; exception when invalid_parameter_value then null; end;
 if (select count(*) from public.payments where order_id=(result->'order'->>'id')::uuid)<>2 then raise exception 'Duplicate payments'; end if;
 begin perform public.create_customer_order(jsonb_build_object('counter_entry',true)); raise exception 'Authenticated direct pricing RPC accepted'; exception when insufficient_privilege then null; end;
 begin perform public.create_counter_order(gen_random_uuid(),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',1,'unit_price',0))),lines); raise exception 'Direct RPC accepted supplied price'; exception when invalid_parameter_value then null; end;
 begin perform public.advance_hub_order((result->'order'->>'id')::uuid,'ready'); raise exception 'Legacy transition bypassed counter lifecycle'; exception when check_violation then null; end;
 begin perform public.deliver_counter_order((result->'order'->>'id')::uuid); raise exception 'Unready order handed off'; exception when check_violation then null; end;
 begin perform * from public.counter_daily_numbers; raise exception 'Cashier read ticket allocator'; exception when insufficient_privilege then null; end;
 begin perform * from public.counter_order_submissions; raise exception 'Cashier read request ledger'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.order_items set status='ready' where order_id=(select order_id from counter_test_context);
do $$ begin
 if not exists(select 1 from public.orders where id=(select order_id from counter_test_context) and status='ready' and counter_ready_at is not null) then raise exception 'Ready timestamp missing'; end if;
 begin update public.orders set total_amount=total_amount+1 where id=(select order_id from counter_test_context); raise exception 'Paid counter total changed'; exception when check_violation then null; end;
end $$;
set local role authenticated;
select public.deliver_counter_order(order_id) from counter_test_context;
select public.deliver_counter_order(order_id) from counter_test_context;
reset role;
update public.restaurant_settings set counter_payment_timing='at_end' where id;
set local role authenticated;
do $$ declare result jsonb; o uuid; begin
 result:=public.create_counter_order(gen_random_uuid(),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',(select product_id from counter_test_context),'quantity',1))),'[]');
 o:=(result->'order'->>'id')::uuid;
 if result->'order'->>'payment_status'<>'pending' or result->'order'->>'status'<>'open' then raise exception 'Pay-at-end did not release preparation'; end if;
 update counter_test_context set order_id=o;
 begin perform public.deliver_counter_order(o); raise exception 'Unpaid delivery accepted'; exception when check_violation then null; end;
end $$;
reset role;
update public.order_items set status='ready' where order_id=(select order_id from counter_test_context);
set local role authenticated;
select public.record_order_payments(order_id,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',22000,'original_amount',22000))) from counter_test_context;
select public.deliver_counter_order(order_id) from counter_test_context;
reset role;
select set_config('request.jwt.claim.sub',(select kitchen_id::text from counter_test_context),true);
set local role authenticated;
do $$ begin
 begin perform public.create_counter_order(gen_random_uuid(),'{}','[]'); raise exception 'Kitchen created counter order'; exception when insufficient_privilege then null; end;
 begin perform public.deliver_counter_order((select order_id from counter_test_context)); raise exception 'Kitchen delivered counter order'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.create_counter_order(gen_random_uuid(),'{}','[]'); raise exception 'Anonymous counter creation'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set is_active=false where id=(select cashier_id from counter_test_context);
select set_config('request.jwt.claim.sub',(select cashier_id::text from counter_test_context),true);
set local role authenticated;
do $$ begin
 begin perform public.create_counter_order(gen_random_uuid(),'{}','[]'); raise exception 'Blocked cashier created order'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
