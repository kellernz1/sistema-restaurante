begin;
-- Legacy role scenarios explicitly enable waiter service in this rolled-back fixture.
update public.service_policy set uses_waiter=true where id;
create temporary table contact_test_context(product_id uuid,py_customer uuid,br_customer uuid,admin_id uuid,cashier_id uuid);
grant all on contact_test_context to service_role,authenticated;
insert into public.categories(name) values('__contacts_py_br__');
with p as (insert into public.products(category_id,name,price) select id,'__contacts_py_br__',22000 from public.categories where name='__contacts_py_br__' returning id)
insert into contact_test_context(product_id,admin_id,cashier_id) select id,(select id from public.profiles where role='admin' and is_active limit 1),(select id from public.profiles where role='cashier' and is_active limit 1) from p;
update public.restaurant_settings set default_phone_country='PY',is_accepting_orders=true,pickup_enabled=true,delivery_enabled=true,delivery_fee_mode='fixed',delivery_fee=6000,min_delivery_order=0,enabled_payment_methods=array['cash']::public.payment_method[] where id;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$ declare product uuid; first_order public.orders; second_order public.orders; payload jsonb; begin
 select product_id into product from contact_test_context;
 payload:=jsonb_build_object('order_type','delivery','source','web','customer_name','PY contact','customer_phone','0981 123 457','payment_method','cash','delivery_address',jsonb_build_object('street','Mariscal López 123','reference','Portón azul','city','Asunción'),'items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1)));
 first_order:=public.create_customer_order(payload);
 second_order:=public.create_customer_order(payload||jsonb_build_object('customer_phone','+595981123457'));
 if first_order.customer_phone<>'+595981123457' or first_order.customer_id<>second_order.customer_id or first_order.total_amount<>28000 then raise exception 'PY identity/pricing failed'; end if;
 if not exists(select 1 from public.customer_addresses where customer_id=first_order.customer_id and street='Mariscal López 123' and state is null and zip_code is null and number is null) then raise exception 'Free-form nullable address failed'; end if;
 update contact_test_context set py_customer=first_order.customer_id;
 payload:=payload||jsonb_build_object('order_type','pickup','customer_phone','+551112345678','delivery_address',null);
 first_order:=public.create_customer_order(payload);
 second_order:=public.create_customer_order(payload||jsonb_build_object('customer_phone','+5511912345678'));
 if first_order.customer_id<>second_order.customer_id or first_order.customer_phone<>'+5511912345678' then raise exception 'Brazilian alias duplicated customer'; end if;
 update contact_test_context set br_customer=first_order.customer_id;
 if public.phone_identity('+551123456789')=public.phone_identity('+5511923456789') then raise exception 'Landline/mobile identity collision'; end if;
 begin perform public.create_customer_order(payload||jsonb_build_object('customer_phone','abc123')); raise exception 'Alphabetic phone accepted'; exception when invalid_parameter_value then null; end;
 insert into public.whatsapp_conversations(phone) values('+5511912345678') on conflict do nothing;
 perform public.remember_whatsapp_recipient('+5511912345678','551112345678',now());
 if not exists(select 1 from public.whatsapp_conversations where phone='+5511912345678' and provider_recipient='551112345678') then raise exception 'Transport identity not preserved'; end if;
 perform public.remember_whatsapp_recipient('+5511912345678','5511912345678',now()-interval '1 day');
 if not exists(select 1 from public.whatsapp_conversations where phone='+5511912345678' and provider_recipient='551112345678') then raise exception 'Stale recipient overwrote current'; end if;
 begin perform public.remember_whatsapp_recipient('+5511912345678','595981123457',now()); raise exception 'Different recipient accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub',(select cashier_id::text from contact_test_context),true);
set local role authenticated;
do $$ begin
 update public.restaurant_settings set default_phone_country='BR' where id;
 if found then raise exception 'Cashier changed phone default'; end if;
 begin perform public.remember_whatsapp_recipient('+5511912345678','551112345678',now()); raise exception 'Cashier changed transport'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claim.sub',(select admin_id::text from contact_test_context),true);
set local role authenticated;
update public.restaurant_settings set default_phone_country='BR' where id;
do $$ begin
 if not exists(select 1 from public.restaurant_settings where id and default_phone_country='BR') then raise exception 'Admin default update failed'; end if;
 begin update public.restaurant_settings set default_phone_country='ZZ' where id; raise exception 'Invalid country accepted'; exception when check_violation then null; end;
end $$;
reset role;
rollback;
