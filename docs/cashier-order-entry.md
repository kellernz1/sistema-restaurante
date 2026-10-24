# Taking orders at the cashier

The cashier dashboard now has **Novo pedido**, opening `/cashier/orders/new`.
Both cashier and admin can submit table, pickup and delivery orders. Waiters,
kitchen staff and anonymous callers cannot create orders through this endpoint.

For table service, select a free table to open a tab or an occupied table to add
items. Tables already requesting their bill cannot receive items. Pickup requires
customer name, phone and payment method; delivery also requires a full address.
Existing channel availability, delivery minimum, fee and change rules apply.
The server normalizes phone numbers and uses database product prices.

Successful submissions are confirmed for kitchen preparation. Payment remains
pending until the normal cashier/table or order-hub completion flow. Existing
receipt printing remains available after closing, and offsite ticket printing
remains in the order hub. Creating an order does not mark it paid.

## Architecture and deployment

- `/api/staff/orders` validates a strict Zod payload and checks the authenticated
  profile. It obtains the actor ID from the session, never the request body.
- `src/lib/order-service.ts` calls service-role-only `create_cashier_order`.
- Migration `202610230001_cashier_order_entry.sql` adds a private idempotency
  ledger and the RPC. It extends the shared `create_customer_order` pricing
  pipeline to the existing internal `waiter` source (staff-entered orders).
  No new enum is required. Public schemas still reject caller-supplied sources.
- Actor role is checked again in PostgreSQL. The ledger is inaccessible to browser
  roles. Order/items/confirmation and request tracking commit atomically.
- Table locks serialize with existing ordering and closing. The same request ID
  and payload return the original order without inserting more items; reusing an
  ID for another actor/payload fails. Failed transactions leave no ledger entry.
- On uncertain network failure, the form locks editing and offers **Consultar
  envio** using the same request ID. No automatic resubmission is performed.
  Before abandoning/reloading such a form, check the order hub for the result.
- Generated database types are refreshed. `StoredRow` omits opt-in PostgREST
  computed fields when typing stored rows; WhatsApp JSON helper annotations were
  narrowed to reflect the non-null object payloads they already serialize.

The migration has been applied to the current local database. Other environments
must apply it before deploying this feature, then run `npm.cmd run types`.

## Validation

- Production build (including TypeScript) and ESLint.
- `tests/cashier-order-validation.test.mjs`: three cases cover all order types,
  phone/address normalization, request IDs and rejected actor/source/price/status
  overrides or incomplete data.
- `supabase/tests/cashier_orders_test.sql`: transactional fixtures cover new and
  occupied tables, closing-table rejection, exact totals, fee/minimum/change,
  duplicate request reuse, unauthorized actors and direct RPC/table access,
  kitchen readiness and pickup/delivery completion. Included in `test:sql`.
- `tests/cashier-order-smoke.test.mjs`: authenticated HTTP creation of all channels,
  concurrent identical submissions, kitchen transitions and cashier completion;
  verifies anonymous/waiter/kitchen denial. Fixtures are removed by their IDs.
  The live test requires `PUBLIC_TEST_URL`, local Supabase keys and demo accounts.

For manual acceptance, sign in as `caixa@restaurante.local`, open **Novo pedido**,
and test all three types. Verify notes, quantities, delivery fees and change.
Follow the items in the kitchen, then close/pay using the existing workflow and
check print preview. Browser interaction and physical printing remain manual.
