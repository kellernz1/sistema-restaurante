# Counter service and business day

## Counter editor layout

The desktop order panel keeps its heading/item-count badge and submission footer
outside `.counter-cart-body`, the only internally scrolling region. Item cards
group name/line value, a touch-sized quantity stepper, removal and item notes.
Customer identification, discount, subtotal and payment sections have separate
spacing; payment method/currency share a row while amounts and change use the
full card width. Mobile retains page scrolling and the visible submission footer,
with reserved space for language/theme controls. Financial and approval behavior
is unchanged by this layout update.

Layout validation (2026-10-26): text guard, lint, TypeScript/build and 41 Vitest
cases passed. Browser checks cover Portuguese/Spanish at desktop/mobile widths,
two distinct products, discount approval/invalidation, scrolling-body versus
header/footer geometry and preference-control overlap. Reviewed captures are in
ignored `artifacts/visual/2026-10-26T05-15-11.627Z/`. The full 46-migration clean
chain and SQL/concurrency suites also passed. Its isolated counter-discount
concurrency fixture now explicitly disables shared-drawer exclusivity, because a
preceding fixture may leave another operator's session open; the development
policy was not changed. No migration, financial workflow, commit or push was
part of this layout update.

## Discount before counter payment

The order editor now offers **Adicionar desconto** before payment, for both
`at_order` and `at_end`. Select whole PYG or a percentage (up to two decimal places),
enter the required reason and request a server quote. Administrators apply under
their own audited authority; cashiers use the existing configured approver/PIN
policy. Only active administrators/supervisors with a personal PIN appear as
approvers. There is no default approval PIN.

`counter_discount_quote` prices the cart from current database products and returns
gross, discount and net total. Percentages are integer basis points and PostgreSQL
rounds positive half-guarani results up. The SHA-256 binding includes actor, random
draft identity, normalized name, item order/IDs/quantities/notes/current prices,
discount/reason, policy version and counter payment timing. Product rows stay
share-locked while creation rechecks the quote. A changed price or disabled product
requires review again. The UI discards approval on any item/name change or draft
recovery; PINs and approval grants are never saved in ordinary navigation drafts.

`request_counter_discount_approval` and existing order approvals share one private
PIN issuer, preserving rate limits, lockouts and PIN-version checks. Only narrow
wrappers can call it. The authorization remains actor/binding specific, short lived
and single use. It is consumed inside `create_counter_order`, not by the browser.

The existing three-argument creator accepts an optional strict `payload.discount`.
Its original UUID/payload/lines replay check runs first. Private RLS-protected
`counter_discount_claims` also allows only one committed order per approved draft,
even with different submission UUIDs. Invalid/insufficient payment rolls back the
claim, grant consumption, ticket, order/items, discount audit, payment ledger and
deferred print jobs together. Recovery repeats the exact stored submission; it
does not request a fresh approval after an ambiguous network failure.

Net total is shown before cash/Pix/split-payment entry. Existing PostgreSQL FX,
cash change and session linkage remain authoritative. A fully discounted order
has no payment rows, is marked paid and remains open for kitchen/handoff. Its
receipt says it was settled by full discount, not that payment is pending. A
nonzero `at_end` order remains unpaid until its later payment session. Discount
audit/report/snapshot fields are the same as existing-order discounts, so reports
do not invent revenue or duplicate a discount on retry. Physical printing remains
unvalidated.

Manual check: add items, choose **Adicionar desconto**, enter Gs or %, reason and
approval as required. Verify subtotal/discount/net total, then payment/troco and
receipt. Changing quantity must remove the authorization. Test insufficient split
payment, retry/reload recovery, 100% courtesy and pay-at-end in disposable fixtures
or a dedicated acceptance database. Never apply these tests as real business data.

Validation (2026-10-26): `db:validate-clean` passed 46 officially tracked migrations,
seed, every SQL suite and concurrent discounted counter creation. SQL covers
underpayment rollback (including grant/audit), changed cart/discount/price, expiry,
replay, duplicate draft prevention, split payments/change, free orders, pay-at-end,
private helper/table grants and final kitchen snapshot. Development history is
46/46 after official `local:update` with a verified pre-update dump at
`backups/2026-10-26T04-44-05-525Z_74faffed-5c71-428a-a789-680b6e346f0d.dump`.
No development reset/restore or historical payment rewrite was performed.

Text check, lint, TypeScript and production build passed. Vitest includes both
counter and approval suites (41 passed); native tests passed 90 with 28 live
integration cases skipped to avoid mutating development. The focused HTTP suite
passed authorization, real database-price quotation, forged input and invalid
binding rejection without creating a sale. The aggregate legacy `test:all`
mutating HTTP workflows were not executed on development.

Browser checks passed Portuguese/Spanish at 390/1440 px: real admin quotes,
subtotal/net display, blocked unapproved submission, invalidation on quantity
change, and the PIN UI using browser-only simulated approval responses (no real
PIN configuration or financial execution). Screenshot review and control geometry
checks cover the total/action versus floating language/theme preferences.
Captures: ignored `artifacts/visual/2026-10-26T04-55-36.374Z/`.
Receipt byte/layout tests cover full discount settlement; physical printing,
real shared-device PIN acceptance and complete live HTTP sale acceptance remain
manual checks. No commit or push was made. Services remain running for acceptance.

Block 6 adds independent counter enablement and optional waiter use. Counter service does not require ordinary pickup or the waiter role to be enabled. Public counter QR/provisional tickets are deferred; see [service modes](service-modes.md).

Block 5 reuses this business-day definition for operator cash sessions. Payments belong to the session open when received, including pay-at-end orders created earlier. Daily dashboard revenue now uses receipts net of change. See [cash sessions](cash-sessions.md).

Printing update (block 4A): counter receipts now use the shared print queue/layout and destination configuration described in [printing-architecture.md](printing-architecture.md). Browser delivery still uses its print dialog, while the local file-test processor runs without a visible kitchen page. The earlier isolated receipt implementation below describes the original block-3 delivery; payment and ticket rules are unchanged.

## Channel and compatibility

Cashier screens share a sticky navigation for Caixa e mesas, Pedido de balcão and Turnos de caixa. It respects enabled service modes and marks the active route. The counter catalog and order editor use aligned cards; support/printing information is compact on cashier routes while failure alerts remain visible. Header height is measured so the local navigation and sticky order editor do not collide with it.

Unsubmitted counter drafts are kept in tab-local session storage scoped to the operator. They contain product IDs, quantities, notes, optional name and payment drafts, never authoritative catalog prices, exchange rates or a new submission key. Returning resolves products against the current active catalog and filters disabled payment methods; staff must review the recovered draft. Clearing/submitting the cart removes that draft. Existing uncertain-request UUID recovery remains separate and unchanged. Browser storage availability is required for navigation recovery; nothing is submitted automatically.

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
