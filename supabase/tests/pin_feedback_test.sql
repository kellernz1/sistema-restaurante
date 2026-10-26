begin;
update public.approval_policy set pin_failures=3,pin_lock_minutes=2 where id;
update public.restaurant_settings set is_accepting_orders=true where id;
update public.service_policy set counter_enabled=true where id;
create temporary table pin_feedback(actor uuid,approver uuid,draft uuid,payload jsonb,discount jsonb,quote jsonb);
grant all on pin_feedback to authenticated;
insert into pin_feedback(actor,approver,draft)values(gen_random_uuid(),gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,email,raw_user_meta_data)select actor,actor||'@feedback.test','{"full_name":"Feedback cashier"}'::jsonb from pin_feedback union all select approver,approver||'@feedback.test','{"full_name":"Feedback approver"}'::jsonb from pin_feedback;
update public.profiles set role='cashier'where id=(select actor from pin_feedback);
update public.profiles set role='supervisor'where id=(select approver from pin_feedback);
insert into public.approver_pins(user_id,pin_hash)select approver,extensions.crypt('4321',extensions.gen_salt('bf',4))from pin_feedback;
update pin_feedback set payload=jsonb_build_object('name','Feedback','items',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where is_active and price>0 limit 1),'quantity',1))),discount='{"mode":"amount","value":1,"reason":"Feedback test"}';
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select actor::text from pin_feedback),true);
set local role authenticated;
update pin_feedback set quote=public.counter_discount_quote(draft,payload,discount);
do $$declare c pin_feedback;r jsonb;again jsonb;request uuid;deadline text;begin
 select *into c from pin_feedback;
 for n in 1..3 loop
  request:=gen_random_uuid();r:=public.request_counter_discount_approval(request,c.approver,'0000',c.draft,c.payload,c.discount,c.quote->>'binding');
  if(r->>'attempts_remaining')::integer is distinct from 3-n then raise exception 'Custom remaining count incorrect';end if;
  again:=public.request_counter_discount_approval(request,c.approver,'0000',c.draft,c.payload,c.discount,c.quote->>'binding');
  if again<>r then raise exception 'Failure replay changed feedback';end if;
 end loop;
 if r->>'code'<>'locked' or(r->>'retry_after_seconds')::integer not between 1 and 120 then raise exception 'Custom lock missing';end if;
 deadline:=r->>'blocked_until';
 r:=public.request_counter_discount_approval(gen_random_uuid(),c.approver,'4321',c.draft,c.payload,c.discount,c.quote->>'binding');
 if r->>'code'<>'locked' or r->>'blocked_until' is distinct from deadline then raise exception 'Active lock extended or bypassed';end if;
end $$;
reset role;
update public.approver_pins set blocked_until=clock_timestamp()-interval '1 second'where user_id=(select approver from pin_feedback);
set local role authenticated;
do $$declare c pin_feedback;r jsonb;begin
 select *into c from pin_feedback;
 r:=public.request_counter_discount_approval(gen_random_uuid(),c.approver,'0000',c.draft,c.payload,c.discount,c.quote->>'binding');
 if r->>'code'<>'pin' or(r->>'attempts_remaining')::integer<>2 then raise exception 'Expired lock did not reset failures';end if;
 r:=public.request_counter_discount_approval(gen_random_uuid(),c.approver,'4321',c.draft,c.payload,c.discount,c.quote->>'binding');if not(r->>'ok')::boolean then raise exception 'Correct PIN failed';end if;
 r:=public.request_counter_discount_approval(gen_random_uuid(),c.approver,'0000',c.draft,c.payload,c.discount,c.quote->>'binding');if(r->>'attempts_remaining')::integer<>2 then raise exception 'Success did not reset counter';end if;
end $$;
reset role;
update public.approval_actor_limits set hits=10,window_start=clock_timestamp()where actor_id=(select actor from pin_feedback);
set local role authenticated;
do $$declare c pin_feedback;r jsonb;begin
 select *into c from pin_feedback;
 r:=public.request_counter_discount_approval(gen_random_uuid(),c.approver,'0000',c.draft,c.payload,c.discount,c.quote->>'binding');
 if r->>'code'<>'limited' or(r->>'retry_after_seconds')::integer not between 1 and 60 or r ? 'attempts_remaining' then raise exception 'Rate limit feedback incorrect';end if;
end $$;
reset role;
rollback;
