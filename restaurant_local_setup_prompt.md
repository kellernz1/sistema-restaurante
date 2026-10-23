# Role
You are a senior full-stack/DevOps engineer working as an autonomous coding agent **inside the existing repository** of our Restaurant Management System (Next.js App Router + TypeScript + Tailwind + Supabase; 10 phases already implemented: auth, waiter, kitchen KDS, cashier, QR/NFC table ordering, pickup/delivery, Orders Hub, WhatsApp bot).

# Goal
Make the whole system run **100% locally** on one restaurant computer — **no hosting, no VPS, no cloud services** — and ship it with **ready-to-use demo data** so I can test every feature right after setup. Staff tablets and customer phones on the **same Wi-Fi/LAN** must be able to use it.

# Ground rules
1. **Do NOT rebuild or rewrite features.** Change business logic only when something blocks local operation, and explain why. Keep all existing tests passing.
2. **Audit first, then change.** Read `AGENTS.md`, `package.json`, `supabase/migrations`, `.env.example`, `middleware.ts`, and `src/utils/supabase/*`. Adapt to the real paths and names you find; do not assume the structure in this prompt is exact.
3. Work in the stages below, **commit after each stage** (`chore(local): …`), and keep `npm run lint` and `npm run build` green at all times.
4. **Scripts must be cross-platform** (Windows, macOS, Linux): write them in Node (`.mjs`), not bash/PowerShell. Add no heavy dependencies; justify any addition.
5. If Docker or the Supabase CLI is **not available in your environment**, do everything verifiable statically (lint, typecheck, build, dry-runs of scripts) and clearly list what I must run on my machine. Never claim something was tested if you could not run it.
6. Stop and ask only for decisions that are hard to reverse. Otherwise choose the simplest sensible option, state it, and continue.

# Verified facts about this repository (audited from GitHub; re-check each one before acting)
- Stack/versions: Next.js 16.4 (uses `src/proxy.ts`, not `middleware.ts`), React 19, `@supabase/ssr`, zod 4, vitest 5. Read `node_modules/next/dist/docs/` before touching Next.js APIs (see `AGENTS.md`).
- **There is no `supabase/config.toml`** and no local-Supabase tooling. `docs/supabase-setup.md` describes only a hosted project plus manual SQL Editor steps.
- 4 migrations exist (`202610220001` … `202610220004`). **`AGENTS.md` says migrations were never executed against a live database** ("live acceptance pending"). Expect real SQL errors the first time `db reset` runs on a clean database — fixing them is part of this task, and every fix must be reported.
- `docs/supabase-setup.md` references SQL tests that are **missing from the repo** (`table_self_service_test.sql`, `whatsapp_bot_test.sql`). Only `rls_smoke_test.sql` and `offsite_orders_test.sql` exist. Report this; recreate the missing tests only if cheap, otherwise list them as pending.
- `supabase/seed.sql` already seeds settings, 10 tables, 4 categories, 15 products, and **updates roles by e-mail** for `admin@`, `garcom@`, `cozinha@`, `caixa@restaurante.local` — but those auth users must exist first, and during `db reset` they do not, so the role update silently does nothing. The existing convention is the `@restaurante.local` domain; keep it.
- `.env.example` already contains `WHATSAPP_MOCK`, `WHATSAPP_WORKER_SECRET`, `PUBLIC_TRUST_PROXY`, and `NEXT_PUBLIC_APP_URL`.
- `src/app/layout.tsx` has **no** external fonts and `src/` has no hardcoded external asset URLs, so offline build is likely already fine (verify with a real `npm run build` and no network if possible).
- **`crypto.randomUUID()` is used in client components** (`features/orders/table-order.tsx`, `features/customer-ordering/offsite-menu.tsx`, `features/customer-ordering/table-menu.tsx`). On plain `http://<LAN-IP>:3000` this API is undefined, so the **"Adicionar" button would throw on phones and tablets**. This is a real blocker and must be fixed with a tiny fallback helper (server-side uses are fine).
- **WhatsApp mock is blocked in production mode:** `mockAllowed()` in `src/features/whatsapp/security.ts` returns true only when `NODE_ENV === "development"` and `WHATSAPP_MOCK === "true"`, and `docs/whatsapp-setup.md` says `npm run start` does not allow the mock. A `next start` local deployment therefore cannot use the simulator.
- **The WhatsApp queue needs a scheduled worker.** `/api/whatsapp/process` drains the queue and is protected by `Bearer WHATSAPP_WORKER_SECRET`; background draining otherwise relies on Next's `after()` after a request. With no cloud scheduler, outbound notifications can stay queued, so a local scheduler is required.
- The existing `tests/*.test.mjs` smoke tests need `PUBLIC_TEST_URL`; `npm run test:whatsapp` runs only Vitest. There is no unified smoke command.
- The repo also contains `conversa-restaurante.md` and a copy of the master prompt; leave them alone but do not copy their contents into docs.

