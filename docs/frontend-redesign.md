# Visual refresh

## Scope

The application uses Next.js, React and Supabase. Authentication still uses email
and password. No PIN authentication, routes, database fields, endpoints, Realtime
subscriptions, order mutations or print handlers were changed. No dependencies,
external fonts or remote images were added.

`src/app/globals.css` imports `screen-theme.css` after Tailwind. The new theme is
entirely inside `@media screen`. It also imports `lineup.css` for shared lineup
components. Their selectors override the legacy screen theme
without changing the existing receipt, order or QR print rules or their variables.
Decorative catalogue placeholders are CSS backgrounds and do not appear in print.

## Stages and verification

1. **Shared design system** — `src/app/globals.css`, `src/app/screen-theme.css`.
   System fonts, neutral surfaces, blue actions, rounded cards, touch targets,
   visible focus, reduced motion and automatic dark mode. Check login and staff
   navigation with keyboard, light/dark system preferences and narrow viewports.
2. **Orders** — `src/features/orders/orders-hub.tsx` and the theme's Orders section.
   Status pills use the existing status values. Check channel filters, selection,
   sound control, refresh, handoff controls and role-based action visibility.
3. **Table service** — the theme's Table service section. Check table map, service
   alerts, product search, quantities, notes, submission and delivery controls.
4. **Kitchen** — the theme's Table service and kitchen section. Check the three
   columns, elapsed-time warning, notes, preparing/ready actions and touch layout.
5. **Cashier** — the theme's Cashier section. Check table selection, totals,
   confirmation dialog, payment and closed-bill print preview.
6. **Public catalogue** — `src/features/customer-ordering/menu-cart.tsx` adds only
   a grid wrapper. The theme supplies local decorative product placeholders.
   Check categories, search, cart editing, delivery/pickup steps, address/payment
   inputs, minimum amount, submission and tracking. Check QR/NFC table ordering.
7. **Login and auxiliary screens** — the theme's remaining sections. Check email
   and password, loading/error messages, unauthorized access, administration,
   settings, QR controls and local WhatsApp simulator.

Use 390px, 768px and 1440px viewport widths. Verify large text, keyboard focus,
dark mode and reduced motion. The header may wrap on smaller screens; operational
lists and detail panels stack. Kitchen columns stack on phones.

## Functional acceptance

With the local Supabase stack running and demo accounts available:

- Create a test order from the waiter and public catalogue, confirm offsite orders
  as cashier/admin, and verify the kitchen receives the items.
- Advance kitchen items, verify readiness at the waiter/orders views, request the
  bill, close it through the existing confirmation and check totals.
- Compare browser print previews for a closed bill, an offsite order and the A4
  QR sheet. Screen-only theme rules must not apply to the printed document.
- Confirm role restrictions, disabled/loading controls and connection errors.

Static checks: `npm.cmd run lint`, `npm.cmd run build` (includes TypeScript).
Browser appearance, database-backed acceptance and physical printing require a
running local environment; static checks do not establish those results.

## Lineup refinement

