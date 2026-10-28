begin;

-- Invoker permissions and base-table RLS remain the boundary, including for joins.
create function public.kitchen_queue_page(p_after_created timestamptz default null,
 p_after_id uuid default null,p_limit integer default 250)returns jsonb
language sql stable security invoker set search_path=''as $$
 with active_orders as materialized(
  select o.id,jsonb_build_object('id',o.id,'order_number',o.order_number,'order_type',o.order_type,
   'customer_name',o.customer_name,'is_counter',o.is_counter,'counter_ticket',o.counter_ticket,
   'counter_name',o.counter_name,'status',o.status,'tables',
   case when t.id is null then null else jsonb_build_object('table_number',t.table_number)end)details
  from public.orders o left join public.tables t on t.id=o.table_id
  where o.status in('open','ready')
 ),active_items as materialized(
  select i.*,o.details from active_orders o cross join lateral(
   select i.id,i.quantity,i.status,i.notes,i.created_at,i.product_id from public.order_items i
   where i.order_id=o.id and i.status in('pending','preparing','ready')
    and((p_after_created is null and p_after_id is null)or(i.created_at,i.id)>(p_after_created,p_after_id))
   order by i.created_at,i.id limit greatest(1,least(coalesce(p_limit,250),500)) offset 0
  )i
 ),page as(
  select *from active_items order by created_at,id limit greatest(1,least(coalesce(p_limit,250),500))
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'quantity',i.quantity,'status',i.status,
  'notes',i.notes,'created_at',i.created_at,'orders',i.details,'products',
  case when p.id is null then null else jsonb_build_object('name',p.name)end)
  order by i.created_at,i.id),'[]'::jsonb)
 from page i left join public.products p on p.id=i.product_id
$$;
revoke all on function public.kitchen_queue_page(timestamptz,uuid,integer)from public,anon,authenticated,service_role;
grant execute on function public.kitchen_queue_page(timestamptz,uuid,integer)to authenticated;
commit;
