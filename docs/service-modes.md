# Service modes, optional waiters and QR review

## Configuration and authorization

Settings → Atendimento controls counter service, table QR service, pickup, delivery and waiter use. Existing restaurant switches remain authoritative for table/pickup/delivery; `service_policy` adds independent counter enablement, waiter use (default off), QR confirmation, phone collection and pending limits. Delivery controls also remain in their delivery section. A disabled mode rejects creation in SQL, including adding items to an existing disabled table. Counter enablement is independent of ordinary pickup.

The waiter role is omitted for new employees while disabled. Existing accounts/history are retained; role helpers, RLS and staff APIs deny waiter actions, and their screen shows an explanatory message. Re-enabling restores access for otherwise active accounts. Administrator/cashier entry uses the internal `waiter` source label from the counter block; that source does not require a waiter employee.

## Open table account and pending requests

The existing single active dine-in order remains the table's aggregate bill. New `qr_requests` stage individual customer submissions before materialization, with immutable product/price snapshots. Pending requests have no kitchen items or print jobs. Confirmation reuses `create_customer_order` for authoritative availability, prices and totals. A price change between submission and confirmation fails the entire confirmation: reject the old request and ask the customer to review/resend. No client-supplied price is accepted.

Legacy pending QR orders from before this block remain reviewable by cashier/admin with a required refusal reason. They do not acquire the new per-request cancellation secret retroactively. Their manual review is retained; new submissions use the new policy and account marker. The public browser must refresh after the upgrade.

Tables have a random account epoch (`qr_account_id`) and a first-confirmed marker. The epoch lasts until the active bill releases the table. Pending submissions made before the first bill opens share that epoch. Releasing the table changes it, resets the marker and cancels any remaining staged submissions with a system reason. Rotating a QR token changes access, not the account epoch; staff can still review existing requests. Old QR links stop working at the locked SQL boundary.

Three modes are snapshotted per submission:

- `manual` (default): each submission, including additions, waits for cashier/admin review.
- `after_first`: the first submission of an account requires manual review. Only after that successful confirmation do later submissions auto-confirm. Another table or a released/reopened account does not inherit approval. Refusing the first request does not establish approval; refusing a later request does not erase the already confirmed account's marker. Already pending requests are not retroactively auto-approved.
- `payment`: cashier/admin uses **Receber e confirmar** and the existing split-payment/Pix editor. Materialization and payment commit together; insufficient payment, missing mandatory cash session, stale rate or any error rolls everything back. The account's complete remaining balance plus this request must be covered, not just the latest request. UI estimates this due amount; PostgreSQL rechecks under locks.

A prepaid QR account stays open for preparation and additions instead of being released on receipt. Its recorded payments remain immutable. Once paid, **Liberar mesa paga** closes/releases it explicitly; pending requests block that action. Later additions can require new payment. Automatic additions correctly restore pending payment status if the bill grows. Table closure never refunds or deletes payments.

## Customer identity, limits and cancellation

Customer name is required. Phone collection is required, optional (default) or off. The existing PY/BR selector/default and server E.164 normalizer are reused. Without a phone, a per-phone quota or phone block cannot identify that visitor; this is stated in settings. This block does not verify ownership of a phone or prove physical presence.

Defaults: two pending requests per table and two per normalized phone. Phone-scoped advisory locks serialize cross-table submissions; table locks serialize local limits, rotation, confirmation and customer cancellation. Requests carry a mandatory UUID and exact normalized payload; concurrent/repeated submissions reuse one record. A changed payload under the same key is rejected. Browser uncertainty retains the same request in session storage and offers **Consultar envio**. Unknown/transient server failures remain uncertain, rather than inviting an automatic duplicate.

Public tracking/cancellation requires both the current table QR token and a separate random 256-bit request access token retained by that browser. Status responses contain only request state/reason and its item names/quantities, not phone, address, other requests or access tokens. The old UUID-based, sanitized legacy bill tracking remains available for existing orders. Customer cancellation is allowed only while pending; confirmation/cancellation contend on the same table/request locks. Actor kind, reason and time are stored. A confirmed request cannot be cancelled from the phone.

The table menu uses the shared floating cart as a fixed circular shortcut. It opens an internally scrollable dialog for draft items, name/contact and the last request's tracking/cancellation. Total and send/recovery actions stay in its footer; errors and successful-send feedback also appear there. Closing the dialog retains draft state. The offsite cart keeps its existing expanding/compacting behavior. Visual smoke adds draft items, adjusts quantity and reopens the table cart without submitting an order.

The public table catalog uses category pages with at most six products per page and the shared compact product layout. Category/search/page changes retain draft items. On mobile the cart sits below theme/language controls, with coordinated safe-area spacing. Browser smoke checks page changes, the six-item limit, page width and non-overlapping floating controls.

Administrator phone block/unblock actions are available from refused/cancelled requests with a phone. The server normalizes before submission and the SQL boundary rejects blocked numbers. The shared order insert guard also rejects blocked numbers in other ordering channels. This is a deterrent, not an authenticated identity or SMS verification system.

## Cashier queue and service calls

`/cashier` lists pending QR submissions oldest first, with name, table, items/notes, amount, count and waiting color thresholds reused from the counter block. It polls every five seconds. Optional sound is stored in the browser; autoplay restrictions may require user interaction. No timeout automatically approves anything. Manual review requests retain their UUID/payload for uncertain-response recovery.

**Chamar atendente** and **Pedir a conta** use the existing service requests. One request per minute per table applies across both types; repeated open requests remain deduplicated. Cashier/admin can mark attended; bill requests link to the selected table's closing flow. Waiters can attend calls only when their mode is enabled. These buttons remain useful even when orders are temporarily paused, but not when table mode itself is disabled.