---

## Stage A — Audit for cloud/online dependencies
Produce a short report (and save it to `docs/local-audit.md`) listing every place where the app needs internet or a hosted service **at build time or runtime**, and then fix each one:
- Hardcoded `supabase.co` URLs, hosted keys, or env vars pointing to the cloud.
- Fonts/CDNs/remote images: the audit found none, so just confirm by building offline (`npm run build` with the network disabled if you can) and by grepping the built output for external hosts. Set `NEXT_TELEMETRY_DISABLED=1` in the scripts/env.
- Remote images, analytics, external APIs, or telemetry → remove or make optional. Set `NEXT_TELEMETRY_DISABLED=1` in the scripts/env.
- **Secure-context-only browser APIs.** The app will be served over plain `http://<LAN-IP>:3000`. Replace the three client-side `crypto.randomUUID()` calls listed above with a shared `uuid()` helper in `src/lib` that uses `crypto.randomUUID` when available and a `crypto.getRandomValues`/`Math.random` fallback otherwise; then grep again for `navigator.clipboard`, `wakeLock`, and `serviceWorker` and add fallbacks if any appear.
- Alert sound: `orders-hub.tsx` already has a sound toggle backed by `AudioContext`; verify it works after a tap on a tablet. Check whether `kitchen-board.tsx` needs the same toggle for new items and add it only if missing.
- Cookie/session behavior under `next start` on plain HTTP: verify that `@supabase/ssr` cookies are **not** forced to `Secure` and that login persists across refresh over `http://<LAN-IP>:3000`.

## Stage B — Local Supabase (Docker)
1. Ensure `supabase/config.toml` exists (`npx supabase init` if not) and configure it for local use: fixed ports documented, `project_id` set, email confirmations **disabled**, signup limited as appropriate, Realtime enabled, Studio kept on.
2. **Migrations must apply cleanly from zero** with `npx supabase db reset` (all migrations in order, then `supabase/seed.sql`). Fix ordering/idempotency problems in a new migration whenever possible (edit an existing migration only if it cannot run on a fresh database, and say so).
3. Verify the Realtime publication includes `order_items`, `orders`, `tables`, and `service_requests`, and that RLS is enabled on every table.
4. **Security for LAN use (important):** the Supabase CLI's default local JWT secret and keys are **publicly known demo values**. Because other devices on the LAN will reach the API, configure a **custom random `jwt_secret` (≥ 32 chars) and generate matching `anon` and `service_role` keys**, using whichever mechanism the installed CLI version supports (verify in the CLI's current docs/help — do not guess). Store the secret in a git-ignored file. Never expose the service-role key to the client bundle (confirm with a build grep).

## Stage C — Environment and scripts
Create Node scripts in `scripts/` and `npm` commands in `package.json`:

| Command | Behavior |
|---|---|
| `npm run local:setup` | One-shot first-time setup: checks Node/Docker/CLI versions (clear error messages), starts Supabase, applies migrations + base seed, generates `.env.local`, creates staff users, and prints `local:info`. Idempotent. |
| `npm run local:env` | (Re)generates `.env.local` from `supabase status`, using the **machine's LAN IP** for `NEXT_PUBLIC_APP_URL` (`http://<LAN-IP>:3000`) **and** `NEXT_PUBLIC_SUPABASE_URL` (`http://<LAN-IP>:54321`, because staff tablets' browsers connect to Supabase directly for Realtime — `127.0.0.1` would not work from other devices). Allow overriding the IP with `--ip` or `LAN_IP`. Warn loudly if only a loopback IP is detected. |
| `npm run local:start` / `local:stop` | Start/stop Supabase and the app (production mode: `next build` if needed, then `next start -H 0.0.0.0`). Data must persist between stops. |
| `npm run dev:lan` | `next dev -H 0.0.0.0` for development. |
| `npm run local:info` | Prints: LAN IP, app URL, Supabase API URL, Studio URL (localhost only), staff accounts, **QR URL of every table**, `/order` URL, and the WhatsApp mock simulator URL. |
| `npm run db:reset` | **Destructive.** Requires typing a confirmation word, runs `db:backup` automatically first, then resets. |
| `npm run db:backup` | Dumps the database (schemas `public`, `auth`, and `storage` if used) via `docker exec <db-container> pg_dump` (or the CLI if it covers `auth`) to `backups/YYYY-MM-DD_HHmm.sql`; keeps the latest 14 files; `backups/` is git-ignored. |
| `npm run db:restore` | Restores a chosen backup file (interactive selection, confirmation required). |
| `npm run types` | Regenerates `src/types/database.types.ts`. |
| `npm run test:smoke` | See Stage F. |

