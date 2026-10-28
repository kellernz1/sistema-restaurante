# Restaurant Management System

## Stack

- Next.js 16 with App Router, React 19, TypeScript in strict mode
- Tailwind CSS 4 and Lucide React
- Supabase PostgreSQL, Auth, Row Level Security, and Realtime
- `@supabase/ssr` for cookie-based sessions

## Conventions

- Preserve UTF-8 when editing accented text. Prefer apply_patch or explicit Node/Python UTF-8 reads/writes. Never pipe accented source through Windows shell commands that transcode implicitly; PowerShell reads/writes must specify UTF-8 explicitly. A successful build does not validate encoding.
- Run `npm run check:text` before completing every block. For interface changes, run `npm run test:visual` against the running local stack and review screenshots in ignored `artifacts/visual/`. Report any unavailable browser/environment checks honestly. See `docs/text-and-visual-checks.md`.

- Code, identifiers, comments, and commits are written in English.
- User-facing interface text supports Brazilian Portuguese (`pt-BR`, default) and Spanish (`es`). Use `useTranslation` in Client Components and `getTranslation` in Server Components; add source text and Spanish translations to `src/lib/i18n/es.json`. Keep restaurant-entered menu content unchanged.
- Base currency is PYG: monetary prices, fees and order totals are bounded whole-guarani `bigint` values. Use `src/lib/money.ts` for `Gs. 25.000` formatting and limits; never use cent arithmetic for PYG. BRL payment originals are integer cents.
- Payments support cash (PYG only), transfer, card and Pix (BRL), enabled per restaurant. PostgreSQL is authoritative for split payments, exact BRL/PYG conversion, rounding and cash change. Exchange rates are append-only; recorded payments retain their historical rate. Do not recalculate historical payments or bypass the ledger.
- Normalize customer phones through the shared libphonenumber helper to E.164, with explicit PY (+595) / BR (+55) selection and the configured default. Preserve the safe Brazilian ninth-digit identity rules and original WhatsApp transport recipient. See `docs/paraguay-contacts.md`.
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

- Sensitive discounts and cancellations use `sensitive_quote`, single-use actor/operation-bound approval grants, and `execute_sensitive_action`. Supervisors and administrators act under their own audited authority. PIN/password parameters are never logged or persisted in the browser. Audit is append-only; do not add privileged update/delete shortcuts or rewrite historical payments. Block 8B manual refunds use `refund_quote` / `execute_refund`, capped by the discounted net-paid balance, original currency/rate and an open operator cash session. Cancellation, refund, grant and audit commit together; never recalculate receipts or imply a bank transfer occurred. See `docs/approvals-and-audit.md` and `docs/refunds.md`.
- Counter discounts before payment use `counter_discount_quote` and the shared private PIN issuer. `create_counter_order` atomically claims the exact approved draft, consumes authorization, applies the discount, records audit and settles payment. Cart edits invalidate approval; uncertain submissions replay the same request. See `docs/counter-flow.md`.

- Service modes are enforced in SQL, not only navigation. Waiter use defaults off; disabled waiter accounts retain history but lose effective role access. Table QR submissions stage in `qr_requests`, then materialize through the shared order creator only after required review/payment. Account epochs reset on table release; public cancellation requires a separate per-request secret. Shared cash-session exclusivity defaults on. See `docs/service-modes.md`.

- Cash sessions are operator-owned, with one open session per operator and mandatory payment linkage enabled by default. PostgreSQL serializes payment binding and closing; closed reports/history are immutable except audited admin reopening. Daily revenue follows payment business dates, net of cash change, including historical unassigned receipts. See `docs/cash-sessions.md`.

