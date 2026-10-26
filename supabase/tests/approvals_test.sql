begin;
create temporary table approval_test(product uuid default null,actor uuid,approver uuid,order_id uuid,item_id uuid,quote jsonb,grant_id uuid,request_id uuid);
grant all on approval_test to authenticated;
insert into approval_test(actor,approver,order_id,item_id,quote,grant_id,request_id) values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),null,null,gen_random_uuid());
insert into auth.users(id,email,encrypted_password,raw_user_meta_data)
 select actor,actor||'@approval.test',extensions.crypt('Approval-test-password',extensions.gen_salt('bf',4)),'{"full_name":"Approval cashier"}'::jsonb from approval_test union all
 select approver,approver||'@approval.test',extensions.crypt('Approval-test-password',extensions.gen_salt('bf',4)),'{"full_name":"Approval supervisor"}'::jsonb from approval_test;
update public.profiles set role='cashier' where id=(select actor from approval_test);
update public.profiles set role='supervisor' where id=(select approver from approval_test);
insert into public.orders(id,order_type,source,status,customer_name,customer_phone) select order_id,'pickup','waiter','open','Approval test','+595981123456' from approval_test;
update approval_test set product=(select id from public.products where is_active limit 1);
update public.products set price=25001 where id=(select product from approval_test);
insert into public.order_items(id,order_id,product_id,quantity,unit_price)
 select c.item_id,c.order_id,p.id,1,25001 from approval_test c cross join(select id from public.products where id=(select product from approval_test))p;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select approver::text from approval_test),true);
set local role authenticated;
do $$begin
 if not (public.set_approval_pin('4321','Approval-test-password')->>'ok')::boolean then raise exception 'PIN configuration failed';end if;
 begin update public.audit_events set reason='tampered';raise exception 'Audit update allowed';exception when insufficient_privilege then null;end;
 begin delete from public.audit_events;raise exception 'Audit delete allowed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if exists(select 1 from public.approver_pins where pin_hash='4321' or length(pin_hash)<>60) then raise exception 'Plain PIN stored';end if;
 begin update public.audit_events set reason='owner tampered';raise exception 'Owner audit update allowed';exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub',(select actor::text from approval_test),true);
set local role authenticated;
update approval_test set quote=public.sensitive_quote(jsonb_build_object('action','discount','target',order_id,'mode','percent','value',1000,'reason','Test discount'));
do $$declare c approval_test;r jsonb;begin
 select * into c from approval_test;
 if (c.quote->'operation'->>'amount')::bigint<>2500 or not(c.quote->>'requires_approval')::boolean then raise exception 'Discount rounding/policy failed';end if;
 begin perform public.execute_sensitive_action(c.request_id,jsonb_build_object('action','discount','target',c.order_id,'mode','percent','value',1000,'reason','Test discount'),c.quote->>'binding');raise exception 'Approval bypass';exception when insufficient_privilege then null;end;
 r:=public.request_operation_approval(gen_random_uuid(),c.approver,'4321',jsonb_build_object('action','discount','target',c.order_id,'mode','percent','value',1000,'reason','Test discount'),c.quote->>'binding');
 if not(r->>'ok')::boolean then raise exception 'Valid PIN rejected';end if;
 update approval_test set grant_id=(r->>'authorization')::uuid;
end $$;
reset role;
update public.operation_authorizations set expires_at=clock_timestamp()-interval '1 second' where id=(select grant_id from approval_test);
set local role authenticated;
do $$declare c approval_test;begin
 select * into c from approval_test;
 begin perform public.execute_sensitive_action(gen_random_uuid(),jsonb_build_object('action','discount','target',c.order_id,'mode','percent','value',1000,'reason','Test discount'),c.quote->>'binding',c.grant_id);raise exception 'Expired grant accepted';exception when insufficient_privilege then null;end;
end $$;
reset role;
update public.operation_authorizations set expires_at=clock_timestamp()+interval '2 minutes' where id=(select grant_id from approval_test);
set local role authenticated;
do $$declare c approval_test;r jsonb;op jsonb;begin
 select * into c from approval_test;op:=jsonb_build_object('action','discount','target',c.order_id,'mode','percent','value',1000,'reason','Test discount');
 begin perform public.execute_sensitive_action(gen_random_uuid(),op||'{"value":2000}',c.quote->>'binding',c.grant_id);raise exception 'Grant amount changed';exception when check_violation then null;end;
 r:=public.execute_sensitive_action(c.request_id,op,c.quote->>'binding',c.grant_id);
 if r is distinct from public.execute_sensitive_action(c.request_id,op,c.quote->>'binding',c.grant_id) then raise exception 'Sensitive retry changed';end if;
 if (select total_amount from public.orders where id=c.order_id)<>22501 then raise exception 'Discount total failed';end if;
 begin perform public.execute_sensitive_action(gen_random_uuid(),op,c.quote->>'binding',c.grant_id);raise exception 'Grant reused';exception when insufficient_privilege or check_violation then null;end;
 begin select pin_hash from public.approver_pins limit 1;raise exception 'Hash exposed';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 if (select count(*) from public.audit_events where action='discount' and target_id=(select order_id from approval_test))<>1 then raise exception 'Missing or duplicated financial audit';end if;
 if exists(select 1 from public.security_action_context) then raise exception 'Authorization context leaked';end if;