Also: update `.env.example` (no real secrets), make sure `.gitignore` covers `.env.local`, `backups/`, and the JWT secret file.

## Stage D — Seed data (base vs. demo)
Two levels, so real operation never gets polluted by fake data:

**1. Base seed — `supabase/seed.sql` (loaded automatically by `db reset`; idempotent):**
The repo already has this file (10 tables, 4 categories, 15 products, settings with fee 8,00 / minimum 30,00, WhatsApp disabled, and a role-by-email section). **Extend it instead of replacing it**: keep existing data and the `@restaurante.local` convention, add what is missing from the list below (12 tables, a 5th category, an inactive product, etc.), enable WhatsApp in settings for the demo, and make the role-by-email section harmless when the users do not exist yet (the Node seed script creates the auth users **first** through the Auth admin API and then applies the roles).
- `restaurant_settings`: accepting orders ON, QR ordering ON, `require_confirmation_for_qr` ON, pickup ON, delivery ON, `delivery_fee` = 6.00, `min_delivery_order` = 25.00, pickup 20 min, delivery 45 min, WhatsApp enabled.
- 12 tables (numbers 1–12, capacities 2,2,4,4,4,4,6,6,8,2,4,4), all `available`.
- 5 categories: **Entradas, Pratos Principais, Lanches, Bebidas, Sobremesas** (with `sort_order`).
- ~22 active products with realistic pt-BR names, descriptions, and BRL prices, e.g.: Bolinho de Bacalhau (6 un) 32,00 · Porção de Batata Frita 28,00 · Pastel de Queijo 18,00 · Filé à Parmegiana 56,90 · Feijoada Completa 62,00 · Frango Grelhado com Arroz e Salada 39,90 · Risoto de Cogumelos 54,00 · X-Burger 29,90 · X-Bacon 34,90 · X-Salada 27,90 · Coca-Cola Lata 7,00 · Suco de Laranja 12,00 · Água sem gás 5,00 · Cerveja Long Neck 14,00 · Caipirinha 22,00 · Pudim 14,00 · Petit Gâteau 24,90 · Brigadeiro (un) 4,50 … plus **one inactive product** ("Prato do Dia — esgotado") to prove that inactive items are hidden everywhere.

**2. Demo seed — `npm run seed:demo` (Node script using the service-role client; idempotent; every demo record is marked with a `[DEMO]` prefix in names/notes so it can be removed):**
- **Staff users** (created through the Supabase Auth admin API, profile roles set; password from `DEMO_PASSWORD`, default `Demo@12345`): `admin@restaurante.local`, `garcom@restaurante.local`, `garcom2@restaurante.local`, `cozinha@restaurante.local`, `caixa@restaurante.local`.
- **Customers:** Maria Souza (`+5511999990001`, 1 address) and João Lima (`+5511999990002`, 2 addresses).
- **Orders in every state**, created through the **real RPCs/order service** where possible (so triggers, totals, and constraints run exactly like production — read the implemented functions first and reproduce the states the real flows produce):
  - **Dine-in:** Mesa 3 occupied with 4 items in statuses pending / preparing / ready / delivered · Mesa 5 `closing` with all items delivered (ready for the cashier) · Mesa 8 with a **QR order `pending_confirmation`** (waiter must confirm) · Mesa 4 with an open "Chamar garçom" service request.
  - **Pickup:** one `pending_confirmation` (Maria), one `open` with items preparing, one `ready`.
  - **Delivery:** one `pending_confirmation` via WhatsApp (João), one `out_for_delivery` with cash "troco para R$ 100".
  - **History:** ~6 `closed` orders (mixed types and payment methods, spread over the past days) so the screens don't look empty.
  - **WhatsApp:** one conversation mid-flow and one with `needs_human = true`.
- `npm run seed:clear-demo` removes only `[DEMO]` data (and demo users); `npm run seed:demo` can be re-run safely after it.
- `local:setup` asks (or accepts `--demo` / `--no-demo`) whether to load the demo data; **default is demo ON for first setup**, and the docs must explain how to switch to real operation (`seed:clear-demo`, change/delete demo users, set real passwords).

