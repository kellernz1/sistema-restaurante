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

## Current Phase

- Phase 1: complete.
- Phase 2: complete; migration execution in Supabase remains a manual environment step.
- Phase 3: complete.
- Phase 4: complete locally; awaiting user confirmation.
- Next phase: Phase 5 (only after the user replies `CONFIRMED`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
