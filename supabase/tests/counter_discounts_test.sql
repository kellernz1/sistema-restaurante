begin;
update public.cash_session_policy set single_open_session=false,require_open_session=true where id;
update public.service_policy set counter_enabled=true where id;
update public.restaurant_settings set is_accepting_orders=true,counter_payment_timing='at_order',enabled_payment_methods=array['cash','card']::public.payment_method[] where id;
create temporary table counter_discount_test(actor uuid,approver uuid,product uuid,draft uuid,request uuid,payload jsonb,discount jsonb,quote jsonb,grant_id uuid,created uuid);
grant all on counter_discount_test to authenticated;
insert into counter_discount_test(actor,approver,draft,request)values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,raw_user_meta_data)
 select actor,actor||'@counter-discount.test','{"full_name":"Discount cashier"}'::jsonb from counter_discount_test union all
 select approver,approver||'@counter-discount.test','{"full_name":"Discount supervisor"}'::jsonb from counter_discount_test;
update public.profiles set role='cashier' where id=(select actor from counter_discount_test);
update public.profiles set role='supervisor' where id=(select approver from counter_discount_test);
update counter_discount_test set product=(select id from public.products where is_active limit 1);
update public.products set price=25005 where id=(select product from counter_discount_test);
insert into public.approver_pins(user_id,pin_hash)select approver,extensions.crypt('4321',extensions.gen_salt('bf',4))from counter_discount_test;
update counter_discount_test set payload=jsonb_build_object('name','Counter discount','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',2,'notes','Sem cebola'))),discount='{"mode":"percent","value":1000,"reason":"Test discount"}';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select actor::text from counter_discount_test),true);
set local role authenticated;
select public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');
update counter_discount_test set quote=public.counter_discount_quote(draft,payload,discount);
do $$declare c counter_discount_test;r jsonb;begin
 select * into c from counter_discount_test;
 if(c.quote->>'gross')::bigint<>50010 or(c.quote->>'discount')::bigint<>5001 or(c.quote->>'total')::bigint<>45009 or not(c.quote->>'requires_approval')::boolean then raise exception 'Incorrect server-priced discount';end if;
 begin perform public.create_counter_order(c.request,c.payload||jsonb_build_object('discount',c.discount||jsonb_build_object('draft_id',c.draft,'binding',c.quote->>'binding','authorization',null)),'[]');raise exception 'Missing approval accepted';exception when insufficient_privilege then null;end;
 r:=public.request_counter_discount_approval(gen_random_uuid(),c.approver,'4321',c.draft,c.payload,c.discount,c.quote->>'binding');
 if not(r->>'ok')::boolean then raise exception 'Counter approval rejected';end if;
 update counter_discount_test set grant_id=(r->>'authorization')::uuid;
end $$;
do $$declare c counter_discount_test;p jsonb;n bigint;begin
 select * into c from counter_discount_test;
 p:=c.payload||jsonb_build_object('discount',c.discount||jsonb_build_object('draft_id',c.draft,'binding',c.quote->>'binding','authorization',c.grant_id));
 select count(*)into n from public.orders;
 begin perform public.create_counter_order(c.request,p,jsonb_build_array(jsonb_build_object('method','cash','currency','PYG','amount_pyg',1,'original_amount',1)));raise exception 'Underpaid discounted order created' using errcode='23505';exception when check_violation then null;end;
 if(select count(*)from public.orders)<>n then raise exception 'Order survived failed payment';end if;
 begin perform public.create_counter_order(c.request,jsonb_set(p,'{items,0,quantity}','3'),'[]');raise exception 'Changed cart approved' using errcode='23505';exception when check_violation then null;end;
 begin perform public.create_counter_order(c.request,jsonb_set(p,'{discount,value}','2000'),'[]');raise exception 'Changed discount approved' using errcode='23505';exception when check_violation then null;end;
end $$;
reset role;
do $$begin
 if exists(select 1 from public.operation_authorizations where id=(select grant_id from counter_discount_test)and consumed_at is not null)then raise exception 'Failed creation consumed approval';end if;
 if exists(select 1 from public.audit_events where action='discount' and actor_id=(select actor from counter_discount_test))then raise exception 'Failed creation left financial audit';end if;
end $$;
update public.products set price=25006 where id=(select product from counter_discount_test);
set local role authenticated;
do $$declare c counter_discount_test;begin
 select *into c from counter_discount_test;
 begin perform public.create_counter_order(c.request,c.payload||jsonb_build_object('discount',c.discount||jsonb_build_object('draft_id',c.draft,'binding',c.quote->>'binding','authorization',c.grant_id)),'[]');raise exception 'Changed price retained approval' using errcode='23505';exception when check_violation then null;end;