Reference: [Apple iPhone lineup](https://www.apple.com/iphone/).

- `src/components/ui.tsx`: pill button, arrow link/button, lineup card,
  segmented control and status pill. `src/app/lineup.css` supplies the shared
  gradients, layout, system font and light/dark tokens.
- `src/features/orders/orders-hub.tsx`: channel segments with counts for the
  loaded list, per-channel card tones, elapsed time and a quick confirmation
  button invoking the original acceptance handler. Detail selection still loads
  the existing ticket data and payment choice.
- `src/features/orders/order-details.tsx`: sticky desktop panel and mobile bottom
  sheet, close button/backdrop/Escape, keyboard focus containment and restoration.
  Existing ticket actions remain in a sticky footer. Print uses the original
  ticket presentation.
- `src/features/whatsapp/human-handoffs.tsx`: native expandable summary. The same
  polling, role restrictions and handoff resolution remain in place. A polling
  error remains visible even when the banner is collapsed.
- `src/app/(staff)/admin/page.tsx`: four metric cards. Counts are exact queries
  using the existing authenticated/RLS client. Daily revenue sums paid, closed
  orders by `closed_at`, using integer cents and paginated reads, for the current
  Sao Paulo business day (UTC-3). Refresh the page to refresh these indicators.
  Errors display a dash rather than a false zero. No schema or API was added.
- `src/components/product-card.tsx`: shared public/staff catalogue card, originally
  using a decorative local plate/icon placeholder. Dish photos are now supported;
  see `docs/menu-management.md`. The placeholder remains for products without photos.
  Existing add-to-cart callbacks and disabled conditions remain unchanged.
- `src/features/tables/qr-sheet.tsx`: large gradient-backed QR artwork, SVG download
  generated locally, and printing of either one table or the entire A4 sheet.
  Token rotation and QR readiness checks remain in place. `lineup.css` adds an
  opt-in print selector for a single table and a transparent artwork wrapper in
  print; original receipt and A4 QR print declarations are unchanged.

### Verification performed

- Lint and production build, including TypeScript: passed.
- Existing WhatsApp Vitest suite: 27 passed.
- Existing native validation/HTTP suites: 19 passed; 2 optional webhook tests
  skipped without their dedicated credentials. The WhatsApp smoke suite must
  inherit `.env.local` to match the server's local simulator mode.
- Authenticated HTTP/server-payload checks: `/admin`, `/orders`,
  `/admin/tables/qr`, `/cashier`, `/kitchen`, and public `/order`: HTTP 200.
- Dashboard query error state was absent; health reported a reachable database;
  the public menu returned 29 products in this local environment.
- CSS parsed successfully; original print blocks compared equal to the repository
  version; neither theme stylesheet references remote assets.
- No browser was available through the connected automation surface. Screenshots,
  visual light/dark/mobile QA, client interactions, download opening and physical
  print acceptance remain manual checks. HTTP checks do not verify hydration.

### How to test this revision

1. Run `npm.cmd run local:start`. Open `http://localhost:3000/login`, sign in with
   the existing demo administrator, then use **Meu painel** and **Pedidos**.
2. On **Pedidos**, switch all four segments, compare counts, expand WhatsApp and
   open **Detalhes**. On a phone-sized viewport, verify the sheet scrolls, footer
   actions stay accessible, Tab remains inside it and Escape/Fechar restores focus.
   Confirm only an intentionally created test order, since this invokes the real
   existing acceptance endpoint.
3. Check `/order` and a waiter table: search, add a product, adjust quantities and
   confirm the same totals and notes. Test QR/NFC ordering with a current table URL.
4. On **QR codes**, download a table's SVG and scan it. **Imprimir** must show only
   that table; **Imprimir folha A4** must show all tables. Cancel and repeat, then
   test printing an order and a closed bill.
5. Repeat at 390px, 768px and 1440px in light and dark system modes. Check that
   there is one primary action per product/QR/order card, no serif screen titles,
   visible keyboard focus and no overflow.
6. Run `npm.cmd run local:stop` when finished. Database data is preserved.

## Manual theme selection

The bottom-right **Tema** control is shared by all routes, including login and
public ordering. **Claro** and **Escuro** override the operating system;
**Automático** follows `prefers-color-scheme`. The preference is saved locally
under `mesa-certa-theme`, synchronized between tabs, and applied before hydration.
When browser storage is blocked, switching still works on the current page.
The control and all explicit theme tokens are excluded from print.

Check each selection, navigate between pages and reload. In automatic mode, change
the system appearance; in manual mode, confirm the page keeps its chosen theme.
# Settings navigation

Restaurant settings now use four focused sections: Atendimento, Entrega e taxas, Localização and WhatsApp. Employees remain in the existing separate settings tab. The desktop section menu becomes a compact grid on phones. One shared form state preserves unsaved edits across section changes; the sticky save bar indicates pending changes and saves the entire configuration together. Grouped fields and contextual links replace the previous long single panel. Files: `src/features/settings/settings-form.tsx`, `src/app/settings.css`, and the stylesheet import in `src/app/globals.css`. Backend fields, permissions and pricing behavior are unchanged. Verify by editing a setting, switching sections, returning to confirm the edit is preserved, and saving. Also verify fixed/distance fee fields and location editing on mobile and desktop.
