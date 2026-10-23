# Phase 10: WhatsApp bot validation

## Changed files

- `supabase/migrations/202610220004_whatsapp_bot.sql`: conversations, opt-out/handoff, message queue/outbox, unique inbound/event/outbox IDs, sequence ordering, RLS, leased per-phone claims, atomic turn/order commits, narrow staff handoff RPCs, and cash-change cleanup in `close_order` when the payment method changes.
- `supabase/tests/whatsapp_bot_test.sql`: rollback fixtures for all three order types, DB prices, forced pending confirmation for new Local orders, persisted phone, duplicate inbound IDs/turn commits, outbox atomicity, and anonymous/admin permissions.
- `src/types/database.types.ts`: new tables/functions, pending generation from a live project.
- `src/lib/order-service.ts`: atomic WhatsApp turn wrapper sharing the existing order creation RPC and database rules.
- `src/features/whatsapp/types.ts`, `messages.pt-BR.ts`, `state-machine.ts`: pure conversation model, centralized messages, pagination/summaries/editing, saved addresses, location reference, quantity/notes/payment/change, two-hour expiry, cancellation/restart, human pause, and opt-out.
- `src/features/whatsapp/security.ts`, `protocol.ts`: exact raw-byte HMAC/timing-safe comparison, webhook schema, mock gate, API payload serialization, and message-limit enforcement.
- `src/features/whatsapp/client.ts`: server-only official Cloud API text/buttons/list/template send functions and development console mock. API version is configured explicitly.
- `src/features/whatsapp/handlers.ts`: minimal batch ingestion, unique-ID deduplication, service-only context loading, transactional commits, queue worker, outbound-window checks, and monotonic delivery/read events.
- `/api/whatsapp/webhook`, `/process`, `/simulate`: signed ingestion and verification, authenticated durable worker trigger, and authenticated development-only simulation.
- `src/features/whatsapp/human-handoffs.tsx`, `orders-hub.tsx`: limited cashier/admin handoff list with five-second refresh, WhatsApp contact link, and resolve action.
- `src/features/orders/notifications.ts`: persistent once-per-order/event outbox, approved templates outside 24 hours, pause/opt-out handling, best-effort errors and post-response drain.
- `/api/staff/orders/[orderId]/close`, `src/features/cashier/bill-detail.tsx`: dine-in closure retains role/RLS/RPC enforcement and now calls the completed notification adapter, including Local WhatsApp orders.
- Public order-token endpoint and tracking component: tracking can also show a Local order by its unguessable public token, without phone/address disclosure.
- Settings label, `.env.example`, `package.json`, lockfile, `vitest.config.mts`, tests and setup/phase documentation.

Only Vitest was added as a development dependency, as planned. No unofficial WhatsApp library, provider account setup, deployment, or real outbound send was performed.

## Verification performed

- `npm run test:whatsapp`: 27 tests passed in two Vitest files.
- Native/HTTP suite: 21 tests passed, including the existing 17 plus four WhatsApp HTTP checks. Combined total: 48 tests.
- `npm run lint`, `npm run build`, `node node_modules/typescript/bin/tsc --noEmit`, and `git diff --check`: passed.
- Production-server HTTP checks with fictitious local-only verification/App Secret: valid callback challenge, wrong verification token, invalid HMAC, signed malformed JSON, missing worker authorization, and simulator absence in production all behaved as expected.
- No live Supabase, SQL execution, full DB-backed mock flow, physical-device or actual Meta send has been validated in this workspace.

Vitest covers all three happy paths, table tokens/numbers, known name/saved address reuse, location plus address completion, invalid input/quantity, cancelled/expired sessions, opt-out/human pause, empty-cart editing, repeated confirmation, disabled channels, delivery minimum/change, inactive products, large paginated menus, emoji title bounds, long cart summaries, exact HMAC bytes, webhook payloads, serialization limits, and the exact 24-hour template boundary.

## Local commands

```powershell
npm run test:whatsapp
npm run lint
npm run build
node node_modules/typescript/bin/tsc --noEmit
```

