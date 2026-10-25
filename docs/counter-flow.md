# Counter service and business day

Block 5 reuses this business-day definition for operator cash sessions. Payments belong to the session open when received, including pay-at-end orders created earlier. Daily dashboard revenue now uses receipts net of change. See [cash sessions](cash-sessions.md).

Printing update (block 4A): counter receipts now use the shared print queue/layout and destination configuration described in [printing-architecture.md](printing-architecture.md). Browser delivery still uses its print dialog, while the local file-test processor runs without a visible kitchen page. The earlier isolated receipt implementation below describes the original block-3 delivery; payment and ticket rules are unchanged.

## Channel and compatibility

Counter service reuses `order_type=pickup` and the internal `source=waiter`, with explicit `is_counter=true`. This avoids extending existing enums, routing, delivery, WhatsApp and QR contracts. It does not imply a waiter is present: source means staff entry. Ordinary pickup still requires its normal customer contact, counter orders require neither phone nor name and have no customer/address record. Public payloads cannot opt into counter service. Only active cashier/admin can call `create_counter_order` through `/api/staff/counter`; kitchen/waiter/anonymous callers cannot.

The shared `create_customer_order` still owns product availability, stored prices, totals and item insertion. Direct EXECUTE remains service-role restricted. A narrow branch permits the authenticated, role-checked counter wrapper to call it internally. Counter item fields/quantities are validated again in SQL. Other channels keep their existing behavior.

## Ticket and commercial date

Settings → Counter and business day controls restaurant name, IANA timezone (default `America/Asuncion`), local start time (default `05:00`), payment timing and waiting thresholds. Database timezone validation uses PostgreSQL's installed timezone data. For an instant `t`, its business date is the local date after subtracting the start-of-day offset. Thus 00:30 and 04:59 belong to the previous business date, while 05:00 starts the next one. Use `business_day_for` and `business_day_window` for future shift work, not a fixed UTC offset or a 24-hour duration assumption. Bounds are local cutoff instants converted through the timezone, including timezone offset changes.

Ticket allocation uses transaction time (`now()`, also used by `created_at`) and a private `counter_daily_numbers` row per business date. Atomic INSERT/ON CONFLICT UPDATE allocates 1, 2, 3...; rollback does not consume a number. `(counter_business_date,counter_ticket)` is unique for counter orders. Two independent PostgreSQL sessions are tested concurrently. Old tickets never change when settings change; the date is also shown in the queue/receipt to distinguish open tickets from different days. Changing timezone/cutoff during service should be avoided. An order started before cutoff and committed afterward retains its transaction-time business date.

Admin daily revenue now uses `business_day_window` instead of fixed UTC−3 midnight. The existing revenue definition is retained: paid **and closed** orders by closure timestamp. Upfront counter payments therefore enter this metric after handoff, not while still preparing. This is not a shift/cash reconciliation report.

## Payment and lifecycle

Default `at_order`: one authenticated `create_counter_order` transaction creates the order, applies existing split-payment/BRL conversion/change rules through `record_order_payments`, requires full coverage, then commits. Insufficient/stale/invalid payment rolls back order, items, ledger rows, queue job and ticket allocation. Realtime/kitchen only see the committed paid order. No public/unpaid counter checkout is created.

`at_end`: creation accepts no upfront payment lines and commits an open/unpaid order directly to preparation. At readiness the cashier opens the existing payment panel and settles the balance using block-1 payment rules. The payment mode is snapshotted into each order. A stale screen with incompatible lines fails rather than silently changing timing.

Counter state sequence: `open` (preparation) → `ready` (all items ready/delivered, timestamp recorded) → `closed` (handed to customer). Paying a counter order marks payment paid but **does not close the preparation order**. Other order types retain existing payment/closure behavior. `deliver_counter_order` requires ready and paid and is idempotent; it closes the order and marks items delivered. Legacy hub transitions cannot bypass this flow. Paid counter totals are immutable. There are no new order-status enum values.

`counter_order_submissions` binds a UUID to actor, exact payload/payment lines and original response. Identical concurrent/repeated requests return the same ticket/order, without another payment. Changed payload/actor under the same key fails. Pending UUID/payload is held in memory and session storage when available; uncertain network responses must be resolved with **Consultar envio** before another order. Prices may change between display and submit: PostgreSQL revalidates, and an insufficient/excess allocation fails atomically. Reload to refresh settings/rate after a confirmed validation error.

## Operator interface

`/cashier/counter` provides always-visible category buttons, remembered category on that browser, focused name search, Enter to add the first result, one-touch product buttons, quantities, item notes/removal and a sticky Gs total. Optional call name is normalized to one line with collapsed whitespace, at most 30 Unicode code points; the ticket remains the identifier.

