-- Base operational data loaded automatically by `supabase db reset`.
-- The statements are safe to run more than once.

begin;

insert into public.restaurant_settings (
  id, is_accepting_orders, dine_in_qr_enabled, require_confirmation_for_qr,
  pickup_enabled, delivery_enabled, delivery_fee, min_delivery_order,
  estimated_pickup_minutes, estimated_delivery_minutes, whatsapp_enabled
) values (
  true, true, true, true, true, true, 6.00, 25.00, 20, 45, true
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
select * from (values
  (1, 2), (2, 2), (3, 4), (4, 4), (5, 4), (6, 4),
  (7, 6), (8, 6), (9, 8), (10, 2), (11, 4), (12, 4)
) as seeded_table(table_number, capacity)
on conflict (table_number) do update set capacity = excluded.capacity;

update public.categories
set name = 'Pratos Principais'
where name = 'Pratos principais'
  and not exists (select 1 from public.categories where name = 'Pratos Principais');

insert into public.categories (name, sort_order) values
  ('Entradas', 10),
  ('Pratos Principais', 20),
  ('Lanches', 30),
  ('Bebidas', 40),
  ('Sobremesas', 50)
on conflict (name) do update set sort_order = excluded.sort_order;

insert into public.products (category_id, name, price, description)
select category.id, product.name, product.price, product.description
from (
  values
    ('Entradas', 'Bruschetta da casa', 18.90::numeric, 'Pão italiano, tomate, manjericão e azeite'),
    ('Entradas', 'Batata rústica', 22.00::numeric, 'Batatas assadas com ervas e molho especial'),
    ('Entradas', 'Iscas de frango', 27.90::numeric, 'Frango crocante com molho de mostarda e mel'),
    ('Entradas', 'Bolinho de Bacalhau (6 un)', 32.00::numeric, 'Bolinhos crocantes servidos com limão'),
    ('Entradas', 'Porção de Batata Frita', 28.00::numeric, 'Batatas fritas sequinhas com molho da casa'),
    ('Entradas', 'Pastel de Queijo', 18.00::numeric, 'Pastéis artesanais recheados com queijo'),
    ('Pratos Principais', 'Hambúrguer clássico', 32.90::numeric, 'Carne, queijo, salada e molho da casa'),
    ('Pratos Principais', 'Hambúrguer vegetariano', 31.90::numeric, 'Burger vegetal, queijo, salada e molho da casa'),
    ('Pratos Principais', 'Filé de frango grelhado', 39.90::numeric, 'Acompanha arroz, feijão e salada'),
    ('Pratos Principais', 'Bife acebolado', 46.90::numeric, 'Acompanha arroz, feijão e batata frita'),
    ('Pratos Principais', 'Massa ao molho pomodoro', 35.00::numeric, 'Massa fresca com molho de tomates e parmesão'),
    ('Pratos Principais', 'Risoto de cogumelos', 54.00::numeric, 'Arroz arbóreo, cogumelos e parmesão'),
    ('Pratos Principais', 'Filé à Parmegiana', 56.90::numeric, 'Filé empanado, molho de tomate, queijo, arroz e fritas'),
    ('Pratos Principais', 'Feijoada Completa', 62.00::numeric, 'Feijoada, arroz, couve, farofa e laranja'),
    ('Lanches', 'X-Burger', 29.90::numeric, 'Pão, hambúrguer, queijo e molho da casa'),
    ('Lanches', 'X-Bacon', 34.90::numeric, 'Pão, hambúrguer, queijo, bacon e molho da casa'),
    ('Lanches', 'X-Salada', 27.90::numeric, 'Pão, hambúrguer, queijo, alface e tomate'),
    ('Bebidas', 'Água mineral', 6.00::numeric, 'Com ou sem gás'),
    ('Bebidas', 'Refrigerante lata', 8.00::numeric, 'Consulte os sabores disponíveis'),
    ('Bebidas', 'Suco natural', 12.00::numeric, 'Consulte as frutas disponíveis'),
    ('Bebidas', 'Café espresso', 7.00::numeric, 'Café espresso 50 ml'),
    ('Bebidas', 'Coca-Cola Lata', 7.00::numeric, 'Lata 350 ml'),
    ('Bebidas', 'Água sem gás', 5.00::numeric, 'Garrafa 500 ml'),
    ('Bebidas', 'Cerveja Long Neck', 14.00::numeric, 'Garrafa 330 ml'),
    ('Bebidas', 'Caipirinha', 22.00::numeric, 'Limão, açúcar, gelo e cachaça'),
    ('Sobremesas', 'Pudim de leite', 14.90::numeric, 'Fatia de pudim com calda de caramelo'),
    ('Sobremesas', 'Brownie com sorvete', 19.90::numeric, 'Brownie de chocolate com sorvete de creme'),
    ('Sobremesas', 'Petit Gâteau', 24.90::numeric, 'Bolo quente de chocolate com sorvete de creme'),
    ('Sobremesas', 'Brigadeiro (un)', 4.50::numeric, 'Brigadeiro artesanal de chocolate')
) as product(category_name, name, price, description)
join public.categories as category on category.name = product.category_name
where not exists (select 1 from public.products as existing where existing.name = product.name);

insert into public.products (category_id, name, price, description, is_active)
select category.id, 'Prato do Dia — esgotado', 35.00, 'Item demonstrativo indisponível', false
from public.categories as category
where category.name = 'Pratos Principais'
  and not exists (select 1 from public.products where name = 'Prato do Dia — esgotado');

commit;

-- The local Node demo seed creates these users first. In hosted environments,
-- create them through Supabase Auth before rerunning this harmless role mapping.
update public.profiles as profile
set full_name = role_map.full_name,
    role = role_map.role::public.user_role
from (
  values
    ('admin@restaurante.local', 'Administrador', 'admin'),
    ('garcom@restaurante.local', 'Garçom', 'waiter'),
    ('garcom2@restaurante.local', 'Garçom 2', 'waiter'),
    ('cozinha@restaurante.local', 'Cozinha', 'kitchen'),
    ('caixa@restaurante.local', 'Caixa', 'cashier')
) as role_map(email, full_name, role)
join auth.users as auth_user on lower(auth_user.email) = lower(role_map.email)
where profile.id = auth_user.id;

do $$
declare configured_users integer;
begin
  select count(*) into configured_users
  from public.profiles
  where id in (
    select id from auth.users where lower(email) in (
      'admin@restaurante.local', 'garcom@restaurante.local',
      'garcom2@restaurante.local', 'cozinha@restaurante.local',
      'caixa@restaurante.local'
    )
  );
  if configured_users < 5 then
    raise warning 'Create all five seed users in Supabase Auth, then rerun the role update section.';
  end if;
end;
$$;
