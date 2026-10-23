# Phase 9: pickup, delivery, and orders hub

## Implementation and files

- `supabase/migrations/202610220003_offsite_orders.sql`: replaces the shared creation RPC to upsert customers/addresses atomically, validates complete delivery addresses, checks cash change, and rechecks minimum/change against final DB-set prices. Adds readiness triggers and role-checked hub transitions. All prior QR token checks remain.
- `supabase/tests/offsite_orders_test.sql`: transactional fixtures for pickup/delivery creation, prices/fees, customer/address persistence, minimum/change/address failures, waiter denial, automatic readiness, payment closure, stale actions, and isolation from dine-in tables.
- `src/types/database.types.ts`: corresponding local RPC type additions, pending live regeneration.
- `src/features/customer-ordering/offsite-validation.ts`: strict, type-specific payload validation and phone normalization.
- `src/features/customer-ordering/menu-cart.tsx`: shared product catalog/cart editor used by both QR/NFC and offsite ordering. The table menu now consumes these components.
- `src/features/customer-ordering/offsite-menu.tsx`, `/order/page.tsx`: public three-step flow, type availability, active menu/search/cart, customer fields, address reuse on the device, fees/minimum/estimates, payment and change, and confirmation/tracking link.
- `src/features/customer-ordering/order-tracking.tsx`, `/track/[token]/page.tsx`: private bearer-link tracking with polling, type-aware stages, reason on rejection, totals, and item summary.
- `/api/public/menu`, `/api/public/orders`, `/api/public/orders/[token]`: server-only public access, strict validation, no-store, and persistent throttling.
- `src/features/customer-ordering/public-client.ts`, `src/lib/public-table-api.ts`: typed browser response handling and shared database-backed quotas.
- `src/features/orders/hub-query.ts`, `orders-hub.tsx`, `/orders/page.tsx`: shared badges/filters, new-order section, opt-in sound, details and contact/map links, realtime, rejection reason, status actions, payment completion, and printable ticket.
- `src/features/orders/notifications.ts`: server-only no-op customer notification adapter called for supported accept/reject/ready/dispatch/complete flows. No WhatsApp delivery is implemented yet.
- `/api/staff/orders/[orderId]/transition`, `/api/staff/items/[itemId]/status`, `src/lib/staff-api.ts`: authenticated, role-checked mutations using the caller's Supabase session/RLS. Kitchen UI now calls the item endpoint, retaining optimistic movement/rollback and enabling the ready notification hook.
- `src/features/settings/settings-schema.ts`, `settings-form.tsx`, `/admin/settings/page.tsx`: admin-only settings, validated prices/times and feature toggles, including the future WhatsApp flag.
- Admin page, staff navigation, waiter order badge, and global styles: discoverable screens, consistent type indicators, responsive layout, and print rules.
- `tests/offsite-order-validation.test.mjs`, `tests/offsite-smoke.test.mjs`: new validation and HTTP smoke tests.
- `tsconfig.json`: allows explicit `.ts` imports in the no-emit project so shared validation runs directly with Node 24's native TypeScript support. No dependency was added.
- `AGENTS.md` and `docs/supabase-setup.md`: phase/setup updates.

## Behavior and scope decisions

Offsite orders always start pending confirmation. Pickup/delivery types and acceptance are checked again by the shared database service, not trusted from the browser. A delivery fee and minimum derive from current settings, while item prices derive from products. Customer name/phone/address are snapshotted on the order. The customer phone is normalized to E.164; Brazilian local numbers with DDD gain +55.

Only cashier/admin can accept, reject, mark ready, dispatch delivery, and receive payment. The waiter hub is read-only. Dine-in payment remains in `/cashier`. When all offsite items become ready/delivered, a trigger makes the open order ready; this removes it from KDS, whose scope remains open orders, and moves management to the hub. Manual ready is allowed with a warning for unfinished items. Closing pickup/delivery uses `close_order` and does not touch tables.

The hub returns at most 200 rows, sorted by status with active work first and newest rows within a status. It is an operational view, not an unlimited history/report. Sound requires an explicit button click due to browser audio restrictions. Notification hooks are no-op and best-effort; Phase 10 must implement delivery/idempotency.

Saved addresses are reused only from the same browser after the user opts to save them, under a key for the normalized phone. There is no public API that reveals an address by phone alone. The server upserts customers/addresses as required for staff use. A different device must enter its address again. Device storage can be removed with Esquecer endereço salvo.

Public write quotas use the Phase 8 database counters: 30 submissions/IP and 10/normalized phone per ten minutes. Menu/tracking reads allow 1,800/origin per ten minutes. With `PUBLIC_TRUST_PROXY=false`, network quotas intentionally share a bucket; configure a trusted overwriting proxy before enabling per-client forwarding headers. No raw IP/phone is stored in quota keys. Anonymous clients use only application endpoints. Public tracking exposes neither phone nor address. Tokens are unguessable bearer credentials and tracking uses no-referrer/no-index metadata.

