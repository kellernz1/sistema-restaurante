begin;

alter table public.products add column image_version uuid;
alter table public.products add column is_archived boolean not null default false;
alter table public.products add constraint archived_products_unavailable check (not is_archived or not is_active);

-- Compact, processed images are part of the same local database backups.
-- Keep binary payloads out of product/catalog queries and browser database access.
create table public.product_photos (
  product_id uuid primary key references public.products(id) on delete cascade,
  version uuid not null default gen_random_uuid(),
  content text not null check (length(content) between 4 and 1400000 and length(content) % 4 = 0 and content ~ '^[A-Za-z0-9+/]+={0,2}$')
);
alter table public.product_photos enable row level security;
revoke all on public.product_photos from public, anon, authenticated;

create or replace function public.set_product_photo(p_product_id uuid, p_content text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
  if auth.uid() is null or coalesce(public.current_user_role()::text, '') <> 'admin' then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;
  perform 1 from public.products where id = p_product_id and not is_archived for update;
  if not found then raise exception 'Product unavailable' using errcode = 'P0002'; end if;
  if p_content is null or p_content = '' then
    delete from public.product_photos where product_id = p_product_id;
    update public.products set image_version = null where id = p_product_id;
    return null;
  end if;
  result := gen_random_uuid();
  insert into public.product_photos(product_id, version, content) values (p_product_id, result, p_content)
    on conflict (product_id) do update set version = excluded.version, content = excluded.content;
  update public.products set image_version = result where id = p_product_id;
  return result;
end $$;
revoke all on function public.set_product_photo(uuid, text) from public, anon;
grant execute on function public.set_product_photo(uuid, text) to authenticated;

commit;
