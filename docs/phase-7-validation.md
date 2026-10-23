# Phase 7: cashier checkout

## Files and behavior

- `src/app/(staff)/cashier/page.tsx`: server-rendered initial table list.
- `src/features/cashier/cashier-query.ts`: typed active-table and bill-item queries.
- `src/features/cashier/cashier-board.tsx`: occupied/closing tables with closing first; selection, loading/error/empty states, Realtime, and reconnect/visibility resynchronization.
- `src/features/cashier/bill-detail.tsx`: historical unit prices, quantities, notes, item statuses, totals, undelivered warning, payment dialog, and receipt.
- `src/features/cashier/bill-totals.ts`: line/subtotal arithmetic in integer cents.
- `src/app/globals.css`: responsive cashier layout, modal, receipt print rules.
- `tests/bill-totals.test.mjs`: native Node tests, requiring Node 24 (the local runtime).
- `AGENTS.md`: current phase status.

Checkout uses only the existing `close_order` RPC, which checks cashier/admin authorization, locks the order, recomputes the total, records payment, and releases dine-in tables in one transaction. The browser never writes payment fields directly. There is a synchronous submission lock; an already closed/cancelled order is refreshed and shown with a friendly message. A selected bill remains pinned to its order ID even when the table is freed or reopened.

The confirmation dialog supports Dinheiro, Cartão, and Pix, warns about undelivered items, and rejects a confirmation if the displayed bill changes. The receipt uses the RPC/database total after closure and remains available in the selected view while other tables update. Printing hides navigation, table selection, action buttons, and the dialog. The receipt is explicitly non-fiscal and does not persist after leaving/reloading the page.

## Automated verification

- `npm run lint`: passed without warnings.
- `npm run build`: passed; cashier route is dynamic.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `node --test tests/bill-totals.test.mjs`: 3 passed, 0 failed; Node emitted a harmless module-type detection warning. Tests cover historical prices, fractional values, multiple quantities, empty bills, and free items.
- `git diff --check`: passed.

## Manual setup and tests

Configure `.env.local` using `.env.example` and the real Supabase credentials; complete `docs/supabase-setup.md` and ensure the existing migration, seed, and Realtime publication are installed. No new SQL migration or dependency is needed.

1. Run `npm run dev`. Sign in as cashier in one browser profile and waiter in another. Open a table and submit products as waiter.
2. Verify `/cashier` lists occupied/closing tables only. Request the bill as waiter: the table must become highlighted and move ahead of occupied tables without refreshing.
3. Select the table. Check product names, quantities, historical unit prices, line subtotals, notes, and total. Change a product's catalog price and verify the existing bill keeps its recorded price.
4. Confirm the undelivered warning appears if applicable. Open Fechar conta, select each payment method in separate test checkouts, and cancel once to verify cancellation performs no mutation. Check keyboard focus, Escape, and keyboard-only use of the modal.
5. Confirm checkout, including rapid double clicks. Verify exactly one successful closure: `orders.status = 'closed'`, `closed_at` set, `payment_status = 'paid'`, correct `payment_method`, recomputed total, and table `available` on the waiter map without reload.
6. Open the same account in two cashier sessions, close in one, then attempt in the stale session. Verify a friendly error/state refresh, no duplicate payment, and no reopened order. Reopen the table as waiter: the old selected receipt must remain pinned to the closed order.
7. Add/change an item while the confirmation dialog is open. Verify confirmation is blocked until the dialog is cancelled and reopened against the updated bill. Disconnect during checkout and reconnect: verify refreshed state before retrying.
8. After closure, click Imprimir comprovante. In print preview verify only the receipt, historical prices, total, payment method, and closure timestamp appear. Check a multi-page bill repeats table headers and keeps rows readable; also check tablet/mobile layout.
9. Run `supabase/tests/rls_smoke_test.sql` in the configured environment. Additionally attempt `close_order` under waiter and kitchen sessions: both must be rejected; cashier/admin must succeed.
10. Test no active tables, a table without an active order, and a failed network request. Confirm empty/error states and retry actions.

## Acceptance checklist

- PASS (implementation/static): closing-first active tables, full bill, historical prices, undelivered warning, payment confirmation, double-submit guard, already-closed handling, and printable receipt.
- PASS (automated): totals use recorded prices and integer-cent arithmetic; lint/build/TypeScript pass.
- PENDING (live database): RPC payment/closure/table-release results and live waiter updates.
- PENDING (live database): simultaneous closure behavior and denied waiter/kitchen checkout.
- PENDING (browser): print-preview layout and end-to-end modal/Realtime interaction.

Supabase/browser acceptance checks were not executed because this workspace has no configured Supabase credentials. Phase 8 has not been started.
