begin;
update public.cash_session_policy set single_open_session=false,require_open_session=true,blind_count=false where id;
update public.service_policy set counter_enabled=true where id;
update public.restaurant_settings set is_accepting_orders=true,counter_payment_timing='at_order',enabled_payment_methods=array['cash','pix','card']::public.payment_method[] where id;
create temporary table refund_test(admin uuid,cashier uuid,product uuid,order_id uuid,original_session uuid,session_id uuid,closed_report jsonb,baseline bigint,pix_order uuid,request_id uuid,quote jsonb,grant_id uuid);
grant all on refund_test to authenticated;
insert into refund_test(admin,cashier,request_id)values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,raw_user_meta_data)select admin,admin||'@refund.test','{"full_name":"Refund admin"}'::jsonb from refund_test union all select cashier,cashier||'@refund.test','{"full_name":"Refund cashier"}'::jsonb from refund_test;
update public.profiles set role='admin'where id=(select admin from refund_test);update public.profiles set role='cashier'where id=(select cashier from refund_test);
update refund_test set product=(select id from public.products where is_active limit 1);update public.products set price=50000 where id=(select product from refund_test);
insert into public.approver_pins(user_id,pin_hash)select admin,extensions.crypt('4321',extensions.gen_salt('bf',4))from refund_test;
select set_config('request.jwt.claim.role','authenticated',true);select set_config('request.jwt.claim.sub',(select admin::text from refund_test),true);set local role authenticated;
update refund_test set baseline=(public.cash_day_report()->'payments'->>'total')::bigint;
update refund_test set original_session=(public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":100000}')->>'session_id')::uuid;
do $$declare c refund_test;p jsonb;d jsonb:='{"mode":"amount","value":10000,"reason":"Test discount"}';q jsonb;r jsonb;draft uuid:=gen_random_uuid();begin
 select *into c from refund_test;p:=jsonb_build_object('name','Discount refund','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1)));
 q:=public.counter_discount_quote(draft,p,d);r:=public.create_counter_order(gen_random_uuid(),p||jsonb_build_object('discount',d||jsonb_build_object('draft_id',draft,'binding',q->>'binding','authorization',null)),'[{"method":"cash","currency":"PYG","amount_pyg":40000,"original_amount":50000}]');
 update refund_test set order_id=(r->'order'->>'id')::uuid;
end $$;
select public.cash_session_command(gen_random_uuid(),'close',jsonb_build_object('session_id',original_session,'counted_amount',140000))from refund_test;
update refund_test set closed_report=public.cash_session_report(original_session),session_id=(public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":50000}')->>'session_id')::uuid;
do $$declare c refund_test;q jsonb;op jsonb;r jsonb;request uuid:=gen_random_uuid();begin
 select *into c from refund_test;op:=jsonb_build_object('action','refund','target',c.order_id,'amount',10000,'reason','Partial refund');q:=public.refund_quote(op);
 if(q->>'available')::bigint<>40000 or(q->>'paid')::bigint<>40000 or(q->>'total')::bigint<>40000 then raise exception 'Gross price or tender leaked into refundable limit';end if;
 begin perform public.refund_quote(op||'{"amount":50000}');raise exception 'Undiscounted total refundable'using errcode='23505';exception when check_violation then null;end;
 begin perform public.execute_refund(request,op,q->>'binding',null,false);raise exception 'Manual confirmation bypassed'using errcode='23505';exception when invalid_parameter_value then null;end;
 r:=public.execute_refund(request,op,q->>'binding',null,true);if r<>public.execute_refund(request,op,q->>'binding',null,true)then raise exception 'Refund replay changed';end if;
 begin perform public.execute_refund(gen_random_uuid(),op,q->>'binding',null,true);raise exception 'Stale refund quote reused'using errcode='23505';exception when check_violation then null;end;
 q:=public.refund_quote(op);if(q->>'available')::bigint<>30000 then raise exception 'Prior refund ignored';end if;
 begin perform public.refund_quote(op||'{"amount":40000}');raise exception 'Previous refund returned twice'using errcode='23505';exception when check_violation then null;end;
 op:=jsonb_build_object('action','cancel_refund','target',c.order_id,'reason','Cancel discounted order');q:=public.refund_quote(op);r:=public.execute_refund(gen_random_uuid(),op,q->>'binding',null,true);
 if(r->>'amount')::bigint<>30000 or(select status from public.orders where id=c.order_id)<>'cancelled'then raise exception 'Discounted cancellation/refund failed';end if;
 if(select sum(amount_pyg)from public.refunds where order_id=c.order_id)<>40000 or(select sum(original_amount)from public.refunds where order_id=c.order_id)<>40000 then raise exception 'Refund exceeded net paid discounted amount';end if;
 if(select original_amount from public.payments where order_id=c.order_id)<>50000 then raise exception 'Original payment rewritten';end if;
 if(public.cash_session_report(c.session_id)->>'expected')::bigint is distinct from 10000 then raise exception 'Cash refund not deducted from current session';end if;
 if public.cash_session_report(c.original_session)<>c.closed_report then raise exception 'Old closed session mutated';end if;
 if(public.cash_day_report()->'payments'->>'total')::bigint<>c.baseline then raise exception 'Daily net revenue not reversed';end if;
 begin update public.refunds set reason='tampered';raise exception 'Admin modified refund'using errcode='23505';exception when insufficient_privilege then null;end;
 begin delete from public.refunds;raise exception 'Admin deleted refund'using errcode='23505';exception when insufficient_privilege then null;end;
end $$;
-- Pix: return original cents at the historical rate, never at today's rate.
do $$declare c refund_test;p jsonb;d jsonb:='{"mode":"amount","value":25000,"reason":"Pix discount"}';q jsonb;r jsonb;draft uuid:=gen_random_uuid();rate uuid;op jsonb;begin
 select *into c from refund_test;rate:=public.set_exchange_rate('1400','half_real');p:=jsonb_build_object('name','Pix discounted','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1)));q:=public.counter_discount_quote(draft,p,d);
 r:=public.create_counter_order(gen_random_uuid(),p||jsonb_build_object('discount',d||jsonb_build_object('draft_id',draft,'binding',q->>'binding','authorization',null)),jsonb_build_array(jsonb_build_object('method','pix','currency','BRL','amount_pyg',25000,'original_amount',1800,'rate_id',rate)));
 update refund_test set pix_order=(r->'order'->>'id')::uuid;
 perform public.set_exchange_rate('2000','whole_real');op:=jsonb_build_object('action','refund','target',r->'order'->>'id','amount',10000,'reason','Partial Pix refund');q:=public.refund_quote(op);
 if(q->'lines'->0->>'original')::bigint<>720 or(q->'lines'->0->>'rate')::numeric<>1400 then raise exception 'Pix refund used current rate or wrong cents';end if;
 perform public.execute_refund(gen_random_uuid(),op,q->>'binding',null,true);
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select cashier::text from refund_test),true);set local role authenticated;
select public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');
update refund_test set quote=public.refund_quote(jsonb_build_object('action','cancel_refund','target',pix_order,'reason','Cancel remaining Pix'));
update refund_test set grant_id=(public.request_refund_approval(gen_random_uuid(),admin,'4321',jsonb_build_object('action','cancel_refund','target',pix_order,'reason','Cancel remaining Pix'),quote->>'binding')->>'authorization')::uuid;
reset role;
update public.operation_authorizations set expires_at=clock_timestamp()-interval '1 second'where id=(select grant_id from refund_test);
set local role authenticated;
do $$declare c refund_test;op jsonb;begin
 select *into c from refund_test;op:=jsonb_build_object('action','cancel_refund','target',c.pix_order,'reason','Cancel remaining Pix');
 begin perform public.execute_refund(c.request_id,op,c.quote->>'binding',c.grant_id,true);raise exception 'Expired refund grant accepted'using errcode='23505';exception when insufficient_privilege then null;end;
 if exists(select 1 from public.refunds where order_id=c.pix_order and operator_id=c.cashier)then raise exception 'Rejected grant wrote refund';end if;
end $$;
reset role;
update public.operation_authorizations set expires_at=clock_timestamp()+interval '2 minutes'where id=(select grant_id from refund_test);
set local role authenticated;
do $$declare c refund_test;op jsonb;begin
 select *into c from refund_test;op:=jsonb_build_object('action','cancel_refund','target',c.pix_order,'reason','Cancel remaining Pix');
 begin perform public.execute_refund(c.request_id,op,c.quote->>'binding',null,true);raise exception 'Cashier bypassed refund approval'using errcode='23505';exception when insufficient_privilege then null;end;
 begin perform public.execute_refund(gen_random_uuid(),op||'{"reason":"Changed approved operation"}',c.quote->>'binding',c.grant_id,true);raise exception 'Changed operation accepted refund grant'using errcode='23505';exception when check_violation then null;end;
 perform public.execute_refund(c.request_id,op,c.quote->>'binding',c.grant_id,true);
 perform public.execute_refund(c.request_id,op,c.quote->>'binding',c.grant_id,true);
 if(select sum(amount_pyg)from public.refunds where order_id=c.pix_order)<>25000 or(select sum(original_amount)from public.refunds where order_id=c.pix_order)<>1800 or(select sum(rounding_adjustment_pyg)from public.refunds where order_id=c.pix_order)<>200 then raise exception 'Pix refund totals/cents/rounding drift';end if;
 perform public.cash_session_command(gen_random_uuid(),'close',jsonb_build_object('session_id',(select id from public.cash_sessions where operator_id=c.cashier and status='open'),'counted_amount',0));
 perform public.execute_refund(c.request_id,op,c.quote->>'binding',c.grant_id,true);
end $$;
reset role;
-- Force an audit failure: neither the refund nor cancellation may survive.
select set_config('request.jwt.claim.sub',(select admin::text from refund_test),true);set local role authenticated;
do $$declare c refund_test;p jsonb;r jsonb;begin
 select *into c from refund_test;p:=jsonb_build_object('name','Atomic refund','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1)));
 r:=public.create_counter_order(gen_random_uuid(),p,'[{"method":"card","currency":"PYG","amount_pyg":50000,"original_amount":50000}]');update refund_test set order_id=(r->'order'->>'id')::uuid;
end $$;
reset role;
create function pg_temp.fail_refund_audit()returns trigger language plpgsql as $$begin if new.action='refund'then raise exception 'Injected refund audit failure';end if;return new;end $$;
create trigger refund_test_failure before insert on public.audit_events for each row execute function pg_temp.fail_refund_audit();
set local role authenticated;
do $$declare c refund_test;op jsonb;q jsonb;begin
 select *into c from refund_test;op:=jsonb_build_object('action','cancel_refund','target',c.order_id,'reason','Atomic rollback');q:=public.refund_quote(op);
 begin perform public.execute_refund(gen_random_uuid(),op,q->>'binding',null,true);raise exception 'Missing injected audit error'using errcode='23505';exception when raise_exception then null;end;
 if exists(select 1 from public.refunds where order_id=c.order_id)or(select status from public.orders where id=c.order_id)='cancelled'then raise exception 'Refund/cancellation survived failed audit';end if;
end $$;
reset role;
drop trigger refund_test_failure on public.audit_events;
-- Discount of 100%: cancellation succeeds without inventing a payment or refund.
set local role authenticated;
do $$declare c refund_test;p jsonb;d jsonb:='{"mode":"percent","value":10000,"reason":"Full courtesy"}';draft uuid:=gen_random_uuid();q jsonb;r jsonb;op jsonb;begin
 select *into c from refund_test;p:=jsonb_build_object('name','Free cancellation','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1)));q:=public.counter_discount_quote(draft,p,d);
 r:=public.create_counter_order(gen_random_uuid(),p||jsonb_build_object('discount',d||jsonb_build_object('draft_id',draft,'binding',q->>'binding','authorization',null)),'[]');op:=jsonb_build_object('action','cancel_refund','target',r->'order'->>'id','reason','Cancel free order');q:=public.refund_quote(op);
 if(q->>'available')::bigint<>0 or jsonb_array_length(q->'lines')<>0 then raise exception 'Free order has refundable money';end if;
 perform public.execute_refund(gen_random_uuid(),op,q->>'binding',null,true);
 if exists(select 1 from public.refunds where order_id=(r->'order'->>'id')::uuid)then raise exception 'Fake refund on free order';end if;
end $$;
reset role;
set constraints all immediate;
select set_config('request.jwt.claim.sub',(select admin::text from refund_test),true);
set local role authenticated;
-- Partly paid mixed-method cancellation returns receipts, never the unpaid balance.
do $$declare c refund_test;r jsonb;q jsonb;op jsonb;v_order uuid;begin
 select *into c from refund_test;
 update public.restaurant_settings s set counter_payment_timing='at_end'where s.id;
 r:=public.create_counter_order(gen_random_uuid(),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1))),'[]');v_order:=(r->'order'->>'id')::uuid;
 perform public.record_order_payments(v_order,gen_random_uuid(),'[{"method":"cash","currency":"PYG","amount_pyg":10000,"original_amount":15000},{"method":"card","currency":"PYG","amount_pyg":10000,"original_amount":10000}]');
 op:=jsonb_build_object('action','cancel_refund','target',v_order,'reason','Partly paid cancellation');q:=public.refund_quote(op);
 if(q->>'available')::bigint is distinct from 20000 or jsonb_array_length(q->'lines')<>2 then raise exception 'Unpaid amount refundable or mixed allocation missing';end if;
 perform public.execute_refund(gen_random_uuid(),op,q->>'binding',null,true);
 if(select sum(amount_pyg)from public.refunds where order_id=v_order)is distinct from 20000 then raise exception 'Mixed refund did not balance';end if;
end $$;
reset role;
-- Database boundaries apply even when a client bypasses the staff interface.
do $$declare kitchen uuid;begin
 insert into auth.users(id,email,raw_user_meta_data)values(gen_random_uuid(),'kitchen-refund@test.local','{}')returning id into kitchen;
 update public.profiles set role='kitchen'where id=kitchen;
 perform set_config('request.jwt.claim.sub',kitchen::text,true);
end $$;
set local role authenticated;
do $$begin
 if exists(select 1 from public.refunds)then raise exception 'Kitchen can read financial refunds';end if;
 begin perform public.refund_quote(jsonb_build_object('action','cancel_refund','target',(select order_id from refund_test),'reason','Forbidden'));raise exception 'Kitchen quoted refund'using errcode='23505';exception when insufficient_privilege then null;end;
 begin insert into public.refunds default values;raise exception 'Direct refund insert allowed'using errcode='23505';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if(select count(*)from public.kitchen_cancellations where order_id=(select pix_order from refund_test))<>1 then raise exception 'Cancellation notice missing/duplicated';end if;
 if exists(select 1 from public.security_action_context)then raise exception 'Refund context leaked';end if;
end $$;
rollback;
