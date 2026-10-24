# Menu management

Sign in as administrator and open **Cardápio** (`/admin/menu`), or use **Gerenciar
cardápio** on the admin dashboard. Cashier, waiter and kitchen accounts can use the
catalogue when ordering but cannot change products or upload images.

## Daily operation

1. **Adicionar produto**: enter name, existing category, description, price and
   availability. Optionally select a dish photo and press **Salvar produto**.
2. **Editar** changes the product details and can replace or remove its photo.
3. **Indisponibilizar/Disponibilizar** hides or shows the product in customer and
   staff catalogues loaded afterwards. Existing carts are revalidated by the
   database when submitted. Refresh a previously open catalogue to see changes.
4. **Remover** archives the product, retaining its identity and historical order
   references. To undo, choose **Removidos**, then **Restaurar**. A restored product
   starts unavailable; activate it when ready to sell.

Existing order item prices remain their original values when a product price is
edited. There is no permanent product deletion control in this interface.

Photos accept JPEG, PNG or WebP up to 5 MB. The server checks the file signature,
limits decoded pixels and converts the image to WebP within 1200 × 900 pixels,
without enlarging small images. The processed file is capped at 1 MB. Sharp strips
metadata during conversion. Uploads and image processing work on the local machine.
Products without photos or whose image cannot load retain a decorative placeholder.

If product details save but the photo upload fails, the editor retains the saved
product ID and selected file. Fix the photo problem and save again; this updates
the same product. The message explicitly identifies this partial outcome.

## Implementation

- `src/features/menu-management`: strict schemas, admin list query, editor and
  bounded image decoding. `src/app/(staff)/admin/menu/page.tsx` loads the interface.
- `/api/staff/products` and `/api/staff/products/[productId]`: admin-only listing,
  create, edit, availability, archive and restore. Client-controlled product IDs,
  image references and archive fields are rejected by the schemas.
- `/api/staff/products/[productId]/photo`: admin-only upload and removal, using
  the authenticated `set_product_photo` RPC. A product lock makes image/version
  changes atomic. Archived products cannot receive photos until restored.
- `product_photos` is private; browser database roles have no table privileges.
  The public validated image endpoint serves only WebP with `nosniff`, versioned
  URLs and ETags. Product/catalogue queries never include image binary payloads.
- Images are stored compactly as base64 in the local PostgreSQL database and are
  included in the existing database backup/restore procedure. Supabase Storage
  remains disabled; no filesystem upload directory or new service is needed.
- Public table and offsite menu endpoints expose only the image version. Shared
  `ProductPhoto` renders images in customer, cashier and waiter product cards.
- The already installed Sharp version is now an explicit, locked dependency.

Migration `202610230002_menu_management.sql` adds `image_version`, `is_archived`,
the archive/availability constraint and private photo storage/RPC. It has been
applied locally and database types regenerated. Apply it before deployment to
other environments.

## Verification

- ESLint, production build and TypeScript passed.
- Three schema tests cover field validation, currency precision, narrow availability
  and restore payloads, and prohibited identity/image/archive overrides.
- Live HTTP tests covered admin-only access, creation, image upload and replacement,
  resizing/WebP output, version/cache headers, forged image rejection, removal,
  availability, archival/restoration and preservation of historical item prices.
- Existing cashier HTTP tests passed again, including creation across all three
  channels, duplicate prevention, kitchen status updates and order completion.
- Test fixtures are removed by their tracked IDs. No demo products were removed.

For browser acceptance, create a temporary dish with your own photo, check it at
`/order` and in a cashier/table catalogue, then toggle availability, edit the price,
remove/restore the dish and check both themes on a phone and desktop. Browser
interaction and visual inspection remain manual because no browser was connected.