- All ordering channels will use one shared server-side order creation service.
- Supabase browser and server clients use the public anon key; privileged server-only work uses a separate admin client.
- Session refresh and optimistic route protection run in the Next.js 16 `src/proxy.ts`; database RLS remains the authorization boundary.
- Database integrity and totals are enforced with PostgreSQL constraints and triggers.
- Role-specific RLS policies use security-definer helpers to compare proposed updates with stored rows, preventing unauthorized column changes.
- Customer-created orders use the service-role-only `create_customer_order(jsonb)` RPC.
- Database types live in `src/types/database.types.ts` and must be regenerated after schema changes.
- Apply application migrations only with the official Supabase CLI (`migration up` / tracked `db push`), including temporary/clean validation and restored candidates. Never execute migration files directly through psql/SQL Editor or manually insert migration-history rows. Keep applied files immutable; use a new version for corrective changes. Run `db:verify-history` before concluding database work; `local:update` also checks schema against the officially tracked prefix. Metadata repair requires a matching clean schema, preserved configuration, a verified backup and an explicit audit, then the official `migration repair` command. See `docs/migration-history.md`.
- Every new block must validate the complete ordered migration chain and SQL suites in a clean, separate temporary database/instance. Never reset or delete the development database for validation. Use `npm run db:validate-clean`; document the boundary (SQL validation is not a full Auth/Realtime HTTP installation).
- Counter service reuses pickup with `is_counter`, optional normalized name and an atomic per-business-day ticket. Timezone/cutoff default to America/Asuncion and 05:00. Pay-at-order creation and payments commit together; pay-at-end remains supported. Kitchen group actions are transactional and idempotent. See `docs/counter-flow.md`.
- Printing separates immutable document snapshots from browser/file-test drivers. Claim/finish/reprint operations preserve RLS and share a PostgreSQL processor lease. Uncertain output is never automatically resent. Both request paths use the same document-busy guard; human decisions record actor/time and are audited. Only admin can archive/discard, and archived work cannot dispatch. Forwarded units count committed kitchen reservations; copy acknowledgements are separate. See `docs/printing-architecture.md`.
- TCP/spooler drivers and silent hardware printing are not implemented. Do not claim physical printer compatibility from file/browser tests.
- Public table endpoints validate strict Zod payloads and throttle through service-role-only PostgreSQL counters. Forwarding headers are trusted only when `PUBLIC_TRUST_PROXY=true` behind a proxy that overwrites them.
- QR/NFC order creation revalidates `table_token` under the table lock in `create_customer_order`; rotating a token invalidates old links. Customer pages use polling and never mount the staff AuthProvider.
- Staff review, request attendance, and token rotation use role-checked RPCs. Public service requests and bill status changes are atomic.
- Offsite public orders atomically upsert customer/address data, enforce minimum/fee/change against database prices, and begin pending confirmation. Only cashier/admin use `advance_hub_order`; kitchen completion updates only item status via an authenticated server endpoint and triggers aggregate readiness.
- Customer address reuse on the web is opt-in on the same browser, scoped by normalized phone; no anonymous address lookup by phone is exposed.
- Real WhatsApp uses the official Cloud API. Local mode uses the isolated simulator while preserving the same leased PostgreSQL queue and order service. Signed webhook batches persist before acknowledgement; order, conversation, inbound completion and reply outbox commit together.
- WhatsApp notifications enqueue once per order/event, use templates outside the 24-hour window, and honor opt-out/human pause. Ambiguous outbound failures are never automatically resent; staff must review them. Deployments must schedule the authenticated worker as well as allow Next.js `after`.
- `WHATSAPP_MOCK` and `/api/whatsapp/simulate` are allowed only in development or explicit `APP_MODE=local`; the simulator endpoint keeps bearer-secret protection. Raw WhatsApp tables are admin read-only; cashier/admin use narrow handoff RPCs. Number-only dine-in orders require a free table and always await confirmation; existing tables require a valid token or staff assistance.

- Installation licensing uses Ed25519 signatures verified independently in PostgreSQL. Keep owner private keys and issuer registries outside the restaurant installation. Creation guards enforce entitlement at safe cash/business-day boundaries; settlement, refunds, reports and recovery remain available. Preserve monotonic license sequences, signed online renewal challenges and server-owned clock evidence. See `docs/licensing.md`.

## Local-First Operation

- Script data writes require a branded, installation-bound target from `scripts/target-safety.mjs`. Import data helpers only through `scripts/target-operations.mjs`; private implementations and raw process/HTTP transports are restricted to the barrier. Never infer a known/sole container or default test database. Tests require a signed, unexpired disposable owner context and must reject development even with authorization flags. Run `check:targets` and target-safety tests when adding scripts. See `docs/target-safety.md`.
- All `scripts/**/*.mjs` must pass ESLint `no-undef`. Long-running entry points must pass the disposable supervisor/process startup acceptance in `test:all`: stable live processes, successful activity and advancing heartbeats are required; importing a driver/helper alone is not runtime coverage. Never use an existing installation to validate worker startup.
- Development maintenance requires `--allow-development --installation-id <actual database UUID>`. Background runtime/backup requires an explicitly granted installation-bound automation record. Production demo/reset/repair/migration/replacement requires enhanced typed authorization. Never grant these authorizations or mutate an existing installation as part of a test block; use disposable validation.

