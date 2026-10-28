-- Disposable fixtures, never an application migration or a production seed.
create schema perf_fixture;
create table perf_fixture.identities(label text primary key,actor uuid,db_role text not null);
create table perf_fixture.visibility(phase text,label text,relation text,status text,keys jsonb,
 primary key(phase,label,relation));
create table perf_fixture.catalog(phase text primary key,permissions jsonb,policies jsonb,functions jsonb);
-- Distinct operators exercise owner-scoped session visibility in this fixture.
update public.cash_session_policy set single_open_session=false where id;
insert into auth.users(id,email,raw_user_meta_data)
 select gen_random_uuid(),'perf-'||r||'@fixture.invalid',jsonb_build_object('full_name','Synthetic '||r)
 from unnest(array['admin','supervisor','cashier','kitchen','waiter','cashier2','inactive'])r;
update public.profiles set role=case when full_name='Synthetic cashier2' then 'cashier'::public.user_role
 when full_name='Synthetic inactive' then 'waiter'::public.user_role
 else replace(full_name,'Synthetic ','')::public.user_role end,
 is_active=full_name<>'Synthetic inactive' where full_name like 'Synthetic %';
insert into perf_fixture.identities select replace(full_name,'Synthetic ',''),id,'authenticated'
 from public.profiles where full_name like 'Synthetic %';
insert into perf_fixture.identities values('public_customer',gen_random_uuid(),'anon'),('anonymous',null,'anon');

create function perf_fixture.seed_batch(p_start integer,p_count integer) returns void
language plpgsql as $$
declare actor uuid;session uuid;
begin
 select i.actor into actor from perf_fixture.identities i where label='admin';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 if not exists(select 1 from public.cash_sessions where operator_id=actor and status='open')then
  perform public.cash_session_command(gen_random_uuid(),'open','{"opening_amount":0}');
 end if;
 insert into public.orders(order_type,source,customer_name,customer_phone,notes,created_at)
  select 'pickup','waiter','Synthetic history','+595981123456','PERF_HISTORY_'||n,
   now()-make_interval(days=>1+(n%365)) from generate_series(p_start,p_start+p_count-1)n;
 insert into public.order_items(order_id,product_id,quantity,unit_price,status,created_at)
  select o.id,p.id,2,p.price,'ready',o.created_at from public.orders o
  cross join lateral(select id,price from public.products where is_active order by id limit 1)p
  where o.notes like 'PERF_HISTORY_%' and substring(o.notes from 14)::int between p_start and p_start+p_count-1;
 insert into public.order_payment_submissions(request_id,order_id,actor_id,payload)
  select gen_random_uuid(),id,actor,'[]' from public.orders
  where notes like 'PERF_HISTORY_%' and substring(notes from 14)::int between p_start and p_start+p_count-1;
 insert into public.payments(order_id,method,currency,original_amount,equivalent_pyg,operator_id,idempotency_key,line_number,created_at)
  select o.id,'cash','PYG',o.total_amount,o.total_amount,actor,s.request_id,1,o.created_at
  from public.orders o join public.order_payment_submissions s on s.order_id=o.id
  where o.notes like 'PERF_HISTORY_%' and substring(o.notes from 14)::int between p_start and p_start+p_count-1;
 update public.orders set payment_status='paid',status='closed',closed_at=created_at+interval '15 minutes',confirmed_at=created_at
  where notes like 'PERF_HISTORY_%' and substring(notes from 14)::int between p_start and p_start+p_count-1;
 insert into public.audit_events(actor_id,action,target_type,target_id,amount_pyg,reason,business_date,created_at)
  select actor,'fixture_history','order',id,total_amount,'Synthetic history',created_at::date,created_at
  from public.orders where notes like 'PERF_HISTORY_%' and substring(notes from 14)::int between p_start and p_start+p_count-1;
 insert into public.print_jobs(order_id,destination,kind,snapshot,device,status,created_at,sent_at)
  select id,'kitchen','kitchen','{"items":[],"synthetic":true}','{}','sent',created_at,created_at
  from public.orders where notes like 'PERF_HISTORY_%' and substring(notes from 14)::int between p_start and p_start+p_count-1;
end $$;

