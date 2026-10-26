# Manual refunds and paid cancellation (block 8B)

## Scope and accounting

`refunds` is an append-only ledger referencing the original payment. Original
payments, rates, discounts and previously printed snapshots are never rewritten.
`payment_status` retains its receipt meaning; refund history is separate.
`refund_submissions` privately caches actor-bound exact request results.

The server-authoritative available amount is:

`max(0, min(discounted order total, sum(equivalent_pyg - change_pyg)) - sum(refund amount_pyg))`.

Neither gross item prices before discount nor cash tender before change increase
this ceiling. Counter discounts are already in the order total because creation,
discount, audit and payments commit together. For a Gs. 50.000 order discounted
by Gs. 10.000, tendered Gs. 50.000 with Gs. 10.000 change, at most Gs. 40.000 is
refundable. After a Gs. 10.000 partial return, cancellation returns Gs. 30.000.
Inconsistent legacy receipts exceeding the discounted total are refused for
manual reconciliation, rather than silently converted into refundable credit.

`refund_quote`, `request_refund_approval` and `execute_refund` validate active
cashier/admin access. Cashiers always require another active admin/supervisor's
PIN approval; administrators use their own audited authority. Supervisors approve
but cannot register financial returns. Grants bind actor, operation, order,
reason, amount, policy version and current financial state, expire and are consumed
once. Existing PIN budgets, lockout and remaining-attempt feedback apply.

Every refund requires the operator's own open cash session, even if payment-session
enforcement is disabled. The session and current restaurant business date capture
the actual return time. A later return never changes an earlier closed report.
Expected cash subtracts cash refunds through net cash receipts. Net daily revenue,
method/service totals, hourly movements and delivery fees subtract returns on
their return business day. Separate refund lines show original currency, PYG,
operator and reversed FX adjustment; receipt/order counts remain receipt counts.
Product rankings continue to describe sold items, not inferred returned units:
an amount refund does not identify which item was returned.

## Original currency and rounding

Payments are allocated oldest first (timestamp, then ID); staff cannot select a
different payout currency or change the saved rate. Cash returns are PYG and never
return change a second time. BRL returns use the original cents proportionally:

`floor(original_cents * cumulative_refunded_pyg / net_paid_pyg) - prior_returned_cents`.

Thus a complete return restores exactly the received BRL cents, including the
original FX rounding surplus. The saved rate is informational and never replaced
by today's rate. The separately reversed PYG rounding adjustment uses cumulative
PostgreSQL `round`; delivery-fee attribution uses cumulative `floor`. Allocation
is performed once in PostgreSQL; the browser does not recalculate it. A partial
return smaller than one source-currency cent is refused; choose a larger amount.

## Cancellation, atomicity and recovery

Standalone partial refunds require a fully paid order. Returning the full balance
of an active order requires **Cancelar pedido e estornar**; closed orders can be
refunded without changing operational status. A partly paid order can be cancelled
with all its receipts returned; its unpaid balance is never returned. Ordinary
unpaid cancellation keeps block 8 rules. A fully discounted zero-total order can
be cancelled without inventing a payment or zero-valued refund row.

Cancellation, refund rows, grant consumption, audit, table release and the kitchen
cancellation notice/print job commit in one transaction. A failed audit rolls all
of them back. Cancelling a historical closed table order never releases a table
that may now have a new customer. Pending QR requests must be resolved first.
Original receipt/kitchen snapshots remain immutable; new receipt previews include
refund history. Existing cancellation documents and uncertain-output rules apply;
no physical printer compatibility has been validated.

Order locks serialize returns and payments; the request advisory lock serializes
identical retries. Changed state invalidates a quote. Same actor/request/payload
returns the saved result even after the session closes. A different payload under
that key fails. RLS, revoked direct writes and mutation/truncate triggers protect
the ledger, including administrator application access.

The UI first quotes, then obtains approval, then asks the operator to confirm the
manual return. It persists only the exact uncertain execution in sessionStorage,
never a PIN, and retries that UUID/payload. Refreshing an uncertain operation must
use **Consultar envio**. Do not physically return money again. Closing the tab,
clearing browser storage or changing devices requires reviewing the ledger/audit.

