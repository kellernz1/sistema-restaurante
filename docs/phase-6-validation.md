# Phase 6: kitchen display system

## Changes

- `src/app/(staff)/kitchen/page.tsx`: server-side loading of the initial production queue.
- `src/features/kitchen/kitchen-query.ts`: shared typed query with `orders!inner`, restricted to open orders and pending/preparing/ready items. The result includes product names, order details, and table numbers.
- `src/features/kitchen/kitchen-board.tsx`: responsive three-column queue, per-card actions, optimistic transitions with rollback, synchronous per-item locks, and status comparison to detect concurrent updates.
- `src/components/order-type-badge.tsx`: shared Local/Retirada/Entrega labels with distinct icons and colors.
- `src/app/globals.css`: queue layout, highlighted notes, and elapsed-time warnings.
- `AGENTS.md`: phase status updated.

The queue refetches its joined data on item and order events. This ensures confirmation makes an order visible and cancellation/closure removes it. Delivered items are excluded. Refetching also occurs on subscription/reconnect, browser online, and returning to a visible tab. Subscriptions, listeners, and the clock are cleaned up on unmount; stale responses are discarded. Pending optimistic changes overlay refresh results until each mutation completes.

Cards show quantities, notes, type, table number for dine-in, order number, customer first name for pickup/delivery, and elapsed minutes. The warning defaults to 10 minutes and can be changed for the current view. Oldest items appear first. No sound alert or schema changes are required.

## Checks performed

- `npm run lint`: passed without warnings.
- `npm run build`: passed; `/kitchen` is a dynamic route.
- `node node_modules/typescript/bin/tsc --noEmit`: passed.
- `git diff --check`: passed.

## Manual setup

Configure `.env.local` with the real Supabase URL and anon key and complete `docs/supabase-setup.md`. Existing migrations include Realtime publication and role-specific RLS; no new migration is needed. The existing `supabase/tests/rls_smoke_test.sql` includes allowed kitchen status updates and denied quantity/table updates. Run it in the configured Supabase environment.

## Manual acceptance tests

1. Run `npm run dev`. Open separate browser profiles: one authenticated as waiter, the other as kitchen at `/kitchen`.
2. Submit two products from an open table, including multiple quantities and notes. Confirm both kitchen cards appear under Recebidos without refreshing, targeting about one second under normal network conditions.
3. Verify each card's product, quantity, notes, table, order number, and Local badge. Verify the empty columns, and inspect the layout at tablet and phone widths.
4. Click Iniciar preparo. Confirm immediate movement to Preparando, then persisted status in the database and live update on the waiter screen. Click Marcar pronto and confirm the same behavior for Prontos. Rapidly double-click and verify there is no duplicated mutation for the same item.
5. As waiter, mark the ready item delivered; confirm it disappears from the kitchen.
6. Using an authorized test session or SQL Editor, create a valid pending-confirmation order with items. Confirm it is hidden, then set its status to open and confirm its cards appear. Cancel/close an open order and confirm all its cards disappear. Include valid pickup/delivery test orders and verify badges and customer first names.
7. Set an item's `created_at` more than 10 minutes in the past. Confirm the elapsed time and Atenção warning. Change the threshold and verify the warning follows it.
8. Disconnect the kitchen browser and attempt an action before the disconnect is detected. Confirm failed mutations roll back, display an error, and can be retried after reconnection. Confirm manual refresh, reconnect, and tab visibility regain fetch current data.
9. Update the same item in two kitchen sessions concurrently. Confirm the losing mutation shows an error and the queue resynchronizes. During a mutation, cancel the order in another session and confirm no card is resurrected by rollback.
10. Run the SQL smoke test and verify a kitchen user can change status but cannot change quantity, prices, notes, or table data.

## Acceptance status

- PASS (implementation/static checks): three-column queue, badges, highlighted notes, live clock, configurable warning, optimistic actions and rollback.
- PASS (implementation/static checks): open-order join, exclusion of delivered items, subscriptions to items and orders, reconnect/visibility resync, and cleanup.
- PENDING (live Supabase): waiter-to-kitchen latency around one second and live status updates in both sessions.
- PENDING (live Supabase): confirmation/cancellation visibility, concurrency, failed-network rollback, and RLS smoke tests.

Live acceptance tests were not run because this workspace has no Supabase credentials. Phase 7 has not been started.
