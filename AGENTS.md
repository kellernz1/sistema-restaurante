# Restaurant Management System

## Stack

- Next.js 16 with App Router, React 19, TypeScript in strict mode
- Tailwind CSS 4 and Lucide React
- Supabase PostgreSQL, Auth, Row Level Security, and Realtime
- `@supabase/ssr` for cookie-based sessions

## Conventions

- Code, identifiers, comments, and commits are written in English.
- User-facing text is written in Brazilian Portuguese (`pt-BR`).
- Currency uses `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`.
- Server Components are the default; Client Components are used only for browser interaction or Realtime.
- Public customer flows never access Supabase directly; they use validated server endpoints.
- The Supabase service-role key is server-only and must never be imported into a Client Component.
- Imports within `src` use the `@/*` alias.

## Folder Structure

- `src/app`: App Router pages, layouts, and route handlers
- `src/components`: shared UI and layout components
- `src/features`: feature-oriented application modules
- `src/lib`: shared application and server logic
- `src/types`: generated database and domain types
- `src/utils/supabase`: browser, server, middleware, and admin Supabase clients
- `supabase/migrations`: versioned database migrations
- `docs`: setup and operational guides

## Architecture Decisions

- All ordering channels will use one shared server-side order creation service.
- Supabase browser and server clients use the public anon key; privileged server-only work uses a separate admin client.
- Session refresh and optimistic route protection run in the Next.js 16 `src/proxy.ts`; database RLS remains the authorization boundary.
- Database integrity and totals are enforced with PostgreSQL constraints and triggers.
- Role-specific RLS policies use security-definer helpers to compare proposed updates with stored rows, preventing unauthorized column changes.
- Customer-created orders use the service-role-only `create_customer_order(jsonb)` RPC.
- Database types live in `src/types/database.types.ts` and must be regenerated after schema changes.
- Public table endpoints validate strict Zod payloads and throttle through service-role-only PostgreSQL counters. Forwarding headers are trusted only when `PUBLIC_TRUST_PROXY=true` behind a proxy that overwrites them.
- QR/NFC order creation revalidates `table_token` under the table lock in `create_customer_order`; rotating a token invalidates old links. Customer pages use polling and never mount the staff AuthProvider.
- Staff review, request attendance, and token rotation use role-checked RPCs. Public service requests and bill status changes are atomic.
- Offsite public orders atomically upsert customer/address data, enforce minimum/fee/change against database prices, and begin pending confirmation. Only cashier/admin use `advance_hub_order`; kitchen completion updates only item status via an authenticated server endpoint and triggers aggregate readiness.
- Customer address reuse on the web is opt-in on the same browser, scoped by normalized phone; no anonymous address lookup by phone is exposed.
- Real WhatsApp uses the official Cloud API. Local mode uses the isolated simulator while preserving the same leased PostgreSQL queue and order service. Signed webhook batches persist before acknowledgement; order, conversation, inbound completion and reply outbox commit together.
- WhatsApp notifications enqueue once per order/event, use templates outside the 24-hour window, and honor opt-out/human pause. Ambiguous outbound failures are never automatically resent; staff must review them. Deployments must schedule the authenticated worker as well as allow Next.js `after`.
- `WHATSAPP_MOCK` and `/api/whatsapp/simulate` are allowed only in development or explicit `APP_MODE=local`; the simulator endpoint keeps bearer-secret protection. Raw WhatsApp tables are admin read-only; cashier/admin use narrow handoff RPCs. Number-only dine-in orders require a free table and always await confirmation; existing tables require a valid token or staff assistance.

## Local-First Operation

- Supabase runs locally in Docker with fixed ports: API/Realtime `54321`, PostgreSQL `54322`, Studio `54323`, and shadow database `54320`.
- The Next.js production server listens on `0.0.0.0:3000`. LAN clients reach both the app and Supabase API through the computer's reserved LAN IP; never use loopback URLs in their generated environment.
- Expose only ports `3000` and `54321` to the private LAN. Keep PostgreSQL and Studio blocked from the network and never forward local ports to the public internet.
- `local:env` generates `.env.local` with modern publishable/secret Supabase keys, `APP_MODE=local`, and a random worker secret. Secret keys stay server-only and all generated secrets, logs, and backups are git-ignored.
- Daily commands are `local:start`, `local:stop`, and `local:info`. First-time provisioning uses `local:setup`; database recovery uses `db:backup`, `db:restore`, and confirmed `db:reset`.
- Base operational records live in `supabase/seed.sql`. Optional records created by `seed:demo` carry `[DEMO]` markers or are tracked in the ignored demo manifest; `seed:clear-demo` removes only that set.
- `local:start` also runs the authenticated WhatsApp queue worker. `/api/health` reports only application and database reachability. `test:smoke` covers the running local stack and SQL policies.
- Regenerate `.env.local` and reprint table QR codes whenever the reserved LAN IP changes. Real WhatsApp remains optional and requires a narrowly scoped public HTTPS tunnel for its webhook.

## Current Phase

- Phase 1: complete.
- Phase 2: complete; migration execution in Supabase remains a manual environment step.
- Phase 3: complete.
- Phase 4: confirmed by the user.
- Phase 5: implemented; lint, build, and TypeScript checks pass. Live Supabase acceptance tests remain pending environment setup; see `docs/phase-5-validation.md`.
- Phase 6: implemented after the user's request to proceed; lint, build, and TypeScript checks pass. Live Supabase acceptance tests remain pending; see `docs/phase-6-validation.md`.
- Phase 7: implemented after user confirmation; lint, build, TypeScript, and subtotal tests pass. Live Supabase and print-preview acceptance remain pending; see `docs/phase-7-validation.md`.
- Phase 8: implemented after user confirmation; lint, build, TypeScript, and 9 automated/smoke tests pass. Migration execution, live Supabase acceptance, and QR/NFC/print checks remain pending; see `docs/phase-8-validation.md` and `docs/qr-nfc-setup.md`.
- Phase 9: implemented after user confirmation; lint, build, TypeScript, and 17 automated/HTTP smoke tests pass. Migration execution and live acceptance remain pending; see `docs/phase-9-validation.md`.
- Phase 10: implemented after user confirmation; lint, build, TypeScript, 27 Vitest tests, and 21 native/HTTP tests pass. Migration execution, full mock flows against Supabase, and live Meta acceptance remain pending; see `docs/phase-10-validation.md` and `docs/whatsapp-setup.md`.
- Local-first package: implemented statically; Docker-backed reset, seeds, SQL tests, LAN acceptance, and backup/restore remain pending on a machine with Docker Desktop.
- All planned implementation phases are present. Environment/database/provider acceptance is still required before production use.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
