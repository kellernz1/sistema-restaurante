# Cash sessions and business-day reports

Block 8B adds manual refunds and atomic paid cancellation, capped by discounted net receipts. Return-time cash sessions and net reports supersede earlier refund exclusions below. See [refunds.md](refunds.md).


Block 6 adds a default-on single shared-session rule across operators. Administrators can disable it to use simultaneous operator sessions as described below. See [service modes](service-modes.md); the existing one-open-session-per-operator rule always applies.

## Accounting rules

Each active cashier/admin can have one open session. Different operators can open simultaneous sessions. Opening captures the restaurant timezone, business-day cutoff and business date (defaults: America/Asuncion, 05:00). Before 05:00 the session belongs to the preceding date. This is an operator ledger for one shared physical cashier station, not independent physical drawers: operators must coordinate their initial funds and physical counts.

`cash_session_policy` controls mandatory sessions (default enabled) and blind counting (default enabled). Administrators edit it in Settings, payments section. New payments are bound in PostgreSQL to the authenticated paying operator's open session, under a row lock. Payment time, rather than order creation time, determines attribution. A pay-at-end order created yesterday can therefore be received in today's session. Each new payment saves its receipt business date; an overnight session can have receipts on different business dates.

Existing test payments retain null session IDs and dates. They are excluded from session reports, but included in daily reports using the configured business-day window. No old financial values are rewritten by these migrations.

Expected cash = opening fund + cash payments net of change + supplies - withdrawals. All cash amounts are whole PYG. Pix, cards, transfers and Pix rounding adjustments never increase expected physical cash. Supplies and withdrawals require a reason and are not sales. Expenses use a withdrawal with a reason.

Blind counting hides expected cash and payment aggregates in the operator's open-session report until submission. Administrators can inspect other operators' sessions. Existing authorized order/payment access remains available: blind counting is a counting workflow, not an anti-fraud isolation mechanism or manager approval.

## Closing, recovery and authorization

`cash_session_command` handles opening, movements, closing and reopening transactionally. UUIDs bind the actor, action and exact payload. Repeating the same request returns its saved result. Concurrent different closing UUIDs cannot close twice: the second receives a conflict. The browser retains uncertain commands in session storage and offers recovery with the same UUID/payload.

Closing accepts a counted total, optional denomination breakdown and notes. A supplied breakdown must equal the total. Differences are allowed and preserved. Unpaid orders are listed as a warning; closing never modifies them. The closed report is a snapshot. Closed sessions, movement history and events cannot be edited/deleted through ordinary writes. Only an administrator can reopen with a reason; an existing open session for that operator prevents reopening. Reopening preserves prior closing results in events and resumes the same cumulative ledger with a new revision.

Cashiers access their own sessions and reports. Administrators access all. Kitchen and waiter roles cannot access these APIs/RPCs. RLS and authenticated SQL functions enforce these boundaries. Printing, copying and reviewing session report jobs also enforce ownership.

## Reports

`/cashier/sessions` supports opening, supplies/withdrawals, closing and historical reports. `/admin/reports` selects a business day and links its sessions. The session picker shows recent sessions; daily report links can open older ones directly.

Reports group receipts by method and paid currency, retaining original BRL cents, PYG equivalents, cash change and BRL-conversion rounding adjustments separately. General revenue is the sum of recorded PYG equivalents minus change. The administrative dashboard uses the same payment-based business-day definition, rather than closed-order totals. Session order counts are distinct paid orders; a partly paid order can contribute to multiple sessions. Service-type amounts follow receipts.

Delivery fees are recognized once, on the receipt that fully covers the order. Migration `202610250012_cash_delivery_fee_snapshot.sql` saves that fee on the final payment; legacy payments use the final-settlement fallback. Fees are not proportionally rounded across installments. Cancelled/refused order counts and values are captured at cancellation, attributed to the acting operator's open session when available. Legacy cancelled test orders use their creation date as an approximation and carry a legacy marker.

Daily products count fully paid orders on the business day of their final receipt, using historical item prices and quantities. This avoids counting items repeatedly across split-payment days; product totals consequently need not equal that day's partial cash receipts. Hourly movement shows receipts, not opening funds or manual movements. Session lists include sessions opened that day or receiving payments that day.

The closed-session page is printable and can enqueue a report to the logical cashier destination using the existing browser/file-test engine. The shared document generator supports configured 58/80 mm layouts. No real printer compatibility, silent printing or physical drawer control has been validated.

## Schema and validation

Migrations: `202610250011_cash_sessions.sql` and `202610250012_cash_delivery_fee_snapshot.sql`. Main tables: `cash_sessions`, `cash_movements`, `cash_session_events`, `cash_session_policy`, `cash_order_cancellations`; payments gain session/business-date/fee snapshots. Generated types are in `src/types/database.types.ts`.

SQL suites `cash_sessions_test.sql` and `cash_delivery_fee_test.sql` cover mandatory binding, unique opening, mixed payment/change/rounding, movements, blind counts, closing/reopening, immutable history, daily boundaries, old unassigned payments, report printing and RLS. `cash-session-concurrency-test.mjs` uses two real PostgreSQL sessions and runs only on the isolated clean database, avoiding permanent financial test fixtures in development.

The complete chain of 35 migrations, seed, 17 SQL suites and concurrency checks passed in a separate temporary database. The development database was not reset. This validates SQL installation; it is not a second complete Supabase Auth/Realtime installation. Run `npm run db:validate-clean` to repeat that procedure. Unit tests cover expected cash, denomination totals, blind visibility and both report widths. HTTP tests cover authenticated reports, role boundaries, policy editing and daily receipt reconciliation; financial writes are tested with rolled-back SQL fixtures, not persistent HTTP fixtures.

Validation on 2026-10-25: lint and production build (including TypeScript) passed; 18 native tests, 37 Vitest tests and seven HTTP tests passed. The clean migration/SQL/concurrency validation was repeated successfully after the final schema changes. Both new migrations were applied locally after a development backup, and database types were regenerated. No commit or push was made.

## Manual acceptance

1. Sign in as cashier and open `/cashier/sessions`. Open with Gs. 100.000. A second opening must fail. A different cashier may open their own session.
2. Launch a counter order. Receive Gs. 25.000 cash for a Gs. 20.000 amount; confirm Gs. 5.000 change. Test split cash/Pix and verify original BRL/rate snapshots. A cashier without an open session must be refused while the requirement is enabled.
3. Register Gs. 30.000 supply and Gs. 5.000 withdrawal with reasons. For only that cash sale, expected is Gs. 145.000. Close counting Gs. 144.000: expected stays hidden beforehand and the closed report shows a Gs. 1.000 shortage.
4. Leave an unpaid pay-at-end order open. Confirm the warning appears and closing leaves the order unchanged. Pay it from a subsequent open session and verify the receipt belongs there.
5. Repeat a request/reload after a simulated network interruption using recovery. Verify one event and one close. Check cashier cannot access another operator's report; kitchen/waiter cannot enter the feature.
6. As administrator, inspect the daily report and dashboard, change business date, reopen a closed session with a reason, and inspect its event history. Try reopening while that operator already has another open session: it must fail.
7. Open the closed report print page and queue to the configured test destination. Check 58/80 mm, Portuguese/Spanish, browser preview and touch layout manually. Do not switch a test driver to hardware without reviewing its pending queue.

Out of scope: refunds, discounts, manager PIN approval, bank/Pix reconciliation, fiscal invoices, independent physical drawers and real printer drivers. Physical printing, mobile touch acceptance and power-loss recovery remain operational acceptance checks.