end $$;
-- Five distinct failures persist and lock the approver without exceptions rolling them back.
insert into public.order_items(order_id,product_id,quantity,unit_price)
 select c.order_id,p.id,1,25001 from approval_test c cross join(select id from public.products where id=(select product from approval_test))p;
select set_config('request.jwt.claim.sub',(select actor::text from approval_test),true);
set local role authenticated;
update approval_test set quote=public.sensitive_quote(jsonb_build_object('action','cancel_item','target',item_id,'reason','Test cancellation'));
do $$declare c approval_test;r jsonb;begin
 select * into c from approval_test;
 for n in 1..5 loop
  r:=public.request_operation_approval(gen_random_uuid(),c.approver,'0000',jsonb_build_object('action','cancel_item','target',c.item_id,'reason','Test cancellation'),c.quote->>'binding');
  if(r->>'ok')::boolean then raise exception 'Bad PIN accepted';end if;
  if(r->>'attempts_remaining')::integer is distinct from greatest(0,5-n)then raise exception 'Wrong remaining attempt count';end if;
  if n=5 and(r->>'code'<>'locked' or(r->>'retry_after_seconds')::integer not between 1 and 900 or r->>'blocked_until' is null)then raise exception 'Missing lock feedback';end if;
 end loop;
 r:=public.request_operation_approval(gen_random_uuid(),c.approver,'4321',jsonb_build_object('action','cancel_item','target',c.item_id,'reason','Test cancellation'),c.quote->>'binding');
 if r->>'code'<>'locked' then raise exception 'PIN lock missing';end if;
 if(r->>'attempts_remaining')::integer<>0 or(r->>'retry_after_seconds')::integer not between 1 and 900 then raise exception 'Active lock feedback missing';end if;
end $$;
reset role;
-- A supervisor acts under their own authority; cancellation and its print snapshot commit together.
select set_config('request.jwt.claim.sub',(select approver::text from approval_test),true);
set local role authenticated;
do $$declare c approval_test;q jsonb;op jsonb;begin
 select * into c from approval_test;op:=jsonb_build_object('action','cancel_item','target',c.item_id,'reason','Supervisor cancellation');
 q:=public.sensitive_quote(op);perform public.execute_sensitive_action(gen_random_uuid(),op,q->>'binding');
end $$;
reset role;
do $$begin
 if not exists(select 1 from public.print_jobs where kind='cancellation' and order_id=(select order_id from approval_test)) then raise exception 'Cancellation print missing';end if;
 if not exists(select 1 from public.kitchen_cancellations where order_id=(select order_id from approval_test)) then raise exception 'Kitchen notice missing';end if;
end $$;
-- A failed audit insert must roll back the financial change as well.
create function pg_temp.reject_discount_audit() returns trigger language plpgsql as $$begin
 if new.action='discount' then raise exception 'Injected audit failure';end if;return new;
end $$;
create trigger approval_test_audit_failure before insert on public.audit_events for each row execute function pg_temp.reject_discount_audit();
select set_config('request.jwt.claim.sub',(select approver::text from approval_test),true);
set local role authenticated;
do $$declare c approval_test;op jsonb;q jsonb;begin
 select * into c from approval_test;op:=jsonb_build_object('action','discount','target',c.order_id,'mode','amount','value',0,'reason','Rollback verification');
 q:=public.sensitive_quote(op);
 begin perform public.execute_sensitive_action(gen_random_uuid(),op,q->>'binding');raise exception 'Audit failure not propagated' using errcode='23514';exception when raise_exception then null;end;
end $$;
reset role;
drop trigger approval_test_audit_failure on public.audit_events;
do $$begin
 if (select discount_amount from public.orders where id=(select order_id from approval_test))<>2500 then raise exception 'Discount survived failed audit';end if;
end $$;
select set_config('request.jwt.claim.sub','',true);
do $$declare fake uuid:=gen_random_uuid();legitimate uuid:=gen_random_uuid();administrator uuid;begin
 select id into administrator from public.profiles where role='admin' and is_active limit 1;
 if administrator is null then select approver into administrator from approval_test;update public.profiles set role='admin' where id=administrator;end if;
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(fake,fake||'@approval.test',jsonb_build_object('full_name','Untrusted metadata','staff_created_by',administrator),'{}');
 if exists(select 1 from public.audit_events where target_id=fake and actor_id is not null) then raise exception 'User metadata forged audit actor';end if;
 insert into auth.users(id,email,raw_user_meta_data,raw_app_meta_data) values(legitimate,legitimate||'@approval.test','{"full_name":"Trusted metadata"}',jsonb_build_object('staff_created_by',administrator));
 if not exists(select 1 from public.audit_events where target_id=legitimate and actor_id=administrator) then raise exception 'Server metadata attribution missing';end if;
end $$;
rollback;
