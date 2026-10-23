# Phase 5: waiter order taking

## Implementation

- Active products grouped by category, with name/description search.
- Separate cart lines allow different notes for the same product; quantity is limited to 1–99 per line, notes to 500 characters.
- One `order_items` insert sends all cart lines atomically, with `pending` status and no price field. The existing database trigger supplies current prices.
- A synchronous mutation lock prevents double submission. The cart clears only after a successful insert and remains available after an error.
- Sent items show database prices, quantities, notes, and statuses. Realtime watches items, orders, and the table, with cleanup, resynchronization after reconnect/visibility changes, and a manual refresh button.
- Ready items can be marked delivered; requesting the bill changes an occupied table to closing.
- Closed/cancelled orders and refresh errors disable mutations; existing RLS remains the authorization boundary.

## Local verification

- `npm ci`: passed; reported five high severity dependency advisories. Dependency remediation was not included in this phase.
- `npm run lint`: passed without warnings.
- `npm run build`: passed, including the dynamic table route.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.

## Environment and manual verification

No schema changes are required. Configure `.env.local` from `.env.example` with real Supabase values, then complete the migration/seed instructions in `docs/supabase-setup.md`. Do not commit credentials. These live checks have not been run on this machine.

1. Run `npm run dev`, log in as a waiter, open an available table, and enter its order page.
2. Search for a product; verify inactive products are absent and active products appear under their categories.
3. Add two products, adjust quantities, add a note such as “sem cebola”, remove a line, and verify the estimated total. Add the same product twice with different notes.
4. Verify an empty cart cannot be submitted. Send a populated cart, including a rapid double click. Confirm one batch exists, with the expected quantities, notes, and `pending` status; the cart clears and confirmation appears.
5. Inspect the request payload: it must not contain `unit_price`. Inspect the database rows: `unit_price` must match the database product price. Change a product price after opening the page and verify submission uses the new database price.
6. In a second authenticated session, change a sent item through preparing to ready. Verify this page updates without reload; mark it delivered and check the database status.
7. Disconnect/reconnect the browser or change data while the tab is hidden; return and confirm synchronization. Use Atualizar if Realtime is unavailable.
8. Request the bill; verify `tables.status = 'closing'` and the waiter map updates.
9. With a cart populated in one browser, close/cancel the order in a second authorized session. Verify submission is disabled after synchronization. To exercise stale-state protection, pause network delivery of Realtime before closing: submission must fail under waiter RLS, show a friendly message, and retain the cart.
10. Make one cart product inactive before submission. Verify the entire batch fails with no partial rows and the cart remains intact.

## Acceptance checklist

- PASS (code/static checks): cart supports quantity/notes; one atomic insert omits prices; empty submission is blocked.
- PASS (code/static checks): Realtime subscriptions, delivered transition, bill request, and friendly mutation errors are implemented.
- PENDING (live database): rows contain DB prices, quantities, notes, and no duplicate batch under double click.
- PENDING (live database): waiter RLS rejects inserts into closed/cancelled orders.
- PENDING (live environment): Realtime behavior, delivery transition, and bill request verified across sessions.

Phase 6 is not implemented. Wait for explicit user confirmation before starting it.