**No bank, card or Pix refund is sent by this system.** A database transaction
cannot make an external transfer atomic, prove that money was returned, or stop
two people from manually transferring it twice. Operators must coordinate,
validate approval/session immediately before returning money, and retain external
proof. If a grant expires or another operator changes the order after the actual
transfer, inspect/reconcile before requesting another operation. This is an
explicit manual-accounting boundary, not bank reconciliation.

## Installation and validation

Migrations `202610260007_refunds.sql` and `202610260008_refund_reports.sql` use the
official tracked CLI through `local:update`, with verified backup before applying.
Do not run SQL files manually or edit historical payments. Regenerate types.

`npm run db:validate-clean` installs the entire chain and runs rollback-based SQL
fixtures plus two-session refund races in a separate disposable database. The
refund fixtures cover discounted cash with change, prior returns, mixed partial
payments, historical BRL cents/rounding, free cancellation, approval, RLS,
immutable history, daily/session effects and rollback on audit failure.
Unit tests validate API bounds and receipt rendering in both widths/languages.
Visual API simulations exercise dialogs without recording financial fixtures.

Manual acceptance:

1. Open a cash session. Create a Gs. 50.000 counter order with Gs. 10.000 discount;
   receive Gs. 50.000 and return Gs. 10.000 change.
2. Open that order in **Pedidos**, or a ready counter order. Choose **Estornos e
   cancelamento**, partial Gs. 10.000, and a reason. Verify Gs. 40.000 available.
3. As cashier, obtain another approver's PIN; wrong PIN shows remaining attempts.
   Return money once, confirm and register. Verify one immutable return.
4. Choose **Cancelar pedido e estornar**: verify Gs. 30.000, confirm once, and check
   cancellation, kitchen notice and total returned Gs. 40.000. A further return
   must fail. Original payment still shows tender/change and original discount.
5. Repeat with Pix, change the current rate before quoting and confirm the refund
   retains original cents/rate. Check partial and complete return totals.
6. Review current session/day report, prior closed report, audit filter and new
   receipt preview in Portuguese/Spanish and mobile/desktop. Test retry with the
   same request after a lost response; never repeat the physical payout.

Outside scope: external bank execution/confirmation, automatic reconciliation,
item-specific refunds, stock returns, fiscal credit notes, new hardware drivers
and physical printer validation.

## Validation on 2026-10-26

All 49 official migrations, seed, 21 SQL suites and concurrency checks passed
in a disposable clean database, including older-backup upgrade and untracked-DDL
rejection. Financial fixtures rolled back or lived only in that temporary
database. Expired/changed approval, concurrent consumption, identical retry,
retry after cash-session closure and rollback on audit failure were exercised.
Development was not reset or restored. Before official local application, backup
`backups/2026-10-26T06-26-56-812Z_6786b6d7-2c82-4c54-833f-7c988d47097d.dump`
passed manifest/checksum validation. History reports 49 files/49 registered.

Text check (460 UTF-8 files), ESLint, TypeScript/production build and 53 Vitest
cases passed. Native suites passed 91 cases; 28 provider/live integration cases
were intentionally skipped rather than creating development financial fixtures.
The separate authenticated HTTP boundary test passed without recording returns.
Receipt unit tests exercised both locales and 58/80 mm output.

The final browser run passed 60 route/locale/viewport combinations (Portuguese
and Spanish, 390/1440 px), with no console/text/overflow findings. Refund quote and
cancelled-order uncertain-request recovery used simulated browser responses and
storage, never a real payout. Reviewed captures are under
`artifacts/visual/2026-10-26T06-40-34.906Z/` (ignored). Review found a mobile
overlay clipping issue; rendering the refund dialog through a body portal fixed
it. Keyboard focus/scroll containment and a visible title are checked. The visual
fixture also closes the underlying mobile details before exercising print controls.

No actual bank return, printer, power-loss payout reconciliation or full live
provider acceptance was validated. Manual operational acceptance above remains
necessary. App/workers were restarted; no commit or push was made.