## Automated verification

- `npm run lint`: passed without warnings.
- `npm run build`: passed, including public ordering/tracking, staff APIs/hub, and admin settings.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- 17 native Node tests: passed, 0 failures, including 13 pure tests and 4 HTTP smoke tests. Node emits a non-fatal module detection warning.
- HTTP smoke checks on a temporary production server at port 3100: `/order`, `/track/invalid`, and the QR page render without login or Supabase credentials; malformed tracking/table tokens return 404 and no-store.
- `git diff --check`: passed.

Reproduce with Node 24:

```powershell
npm run build
npm run start -- --port 3100
# In another terminal:
$env:PUBLIC_TEST_URL = 'http://localhost:3100'
node --test tests/bill-totals.test.mjs tests/table-order-validation.test.mjs tests/offsite-order-validation.test.mjs tests/public-table-smoke.test.mjs tests/offsite-smoke.test.mjs
```

The four HTTP tests skip if `PUBLIC_TEST_URL` is unset. Pure tests cover phone normalization, required address fields/UF/CEP, forbidden fee/price/source/type manipulation, empty carts, money precision, cash-only change, mandatory rejection reason/payment, and settings bounds.

## Manual setup

Apply migration `202610220003_offsite_orders.sql` after the previous two, using the SQL Editor. Run `supabase/tests/offsite_orders_test.sql`, then the earlier regression scripts. Configure `.env.local` with real Supabase credentials and the public app URL. Regenerate database types after applying the migration using the command in `supabase-setup.md`. No provider account or new secret is required in this phase.

## Manual acceptance steps

1. In `/admin/settings`, set accepting orders on, enable pickup/delivery/QR, and set a nonzero delivery fee/minimum and distinct estimates. Save/reload. As waiter/cashier, verify settings writes and route access are denied. Verify disabled/closed channels in `/order`.
2. Open `/order` anonymously on a phone. Choose pickup, browse/search, add notes/quantities, enter name/phone, and choose payment. Verify empty carts cannot progress, cart data remains after validation failure, and rapid clicks create one submission. Confirm a numbered confirmation and tracking link.
3. Place a delivery order. Verify all address fields, fee, minimum excluding fee, estimate, and cash change. Try incomplete address, insufficient minimum/change, manipulated prices/fees/types/source, or an inactive product: reject without partial rows. Inspect stored customer/address data and final snapshot/total.
4. Save an address with consent, then enter the same normalized phone in the same browser and verify reuse; test deletion and a different browser. Confirm no address lookup is made by phone through the public API.
5. Open `/orders` as cashier/admin and as waiter in separate profiles. Confirm new web orders appear live with correct badges and notes/customer/payment/address data. Test filters, details, telephone/WhatsApp/maps links, and enable sound before creating another order. Waiter must have no action controls and must be denied by the mutation endpoint/RPC.
6. Reject a pending order with a reason. Verify it does not appear in KDS and the tracking page shows cancellation/reason. Accept a different order and verify its items appear in KDS and tracking advances to preparation.
7. Mark all items ready in the kitchen. Verify automatic aggregate ready, removal from KDS, the correct pickup/delivery ready label in tracking, and the hub ready action. Test manual ready with its unfinished-item warning. Dispatch a delivery and verify tracking changes to Saiu para entrega.
8. Complete pickup with payment, and delivery only after dispatch. Verify `closed`, `closed_at`, `paid`, and method. Compare all table statuses before/after to confirm isolation. Try simultaneous/repeated actions from two cashiers and verify stale actions fail politely.
9. Print a selected order ticket, including a long delivery address and many items. Verify only the detail ticket prints, with type, notes, customer/address, items, fee, total, payment and change; inspect phone/tablet layouts and keyboard navigation.
10. Disconnect/reconnect the hub and customer tracking and return from a hidden tab; confirm recovery or a clear retry state. Test persistent quotas across app instances and correct trusted-proxy behavior.
11. Re-run QR ordering, staff confirmation, waiter delivery, dine-in KDS and cashier checkout after the shared menu/refactor and SQL replacement. Verify existing token rotation and restrictions remain intact.

## Acceptance checklist

- PASS (implementation/static): public pickup/delivery selection/menu/cart/data/payment, strict payloads, shared creation service, tracking, settings, badges, hub filters/actions/details/print, no-op notifications, and role checks.
- PASS (automated): 17 tests, lint/build/TypeScript; public pages and malformed-token handling.
- PENDING (live Supabase): migration and SQL tests, authoritative minimum/fee/change/upserts, Realtime confirmation/KDS/tracking, aggregate-ready triggers, RLS, closing without table changes, and concurrency.
- PENDING (browser/device): end-to-end submissions, audio permission/alert, saved-address interaction, responsiveness, and print preview.

No live Supabase credentials are present, so database/device acceptance has not been executed. New-attempt submission idempotency is still not implemented: after losing a success response, check with the restaurant before retrying. No deployment or GitHub push occurred. Phase 10 has not started.