Ready queues appear on the counter screen and cashier dashboard. Realtime plus periodic/reconnect refresh updates orders; a one-second clock updates waits independently. Oldest readiness comes first. Defaults: green through 2 minutes inclusive, yellow through 5 minutes inclusive, red afterward, with textual status as well as color. Paid orders show **Marcar como entregue**; unpaid ones show **Receber pagamento**. Preparation tickets remain available in a separate expandable list. Kitchen cards show ticket and optional name; kitchen printing is not modified.

## Receipt and public tracking

Kitchen cards are grouped by order, with quantities, notes and individual item controls kept together. All-pending orders appear in Received; mixed or preparing orders in Preparing; all-ready orders in Ready. Counters count orders. Ready pickup/counter orders remain visible until handed off. Start-order and mark-all-ready actions call the authenticated `advance_kitchen_order` PostgreSQL RPC (migration `202610250001`). Active kitchen/admin roles are revalidated in SQL. It locks the table/order and full item set, changes pending to preparing and optionally preparing to ready in one transaction, preserving ready/delivered items. A failure rolls back every item and aggregate order state. A private RLS-enabled request ledger binds UUID, actor, order and action to the response; identical retries return it even after later transitions, while changed requests are rejected. Existing notification enqueue deduplication remains in place. The browser keeps an uncertain request UUID in memory and offers Consultar envio; a page reload loses that request context, though repeated status actions remain non-regressive. Kitchen printing is unchanged.

`/print/counter/[orderId]` is an isolated cashier/admin-only 80-mm-oriented HTML receipt with restaurant name, large ticket, optional name, historical item prices, notes, total, payment originals/equivalents, applied rate, change and localized timezone timestamp. It explicitly says **Comprovante não fiscal** and invokes the browser print dialog only. Thermal driver/paper acceptance is manual.

QR is generated locally and encodes the existing `/track/<public_token>` capability. Tokens are 32 random bytes encoded as 64 hex characters, unique in PostgreSQL; neither ticket nor order UUID is accepted as a public tracking key. Counter tracking API returns exactly `is_counter`, `counter_ticket` and `status`. It exposes no name, phone, address, payment information, internal ID or other orders. The polling page shows only ticket/state. Treat the QR link as a bearer capability: anyone given it can view that ticket's status. Configure the reserved LAN URL correctly before printing; remote tracking requires appropriate hosting/connectivity.

## Deployment and verification

Back up and pause app/worker, apply migrations `202610240008`–`202610240010`, regenerate types, build and restart. RLS remains enabled; allocation/submission tables are private. No commit/push is part of this block.

Run lint/build, native `tests/counter.test.mjs`, existing validation/Vitest tests and all SQL suites. `counter_flow_test.sql` rolls back its fixtures. The concurrency runner launches two simultaneous psql transactions against a reserved far-future test date, verifies both results with `counter_concurrency_test.sql`, then removes only that sentinel allocator row. No dblink extension, database authentication change or network port exposure is used. `counter-http.test.mjs` uses a temporary pay-at-end setting, pending test order, cashier/kitchen/admin/waiter sessions and restores/removes its own fixtures; it does not create immutable financial HTTP fixtures. Upfront payments are tested in rolled-back SQL transactions.

Manual: open `/cashier/counter`, search and press Enter, add with touch, change quantities, write “sem cebola”, enter an optional name and pay using split cash/Pix lines. Check one ticket, open receipt and browser print preview. Mark items ready as kitchen, call the ticket at the cashier and hand it off. Repeat with pay-at-end, checking unpaid handoff is refused. Repeat in Spanish and with two cashier browsers. Test boundary time using SQL helper cases rather than changing the notebook clock. Check the QR from a phone on the configured network and confirm only ticket/state are visible.

Out of scope: silent printing, kitchen-print changes, shifts/cash closure, manager approval, QR confirmation policy, TV/waiterless mode, WhatsApp ready notices and electronic invoices. Live printer/mobile/keyboard-touch acceptance remains necessary.

### Local validation on 2026-10-24

Migrations 008–010 were applied to the local test database and database types regenerated. ESLint and the production build (including TypeScript) passed. Validation passed: 43 native unit/validation tests, 37 WhatsApp Vitest tests, 13 SQL suites including two-session ticket concurrency, and 5 HTTP tests including tracking privacy, receipt access, payment authorization and language regression. No physical printer or visual browser/touch acceptance was performed. No commit or push was made.

### Atomic kitchen actions: 2026-10-25

After a local backup, migration `202610250001` was applied and types regenerated. Lint, production build, grouping unit test, all 14 SQL suites and 5 HTTP tests passed. SQL injects an error during a multi-item finish and verifies full rollback, then checks start/finish, unchanged retry responses, action-key conflicts, cancelled orders, inactive staff, cashier/anonymous denial and private-ledger access. HTTP submits simultaneous identical start requests and repeats finish, checks denied roles and confirms public tracking becomes ready. Manual acceptance: use an order with several items, start it as a group, finish one individually, then finish the rest together; verify the cashier/QR show ready only after completion. Network-loss recovery and real touch interaction remain manual checks. No printing or payment rules were changed, and no commit/push was made.
