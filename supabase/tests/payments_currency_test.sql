-- Transactional acceptance: no fixture or financial history survives this suite.
begin;
create temporary table payment_test_context(admin_id uuid,cashier_id uuid,waiter_id uuid,product_id uuid,order_id uuid,rate_id uuid,request_id uuid);
grant all on payment_test_context to authenticated,service_role;
insert into payment_test_context(admin_id,cashier_id,waiter_id,request_id)
 select (select id from public.profiles where role='admin' and is_active limit 1),
 (select id from public.profiles where role='cashier' and is_active limit 1),
 (select id from public.profiles where role='waiter' and is_active limit 1),gen_random_uuid();
insert into public.categories(name) values('__payments_currency__');
with p as (insert into public.products(category_id,name,price) select id,'__payments_currency__',25000 from public.categories where name='__payments_currency__' returning id)
 update payment_test_context set product_id=(select id from p);
update public.restaurant_settings set enabled_payment_methods=array['cash','transfer','card','pix']::public.payment_method[],pickup_enabled=true,is_accepting_orders=true,delivery_fee_mode='fixed';

do $$ begin
 if (select cashier_id is null or admin_id is null or waiter_id is null from payment_test_context) then raise exception 'Seed staff accounts before running SQL acceptance'; end if;
 if round(12.49)::bigint<>12 or round(12.50)::bigint<>13 then raise exception 'Migration rounding failed'; end if;
 if (select data_type from information_schema.columns where table_schema='public' and table_name='products' and column_name='price')<>'bigint' then raise exception 'Price is not bigint'; end if;
 if public.brl_cents_for(25000,1400,'none')<>1786 or public.brl_cents_for(25201,1400,'half_real')<>1850 or public.brl_cents_for(25201,1400,'whole_real')<>1900 then raise exception 'Conversion rounding failed'; end if;
 begin perform public.require_pyg('1.5'); raise exception 'Fraction accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.require_pyg('1000000000001'); raise exception 'Unsafe amount accepted'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claim.sub',(select admin_id::text from payment_test_context),true);
set local role authenticated;
update payment_test_context set rate_id=public.set_exchange_rate('1400.12345678','half_real');
do $$ begin
 begin update public.exchange_rates set rate=1; raise exception 'Rate update accepted'; exception when insufficient_privilege then null; end;
 begin delete from public.exchange_rates; raise exception 'Rate deletion accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 begin update public.exchange_rates set rate=1 where id=(select rate_id from payment_test_context); raise exception 'Owner changed rate history'; exception when insufficient_privilege then null; end;
end $$;
-- Create through the existing shared cashier service (including idempotency).
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$ declare result public.orders; ctx payment_test_context; begin
 select * into ctx from payment_test_context;
 result:=public.create_cashier_order(ctx.cashier_id,gen_random_uuid(),jsonb_build_object('order_type','pickup','customer_name','Payment test','customer_phone','+595981999987','payment_method','transfer','items',jsonb_build_array(jsonb_build_object('product_id',ctx.product_id,'quantity',2))));
 if result.total_amount<>50000 then raise exception 'Integer order subtotal failed'; end if;
 update payment_test_context set order_id=result.id;