Refusals/customer/system cancellations are included in block-5 cancellation totals through a private report source, without creating fake financial orders. Staff refusals belong to their current session when available; anonymous customer/system cancellation has no cashier session and appears in the business-day report. The original snapshot amount and cancellation business date are retained. Closed shift reports remain snapshots.

## One shared cash session

`cash_session_policy.single_open_session` defaults true. A global PostgreSQL advisory lock serializes opening/reopening across operators. A second open session is refused with guidance to close the current one. Administrators can disable this rule to recover the prior multiple-operator ledger behavior; one open session per operator always remains enforced. Enabling it while multiple sessions are already open fails rather than closing them silently. The migration does not rewrite existing sessions; any pre-existing extra sessions must be closed operationally before further openings. Payment/session attribution and business-day rules from block 5 remain unchanged.

## Installation and testing

Migrations `202610250013_service_modes.sql` through `202610250018_legacy_qr_review.sql` add policy, request/audit data, protected account metadata and narrow RPCs. Database types are regenerated. Old QR creation through the legacy RPC is refused; public clients must refresh to send the new request UUID/name contract. Legacy SQL role tests explicitly enable waiter mode inside their rolled-back fixtures. `service_modes_test.sql` supersedes the former table-self-service suite for the new contract.

Run `npm run check:text`, `npm run lint`, `npm run build`, `npm run test:all`, `npm run db:validate-clean` and `npm run test:visual`. Clean validation uses a separately named disposable database, never resets development. The service concurrency script runs only there, because it commits fixtures to exercise independent sessions. HTTP negative/boundary tests restore configuration and do not leave successful financial/QR request fixtures. SQL exercises successful writes inside rollback, and separate sessions test QR idempotency, per-phone limits and one shared drawer.

Manual acceptance:

1. In Settings → Atendimento, choose manual QR and the desired phone rule. Open a table QR from a customer browser, enter name/contact and send. Confirm it appears only in the cashier queue, with no kitchen item beforehand.
2. Confirm or refuse with a reason. Check the customer result, then test cancellation from the customer before confirmation and refusal afterward. Block/unblock a phone as administrator and try the normalized PY/BR input again.
3. Select after-first mode on a new account: first request waits; after approval, later requests go automatically. Release/pay the table and repeat: first request must wait again. Rotate its QR and verify the old link fails.
4. Select payment mode on a fresh account. With no open cash session, receive-and-confirm must fail without kitchen items/payment. Open the cash session, test insufficient and split cash/Pix payment, change and stale rate. Verify the prepaid table remains occupied and can be released explicitly when fully paid.
5. Test the two pending limits across browsers/tables, including absent phone when optional/off. Call an attendant, immediately request the bill (must hit cooldown), then retry after a minute. Mark attended as cashier and follow the bill link.
6. Disable each mode and verify its creation flow disappears/refuses on the server. Sign in as an existing waiter while disabled; re-enable and check access returns. Inspect employee creation in both states.
7. Try opening a second operator session with shared-session mode on; then disable the setting as administrator and repeat. Review cancellation counts and closed-session snapshots.

## Deferred choices

The optional onboarding wizard is not included: all settings are explicit in the existing administration screen. A fixed counter QR is deliberately deferred. Current counter tickets are allocated only by the atomic staff creation/payment transaction; mapping a public provisional code to a ticket safely needs its own pickup staging, immutable conversion and retry binding. Reusing the table account epoch or allocating a counter ticket at public submission would mix incompatible lifecycles. A later block can reuse the staging pattern with a separate short-code namespace and assign the real ticket only at receive-and-confirm.

Out of scope: WhatsApp ready notifications, manager PIN, refunds/discounts, fiscal invoices and real printer drivers. Physical printer/browser audio behavior and all device interactions still need manual acceptance. No commit or push is part of this block.

## Validation performed (2026-10-25)

- Development backup: `backups/2026-10-25_0339.sql`, before schema application. No development reset occurred. Types were regenerated and the app/workers restarted.
- Text check: 386 UTF-8 project text files, zero issues. ESLint and the production build including TypeScript passed.
- Vitest: 37 passed. Native/HTTP: 91 passed, zero failed, four skipped by explicit environment gates (contact identity, external road routing and two configured WhatsApp webhook checks). Local integration: 12/12 passed. All 17 SQL suites passed.
- Isolated installation: all 41 ordered migrations, seed, SQL suites and concurrency tests passed. Separate connections exercised single shared-session opening, duplicate QR submissions and cross-table phone limits. The temporary database was removed, without resetting development. This is SQL installation validation, not a full second Auth/Realtime environment.
- Final visual smoke: 40 passing combinations, including cashier/QR queue, settings, employee creation, public table page and the friendly disabled-waiter screen in pt-BR/es at desktop/mobile widths. No suspicious visible text, page overflow or console errors. Captures: `artifacts/visual/2026-10-25T07-23-07.935Z/`. These are current-state smoke screenshots, not exhaustive interaction or physical-device acceptance.
- Tests caught and corrected an ambiguous SQL phone variable and the old employee test's assumption that waiters were always enabled. A committing legacy ticket fixture briefly enabled waiter mode; that fixture mutation was removed and the local default restored. The final complete run confirmed waiter use remains disabled afterward.

Successful financial/QR writes were validated in rolled-back SQL tests and disposable concurrency fixtures. The HTTP suite verifies invalid/forged/unauthorized public requests and restores its configuration; it does not leave successful payment or QR audit fixtures in development. Browser payment interactions, sound/autoplay and real customer-device use remain manual acceptance.
