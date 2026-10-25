begin;
update public.cash_session_policy set single_open_session=false where id;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;
create temporary table cash_test_context(cashier uuid,admin uuid,other uuid,product uuid,session_id uuid,second_session uuid,paid_order uuid,late_order uuid,pay_request uuid,close_request uuid,rate_id uuid,base_total bigint,day date,print_job uuid);
grant all on cash_test_context to authenticated,service_role;
insert into cash_test_context(cashier,admin,other,pay_request,close_request) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,raw_user_meta_data)
 select cashier,'__cash_a_'||cashier||'@test.local','{"full_name":"Cash A"}'::jsonb from cash_test_context union all
 select admin,'__cash_admin_'||admin||'@test.local','{"full_name":"Cash admin"}'::jsonb from cash_test_context union all
 select other,'__cash_b_'||other||'@test.local','{"full_name":"Cash B"}'::jsonb from cash_test_context;
update public.profiles set role='cashier',is_active=true where id in(select cashier from cash_test_context union select other from cash_test_context);
update public.profiles set role='admin',is_active=true where id=(select admin from cash_test_context);
insert into public.categories(name) values('__cash_sessions__');
with p as(insert into public.products(category_id,name,price) select id,'__cash_sessions__',22000 from public.categories where name='__cash_sessions__' returning id) update cash_test_context set product=(select id from p);
update public.cash_session_policy set require_open_session=true,blind_count=true where id;
update public.restaurant_settings set is_accepting_orders=true,counter_payment_timing='at_order',enabled_payment_methods=array['cash','pix','card','transfer']::public.payment_method[],business_timezone='America/Asuncion',business_day_start='05:00' where id;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select admin::text from cash_test_context),true);
set local role authenticated;
update cash_test_context set rate_id=public.set_exchange_rate('1400','half_real'),base_total=(public.cash_day_report()->'payments'->>'total')::bigint,day=(public.cash_day_report()->>'day')::date;
-- Different operators may have sessions at the same time.
select public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":20000}');
reset role;
select set_config('request.jwt.claim.sub',(select cashier::text from cash_test_context),true);
set local role authenticated;
do $$ declare c cash_test_context;result jsonb;again jsonb;request uuid:=gen_random_uuid();payload jsonb;lines jsonb;before_count bigint;begin
 select * into c from cash_test_context;
 payload:=jsonb_build_object('name','Session test','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',2)));
 lines:=jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',20000,'original_amount',25000),jsonb_build_object('method','pix','currency','BRL','amount_pyg',24000,'original_amount',1750,'rate_id',c.rate_id));
 select count(*) into before_count from public.orders;
 begin perform public.create_counter_order(c.pay_request,payload,lines);raise exception 'Counter paid without open session' using errcode='23514';exception when raise_exception then null;end;
 if (select count(*) from public.orders)<>before_count then raise exception 'Missing-session counter creation did not roll back';end if;
 result:=public.cash_session_command(request,'open','{"opening_amount":100000}');
 again:=public.cash_session_command(request,'open','{"opening_amount":100000}');if result<>again then raise exception 'Opening retry changed';end if;
 update cash_test_context set session_id=(result->>'session_id')::uuid;
 begin perform public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');raise exception 'Duplicate operator session';exception when check_violation then null;end;
 if public.cash_session_report((result->>'session_id')::uuid) ? 'expected' then raise exception 'Blind count leaked expected';end if;
 begin perform public.cash_session_report((select id from public.cash_sessions where operator_id=c.admin limit 1));raise exception 'Other session report exposed';exception when insufficient_privilege then null;end;
 result:=public.create_counter_order(c.pay_request,payload,lines);
 update cash_test_context set paid_order=(result->'order'->>'id')::uuid;
 if exists(select 1 from public.payments where order_id=(result->'order'->>'id')::uuid and cash_session_id is distinct from (select session_id from cash_test_context)) then raise exception 'Payment session binding failed';end if;
 if (select sum(change_pyg) from public.payments where order_id=(result->'order'->>'id')::uuid)<>5000 then raise exception 'Change altered';end if;
 if (select sum(rounding_adjustment_pyg) from public.payments where order_id=(result->'order'->>'id')::uuid)<>500 then raise exception 'FX rounding lost';end if;
