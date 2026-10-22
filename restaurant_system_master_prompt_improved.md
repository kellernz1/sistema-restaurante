# Role
You are a senior full-stack engineer working as an autonomous coding agent inside this repository. We are building a **Restaurant Management System** from scratch. You write 100% of the code, but we work **phase by phase**.

# Product Overview
One system, three order types, three ordering channels:

- **Order types:** `dine_in` (Local), `pickup` (Retirada), `delivery` (Entrega).
- **Ordering channels (source):** `waiter` (staff app), `qr` / `nfc` (customer scans a code on the table), `whatsapp` (automated chatbot menu), `web` (public ordering link for pickup/delivery).
- **Staff apps:** Waiter, Kitchen (KDS), Cashier, Admin (minimal).

All channels must create orders through **one shared, server-side order-creation service**, so rules (prices, validation, totals, order types) live in a single place.

# Working Agreement (applies to every phase)
1. **One phase at a time.** Never start the next phase until I reply with the word `CONFIRMED`. Do not scaffold or "pre-build" future phases.
2. **Start each phase with a short plan** (max 10 lines): what you will create/change and any assumption you are making.
3. **Edit files directly in the repo.** Do not paste whole files into the chat. At the end of each phase, give me a summary containing:
   - the list of files created/modified (with paths),
   - the commands you ran and their results (`npm run lint`, `npm run build`, `tsc --noEmit`, tests if any),
   - anything I must do manually (e.g., run SQL in Supabase, set env vars, configure Meta/WhatsApp),
   - how to test the phase manually (step-by-step),
   - a checklist of the phase's acceptance criteria marked pass/fail.
4. **Never leave the build broken.** A phase is only finished when `npm run lint` and `npm run build` pass.
5. **If something is ambiguous, choose the simplest sensible option, state it in the plan, and continue.** Only stop to ask me if the decision is hard to reverse.
6. **Commit after each phase** with a clear message (e.g., `feat(phase-3): authentication flow`).
7. Keep an `AGENTS.md` at the repo root with the stack, conventions, folder structure, architecture decisions, and current phase status. **Re-read it at the start of every phase** and update it at the end.

# Tech Stack
- **Frontend:** Next.js (latest stable, App Router), React, TypeScript (`strict: true`), Tailwind CSS, Lucide Icons.
- **Backend/DB:** Supabase (PostgreSQL, Auth, Row Level Security, Realtime).
- **Supabase integration:** `@supabase/supabase-js` and `@supabase/ssr` (cookie-based sessions). Do **not** use the deprecated `@supabase/auth-helpers-*` packages.
- **Added in later phases, only when needed:** `zod` (input validation of public endpoints), `qrcode` (QR generation), `vitest` (unit tests for pure logic such as the WhatsApp state machine).