end $$;
reset role;
update public.products set price=25005 where id=(select product from counter_discount_test);
set local role authenticated;
do $$declare c counter_discount_test;p jsonb;lines jsonb;r jsonb;again jsonb;begin
 select * into c from counter_discount_test;
 p:=c.payload||jsonb_build_object('discount',c.discount||jsonb_build_object('draft_id',c.draft,'binding',c.quote->>'binding','authorization',c.grant_id));
 lines:='[{"method":"card","currency":"PYG","amount_pyg":20000,"original_amount":20000},{"method":"cash","currency":"PYG","amount_pyg":25009,"original_amount":30000}]';
 r:=public.create_counter_order(c.request,p,lines);again:=public.create_counter_order(c.request,p,lines);
 if r<>again or(r->'order'->>'total_amount')::bigint<>45009 or r->'order'->>'payment_status'<>'paid' then raise exception 'Discount creation/retry failed';end if;
 update counter_discount_test set created=(r->'order'->>'id')::uuid;
 if(select sum(equivalent_pyg-change_pyg)from public.payments where order_id=(r->'order'->>'id')::uuid)<>45009 then raise exception 'Ledger mismatch';end if;
 if(select sum(change_pyg)from public.payments where order_id=(r->'order'->>'id')::uuid)<>4991 then raise exception 'Cash change mismatch';end if;
 begin perform public.create_counter_order(gen_random_uuid(),p,lines);raise exception 'Grant reused for another order' using errcode='23514';exception when insufficient_privilege or unique_violation then null;end;
end $$;
reset role;
do $$begin
 if(select count(*)from public.audit_events where action='discount' and target_id=(select created from counter_discount_test))<>1 then raise exception 'Financial audit duplicated/missing';end if;
 if exists(select 1 from public.security_action_context)then raise exception 'Private action context leaked';end if;
end $$;
-- Quotes have no write side effects; expired grants cannot create anything.
update counter_discount_test set draft=gen_random_uuid(),request=gen_random_uuid();
set local role authenticated;
update counter_discount_test set quote=public.counter_discount_quote(draft,payload,discount);
update counter_discount_test set grant_id=(public.request_counter_discount_approval(gen_random_uuid(),approver,'4321',draft,payload,discount,quote->>'binding')->>'authorization')::uuid;
reset role;
update public.operation_authorizations set expires_at=clock_timestamp()-interval '1 second' where id=(select grant_id from counter_discount_test);
set local role authenticated;
do $$declare c counter_discount_test;begin
 select *into c from counter_discount_test;
 begin perform public.create_counter_order(c.request,c.payload||jsonb_build_object('discount',c.discount||jsonb_build_object('draft_id',c.draft,'binding',c.quote->>'binding','authorization',c.grant_id)),'[]');raise exception 'Expired grant accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
-- Admin authority and a full discount: no fictitious payment, same kitchen/receipt snapshot.
update public.profiles set role='admin' where id=(select approver from counter_discount_test);
select set_config('request.jwt.claim.sub',(select approver::text from counter_discount_test),true);
set local role authenticated;
do $$declare c counter_discount_test;q jsonb;r jsonb;d jsonb:='{"mode":"percent","value":10000,"reason":"Courtesy"}';id uuid:=gen_random_uuid();begin
 select *into c from counter_discount_test;q:=public.counter_discount_quote(id,c.payload,d);
 r:=public.create_counter_order(gen_random_uuid(),c.payload||jsonb_build_object('discount',d||jsonb_build_object('draft_id',id,'binding',q->>'binding','authorization',null)),'[]');
 if(r->'order'->>'total_amount')::bigint<>0 or r->'order'->>'payment_status'<>'paid' then raise exception 'Free counter order failed';end if;
 if exists(select 1 from public.payments where order_id=(r->'order'->>'id')::uuid)then raise exception 'Fake payment recorded';end if;
end $$;
reset role;
update public.restaurant_settings set counter_payment_timing='at_end' where id;
set local role authenticated;
do $$declare c counter_discount_test;q jsonb;r jsonb;id uuid:=gen_random_uuid();begin
 select *into c from counter_discount_test;q:=public.counter_discount_quote(id,c.payload,c.discount);
 r:=public.create_counter_order(gen_random_uuid(),c.payload||jsonb_build_object('discount',c.discount||jsonb_build_object('draft_id',id,'binding',q->>'binding','authorization',null)),'[]');
 if(r->'order'->>'total_amount')::bigint<>45009 or r->'order'->>'payment_status'<>'pending' then raise exception 'Pay-at-end discount failed';end if;
 if exists(select 1 from public.payments where order_id=(r->'order'->>'id')::uuid)then raise exception 'Pay-at-end created payment';end if;
end $$;
reset role;
set constraints all immediate;
do $$begin
 if not exists(select 1 from public.print_jobs where order_id=(select created from counter_discount_test)and kind='kitchen'and(snapshot->>'discount')::bigint=5001 and(snapshot->>'total')::bigint=45009)then raise exception 'Kitchen snapshot missing discounted total';end if;
end $$;
do $$begin
 if has_function_privilege('authenticated','public.issue_operation_approval(uuid,uuid,text,jsonb,text)','EXECUTE')or has_table_privilege('authenticated','public.counter_discount_claims','INSERT')then raise exception 'Private approval helper/claim exposed';end if;
end $$;
rollback;