- Restaurant installs use `local:provision` on a fresh checkout, with an owned self-hosted profile, exclusive provider/database/worker secrets, no Studio and exactly one explicitly entered administrator. `local:setup` / `--no-demo` are empty development only; demonstration data requires `--demo`. Never convert or clean an existing development instance implicitly. Preflight fails on missing evidence; host-task simulation in disposable tests is not Windows acceptance. See `docs/restaurant-provisioning.md`.
- Child commands must honor their explicitly owned working directory. Provisioning backups must validate provider ownership/stage before selecting a database. Never let a temporary test fall back to development ROOT or its operations/backup state.

- Operations use atomic custom PostgreSQL backups with checksummed manifests, local admin policy and supervised app/workers. Daily `local:start` never builds or migrates; `local:update` backs up before migration/build. See `docs/operations.md`. Never restore/reset development for tests; use protected randomly named candidates. Windows task installation/removal must be simulated with `--dry-run` during implementation, never installed automatically. Preserve dump owners/ACLs and refuse unverified migration provenance rather than guessing.

- Supabase runs locally in Docker with fixed ports: API/Realtime `54321`, PostgreSQL `54322`, Studio `54323`, and shadow database `54320`.
- The Next.js production server listens on `0.0.0.0:3000`. LAN clients reach both the app and Supabase API through the computer's reserved LAN IP; never use loopback URLs in their generated environment.
- Expose only ports `3000` and `54321` to the private LAN. Keep PostgreSQL and Studio blocked from the network and never forward local ports to the public internet.
- `local:env` generates `.env.local` with modern publishable/secret Supabase keys, `APP_MODE=local`, and a random worker secret. Secret keys stay server-only and all generated secrets, logs, and backups are git-ignored.
- Daily commands are `local:start`, `local:stop`, and `local:info`. First-time provisioning uses `local:setup`; database recovery uses `db:backup`, `db:restore`, and confirmed `db:reset`.
- Base operational records live in `supabase/seed.sql`. Optional records created by `seed:demo` carry `[DEMO]` markers or are tracked in the ignored demo manifest; `seed:clear-demo` removes only that set.
- `local:start` runs the WhatsApp worker and the independent file-test print worker. Print RPC/driver waits have explicit deadlines, and workers send instance/version heartbeats. `/api/health` reports app/database reachability; authenticated `/api/staff/printing/health` reports print worker health and aged pending work (configurable default 60 seconds). `test:all` provisions a full disposable Supabase/app instance and validates clean SQL and integrations there; `test:smoke` / `test:integration` also own their temporary instance. NEVER target development with HTTP integration fixtures, bypass immutable history for cleanup, or allow skipped cases to pass the integration aggregate. See `docs/integration-testing.md`.
- Regenerate `.env.local` and reprint table QR codes whenever the reserved LAN IP changes. Real WhatsApp remains optional and requires a narrowly scoped public HTTPS tunnel for its webhook.

## Current Phase

- Phase 1: complete.
- Phase 2: complete; deployment migrations use the official tracked CLI; environment acceptance remains an operational step.
- Phase 3: complete.
- Phase 4: confirmed by the user.
- Phase 5: implemented; lint, build, and TypeScript checks pass. Live Supabase acceptance tests remain pending environment setup; see `docs/phase-5-validation.md`.
- Phase 6: implemented after the user's request to proceed; lint, build, and TypeScript checks pass. Live Supabase acceptance tests remain pending; see `docs/phase-6-validation.md`.
- Phase 7: implemented after user confirmation; lint, build, TypeScript, and subtotal tests pass. Live Supabase and print-preview acceptance remain pending; see `docs/phase-7-validation.md`.
- Phase 8: implemented after user confirmation; lint, build, TypeScript, and 9 automated/smoke tests pass. Migration execution, live Supabase acceptance, and QR/NFC/print checks remain pending; see `docs/phase-8-validation.md` and `docs/qr-nfc-setup.md`.
- Phase 9: implemented after user confirmation; lint, build, TypeScript, and 17 automated/HTTP smoke tests pass. Migration execution and live acceptance remain pending; see `docs/phase-9-validation.md`.
- Phase 10: implemented after user confirmation; lint, build, TypeScript, 27 Vitest tests, and 21 native/HTTP tests pass. Migration execution, full mock flows against Supabase, and live Meta acceptance remain pending; see `docs/phase-10-validation.md` and `docs/whatsapp-setup.md`.
- Local-first package: Docker-backed local database, migrations, seeds and SQL tests have been exercised. Complete migration-chain validation uses an isolated temporary database. Physical printing, full restoration/power-loss acceptance and provider acceptance remain operational checks; see current block validation documents.
- All planned implementation phases are present. Environment/database/provider acceptance is still required before production use.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