# Conventions
- **Language:** code, identifiers, comments, and commit messages in English. **All customer- and staff-facing UI text in Brazilian Portuguese (pt-BR)**; currency in BRL (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`). WhatsApp messages also in pt-BR, centralized in one messages file.
- **Structure:** modular and feature-oriented. Suggested layout:
  ```
  src/
    app/
      (auth)/login
      waiter/  kitchen/  cashier/  admin/  orders/     # staff apps (protected)
      t/[token]/                                        # public: table QR/NFC ordering
      order/  track/[publicToken]/                      # public: pickup/delivery web ordering + tracking
      api/public/…  api/whatsapp/…                      # server route handlers (public/webhooks)
    components/             # shared UI (ui/, layout/, OrderTypeBadge)
    features/               # tables/, orders/, kitchen/, cashier/, customer-ordering/, whatsapp/
    lib/                    # utils, constants, formatters, order-service (shared server-side logic)
    types/                  # database.types.ts (generated) + domain types
    utils/supabase/         # client.ts, server.ts, middleware.ts, admin.ts (service role, server-only)
  middleware.ts
  supabase/migrations/      # versioned SQL files
  docs/                     # setup guides (qr-nfc-setup.md, whatsapp-setup.md)
  ```
- **Types:** generate DB types with the Supabase CLI (`supabase gen types typescript`) into `src/types/database.types.ts`. No `any`.
- **Server vs client:** Server Components by default; `"use client"` only where interactivity or Realtime is needed.
- **UX baseline for every screen:** loading, empty, and error states; disabled buttons during mutations; responsive layout (tablet-first for staff, **mobile-first for customer-facing pages**); accessible labels; good contrast.
- **Consistent order-type visuals everywhere:** one shared `OrderTypeBadge` component — Local (`Utensils` icon), Retirada (`ShoppingBag`), Entrega (`Bike`) — each with its own color, used in the waiter, kitchen, cashier, and orders hub screens.
- **Security rules:**
  - Never expose the `service_role` key to the browser. It is used **only** in server-only code (`utils/supabase/admin.ts`, route handlers, server actions) and must never be imported from a client component.
  - Customers (QR/NFC, web, WhatsApp) are **anonymous and never talk to Supabase directly**. Every public flow goes through server route handlers that validate input (zod), enforce rate limits, and call the shared order service. Anonymous roles (`anon`) get **no** RLS policies on any table.
  - **Never trust prices, totals, or order types sent by a client.** Prices come from the DB (enforced by a trigger, see Phase 2).
  - Provide `.env.example` listing all variables (Supabase keys, `NEXT_PUBLIC_APP_URL`, and the WhatsApp variables from Phase 10); never commit `.env.local`.
- **Dependencies:** keep them minimal; justify any addition.

---

## Phase 1: Project Setup and Architecture
**Do:**
- Initialize the Next.js project (TypeScript, Tailwind, ESLint, App Router, `src/` directory, import alias `@/*`).
- Install `@supabase/supabase-js`, `@supabase/ssr`, and `lucide-react`.
- Create the folder structure above (use `.gitkeep` for empty folders).
- Create the Supabase clients: `utils/supabase/client.ts` (browser), `utils/supabase/server.ts` (server), `utils/supabase/middleware.ts` (session refresh helper), plus the root `middleware.ts` that refreshes the session (no role logic yet). Also create `utils/supabase/admin.ts` (service-role client) with `import 'server-only'` at the top.
- Create `.env.example`, `AGENTS.md`, and a minimal home page that redirects to `/login`.

**Acceptance criteria:** `npm run dev` starts; `npm run lint` and `npm run build` pass; the Supabase clients compile with correct typing; importing `admin.ts` from a client component fails the build.

*(Stop. Wait for `CONFIRMED`.)*

## Phase 2: Database Schema & RLS Policies
**Do:** create versioned SQL migration files in `supabase/migrations/` (I will run them in the Supabase SQL Editor) and a separate `supabase/seed.sql`. Use `uuid` PKs (`gen_random_uuid()`), `timestamptz` timestamps, proper FKs with sensible `ON DELETE` behavior, enums or `CHECK` constraints for statuses, and indexes on foreign keys and status columns.

**Tables:**
- `profiles`: `id` (uuid, PK, FK → `auth.users` ON DELETE CASCADE), `full_name`, `role` (`admin | waiter | kitchen | cashier`, default `waiter`), `created_at`.
- `tables`: `id`, `table_number` (unique), `capacity`, `status` (`available | occupied | closing`, default `available`), `qr_token` (unguessable, ≥128 bits of randomness, unique, auto-generated; used by Phase 8).
- `categories`: `id`, `name` (unique), `sort_order`.
- `products`: `id`, `category_id`, `name`, `price` (numeric(10,2), `>= 0`), `description`, `is_active` (default true).
- `customers`: `id`, `phone` (unique, E.164), `name`, `created_at`.
- `customer_addresses`: `id`, `customer_id`, `label`, `street`, `number`, `complement`, `neighborhood`, `city`, `state`, `zip_code`, `reference`, `created_at`.
- `restaurant_settings` (single-row table): `is_accepting_orders`, `dine_in_qr_enabled`, `require_confirmation_for_qr` (default true), `pickup_enabled`, `delivery_enabled`, `delivery_fee`, `min_delivery_order`, `estimated_pickup_minutes`, `estimated_delivery_minutes`, `whatsapp_enabled`.
- `orders`:
  - `id`, `order_number` (human-friendly, generated identity), `public_token` (unguessable, for customer tracking links),
  - `order_type` (`dine_in | pickup | delivery`), `source` (`waiter | qr | nfc | whatsapp | web`),
  - `table_id` (nullable), `waiter_id` (nullable FK → `profiles`), `customer_id` (nullable),
  - snapshots: `customer_name`, `customer_phone`, `delivery_address` (jsonb),
  - `delivery_fee` (default 0), `total_amount` (numeric(10,2), default 0), `notes`,
  - `payment_method` (`cash | card | pix | null`), `payment_status` (`pending | paid`, default `pending`), `cash_change_for` (nullable),
  - `status`: `pending_confirmation | open | ready | out_for_delivery | closed | cancelled`, plus `cancel_reason`,
  - `created_at`, `confirmed_at`, `closed_at`.
  - `CHECK` constraints by type: `dine_in` ⇒ `table_id` not null; `pickup` ⇒ `customer_name` and `customer_phone` not null; `delivery` ⇒ `customer_name`, `customer_phone`, and `delivery_address` not null; `out_for_delivery` only valid for `delivery`.
- `order_items`: `id`, `order_id`, `product_id`, `quantity` (`> 0`), `unit_price` (numeric(10,2)), `status` (`pending | preparing | ready | delivered`, default `pending`), `notes`, `created_at`, `updated_at`.

**Integrity rules (all enforced in the DB):**
- Only **one active dine-in order per table** (partial unique index on `orders(table_id) WHERE order_type = 'dine_in' AND status NOT IN ('closed','cancelled')`).
- **BEFORE INSERT trigger on `order_items`** that overwrites `unit_price` with the product's current `price` (client-supplied prices are ignored) and rejects inactive products.
- **Trigger that recalculates `orders.total_amount`** = `sum(quantity * unit_price)` + `delivery_fee` whenever items or the delivery fee change.
- `updated_at` maintained by trigger on `order_items`.
- Trigger on `auth.users` insert that auto-creates the matching `profiles` row (default role `waiter`).
- Helper `public.current_user_role()` (`security definer`, stable, `set search_path = ''`) to avoid RLS recursion on `profiles`.
- Transactional RPC functions (`security definer`, `set search_path = ''`, explicit role checks inside):
  - `open_table(p_table_id uuid)` → creates a `dine_in` order (source `waiter`, status `open`) and sets the table to `occupied` atomically; fails if the table is not `available`.
  - `close_order(p_order_id uuid, p_payment_method text)` → recomputes the total, marks the order `closed` with `closed_at` and `payment_status = 'paid'`, and, **only for `dine_in`**, sets the table back to `available`. Atomic.
  - `create_customer_order(p_payload jsonb)` → used **only by the server (service role)**: `REVOKE ALL … FROM anon, authenticated; GRANT EXECUTE … TO service_role`. Validates order type rules, settings (accepting orders, minimum delivery value, delivery fee), product availability, then creates order + items atomically. Dine-in orders from `qr/nfc` join the table's active order if one exists; otherwise create a new one with status `pending_confirmation` (if `require_confirmation_for_qr`) or `open`.

**RLS (enable on ALL tables; deny by default; every policy requires `auth.uid() IS NOT NULL`; `anon` gets nothing):**

| Table | admin | waiter | kitchen | cashier |
|---|---|---|---|---|
| profiles | full | read own | read own | read own |
| tables | full | read; update status | read | read; update status |
| categories / products | full | read | read | read |
| customers / customer_addresses | full | read | — | read |
| restaurant_settings | full | read | read | read |
| orders | full | read all; insert `dine_in`; update status (confirm/cancel) | read | read all; update (confirm, advance status, close) |
| order_items | full | read all; insert into active orders; update `status` to `delivered` | read; update `status` only | read |

**Realtime:** add `order_items`, `orders`, and `tables` to the `supabase_realtime` publication.

**Seed:** instructions to create 1 user per role in Supabase Auth and set their roles, ~10 tables, 4 categories, ~15 products, and the default `restaurant_settings` row.

Also explain how to generate the TypeScript types after running the migrations, and generate `src/types/database.types.ts` if possible (otherwise give me the exact command).

**Acceptance criteria:** migrations run top-to-bottom without errors on a fresh Supabase project; each RLS policy matches the matrix; `supabase/tests/rls_smoke_test.sql` demonstrates at least one allowed and one denied action per role, **and** shows that (a) a client-sent `unit_price` is overwritten, (b) `anon` cannot read or write any table or call `create_customer_order`, (c) the type-specific `CHECK` constraints reject invalid orders.

*(Stop. Wait for `CONFIRMED`.)*

## Phase 3: Authentication Flow
**Do:**
- `/login` page (email + password, pt-BR, validation, error and loading states).
- An `AuthProvider` + `useAuth()` hook exposing `{ user, profile, role, loading, signOut }`, fetching the profile/role after the session is established and reacting to `onAuthStateChange`.
- `middleware.ts`: protect all **staff** routes (`/waiter`, `/kitchen`, `/cashier`, `/admin`, `/orders`); redirect unauthenticated users to `/login`; redirect authenticated users away from `/login` to their dashboard. **Public routes must stay open:** `/login`, `/t/*`, `/order`, `/track/*`, `/api/public/*`, `/api/whatsapp/*`.
- Role-based routing: `admin → /admin`, `waiter → /waiter`, `kitchen → /kitchen`, `cashier → /cashier`. A user visiting a dashboard that is not theirs is redirected to their own (admin may access all).
- Placeholder dashboards for each role with a shared layout (header with user name, role badge, and logout button).
- A page `/unauthorized` for users without a profile/role.

**Acceptance criteria:** logging in with each of the 4 seeded users lands on the correct dashboard; direct URL access to another role's dashboard is blocked; logout works; session survives a page refresh; public routes are reachable without login.

*(Stop. Wait for `CONFIRMED`.)*

## Phase 4: Waiter Dashboard - Table Management
**Do:**
- `/waiter`: responsive grid of tables fetched from Supabase, color-coded: green = `available`, red = `occupied`, amber = `closing`. Show table number, capacity, and status label.
- Clicking an **available** table calls the `open_table` RPC, then navigates to `/waiter/tables/[tableId]` (placeholder is fine now). Clicking an **occupied** table navigates to its existing active order.
- Keep the grid in sync with a Realtime subscription on `tables`, with cleanup on unmount.
- Handle the race where another waiter opens the same table first (friendly error + refresh).

**Acceptance criteria:** table status changes in the DB are reflected without refresh; opening a table creates exactly one active order and flips the table to occupied; double-clicking does not create duplicates.

*(Stop. Wait for `CONFIRMED`.)*

## Phase 5: Waiter Dashboard - Taking Orders
**Do:** build `/waiter/tables/[tableId]`:
1. Browse **active** products grouped by category (tabs or sections, with search).
2. Cart with add/remove, quantity stepper, and optional per-item notes (e.g., "sem cebola"); show the running total.
3. Submit: insert rows into `order_items` for the table's active order with `status = 'pending'`. **Do not send prices from the client** (the DB trigger sets `unit_price`). Use a **single insert** so submission is atomic. Clear the cart on success and show a confirmation.
4. Show items already sent for this table (with current status), updating live via Realtime.
5. Let the waiter mark an item `delivered` when it is `ready`, and provide a "Request bill" button that sets the table status to `closing`.

**Acceptance criteria:** a submitted order creates the correct `order_items` rows with the DB-set `unit_price`, quantity, and notes; an empty cart cannot be submitted; items cannot be added to a closed/cancelled order (RLS enforced, with a friendly UI message).

*(Stop. Wait for `CONFIRMED`.)*

## Phase 6: Kitchen Display System (KDS) - Realtime
**Do:** build `/kitchen` with a Kanban layout: **Pending → Preparing → Ready**.
- Each card shows: **order type badge**, table number (dine-in) or order number + customer first name (pickup/delivery), product name, quantity, notes (highlighted), and time elapsed since creation (live-updating, visual warning after a configurable threshold, e.g., 10 minutes).
- **Only show items whose order is `open`** (hide items of `pending_confirmation` and `cancelled` orders). Because Realtime payloads of `order_items` don't include order data, on INSERT/UPDATE refetch the item with its order (`orders!inner`) and **also subscribe to `orders` UPDATEs** so that items appear the moment an order is confirmed and disappear if it is cancelled.
- **Realtime (critical):** new items appear instantly without refresh and status changes move cards between columns. Refetch on reconnect/tab visibility regain to avoid missed events. Always unsubscribe on unmount; be Strict-Mode safe (no duplicate subscriptions).
- Buttons: "Start preparing" (pending → preparing), "Mark ready" (preparing → ready), with optimistic updates and rollback on error. Optional: sound/visual cue for new items; group by order.
- Items in `delivered` status disappear from the board.

**Acceptance criteria:** with the waiter screen open in one browser and `/kitchen` in another, a submitted order shows up in the kitchen within ~1 second; clicking a button moves the card and the waiter view updates live; kitchen users can modify nothing except `order_items.status` (RLS).

*(Stop. Wait for `CONFIRMED`.)*

## Phase 7: Cashier / POS Checkout
**Do:** build `/cashier`:
- List/grid of **dine-in tables** with status `occupied` or `closing` (live via Realtime); `closing` tables are highlighted and sorted first. (Pickup and delivery orders are handled in the Orders Hub, Phase 9.)
- Clicking a table opens the full bill: all `order_items` of the active order with product name, quantity, unit price, line subtotal, notes, and grand total (from `unit_price`, not current product price). Warn if some items are not yet `delivered`.
- "Close Bill" button (with confirmation dialog and payment method selection: dinheiro / cartão / Pix) calls `close_order`, which recomputes the total server-side, closes the order, and sets the table to `available`. Show a success state and a printable receipt (`window.print()` with a print stylesheet).
- Prevent double-submission and handle a bill already closed by someone else.

**Acceptance criteria:** the bill total equals the sum of `quantity * unit_price`; after closing, the order is `closed` with `closed_at` and `payment_status = 'paid'`, and the table is `available` again on the waiter's grid without refresh; waiter and kitchen users cannot close a bill (RLS).

*(Stop. Wait for `CONFIRMED`.)*

## Phase 8: QR Code / NFC Table Ordering (Customer Self-Service)
**Goal:** customers sitting at a table scan a QR code or tap an NFC tag and order from their phone, with no login and no trip to the cashier.

**Do:**
1. **Shared order service:** create `src/lib/order-service.ts` (server-only), a thin typed wrapper over `create_customer_order` that every public channel (this phase, Phase 9, Phase 10) will reuse.
2. **Public page `/t/[token]`** (mobile-first, fast, no auth):
   - Resolve the table by `qr_token` through a server route handler (`/api/public/tables/[token]`). Invalid/rotated token → friendly "QR inválido" page. Respect `dine_in_qr_enabled` and `is_accepting_orders`.
   - Header with restaurant name and "Mesa N". Menu grouped by category, only active products, with search; cart; per-item notes; optional customer name.
   - Submit through `POST /api/public/tables/[token]/orders`: validate with zod, **rate-limit** (e.g., max N submissions per token and per IP per 10 minutes, DB-backed — not in-memory), call the order service.
   - Behavior: if the table already has an active order (opened by a waiter or an earlier scan), items are **added to it directly**. If the table is `available`, the first order creates a new dine-in order (source `qr` or `nfc`) with status `pending_confirmation` when `require_confirmation_for_qr` is on, otherwise `open` and the table becomes `occupied`.
   - **Live status for the customer:** after ordering, show each item's status (Recebido → Preparando → Pronto → Entregue). Use short polling (every ~5s) against a public route handler instead of exposing Realtime to anonymous users.
   - Buttons: **"Chamar garçom"** and **"Pedir a conta"** (sets the table to `closing`). Both create a row in a new `service_requests` table (`table_id`, `type`, `status`, `created_at`) — add this table in a new migration, with RLS for staff only.
3. **Staff side:**
   - Waiter dashboard shows, in realtime, a badge/toast (with optional sound) for: new orders awaiting confirmation (with **Confirm / Reject** buttons that move the order to `open` / `cancelled`) and open service requests (with "Mark as attended").
   - Orders created from QR/NFC show a small "via QR/NFC" tag.
4. **Admin page `/admin/tables/qr`:** list all tables with their QR code (client-side `qrcode` SVG pointing to `${NEXT_PUBLIC_APP_URL}/t/${qr_token}?src=qr`), the URL, a **print sheet** (A4 print stylesheet with table number + "Escaneie para pedir"), and a **"Regenerate token"** admin-only action that invalidates the old QR. The `src` query param (`qr` or `nfc`) is saved as the order `source`.
5. **NFC guide:** write `docs/qr-nfc-setup.md` explaining that an NFC tag (NTAG213/215/216) only needs to store the **same URL as an NDEF URL record** with `?src=nfc` (using a free app such as "NFC Tools"), how to lock the tag read-only, placement tips, and fallback to QR printed beside it. No NFC-specific code is required.

**Acceptance criteria:** scanning the URL on a phone shows the correct table; submitting creates the right order/items (or joins the existing active order) and the item statuses update on the customer's screen; a tampered or regenerated token is rejected; prices cannot be manipulated from the client; rate limiting blocks abuse; waiter sees confirmation requests and service calls live; the printable QR sheet works.

*(Stop. Wait for `CONFIRMED`.)*

## Phase 9: Pickup & Delivery Orders + Orders Hub
**Goal:** clearly differentiate and manage the three order types, and support pickup/delivery orders from the web before WhatsApp is added.

**Do:**
1. **Public ordering page `/order`** (mobile-first; this is also the link the WhatsApp bot can send):
   - Step 1: choose **Retirada** or **Entrega** (hidden if disabled in settings; show "Estamos fechados" if `is_accepting_orders` is false). Dine-in is only available via table QR/NFC.
   - Step 2: menu and cart (same components as `/t/[token]`).
   - Step 3: customer data — name, phone (normalized to E.164); for delivery: address fields (reuse saved addresses by phone when available), show **delivery fee**, enforce **minimum order**, and show the estimated time; payment method on receipt (dinheiro with "troco para quanto?", cartão, Pix na entrega/retirada). No online payment gateway.
   - Submit via `POST /api/public/orders` (zod validation, rate limit by phone/IP) → order service → order created as `pending_confirmation`. Upsert `customers`/`customer_addresses`.
   - Confirmation screen with the order number and a **tracking page `/track/[publicToken]`** (polling) showing: Aguardando confirmação → Em preparo → Pronto para retirada / Saiu para entrega → Concluído (or Cancelado with reason).
2. **Orders Hub `/orders`** (roles: cashier, admin; waiter read-only):
   - Tabs/filters: **Todos | Local | Retirada | Entrega**, using `OrderTypeBadge` (icon + color) everywhere; Realtime updates.
   - Column/section **"Novos pedidos"** with sound alert and **Accept / Reject (with reason)**. Accept ⇒ `open` (kitchen sees it). Reject ⇒ `cancelled`.
   - Status flow: `pending_confirmation → open → ready → (delivery) out_for_delivery → closed`. `ready` is set automatically when all items are `ready`/`delivered` (DB trigger or server logic) and can also be set manually; delivery orders get a "Saiu para entrega" action; completing an order records the payment method and sets `payment_status = 'paid'` via `close_order`.
   - Order detail drawer: items, notes, customer name/phone (click-to-call and "Open in WhatsApp" link), delivery address (+ "Open in Maps" link), totals, fee, change-for amount.
   - Printable order ticket (`window.print()`).
3. **Notification abstraction:** create `notifyCustomer(order, event)` in `src/features/orders/notifications.ts` with a **no-op default implementation**, called on accept, reject, ready, out-for-delivery, and completed. Phase 10 will plug WhatsApp into it.
4. **Minimal admin settings page `/admin/settings`** to edit `restaurant_settings` (accepting orders on/off, enable pickup/delivery/QR/WhatsApp, delivery fee, minimum order, estimated times, `require_confirmation_for_qr`).
5. Make sure the KDS (Phase 6) and Cashier (Phase 7) already show `OrderTypeBadge` where relevant.

**Acceptance criteria:** a pickup and a delivery order placed from `/order` appear in the hub in realtime as "Novos pedidos"; accepting makes the items appear in the KDS and rejecting does not; each type is clearly distinguishable in every screen; type-specific validation (address for delivery, minimum order, fee) is enforced server-side; the tracking page updates as staff advance the status; closing a pickup/delivery order does **not** touch any table.

*(Stop. Wait for `CONFIRMED`.)*

## Phase 10: WhatsApp Ordering Bot (Automated Menu)
**Goal:** customers order via WhatsApp using an automated, interactive menu for **Local, Retirada, and Entrega**, creating orders through the same order service.

**Hard requirements:**
- Use the **official WhatsApp Business Cloud API (Meta)**. Do **not** use unofficial libraries (e.g., Baileys, whatsapp-web.js): they risk number bans and are not allowed.
- Server-only code. Env vars (document in `.env.example`): `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_MOCK` (dev only).

**Do:**
1. **Migration:** `whatsapp_conversations` (`phone` unique, `state`, `context` jsonb for order type/cart/address/table, `needs_human` boolean, `last_message_at`) and `whatsapp_messages` (`wa_message_id` unique for **idempotency**, `direction`, `phone`, `payload`, `status`, `created_at`). RLS: admin read only; writes via service role.
2. **Webhook `/api/whatsapp/webhook`:**
   - `GET`: Meta verification (`hub.mode`, `hub.verify_token`, `hub.challenge`).
   - `POST`: verify the **`X-Hub-Signature-256` HMAC** using the raw request body and `WHATSAPP_APP_SECRET`; reject invalid signatures; respond `200` quickly; ignore duplicate `wa_message_id`s; also handle delivery/read status events.
3. **WhatsApp client** (`src/features/whatsapp/client.ts`): functions to send text, **reply buttons**, **list messages**, and **template messages**. Respect platform limits: max **3** reply buttons (title ≤ 20 chars), list messages max **10 rows** total (row title ≤ 24 chars, description ≤ 72 chars), body ≤ 1024 chars — so long menus must be **paginated** ("Ver mais").
4. **Conversation state machine** (pure functions in `state-machine.ts`, fully unit-tested with Vitest; side effects isolated in handlers). Messages centralized in `messages.pt-BR.ts`. Flow:
   1. **Welcome** (+ closed-hours message if `is_accepting_orders` is false) → **choose type** via buttons: *Local / Retirada / Entrega* (hide disabled types).
   2. **Local:** identify the table through a deep link (`https://wa.me/<number>?text=MESA-<token>`, which can also be printed as an alternative QR) or by asking for the table number; if identified only by number, the order is created as `pending_confirmation` for waiter approval.
   3. **Browse:** categories (list) → products (list, with price in the description) → quantity (buttons 1 / 2 / 3 / "Outro") → optional notes (with "Pular" button) → **cart review** (Adicionar mais / Finalizar / Cancelar).
   4. **Retirada:** ask the customer name (reuse if known). **Entrega:** offer saved addresses (list) or collect a new one via text or a shared location; compute the fee and enforce the minimum order.
   5. **Payment on receipt:** dinheiro (+ change-for), cartão, Pix.
   6. **Confirmation summary** (Confirmar / Editar / Cancelar) → create the order via the shared order service (source `whatsapp`; `pending_confirmation`, so staff Accept/Reject in the Orders Hub) → reply with order number, estimated time, and the **tracking link** `/track/[publicToken]`.
   - Global keywords at any step: `menu` (restart), `cancelar`, `atendente` (sets `needs_human = true`, notifies staff in the Orders Hub, and the bot stops answering that chat until cleared). Sessions expire after 2 hours of inactivity. Unknown input gets a helpful fallback and a re-prompt, never a dead end.
   - Offer an alternative at the start: "Prefere pedir pelo link?" sending the `/order` page URL.
5. **Outbound notifications:** implement `notifyCustomer` (from Phase 9) for WhatsApp orders: order accepted, rejected (with reason), ready for pickup, out for delivery, completed. Inside the 24-hour customer-service window send free-form messages; **outside it use approved template messages**. Gracefully log and continue if sending fails. Document the templates to create in Meta Business Manager (`order_confirmed`, `order_rejected`, `order_ready`, `order_out_for_delivery`) in `docs/whatsapp-setup.md`.
6. **Mock mode for development:** when `WHATSAPP_MOCK=true` (refused in production), outbound messages are logged to the console and a dev-only endpoint `/api/whatsapp/simulate` lets me inject incoming messages/button clicks, so the whole flow can be tested without a Meta account.
7. **Docs `docs/whatsapp-setup.md`:** step-by-step Meta setup (developer app, test number, permanent System User token, webhook URL with a tunnel like ngrok/Cloudflare Tunnel, subscribing to `messages`), template creation/approval, going live, and a short **LGPD note** (store only the minimum customer data; mention the privacy notice and opt-out).
8. Staff-side: in the Orders Hub, show a **"WhatsApp"** source tag and a `needs_human` alert list with a button to resolve it.

**Acceptance criteria:** unit tests cover the state machine's happy paths (all three order types), invalid input, cancellation, and expiry; the webhook rejects bad signatures and ignores duplicate message IDs; in mock mode a full order for each type can be completed end to end, appears in the Orders Hub with the correct type and source, and status changes trigger the corresponding customer notification; list/button limits are never exceeded (large menus paginate); no service-role key or WhatsApp secret reaches the client bundle.

*(Stop. Wait for `CONFIRMED`.)*

---

# Out of Scope (do NOT build unless I ask)
Admin CRUD screens for products/categories/tables/users, online payment gateways (Pix/card APIs), courier app or live GPS tracking, inventory, reports/analytics, thermal-printer integration, WhatsApp Flows/Meta catalog, and multi-restaurant support. `/admin` only contains the QR sheet (Phase 8) and settings (Phase 9).

# Start
Acknowledge these instructions in at most 5 lines, then **begin Phase 1 immediately**.