To run all native HTTP tests, start the built server on port 3100 in a separate terminal with fictitious local test values for `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, and `WHATSAPP_PHONE_NUMBER_ID=1`. Do not use real credentials for these smoke tests. In the test terminal:

```powershell
$env:PUBLIC_TEST_URL = 'http://localhost:3100'
$env:WEBHOOK_TEST_TOKEN = 'THE-SAME-FICTITIOUS-VERIFY-TOKEN'
$env:WEBHOOK_TEST_SECRET = 'THE-SAME-FICTITIOUS-APP-SECRET'
node --test tests/bill-totals.test.mjs tests/table-order-validation.test.mjs tests/offsite-order-validation.test.mjs tests/public-table-smoke.test.mjs tests/offsite-smoke.test.mjs tests/whatsapp-smoke.test.mjs
```

HTTP tests skip without `PUBLIC_TEST_URL`; handshake/signed-JSON tests also require their matching test variables. Node's existing module auto-detection warning is non-fatal. Use `npm run dev` rather than a production server for the actual mock flow described in `whatsapp-setup.md`.

## Required manual work and acceptance

1. Apply migration 004 after 001–003; run the new SQL script plus all earlier regression scripts; regenerate database types. Verify the database schema, sequence grants, function ACLs, and admin-read-only raw WhatsApp RLS.
2. Configure the server variables and enable the WhatsApp/ordering settings. Set `WHATSAPP_MOCK=true` only in development. Execute a complete pickup, delivery, and Local conversation with the simulator and actual catalog/table IDs. Verify source, pending status, price/fee/minimum/change, customer snapshots, confirmation reply, and tracking.
3. Re-send the same simulated `message_id` before and after processing. Verify one inbound row, one order commit, and one confirmation outbox row. Test two workers against one phone and sequential messages to confirm per-phone ordering and lease behavior.
4. Accept/reject in `/orders`, prepare in KDS, dispatch delivery, and complete at hub/cashier. Verify each corresponding notification appears once in the mock outbox. For Local, verify the cashier completion endpoint, clearing cash change if switching to card/Pix, and table release.
5. Test Local by free table number with QR confirmation disabled: new WhatsApp order must still await staff. Test a valid deep link, a rotated token, an occupied number-only table, and joining an existing active table with a valid token. Only new WhatsApp-origin orders acquire that source; an existing order keeps its original source.
6. Send `atendente`; verify the bot stops, cashier/admin see the handoff within about five seconds, waiter cannot resolve, and raw tables remain unavailable to cashier. Resolve and test the next message. Test `parar`, notification suppression and explicit `menu` re-entry.
7. Age a conversation beyond two hours and verify restart on its next message. For notifications, set the last inbound time older than 24 hours and verify approved template names/parameter order; within 24 hours verify text. Never test outside-window free text against a real number.
8. Test large categories/products/addresses, pagination and wraparound, long notes/summaries, invalid input at each state, closed settings, disabled types, inactive products and price changes before confirmation. Verify errors preserve the cart without a partially created order.
9. Simulate a worker interruption before/after commit. Let an inbound lease expire and verify a retry does not duplicate the order. Verify expired or uncertain outbound sends become failed/handoff and are not automatically resent. Keep the authenticated external worker schedule active when no new webhook arrives.
10. Configure the official Meta test number, HTTPS callback, correct App Secret/verify token, subscribed `messages` field and durable worker. Verify a valid signed webhook is persisted and acknowledged quickly, invalid signatures never persist, repeated IDs do not repeat the order, and delivery/read callbacks update the corresponding outbound row.
11. Register/approve all five notification templates, configure the actual supported API version/System User token, and complete the production checklist in `whatsapp-setup.md`. Inspect browser bundles/network: no service-role key, access token or App Secret may be present.

## Acceptance status

- PASS (automated/static): pure state-machine happy/error/control paths, official payload shapes and limits, HMAC, production mock gate, verification handshake, templates/window selection, build/lint/types and regressions.
- PASS (implementation): durable deduplication/lease/outbox design, shared atomic order rules, staff handoff controls, notifications, mock endpoint and operational guide.
- PENDING (live database): migration/SQL/RLS execution, full three-type mock conversations, concurrent/restarted workers, notification outbox persistence and Realtime/hub/KDS interaction.
- PENDING (Meta/device): actual signed delivery, actual API sends, template approvals, delivery/read callbacks, production worker/platform behavior and phone end-to-end acceptance.

Mock substitutes the Meta transport, not Supabase. The safety rule for occupied number-only tables deliberately requires QR/staff assistance instead of silently appending items. Outbound API uncertainty requires manual follow-up. The implementation is committed locally; the system is not deployed or fully accepted for production merely because local checks pass.