create function perf_fixture.seed_active(p_waiter boolean,p_active_count integer default 100) returns void language plpgsql as $$
declare actor uuid;second_actor uuid;
begin
 select i.actor into actor from perf_fixture.identities i where label='admin';
 select i.actor into second_actor from perf_fixture.identities i where label='cashier2';
 perform set_config('request.jwt.claim.sub',actor::text,true);
 perform set_config('request.jwt.claim.role','authenticated',true);
 update public.service_policy set uses_waiter=p_waiter where id;
 update public.restaurant_settings set counter_payment_timing='at_end' where id;
 insert into public.orders(order_type,source,is_counter,counter_name,notes,waiter_id,created_at)
  select 'pickup','waiter',true,'Synthetic active','PERF_ACTIVE_'||n,
   case when n%2=0 then actor else second_actor end,
   case when n%3=0 then now()-interval '2 days' else now() end
  from generate_series(1,p_active_count)n;
 insert into public.order_items(order_id,product_id,quantity,unit_price,status,created_at)
  select o.id,p.id,1,p.price,case when substring(o.notes from 13)::int%4=0 then 'ready'::public.order_item_status
   when substring(o.notes from 13)::int%4=1 then 'preparing'::public.order_item_status else 'pending'::public.order_item_status end,o.created_at
  from public.orders o cross join lateral(select id,price from public.products where is_active order by id limit 1)p
  where o.notes like 'PERF_ACTIVE_%';
 update public.orders o set status='ready' where o.notes like 'PERF_ACTIVE_%'
  and exists(select 1 from public.order_items i where i.order_id=o.id and i.status='ready');
 insert into public.orders(order_type,source,table_id,waiter_id,notes)
  select 'dine_in','waiter',id,actor,'PERF_TABLE'from public.tables order by table_number limit 5;
 insert into public.order_items(order_id,product_id,quantity,unit_price,status)
  select o.id,p.id,1,p.price,'pending'from public.orders o
  cross join lateral(select id,price from public.products where is_active order by id limit 1)p
  where o.notes='PERF_TABLE';
 insert into public.cash_sessions(operator_id,business_date,timezone,day_start,opening_amount,blind_count)
  select second_actor,current_date,'America/Asuncion','05:00',0,true;
end $$;

create function perf_fixture.capture(p_phase text) returns void language plpgsql as $$
declare identity record;relation record;column_list text;data jsonb;state text;pk_columns text;
 page jsonb;all_items jsonb;cursor_time timestamptz;cursor_id uuid;
begin
 insert into perf_fixture.catalog values(p_phase,
  (select jsonb_agg(jsonb_build_array(c.relname,c.relacl,(select jsonb_agg(jsonb_build_array(a.attname,a.attacl)order by a.attnum)from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped))order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'and c.relkind='r'),
  (select jsonb_agg(jsonb_build_array(c.relname,p.polname,p.polcmd,p.polroles,p.polpermissive)order by c.relname,p.polname)
   from pg_policy p join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'),
  (select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,p.prosecdef,p.provolatile,p.proconfig)order by p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'and p.proname<>'kitchen_queue_page'));
 for identity in select * from perf_fixture.identities order by label loop
  perform set_config('request.jwt.claim.sub',coalesce(identity.actor::text,''),true);
  perform set_config('request.jwt.claim.role',identity.db_role,true);
  for relation in select c.oid,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public'and c.relkind='r'and c.relrowsecurity order by c.relname loop
   -- Compare exact primary-key sets, not counts/hashes. Column grants are compared separately.
   select string_agg(format('t.%I',a.attname),','order by k.ordinality)into pk_columns
    from pg_index i cross join lateral unnest(i.indkey)with ordinality k(attnum,ordinality)
    join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum
    where i.indrelid=relation.oid and i.indisprimary;
   column_list:=coalesce(pk_columns,'t.*');
   data:=null;state:='visible';
   begin
    execute format('set local role %I',identity.db_role);
    execute format('select coalesce(jsonb_agg(key order by key::text),''[]'')from(select jsonb_build_array(%s)key from public.%I t)s',column_list,relation.relname)into data;
    reset role;
   exception when insufficient_privilege then reset role;state:='42501';
   end;
   insert into perf_fixture.visibility values(p_phase,identity.label,relation.relname,state,data);
  end loop;
  data:=null;state:='visible';all_items:='[]';cursor_time:=null;cursor_id:=null;
  begin
   execute format('set local role %I',identity.db_role);
   if to_regprocedure('public.kitchen_queue_page(timestamptz,uuid,integer)')is null then
    select coalesce(jsonb_agg(jsonb_build_array(i.id)order by i.id),'[]')into data
     from public.order_items i join public.orders o on o.id=i.order_id
     where o.status in('open','ready')and i.status in('pending','preparing','ready');
   else
    loop
     execute 'select public.kitchen_queue_page($1,$2,500)'into page using cursor_time,cursor_id;
     all_items:=all_items||page;
     exit when jsonb_array_length(page)<500;
     cursor_time:=(page->-1->>'created_at')::timestamptz;cursor_id:=(page->-1->>'id')::uuid;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_array(v->>'id')order by v->>'id'),'[]')into data
     from jsonb_array_elements(all_items)v;
   end if;
   reset role;
  exception when insufficient_privilege then reset role;state:='42501';
  end;
  insert into perf_fixture.visibility values(p_phase,identity.label,'@kitchen_pages',state,data);
 end loop;
end $$;