end $$;
reset role;
update public.restaurant_settings set counter_payment_timing='at_end' where id;
do $$ declare target uuid;begin
 insert into public.orders(order_type,source,status,customer_name,customer_phone) values('pickup','waiter','pending_confirmation','__cash_cancelled__','+595981999905') returning id into target;
 insert into public.order_items(order_id,product_id,quantity,unit_price) select target,product,1,0 from cash_test_context;
 update public.orders set status='cancelled',cancel_reason='Refused test' where id=target;
end $$;
set local role authenticated;
do $$ declare c cash_test_context;r jsonb;begin
 select * into c from cash_test_context;
 r:=public.create_counter_order(gen_random_uuid(),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1))), '[]');
 c.late_order:=(r->'order'->>'id')::uuid;
 update cash_test_context set late_order=(r->'order'->>'id')::uuid;
 perform public.cash_session_command(gen_random_uuid(),'movement',jsonb_build_object('session_id',c.session_id,'kind','supply','amount',30000,'reason','Extra float'));
 perform public.cash_session_command(gen_random_uuid(),'movement',jsonb_build_object('session_id',c.session_id,'kind','withdrawal','amount',5000,'reason','Expense'));
 begin perform public.cash_session_command(gen_random_uuid(),'movement',jsonb_build_object('session_id',c.session_id,'kind','withdrawal','amount',1,'reason',' '));raise exception 'Empty movement reason accepted' using errcode='23514';exception when invalid_parameter_value then null;end;
 begin perform public.cash_session_command(gen_random_uuid(),'close',jsonb_build_object('session_id',c.session_id,'counted_amount',144000,'denominations',jsonb_build_array(jsonb_build_object('value',100000,'quantity',1))));raise exception 'Wrong denomination total accepted';exception when check_violation then null;end;
 r:=public.cash_session_command(c.close_request,'close',jsonb_build_object('session_id',c.session_id,'counted_amount',144000,'notes','Shortage recorded'));
 if r->'report'->>'expected'<>'145000' or r->'report'->>'difference'<>'-1000' then raise exception 'Expected cash or difference wrong';end if;
 if r->'report'->'payments'->'cancellations'->>'count'<>'1' or r->'report'->'payments'->'cancellations'->>'rejected_count'<>'1' or r->'report'->'payments'->'cancellations'->>'amount'<>'22000' then raise exception 'Cancellation report missing';end if;
 if not exists(select 1 from jsonb_array_elements(r->'report'->'unpaid') x where (x->>'id')::uuid=c.late_order) then raise exception 'Unpaid warning missing';end if;
 if (select status from public.orders where id=c.late_order)<>'open' then raise exception 'Closing session changed unpaid order';end if;
 if public.cash_session_command(c.close_request,'close',jsonb_build_object('session_id',c.session_id,'counted_amount',144000,'notes','Shortage recorded'))<>r then raise exception 'Closing retry changed';end if;
 if (select count(*) from public.cash_session_events where session_id=c.session_id and action='close')<>1 then raise exception 'Duplicate close event';end if;
 if (public.cash_session_report(c.session_id)->'session'->>'status')<>'closed' then raise exception 'Closed report metadata wrong';end if;
 begin perform public.record_order_payments(c.late_order,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',22000,'original_amount',22000)));raise exception 'Payment after close accepted' using errcode='23514';exception when raise_exception then null;end;
 r:=public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');update cash_test_context set second_session=(r->>'session_id')::uuid;
 perform public.record_order_payments(c.late_order,gen_random_uuid(),jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',22000,'original_amount',22000)));
 if not exists(select 1 from public.payments where order_id=c.late_order and cash_session_id=(r->>'session_id')::uuid) then raise exception 'Late payment attributed to launch session';end if;
 perform public.cash_session_command(gen_random_uuid(),'close',jsonb_build_object('session_id',(r->>'session_id')::uuid,'counted_amount',22000));
end $$;
reset role;
do $$ begin
 begin update public.cash_sessions set notes='tampered' where id=(select session_id from cash_test_context);raise exception 'Closed session mutable';exception when check_violation then null;end;
 begin update public.cash_movements set amount=1 where session_id=(select session_id from cash_test_context);raise exception 'Movement mutable';exception when check_violation then null;end;
 begin update public.cash_session_events set result='{}' where session_id=(select session_id from cash_test_context);raise exception 'Event mutable';exception when check_violation then null;end;
end $$;
-- Optional mode leaves unassigned receipts in daily totals, outside shift totals.
update public.cash_session_policy set require_open_session=false where id;
update public.restaurant_settings set counter_payment_timing='at_order' where id;
set local role authenticated;
do $$ declare c cash_test_context;r jsonb;begin
 select * into c from cash_test_context;
 r:=public.create_counter_order(gen_random_uuid(),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1))),jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',22000,'original_amount',22000)));
 if not exists(select 1 from public.payments where order_id=(r->'order'->>'id')::uuid and cash_session_id is null) then raise exception 'Optional unassigned payment missing';end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin::text from cash_test_context),true);
