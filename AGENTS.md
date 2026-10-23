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
- `notifyCustomer` is a server-only no-op hook until Phase 10. Customer address reuse is opt-in on the same browser, scoped by normalized phone; no anonymous address lookup by phone is exposed.

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
- Next phase: Phase 10 (only after user confirmation).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