## Stage E — Local WhatsApp and runtime modes
- `mockAllowed()` currently requires `NODE_ENV === "development"`, so the simulator cannot run under `next start`. Add an explicit `APP_MODE=local` flag and allow the mock only when `WHATSAPP_MOCK=true` **and** (`NODE_ENV === "development"` **or** `APP_MODE=local`); keep refusing it otherwise and update the existing Vitest tests in `security.test.ts`. The simulate endpoint already requires `Bearer WHATSAPP_WORKER_SECRET` — **reuse that secret** (generated by `local:env`) instead of inventing a new one.
- Provide a small **simulator page `/dev/whatsapp`** (only when `APP_MODE=local` and mock is on) with a chat-like UI: type messages, click the buttons/lists the bot sends, and watch the order appear in `/orders`. This replaces testing from a real phone.
- Real WhatsApp stays **optional**: document that it needs a public HTTPS webhook and therefore a free tunnel (Cloudflare Tunnel or ngrok) pointing only at the webhook route, with `WHATSAPP_MOCK=false` and the Meta credentials. Do not make the app depend on it.
- **Local worker scheduler:** add `scripts/whatsapp-worker.mjs`, started and stopped by `local:start`/`local:stop`, which calls `POST /api/whatsapp/process` with `Authorization: Bearer $WHATSAPP_WORKER_SECRET` every ~30 s (with backoff on errors and logs to `logs/`; `logs/` is git-ignored). Document that without it queued notifications may not be sent.
- Add `GET /api/health` (no auth, no sensitive data) returning app status and a DB connectivity check, used by the smoke test and for monitoring.

## Stage F — Verification and documentation
0. **Reuse what exists:** the repo's `tests/*.test.mjs` suites (they need `PUBLIC_TEST_URL`) and `npm run test:whatsapp` (Vitest) must be wired into `test:smoke`/a new `npm run test:all`, with `PUBLIC_TEST_URL` set automatically from the local app URL. Run the existing SQL tests (`rls_smoke_test.sql`, `offsite_orders_test.sql`) against the local database through `docker exec … psql` and report results.
1. **`npm run test:smoke`** (Node script against the running local stack) must verify and print pass/fail for:
   - `/api/health` OK and DB reachable;
   - login works for each of the 5 demo users and each lands on the correct dashboard;
   - the public page for a seeded table token returns 200, and an invalid token returns the friendly error;
   - a pickup order created through `/api/public/orders` appears as `pending_confirmation`, accepting it makes its items appear in the kitchen query, and it is cleaned up afterwards;
   - a full WhatsApp mock conversation completes a pickup order;
   - RLS sanity: an unauthenticated (anon) request cannot read `orders`, and a kitchen user cannot close a bill.
2. **`docs/local-setup.md` — written in Brazilian Portuguese** for a non-technical restaurant owner, step by step:
   - prerequisites (Docker Desktop, Node LTS) and first-time install;
   - daily routine (start/stop) and what to do after a restart or power outage;
   - **LAN setup:** reserve a fixed IP for the computer in the router, run `local:env` if the IP changes (and reprint QR codes if it did), **firewall rules: allow only ports 3000 and 54321**, and keep Studio (54323) and Postgres (54322) blocked from the network; tablets/phones must be on the same Wi-Fi (guest-network isolation can block access);
   - how to open each screen on tablets/phones, add them to the home screen, and keep tablet screens awake (system setting, since Wake Lock needs HTTPS);
   - auto-start on boot (Windows Task Scheduler, Linux systemd, optional `pm2`), UPS recommendation;
   - **backups:** schedule `db:backup` daily (Task Scheduler/cron) and copy the `backups/` folder to a USB drive/another computer; how to restore;
   - moving from demo to real data;
   - optional real WhatsApp via tunnel and optional HTTPS with `mkcert`;
   - troubleshooting (Docker not running, port in use, phones can't connect, wrong IP in QR codes, login loops).
3. **`docs/demo-walkthrough.md` (pt-BR):** the credentials table plus a step-by-step test script covering: table QR order → waiter confirms → kitchen moves items → customer sees live status → cashier closes the bill; a pickup order from `/order` and a delivery order → Orders Hub accept/ready/out-for-delivery/complete; the WhatsApp simulator creating an order of each type; the "atendente" handover; `/admin/settings` toggles (e.g., turn delivery off and see it disappear); `/admin/tables/qr` printing.
4. Update `AGENTS.md` with the local-first architecture, scripts, env variables, and the LAN/security decisions.

# Final report (required)
End with a summary containing: files created/modified; commands run and their results (lint, typecheck, build, smoke test — or exactly why they could not be run); the **exact commands I must run on my machine, in order**, to get from a fresh clone to a working demo; the demo credentials; any remaining risks or manual steps.

# Out of scope
New product features, cloud deployment, Kubernetes/Docker Compose for the Next.js app itself (only Supabase runs in Docker), payment gateways, and a real WhatsApp account setup (document it only).
