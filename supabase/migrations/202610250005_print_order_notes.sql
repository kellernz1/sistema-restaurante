begin;
create or replace function public.print_order_snapshot(p_order_id uuid, p_items jsonb default null) returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('restaurant',s.restaurant_name,'timezone',s.business_timezone,'date',now(),
 'number',o.order_number,'ticket',o.counter_ticket,'name',coalesce(o.counter_name,o.customer_name),
 'table',(select table_number from public.tables where id=o.table_id),'total',o.total_amount,
 'orderType',o.order_type,'notes',o.notes,'token',o.public_token,'items',coalesce(p_items,(select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'name',p.name,'quantity',i.quantity,'notes',i.notes,'price',i.unit_price) order by i.created_at,i.id),'[]') from public.order_items i join public.products p on p.id=i.product_id where i.order_id=o.id)),
 'payments',(select coalesce(jsonb_agg(jsonb_build_object('method',method,'currency',currency,'original',original_amount,'rate',exchange_rate::text,'equivalent',equivalent_pyg-change_pyg,'change',change_pyg) order by created_at,line_number),'[]') from public.payments where order_id=o.id))
 from public.orders o cross join public.restaurant_settings s where o.id=p_order_id and s.id
$$;
commit;
