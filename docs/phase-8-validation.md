# Phase 8: validation and handoff

## Files

- `supabase/migrations/202610220002_table_self_service.sql`: requests/RLS/Realtime, DB counters, request/review/attendance/rotation RPCs, token revalidation in the existing shared order RPC.
- `supabase/tests/table_self_service_test.sql`: transactional fixtures for database prices, joining QR/NFC orders, confirmation, request deduplication, rate-limit boundaries, rotation, bill requests, and denied anonymous/waiter actions.
- `src/types/database.types.ts`: local schema/type updates; regenerate against live Supabase after applying the migration.
- `src/lib/order-service.ts`: server-only shared wrapper over `create_customer_order`.
- `src/lib/public-table-api.ts`: safe responses, token resolution, bounded JSON input, persistent rate limiting, and fail-closed handling.
- `src/app/api/public/tables/[token]/route.ts` and its `orders`, `requests`, `status` routes: scoped public endpoints.
- `src/features/customer-ordering/validation.ts` and `table-menu.tsx`: strict validation and mobile-first public menu/cart/tracking.
- `src/app/t/[token]/page.tsx`: public entry point and privacy metadata.
- `src/features/tables/service-alerts.tsx`, waiter page, and order-detail source tag: staff review and calls in Realtime.
- `src/features/tables/qr-sheet.tsx`, `/admin/tables/qr/page.tsx`, and admin page: QR generation, printing, rotation, and navigation.
- Root/staff/unauthorized layouts and `src/proxy.ts`: staff AuthProvider is excluded from public customer routes; public requests bypass staff session refresh.
- `src/app/globals.css`, `.env.example`, `package.json`, lockfile, `AGENTS.md`, setup guides, and tests.

Added only phase-planned dependencies: Zod for strict public validation, QRCode for client-side SVG generation, and QRCode TypeScript declarations.

## Checks performed

- `npm run lint`: passed without warnings.
- `npm run build`: passed, including all public endpoints, table page, and admin QR page.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- Native Node tests: 9 passed, 0 failed (including the 3 existing subtotal tests). Node's module auto-detection warning is non-fatal.
- Production server on port 3100: public page returned 200 without Supabase credentials or login; all four public endpoint shapes rejected malformed tokens with 404/no-store. The temporary server was stopped afterward.
- `git diff --check`: passed.

To repeat API smoke tests, start `npm run start -- --port 3100` after a build, then use:

```powershell
$env:PUBLIC_TEST_URL = 'http://localhost:3100'
node --test tests/bill-totals.test.mjs tests/table-order-validation.test.mjs tests/public-table-smoke.test.mjs
```

Without `PUBLIC_TEST_URL`, the two HTTP smoke tests are skipped. Pure validation tests cover forbidden price/status/type fields, wrong channels, empty/oversized carts, quantities, UUIDs, notes/name bounds, service request types, and token format.

## Manual acceptance

Follow `qr-nfc-setup.md` first. No live database, physical tag, or browser print-preview checks have been run on this machine.

1. Apply the migration and run `table_self_service_test.sql` in Supabase. Verify no exception and final rollback. Run the existing RLS smoke test as well.
2. Sign in as admin. Open QR codes, verify the public domain, and print A4. Scan every tested QR on a phone and confirm its table number. Check all QR images are ready before printing and verify multiple pages.
3. As an anonymous customer, browse/search active products, adjust quantities, add notes and optional name. Verify an empty cart is disabled and rapid clicks submit once. Inspect the network: only local public endpoints are called; no browser Supabase calls or service key.
4. For an available table with confirmation enabled, submit. Verify one pending-confirmation order with correct source, DB-set prices, quantities, and notes; waiter receives a live pending badge. Confirm it: items must appear in KDS. Repeat on another table and reject: items must remain absent from KDS and table becomes available.
5. Add another customer order to an existing active table: verify it joins the same order. With confirmation disabled, verify the first order is open and the table becomes occupied. Restore the setting afterward.
6. Advance item status from kitchen/waiter and verify the phone updates in about five seconds. Refresh the phone tab and verify its last order is restored when session storage is available.
7. Call the waiter twice and verify one open request; mark it attended. Request the bill and verify a bill request plus table closing, reflected live in waiter/cashier. Verify available tables without orders cannot request a bill.
8. Exceed the write limit and verify HTTP 429; test from multiple app instances against the same database. Verify proxy/IP configuration before load tests. Tamper with payload prices/type/table ID/quantities: expect validation failure or DB rejection.
9. Rotate a token as admin. The old menu, ordering, tracking, and request endpoints must fail. Attempt rotation as waiter and anonymous user: deny. Confirm the replacement QR/NFC works and the old token cannot pass the transactional order check.
10. Disable QR or accepting orders, make a product inactive during checkout, and simulate network loss. Verify friendly errors, retained cart, unavailable actions, and recovery. Confirm status endpoints cannot return another table's order or private customer fields.
11. Write the NFC URL per the guide, tap it with a phone, verify source NFC on newly created orders, and validate the printed QR fallback. Lock only after successful tests.

## Acceptance status

- PASS (automated/static): public no-login rendering, strict payloads, malformed-token rejection, no-store responses, build/lint/types, menu/cart/status UI, staff alerts, admin QR/rotation UI, and documented NFC setup.
- PASS (implementation): service-role-only public writes, DB-backed throttling, transaction-scoped token checks, order joins/confirmation via existing service, staff-only request RLS and role-checked RPCs.
- PENDING (live Supabase): migration/test execution, actual row prices/settings/joins, role enforcement, rate limiting under concurrency, and Realtime behavior.
- PENDING (physical/browser): phone scanning, live polling, NFC, responsive interaction, and A4 print preview.

There is no public submission idempotency key; a lost success response must be checked with staff before a new attempt. No deployment or future-phase feature was performed. Phase 9 requires a new user confirmation.
