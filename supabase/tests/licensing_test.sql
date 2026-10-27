begin;
-- TOKEN_FIXTURES
create temporary table license_audit_baseline as select count(*)n from public.audit_events where action='license_imported';
grant select on license_audit_baseline to authenticated;
update public.cash_session_policy set single_open_session=false;
update public.service_policy set counter_enabled=true,uses_waiter=true;
update public.restaurant_settings set is_accepting_orders=true,counter_payment_timing='at_order',enabled_payment_methods=array['cash','card','pix']::public.payment_method[];
create temporary table licensing_context(admin uuid,product uuid,paid uuid,unpaid uuid,session_id uuid,table_token text);
grant all on licensing_context to authenticated,service_role;
insert into licensing_context(admin,product,table_token)select(select id from public.profiles where role='admin'and is_active limit 1),(select id from public.products where is_active limit 1),(select qr_token from public.tables where status='available'limit 1);
update public.products set price=10000 where id=(select product from licensing_context);
select set_config('request.jwt.claim.sub',(select admin::text from licensing_context),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.license_import((select token from license_tokens where label='active'));
do $$begin
 if public.license_status()->>'state'<>'active'then raise exception 'Valid signed license rejected';end if;
 begin perform public.license_import((select token from license_tokens where label='wrong_installation'));raise exception 'Foreign installation accepted'using errcode='23505';exception when invalid_parameter_value then null;end;
 begin perform public.license_import((select 'A'||substring(token,2)from license_tokens where label='active'));raise exception 'Tampered signature accepted'using errcode='23505';exception when invalid_parameter_value then null;end;
 begin perform public.license_import((select token from license_tokens where label='too_long'));raise exception 'Unbounded monthly token accepted'using errcode='23505';exception when invalid_parameter_value then null;end;
 if(select count(*)from public.audit_events where action='license_imported')<>(select n+1 from license_audit_baseline)then raise exception 'Unexpected import audit count';end if;
 perform public.license_import((select token from license_tokens where label='active'));
 if(select count(*)from public.audit_events where action='license_imported')<>(select n+1 from license_audit_baseline)then raise exception 'Identical import duplicated audit';end if;
end $$;
update licensing_context set session_id=(public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}')->>'session_id')::uuid;
do $$declare c licensing_context;r jsonb;begin
 select *into c from licensing_context;
 r:=public.create_counter_order(gen_random_uuid(),jsonb_build_object('name','License paid','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1))),'[{"method":"cash","currency":"PYG","amount_pyg":10000,"original_amount":12000}]');update licensing_context set paid=(r->'order'->>'id')::uuid;
 update public.restaurant_settings set counter_payment_timing='at_end'where id;
 r:=public.create_counter_order(gen_random_uuid(),jsonb_build_object('name','License pending','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1))),'[]');update licensing_context set unpaid=(r->'order'->>'id')::uuid;
 select *into c from licensing_context;
 begin update public.orders set created_at=clock_timestamp()+interval '1 year'where id=c.unpaid;raise exception 'Client forged clock evidence'using errcode='23505';exception when insufficient_privilege then null;end;
 perform public.license_import((select token from license_tokens where label='seven'));
 if public.license_status()->>'state'<>'expiring'or(public.license_status()->>'warning_days')::integer<>7 then raise exception 'Seven-day warning missing';end if;
 perform public.license_import((select token from license_tokens where label='three'));
 if(public.license_status()->>'warning_days')::integer<>3 then raise exception 'Three-day warning missing';end if;
 perform public.license_import((select token from license_tokens where label='grace'));
 if public.license_status()->>'state'<>'grace'then raise exception 'Grace missing';end if;
 perform public.license_import((select token from license_tokens where label='expired'));
 if(public.license_status()->>'orders_enabled')::boolean is distinct from true or(public.license_status()->>'pending_restriction')::boolean is distinct from true then raise exception 'License restricted an existing shift';end if;
 begin perform public.license_import((select token from license_tokens where label='active'));raise exception 'Old license replay accepted'using errcode='23505';exception when invalid_parameter_value then null;end;
 perform public.cash_session_command(gen_random_uuid(),'close',jsonb_build_object('session_id',c.session_id,'counted_amount',10000));
 r:=public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":10000}');update licensing_context set session_id=(r->>'session_id')::uuid;
 if public.license_status()->>'state'<>'restricted'then raise exception 'Opening did not apply restriction';end if;
 begin perform public.create_counter_order(gen_random_uuid(),jsonb_build_object('items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1))),'[]');raise exception 'Restricted counter accepted'using errcode='23505';exception when sqlstate 'L0001' then null;end;
 begin insert into public.orders(order_type,source,status)values('pickup','waiter','open');raise exception 'Direct order insert bypassed restriction'using errcode='23505';exception when sqlstate 'L0001' then null;end;
 -- Closing/payment and refunds are intentionally outside creation guards.
 perform public.record_order_payments(c.unpaid,gen_random_uuid(),'[{"method":"card","currency":"PYG","amount_pyg":10000,"original_amount":10000}]');
 r:=jsonb_build_object('action','cancel_refund','target',c.paid,'reason','Licensed historical refund');
 perform public.execute_refund(gen_random_uuid(),r,public.refund_quote(r)->>'binding',null,true);
 if not exists(select 1 from public.refunds where order_id=c.paid)then raise exception 'Restricted refund failed';end if;
 perform public.cash_session_report((select session_id from licensing_context));perform public.cash_day_report();
end $$;
reset role;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
do $$declare c licensing_context;payload jsonb;begin
 select *into c from licensing_context;payload:=jsonb_build_object('order_type','pickup','source','web','customer_name','Restricted','customer_phone','+595981123456','payment_method','cash','items',jsonb_build_array(jsonb_build_object('product_id',c.product,'quantity',1)));
 begin perform public.create_customer_order(payload);raise exception 'Public creator bypassed restriction'using errcode='23505';exception when sqlstate 'L0001' then null;end;
 begin perform public.create_cashier_order(c.admin,gen_random_uuid(),payload);raise exception 'Cashier creator bypassed restriction'using errcode='23505';exception when sqlstate 'L0001' then null;end;
 begin perform public.submit_qr_order(c.table_token,gen_random_uuid(),jsonb_build_object('source','qr','customer_name','Restricted QR','items',payload->'items'));raise exception 'QR staging bypassed restriction'using errcode='23505';exception when sqlstate 'L0001' then null;end;
 -- Existing data remains readable even though no new sale can be created.
 if not exists(select 1 from public.orders where id=c.unpaid)then raise exception 'Historical order hidden';end if;
end $$;
reset role;
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select public.license_import((select token from license_tokens where label='restored'));
reset role;
-- A backwards clock raises a debt, but an otherwise valid period is not blocked.
update public.license_installation set max_seen_at=clock_timestamp()+interval '3 hours';
select public.license_tick();
set local role authenticated;
do $$begin
 if(public.license_status()->>'clock_suspect')::boolean is distinct from true or(public.license_status()->>'requires_online')::boolean is distinct from true or(public.license_status()->>'orders_enabled')::boolean is distinct from true then raise exception 'Clock handling interrupted valid service or failed to detect rollback';end if;
 perform public.license_import((select token from license_tokens where label='basic'));
 if(public.license_status()->>'delivery_enabled')::boolean or(public.license_status()->>'whatsapp_enabled')::boolean then raise exception 'Plan features not enforced';end if;
 begin perform public.license_import((select token from license_tokens where label='older_issue'));raise exception 'Older issuance accepted'using errcode='23505';exception when invalid_parameter_value then null;end;
 begin update public.license_installation set restricted=false;raise exception 'Admin edited private licensing state'using errcode='23505';exception when insufficient_privilege then null;end;
 begin perform public.license_set_public_key(repeat('a',64));raise exception 'Admin replaced trust root'using errcode='23505';exception when insufficient_privilege then null;end;
end $$;
reset role;
do $$begin
 begin perform public.assert_order_license('delivery','web');raise exception 'Delivery plan bypassed'using errcode='23505';exception when sqlstate 'L0002' then null;end;
 begin perform public.assert_order_license('pickup','whatsapp');raise exception 'WhatsApp plan bypassed'using errcode='23505';exception when sqlstate 'L0002' then null;end;
end $$;
-- Business-day advance alone applies a due restriction, without another opening.
update public.license_installation set max_seen_at=clock_timestamp()+interval '40 days';
select public.license_tick();
set local role authenticated;
do $$begin
 if public.license_status()->>'state'<>'restricted'then raise exception 'Day boundary failed';end if;
 if not exists(select 1 from public.audit_events where action='license_clock_suspect')or not exists(select 1 from public.audit_events where action='license_state_changed')then raise exception 'License audit missing';end if;
end $$;
reset role;
set constraints all immediate;
rollback;
