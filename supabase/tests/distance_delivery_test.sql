begin;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);
set local role service_role;
do $$
declare
  settings public.restaurant_settings;
  quote public.delivery_quotes;
  product uuid;
  result public.orders;
  payload jsonb;
begin
  update public.restaurant_settings set delivery_fee_mode = 'distance', delivery_origin_latitude = -23.550520,
    delivery_origin_longitude = -46.633308, delivery_distance_step_km = 2, delivery_distance_step_fee = 6,
    is_accepting_orders = true, delivery_enabled = true, min_delivery_order = 0 where id = true returning * into settings;
  select id into product from public.products where is_active limit 1;
  if product is null then raise exception 'Active product required'; end if;
  insert into public.delivery_quotes(location_url,distance_meters,fee,pricing)
    values ('https://maps.apple.com/?ll=-23.56,-46.64',2001,12,public.delivery_pricing_snapshot(settings)) returning * into quote;
  payload := jsonb_build_object('source','web','order_type','delivery','customer_name','__distance_test__','customer_phone','+5511999990078',
    'payment_method','pix','items',jsonb_build_array(jsonb_build_object('product_id',product,'quantity',1)),
    'delivery_address',jsonb_build_object('location_url',quote.location_url,'delivery_quote_id',quote.id));
  result := public.create_customer_order(payload);
  if result.delivery_fee <> 12 then raise exception 'Route fee was not used'; end if;
  begin
    perform public.create_customer_order(payload #- '{delivery_address,delivery_quote_id}');
    raise exception 'Missing quote accepted';
  exception when check_violation then null; end;
  begin
    perform public.create_customer_order(jsonb_set(payload,'{delivery_address,location_url}','"https://maps.apple.com/?ll=0,0"'));
    raise exception 'Changed destination accepted';
  exception when check_violation then null; end;
  update public.delivery_quotes set expires_at = now() - interval '1 second' where id = quote.id;
  begin
    perform public.create_customer_order(payload);
    raise exception 'Expired quote accepted';
  exception when check_violation then null; end;
  update public.delivery_quotes set expires_at = now() + interval '15 minutes' where id = quote.id;
  update public.restaurant_settings set delivery_distance_step_fee = 7 where id = true;
  begin
    perform public.create_customer_order(payload);
    raise exception 'Old pricing accepted';
  exception when check_violation then null; end;
  begin
    insert into public.delivery_quotes(location_url,distance_meters,fee,pricing)
      values (quote.location_url,2001,1,quote.pricing);
    raise exception 'Incorrect band fee accepted';
  exception when check_violation then null; end;
  update public.restaurant_settings set delivery_fee_mode = 'fixed', delivery_fee = 5 where id = true;
  result := public.create_customer_order(payload #- '{delivery_address,delivery_quote_id}');
  if result.delivery_fee <> 5 then raise exception 'Fixed delivery changed'; end if;
  begin
    perform public.create_customer_order(payload || '{"payment_method":"cash","cash_change_for":0}'::jsonb);
    raise exception 'Insufficient change accepted';
  exception when check_violation then null; end;
end;
$$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from public.delivery_quotes;
    raise exception 'Anonymous quote table access';
  exception when insufficient_privilege then null; end;
end; $$;
rollback;