end $$;
reset role;
update public.order_items set status='ready' where order_id=(select order_id from payment_test_context);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select cashier_id::text from payment_test_context),true);
set local role authenticated;
do $$ declare ctx payment_test_context; result jsonb; repeated jsonb; lines jsonb; begin
 select * into ctx from payment_test_context;
 begin perform public.set_exchange_rate('1400','none'); raise exception 'Cashier changed rate'; exception when insufficient_privilege then null; end;
 begin update public.orders set status='closed',payment_status='paid' where id=ctx.order_id; raise exception 'Ledger bypass accepted'; exception when insufficient_privilege then null; end;
 lines:=jsonb_build_array(jsonb_build_object('method','transfer','currency','PYG','amount_pyg',20000,'original_amount',20000));
 result:=public.record_order_payments(ctx.order_id,ctx.request_id,lines);
 if result->>'remaining_pyg'<>'30000' or result->'order'->>'payment_status'<>'pending' then raise exception 'Partial payment failed'; end if;
 repeated:=public.record_order_payments(ctx.order_id,ctx.request_id,lines);
 if repeated<>result then raise exception 'Idempotency response changed'; end if;
 begin perform public.record_order_payments(ctx.order_id,ctx.request_id,lines||lines); raise exception 'Request payload reuse accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.record_order_payments(ctx.order_id,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','card','currency','PYG','amount_pyg',10000,'original_amount',10001))); raise exception 'Noncash excess accepted'; exception when check_violation then null; end;
 lines:=jsonb_build_array(
  jsonb_build_object('method','pix','currency','BRL','amount_pyg',20000,'original_amount',public.brl_cents_for(20000,1400.12345678,'half_real'),'rate_id',ctx.rate_id),
  jsonb_build_object('method','cash','currency','PYG','amount_pyg',10000,'original_amount',15000));
 result:=public.record_order_payments(ctx.order_id,gen_random_uuid(),lines);
 if result->'order'->>'status'<>'closed' or result->>'remaining_pyg'<>'0' then raise exception 'Split close failed'; end if;
 if (select count(*) from public.payments where order_id=ctx.order_id)<>3 then raise exception 'Duplicate payment'; end if;
 if (select sum(change_pyg) from public.payments where order_id=ctx.order_id)<>5000 then raise exception 'Cash change failed'; end if;
 if (select sum(equivalent_pyg-change_pyg) from public.payments where order_id=ctx.order_id)<>50000 then raise exception 'Net settlement mismatch'; end if;
 begin update public.payments set equivalent_pyg=0 where order_id=ctx.order_id; raise exception 'Payment mutated'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from payment_test_context),true);
set local role authenticated;
select public.set_exchange_rate('1500','whole_real');
do $$ begin
 if (public.payment_configuration()->'rate'->>'rate')::numeric<>1500 then raise exception 'New rate not current'; end if;
 if not exists(select 1 from public.payments where order_id=(select order_id from payment_test_context) and exchange_rate=1400.12345678) then raise exception 'Historical snapshot changed'; end if;
end $$;
reset role;
-- Waiter/blocked/anonymous callers cannot collect or inspect financial records.
-- A second order covers disabled methods, stale rates and cash in BRL.
with o as (insert into public.orders(order_type,source,customer_name,customer_phone,status) values('pickup','waiter','Cash BRL test','+595981999988','open') returning id)
 update payment_test_context set order_id=(select id from o);
insert into public.order_items(order_id,product_id,quantity,unit_price) select order_id,product_id,1,0 from payment_test_context;
update public.order_items set status='ready' where order_id=(select order_id from payment_test_context);
update public.restaurant_settings set enabled_payment_methods=array['cash','transfer','pix']::public.payment_method[];
select set_config('request.jwt.claim.sub',(select cashier_id::text from payment_test_context),true);
set local role authenticated;
do $$ declare ctx payment_test_context; current_rate uuid; result jsonb; begin
 select * into ctx from payment_test_context;
 begin perform public.record_order_payments(ctx.order_id,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','card','currency','PYG','amount_pyg',25000,'original_amount',25000))); raise exception 'Disabled card accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.record_order_payments(ctx.order_id,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','pix','currency','BRL','amount_pyg',25000,'original_amount',1800,'rate_id',ctx.rate_id))); raise exception 'Stale rate accepted'; exception when check_violation then null; end;
 current_rate:=(public.payment_configuration()->'rate'->>'id')::uuid;
 result:=public.record_order_payments(ctx.order_id,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','cash','currency','BRL','amount_pyg',25000,'original_amount',2000,'rate_id',current_rate)));
 if result->'order'->>'status'<>'closed' or (select sum(change_pyg) from public.payments where order_id=ctx.order_id)<>5000 then raise exception 'BRL cash change must be in PYG'; end if;
 begin insert into public.payments(order_id) values(ctx.order_id); raise exception 'Direct payment write accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select waiter_id::text from payment_test_context),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.payments) then raise exception 'Waiter read payments'; end if;
 begin perform public.record_order_payments((select order_id from payment_test_context),gen_random_uuid(),'[]'); raise exception 'Waiter collected payment'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.profiles set is_active=false where id=(select cashier_id from payment_test_context);
select set_config('request.jwt.claim.sub',(select cashier_id::text from payment_test_context),true);
set local role authenticated;
do $$ begin
 begin perform public.close_order((select order_id from payment_test_context),'cash'); raise exception 'Blocked cashier closed order'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform * from public.payments; raise exception 'Anonymous payments read'; exception when insufficient_privilege then null; end;
 begin perform public.record_order_payments(gen_random_uuid(),gen_random_uuid(),'[]'); raise exception 'Anonymous collection'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
