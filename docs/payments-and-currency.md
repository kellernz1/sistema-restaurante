# Payments and base currency

Block 5 adds operator cash sessions and payment-based daily reporting. See [cash sessions](cash-sessions.md); its rules supersede earlier exclusions of shifts and instructions that allowed payment without opening a session. Mandatory sessions are enabled by default.

Printing update (block 4A): receipts now snapshot the existing payment ledger through the shared engine in [printing-architecture.md](printing-architecture.md), with on-demand output by default and optional output on full payment. Currency, FX rounding, payment validation and settlement rules are unchanged.

## Deployment and existing test data

Apply migrations `202610240001` through `202610240006`, in order, while the app is stopped. The first migration commits the `transfer` enum before it is used. Back up the database first. Then regenerate types with `npm run types`, build and restart the app. Refresh all previously open customer/staff pages; their carts and payment selections can contain obsolete units.

The database was declared test-only. Existing monetary columns are converted to `bigint` using PostgreSQL `round`: 12.49 becomes 12 Gs and 12.50 becomes 13 Gs. This is **not exchange conversion**. Historical item prices are rounded individually and order totals are recomputed from those rounded prices and delivery fees, so rounding the old total alone can produce a different result. Temporary delivery quotes are deleted because their snapshots use obsolete units. No orders or products are deleted. No exchange rate or fictitious historical payment is generated for old closed orders.

Re-enter/review the entire menu, fixed delivery fee, distance-band fee, minimum and change amounts in guaranies before testing real prices. Old closed orders remain test records, not accounting evidence. Backups contain sensitive data and stay git-ignored.

## Units, limits and presentation

`src/lib/money.ts` centralizes `BASE_CURRENCY = PYG`, `Gs.` formatting, limits and display conversion. PYG amounts are whole guaranies; BRL originals are integer cents. API and database monetary fields are bounded to 0–1,000,000,000,000 minor units. Quantities keep existing limits. Totals exceeding the database bound fail atomically. Rates use exact PostgreSQL `numeric(20,8)` and are submitted/transmitted as decimal strings. Product prices are still always read from the database.

Examples: `Gs. 25.000`, `Gs. 0`. Portuguese and Spanish use the same PYG representation. Fractional PYG API payloads are rejected. PostgreSQL bigint coercion itself rounds fractional SQL literals, so integrations must use the validated endpoints/RPCs rather than treat implicit casts as a validation API.

## Methods and current rate

Settings → Payments and exchange (`Pagamentos e câmbio` / `Pagos y cambio`) is available to administrators. Enable one or more of cash, transfer, card and Pix, and save the methods separately. The database revalidates enabled methods when creating and settling orders. Pix order intent requires a configured rate.

Enter guaranies per one real (for example 1400.12345678), choose a rounding mode and save a new rate. Each save appends an immutable `exchange_rates` row with creator, creation time and effective time. The current rate is the latest effective row, with a sequence tie-breaker. Neither administrators nor cashiers can edit/delete historical rows through the app. No default test exchange rate is installed.

`payment_configuration()` exposes only enabled methods and current rate metadata to staff/server endpoints. Public checkout obtains that sanitized configuration through `/api/public/menu`; it never connects to Supabase. A customer's Pix choice is intent only, with an approximate BRL amount. No public endpoint records payment or claims bank confirmation.

## Conversion and rounding

PostgreSQL `brl_cents_for` is authoritative. The browser's integer/BigInt implementation is a preview of the same rule:

- `none`: the least whole BRL cent covering the allocated PYG amount (no additional step).
- `half_real`: round upward to the next 50 BRL cents.
- `whole_real`: round upward to the next 100 BRL cents.

For 25,000 Gs at 1,400 Gs/BRL, the required amount is BRL 17.86, or BRL 18.00 with either stepped mode. For 25,201 Gs it is BRL 18.50 with half-real rounding and BRL 19.00 with whole-real rounding. “None” does not allow fractional cents.

Configured FX rounding can itself produce a conversion surplus. For a noncash BRL line, `equivalent_pyg` credits the allocated Gs and `rounding_adjustment_pyg` separately preserves `round(original_cents * rate / 100) - equivalent_pyg`. This is an explicit rounding adjustment, not cash change. The server accepts **exactly** the calculated BRL amount; any additional noncash overpayment is rejected. PYG noncash originals must exactly match their allocation. Staff must explain the chosen rounding policy to customers.

Pix settlement is exclusively BRL. Cash settlement is exclusively PYG (migration `202610240011`); BRL cash is disabled in both payment interfaces and rejected by the server schema and PostgreSQL RPC. Historical recorded payments and completed idempotent retry responses remain unchanged. Transfer/card may use either currency when the current rate is configured. Cash change is always PYG. New rate IDs are checked when recording: a stale BRL quote fails atomically. Recorded payments retain their original rate and adjustment forever.

