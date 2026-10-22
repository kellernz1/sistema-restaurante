-- Run this file after 202610220001_initial_schema.sql.
-- It is safe to run more than once.

begin;

insert into public.restaurant_settings (
  id,
  is_accepting_orders,
  dine_in_qr_enabled,
  require_confirmation_for_qr,
  pickup_enabled,
  delivery_enabled,
  delivery_fee,
  min_delivery_order,
  estimated_pickup_minutes,
  estimated_delivery_minutes,
  whatsapp_enabled
) values (
  true,
  true,
  true,
  true,
  true,
  true,
  8.00,
  30.00,
  30,
  50,
  false
)
on conflict (id) do update set
  is_accepting_orders = excluded.is_accepting_orders,
  dine_in_qr_enabled = excluded.dine_in_qr_enabled,
  require_confirmation_for_qr = excluded.require_confirmation_for_qr,
  pickup_enabled = excluded.pickup_enabled,
  delivery_enabled = excluded.delivery_enabled,
  delivery_fee = excluded.delivery_fee,
  min_delivery_order = excluded.min_delivery_order,
  estimated_pickup_minutes = excluded.estimated_pickup_minutes,
  estimated_delivery_minutes = excluded.estimated_delivery_minutes,
  whatsapp_enabled = excluded.whatsapp_enabled;

insert into public.tables (table_number, capacity)
select number, case when number <= 4 then 2 when number <= 8 then 4 else 6 end
from generate_series(1, 10) as number
on conflict (table_number) do update set capacity = excluded.capacity;

insert into public.categories (name, sort_order) values
  ('Entradas', 10),
  ('Pratos principais', 20),
  ('Bebidas', 30),
  ('Sobremesas', 40)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into public.products (category_id, name, price, description)
select category.id, product.name, product.price, product.description
from (
  values
    ('Entradas', 'Bruschetta da casa', 18.90::numeric, 'Pão italiano, tomate, manjericão e azeite'),
    ('Entradas', 'Batata rústica', 22.00::numeric, 'Batatas assadas com ervas e molho especial'),
    ('Entradas', 'Iscas de frango', 27.90::numeric, 'Frango crocante com molho de mostarda e mel'),
    ('Pratos principais', 'Hambúrguer clássico', 32.90::numeric, 'Carne, queijo, salada e molho da casa'),
    ('Pratos principais', 'Hambúrguer vegetariano', 31.90::numeric, 'Burger vegetal, queijo, salada e molho da casa'),
    ('Pratos principais', 'Filé de frango grelhado', 39.90::numeric, 'Acompanha arroz, feijão e salada'),
    ('Pratos principais', 'Bife acebolado', 46.90::numeric, 'Acompanha arroz, feijão e batata frita'),
    ('Pratos principais', 'Massa ao molho pomodoro', 35.00::numeric, 'Massa fresca com molho de tomates e parmesão'),
    ('Pratos principais', 'Risoto de cogumelos', 44.90::numeric, 'Arroz arbóreo, cogumelos e parmesão'),
    ('Bebidas', 'Água mineral', 6.00::numeric, 'Com ou sem gás'),
    ('Bebidas', 'Refrigerante lata', 8.00::numeric, 'Consulte os sabores disponíveis'),
    ('Bebidas', 'Suco natural', 12.00::numeric, 'Consulte as frutas disponíveis'),
    ('Bebidas', 'Café espresso', 7.00::numeric, 'Café espresso 50 ml'),
    ('Sobremesas', 'Pudim de leite', 14.90::numeric, 'Fatia de pudim com calda de caramelo'),
    ('Sobremesas', 'Brownie com sorvete', 19.90::numeric, 'Brownie de chocolate com sorvete de creme')
) as product(category_name, name, price, description)
join public.categories as category on category.name = product.category_name
where not exists (
  select 1 from public.products as existing where existing.name = product.name
);

commit;

-- Create these users in Supabase Dashboard > Authentication > Users first:
--   admin@restaurante.local
--   garcom@restaurante.local
--   cozinha@restaurante.local
--   caixa@restaurante.local
-- The auth trigger creates each profile as a waiter. Then run the statements below.

update public.profiles as profile
set full_name = role_map.full_name,
    role = role_map.role::public.user_role
from (
  values
    ('admin@restaurante.local', 'Administrador', 'admin'),
    ('garcom@restaurante.local', 'Garçom', 'waiter'),
    ('cozinha@restaurante.local', 'Cozinha', 'kitchen'),
    ('caixa@restaurante.local', 'Caixa', 'cashier')
) as role_map(email, full_name, role)
join auth.users as auth_user on lower(auth_user.email) = lower(role_map.email)
where profile.id = auth_user.id;

-- Verify that every expected account exists and has the correct role.
do $$
declare
  configured_users integer;
begin
  select count(*) into configured_users
  from public.profiles
  where role in ('admin', 'waiter', 'kitchen', 'cashier')
    and id in (
      select id
      from auth.users
      where lower(email) in (
        'admin@restaurante.local',
        'garcom@restaurante.local',
        'cozinha@restaurante.local',
        'caixa@restaurante.local'
      )
    );

  if configured_users < 4 then
    raise warning 'Create all four seed users in Supabase Auth, then rerun the role update section.';
  end if;
end;
$$;