set local role authenticated;
do $$ declare c cash_test_context;r jsonb;print_id uuid;request uuid:=gen_random_uuid();begin
 select * into c from cash_test_context;
 r:=public.cash_day_report(c.day);
 if (r->'payments'->>'total')::bigint<>c.base_total+88000 then raise exception 'Day total excludes unassigned payments or includes movements';end if;
 if (select coalesce(sum((x->>'amount')::bigint),0) from jsonb_array_elements(r->'hours') x)<>(r->'payments'->>'total')::bigint then raise exception 'Hourly total differs';end if;
 print_id:=public.request_cash_session_print(c.session_id,request);
 update cash_test_context set print_job=print_id;
 if print_id<>public.request_cash_session_print(c.session_id,request) then raise exception 'Shift print not idempotent';end if;
 if not exists(select 1 from public.print_jobs where id=print_id and kind='cash_session' and cash_session_id=c.session_id and destination='cashier') then raise exception 'Shift not queued to cashier';end if;
 begin perform public.cash_session_command(gen_random_uuid(),'reopen',jsonb_build_object('session_id',c.session_id,'reason',' '));raise exception 'Reopen without reason accepted' using errcode='23514';exception when invalid_parameter_value then null;end;
 perform public.cash_session_command(gen_random_uuid(),'reopen',jsonb_build_object('session_id',c.session_id,'reason','Recount'));
 if not exists(select 1 from public.cash_session_events where session_id=c.session_id and action='reopen' and actor_id=c.admin and payload->>'reason'='Recount') then raise exception 'Reopen event missing';end if;
 if not exists(select 1 from public.cash_session_events where session_id=c.session_id and action='close' and result->'report'->>'difference'='-1000') then raise exception 'Reopen destroyed prior closure';end if;
end $$;
reset role;
update public.print_jobs set archived_at=now(),reviewed_at=now() where kind<>'cash_session';
update public.print_processor_lease set expires_at='-infinity';
select set_config('request.jwt.claim.sub',(select other::text from cash_test_context),true);
set local role authenticated;
do $$ declare c cash_test_context;begin
 select * into c from cash_test_context;
 if exists(select 1 from public.cash_sessions where id=c.session_id) then raise exception 'Other cashier read session';end if;
 if exists(select 1 from public.print_jobs where cash_session_id=c.session_id) then raise exception 'Other cashier read printed closure';end if;
 if public.claim_print_job(gen_random_uuid(),'browser') is not null then raise exception 'Other cashier acquired closure document';end if;
 begin perform public.decide_print_job(c.print_job,'printed',gen_random_uuid());raise exception 'Other cashier reviewed closure document';exception when insufficient_privilege then null;end;
 begin perform public.cash_session_report(c.session_id);raise exception 'Other cashier fetched report';exception when insufficient_privilege then null;end;
 begin perform public.cash_day_report();raise exception 'Cashier accessed daily report';exception when insufficient_privilege then null;end;
 begin perform public.cash_session_command(gen_random_uuid(),'reopen',jsonb_build_object('session_id',c.session_id,'reason','Unauthorized'));raise exception 'Cashier reopened session';exception when insufficient_privilege then null;end;
 begin insert into public.cash_sessions(operator_id,business_date,timezone,day_start,opening_amount,blind_count) values(c.other,current_date,'America/Asuncion','05:00',0,true);raise exception 'Direct session insert accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.profiles where role='kitchen' and is_active limit 1),true);
set local role authenticated;
do $$ begin
 if exists(select 1 from public.cash_sessions) then raise exception 'Kitchen read cash sessions';end if;
 begin perform public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');raise exception 'Kitchen opened cash';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role anon;
do $$ begin begin perform public.cash_day_report();raise exception 'Anonymous cash report';exception when insufficient_privilege then null;end;end $$;
reset role;
do $$ begin
 if public.business_day_for('2026-10-25 04:59:59 America/Asuncion','America/Asuncion','05:00')<>date '2026-10-24' or public.business_day_for('2026-10-25 05:00 America/Asuncion','America/Asuncion','05:00')<>date '2026-10-25' then raise exception 'Cash business-day boundary';end if;
end $$;
rollback;