## Ledger, permissions and idempotency

`payments` stores order, method, original currency/amount, exchange-rate ID and snapshot, rounding mode/adjustment, equivalent Gs, change, operator, timestamp, status and request/line identifiers. Only active cashier/admin can collect; only those roles can read the payment ledger. Anonymous callers cannot read it or write it. Writes occur through `record_order_payments`; direct table writes and financial-history updates/deletes are denied. Direct order updates cannot mark payments paid or bypass the ledger.

One request accepts 1–20 lines. `order_payment_submissions` stores the actor, order, complete payload and original response under a UUID. An identical retry returns that response, without new rows. A changed actor/order/payload under the same key fails. All lines, remaining balance, change and closure commit together. Partial batches remain pending; the order closes and releases its table only when net recorded payments cover the database total. Legacy `close_order` and hub completion use the same ledger. Pickup/delivery keep their existing completion-stage requirements.

Order/item mutations and payments serialize on order rows. Totals cannot be reduced below recorded net payments, and partially paid orders cannot be cancelled in this block, because refunds are not implemented. Financial history is append-only even for test fixtures: use rollback-based SQL tests, not deletion of recorded payments.

## Manual acceptance

1. Sign in as admin, review whole-Gs menu/settings, enable all methods and save a 1400 Gs/BRL rate with no extra rounding. Repeat in Spanish.
2. Public `/order`: add a 25,000 Gs product. Verify whole-Gs menu/cart/total. Pix shows approximately BRL 17.86. Transfer/card/cash show only Gs. Submitting creates a pending order and **no payment**.
3. Confirm and prepare the order. At the normal completion stage, open its payment panel in `/orders`, or the table bill in `/cashier` for dine-in.
4. Add transfer/PYG for 10,000 Gs and Pix/BRL for 15,000 Gs. Check the displayed conversion and remaining balance. Register and verify closure and the saved summary. Alternatively register the first line alone: the order remains pending and the second batch settles the remaining amount.
5. Cash test: for 25,000 Gs, receive 30,000 Gs and verify 5,000 Gs change. Verify BRL is disabled for cash and a forged cash/BRL payload is rejected. Card/transfer/Pix cannot receive a manually inflated original.
6. Switch FX rounding to 0.50 and 1.00 steps. Verify the documented examples. Change the rate in another admin session before submitting an already-open BRL payment: it must be rejected until reviewed. Reopen a closed summary and verify the old applied rate remains.
7. Disable a method; refresh customer/cashier screens and verify it is unavailable. A stale submission must fail server-side. Test blocked cashier, waiter and anonymous access.
8. On an uncertain payment request, use **Consultar envio** to repeat the original UUID and payload. Do not create a second payment merely because the connection failed. The pending UUID/payload is also retained in session storage when available, so reopening the same order in the same browser tab offers the same request. Preserve the open payment screen until the result is resolved if browser storage is unavailable.

## Verification and exclusions

Run `npm run lint`, `npm run build`, `npm run test:whatsapp`, `node --test tests/money.test.mjs tests/bill-totals.test.mjs tests/delivery-pricing.test.mjs tests/menu-management-validation.test.mjs tests/offsite-order-validation.test.mjs`, and `npm run test:sql` with the local seeded database running. SQL fixtures roll back and cover rates, snapshot immutability, conversion, split/partial settlement, PYG cash change and rejection of BRL cash, disabled methods, stale rates, retry payloads, direct-write/RLS boundaries and blocked roles.

Outside this block: shifts/cash reconciliation, USD, refunds/reversals, electronic invoices, manager approval, phone/address rules, printer integration and bank/Meta configuration. No printer layout/queue changes were made. Existing receipts inherit the shared money formatter. Physical printing and interactive browser acceptance still require manual checks. Do not treat a recorded Pix payment as bank-verified.

Validation performed on 2026-10-24: migrations applied to the local test database after backup; database types regenerated; lint and production build passed; 28 native unit/validation tests and 37 Vitest tests passed; all 10 SQL suites passed. The dedicated HTTP contract test passed against a temporary localhost production server, covering sanitized public configuration, whole-Gs prices, authenticated ledger reads, invalid payloads and admin/cashier/waiter/anonymous boundaries. That temporary server was stopped afterward. The complete legacy HTTP smoke suite and interactive browser flows were not executed in this block. SQL tests exercised actual payment writes inside rolled-back transactions; the HTTP test did not create financial fixtures. No commit or push was made.
