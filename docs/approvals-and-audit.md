# Approvals, discounts and immutable audit (block 8)

Block 8B adds manual refunds and atomic paid cancellation, capped by discounted net receipts. Return-time cash sessions and net reports supersede earlier refund exclusions below. See [refunds.md](refunds.md).


## Boundaries

Supervisors are optional approvers, not administrators. They use `/supervisor` to
manage their own PIN and review active orders. Administrators also approve with
their own authority. Cashiers request another person's approval when required.
Kitchen staff cannot grant or execute financial operations. Waiters, when the
service mode is enabled, can request cancellation only on their own orders.
Administrative security configuration is at `/admin/settings/security`; audit is
at `/admin/audit`. All permissions are checked again by PostgreSQL.

This block does not implement refunds, reimbursements, item discounts, fiscal
documents, hardware printing or manager approval of cash closing differences.
Already paid orders are blocked; partially paid orders cannot be cancelled.
Pay-at-order counter orders are already paid when creation returns and therefore
cannot subsequently receive a discount. They can receive a cart-bound discount
before creation/payment through `counter_discount_quote` and
`request_counter_discount_approval`; `create_counter_order` consumes approval and
commits the discount, ledger and audit atomically. See `docs/counter-flow.md`.
Discounts on existing unpaid orders are
available before payment, including pay-at-end counter orders.

## PIN and single-use authorization

`approver_pins` is private, RLS protected, and has no client grants. PINs contain
4–6 digits and use pgcrypto bcrypt with independent salts and cost 12. Defining or
changing a PIN verifies the signed-in approver's current Auth password. No API,
audit event, attempt cache or browser persistence stores the PIN or password.
The application does not log request bodies or database errors on this path.

There is no default approval PIN. Only active administrators/supervisors who have
configured their own PIN appear in the cashier's approver selector. An empty list
is a setup condition, not an invitation to enter the login password. The dialog
explains the setup path, hides the unusable PIN field and disables approval until
an eligible person and a numeric PIN are supplied. After the responsible person
saves their PIN in their own session, the cashier can refresh the approver list
without leaving the order. Uncertain execution recovery retains its original
idempotency key and remains available independently of new-approval input checks.

The default policy blocks a PIN after five wrong attempts for fifteen minutes.
An additional actor budget allows at most ten approval/PIN attempts per minute.
Wrong attempts return a normal result rather than raising an exception, so the
counter and audit event commit. Retrying the same approval request UUID returns
the prior result without consuming a second attempt. Disabling or changing the
approver's role, or changing their PIN, invalidates outstanding grants by version.

Approval failures now return server-authoritative feedback from the shared issuer:
`pin` includes `attempts_remaining`; `locked` includes zero remaining attempts,
`blocked_until` and `retry_after_seconds`; `limited` returns the remaining actor
rate-limit wait without inventing a PIN attempt count. An unavailable approver is
reported separately. Both counter creation and existing-order approval interfaces
show the same localized alert, including singular/plural attempts and the lock
wait rounded up to minutes. The alert describes the failed attempt's server
snapshot; it is not a browser-maintained counter or a live countdown. Concurrent
devices share the approver's database lock/counter. Replaying a failed request UUID
returns its original snapshot without incrementing attempts or extending the lock.
No hash/PIN is exposed, and opening a page never consumes an attempt.

PIN feedback validation (2026-10-26): 47/47 official migration history; complete
clean migration chain and all SQL/concurrency suites passed. SQL verifies default
and custom thresholds, exact remaining counts, failed-request replay, a blocked
correct PIN, nonextended lock deadlines, expiry/success reset and actor rate-limit
waits. Existing development counters/blocks were preserved. The verified
pre-update dump is
`backups/2026-10-26T05-36-14-432Z_5146146c-607a-4855-b145-c6cf66163ecb.dump`.
Text validation, lint, TypeScript/build and 45 Vitest cases passed. Browser checks
passed both languages and desktop/mobile widths, using simulated PIN responses
for remaining/last attempt, lock and rate limit; no real development PIN was
failed or reset for testing. Reviewed captures:
`artifacts/visual/2026-10-26T05-37-22.477Z/` (ignored). Manual acceptance with a
real approver remains available to the operator. No commit/push was made.

`sensitive_quote` produces a SHA-256 binding over the actor, operation, target,
reason, computed amount, policy version and current order/items/payment state.
`request_operation_approval` checks another active approver's PIN and creates a
random UUID grant, valid for 120 seconds by default. The UUID is private, actor
bound, and never listed by a public query. It is an authorization secret, not an
audit identifier. `execute_sensitive_action` locks the document/table/order/items,
rechecks the quote and consumes the grant in the same transaction as the action.
A stale, expired, different-target or consumed grant is rejected. A duplicate
execution request UUID replays the same result; changing its payload is rejected.
Administrators and supervisors use their own authority, recorded as approver,
rather than issuing themselves a PIN grant.

The browser keeps only an uncertain execution's exact UUID, payload, binding and
authorization in sessionStorage. It retries that same request after a network
failure. It never persists the PIN/password. A definite database rejection permits
a fresh quote. Closing a tab ends sessionStorage persistence; staff must inspect
the order/audit rather than blindly recreate an uncertain financial operation.

## Discounts and cancellation

All prices and amounts remain bounded integer PYG (maximum Gs. 1 trillion).
Percentage inputs are integer basis points: 100 means 1%, 10000 means 100%.
PostgreSQL rounds a positive percentage result to the nearest whole guarani,
with halves rounded up. The approved amount is then fixed in Gs: adding items
does not silently increase an earlier percentage discount.

`total = authoritative item subtotal + delivery fee - discount_amount`.
The database recomputes this value and rejects forged totals, direct discount
edits, confirmed fee changes and confirmation regression by staff. A discount
cannot reduce the total below receipts already recorded. It cannot be added after
full payment. Reasons are mandatory (2–300 characters through HTTP); configured
suggestions coexist with free text. With approval disabled for discounts, both
the absolute limit and the percentage limit must be respected. Both default to
zero. A replacement discount audits its signed delta rather than double counting
the entire replacement amount.

Cancellation before kitchen submission is free but audited. A confirmed order,
or an item from such an order, requires approval by default. Partially or fully
paid cancellation requires block 8B. Removing an item cannot leave its order's
discount greater than the remaining gross amount. Cancelled items are physically
removed, while immutable audit/print/kitchen snapshots retain their identity,
quantity, value and reason. Cancelling an unpaid table order releases the table
and preserves the existing account-token epoch protections.

Kitchen cancellations create a separate `cancellation` print document and an
immutable `kitchen_cancellations` notice in the action transaction. The kitchen
shows the last 24 hours (up to 50 notices), polling every five seconds. Print jobs
use the existing lease, review and uncertainty rules: uncertain output is never
automatically resent. Browser/file-test drivers remain the only drivers; physical
printer compatibility has not been validated. Reprinting by job ID retains the
cancellation document and reprint marker.

## Reports and audit

Receipt snapshots contain the discount and net total. Cash-session/day reports
add discount deltas and cancellations after kitchen submission, including value,
count and operator breakdown. These are informational adjustments, never new
payment ledger rows. Revenue remains net recorded receipts. A free settled order
is counted without inventing a zero payment. Existing closed session snapshots
remain unchanged; historical reports are not rewritten.

`audit_events` is insert-only. Client roles (including application admin) cannot
insert/update/delete directly. UPDATE, DELETE and TRUNCATE guards also reject
owner DML. Trusted trigger/RPC insert helpers are not client executable. The
server captures time, business date, actor, approver, target, amount, summaries,
reason and the actor's open cash session in the same transaction as the action.
Phone blocks use a private HMAC pseudonym, not raw customer phone numbers.
Configuration/product/employee events contain narrow operational fields, not
passwords, PIN hashes, customer addresses or access tokens.

`audit_timeline` unifies new events with existing cash reopening events and print
discard reviews without copying those events into another table. It is admin-only,
filters the restaurant business day/action/actor/approver and paginates 100 rows.
New legacy event records retain their business date; older rows use the configured
timezone/cutoff when queried. Actor names are current staff names; immutable IDs
preserve attribution if a name changes.

## Threat model and limits

The boundary protects against a cashier using browser tools or direct authenticated
RPC/table requests to bypass approval, change amounts, replay a grant or rewrite
audit history. A cashier is not trusted to supply prices or computed discount totals.
PIN observation/shoulder surfing, shared signed-in devices, compromised Windows,
malicious browser extensions, stolen administrator credentials and a compromised
database owner remain risks. A four-digit PIN is a convenience approval factor,
not phishing-resistant authentication. Keep approver PIN entry private, lock the
notebook, use individual accounts and rotate observed PINs. Intentional PIN lockout
is possible; there is no unaudited cashier unlock shortcut.

Database owners can alter/drop triggers or restore an older backup; append-only
tables are not external tamper-evident storage. `owner_maintenance` explicitly
permits trusted SQL fixture/maintenance operations outside the staff API boundary,
but never bypasses the immutable audit DML guards. Protect database credentials,
backups and physical access. Configure PostgreSQL/proxy diagnostics so sensitive
RPC parameters are not logged externally. Application protections cannot control
third-party/provider or administrator-enabled SQL parameter logging.

## Validation and manual acceptance

Use `npm run db:validate-clean` for the complete officially tracked migration chain,
SQL cases and two-session grant double-use test in a disposable database. The
concurrency fixture intentionally refuses development because its audit is immutable.
Run `npm run check:text`, `npm run lint`, `npm run build`, `npm run test:all` and
`npm run test:visual`. Keep screenshots in ignored `artifacts/visual/`.

1. As admin, create an optional supervisor; sign in as that person and set a PIN
   with their current password. Check rejected reauthentication and wrong-PIN lock.
2. Create an unpaid order, select Discounts and cancellations, choose a fixed or
   percentage discount and mandatory reason. As cashier, supply another approver's
   PIN. Confirm the net total and make a split payment covering that total.
3. Change the order after quoting: execution must reject the stale quote. Retry a
   completed execution using its same UUID: only one action/event may exist.
4. Cancel an unpaid confirmed item: check its kitchen notice, separate print job,
   amount/operator in reports and audit. Paid cancellation must be rejected.
5. Check a 58/80 mm file/browser receipt, discount, cancellation marker and manual
   reprint. Hardware printing remains outside this block.
6. Compare Portuguese/Spanish desktop/mobile configuration and audit screens.

Deployment uses a verified backup and `local:update` (official migration tracking),
then `db:verify-history`. Never apply migration SQL directly or reset development.

## Recorded validation — 2026-10-25 local / 2026-10-26 UTC

- Official development history: 45 files, 45 registered, no missing/orphaned/renamed
  entries. Development was not reset or restored. The new migrations were applied
  only through `local:update`, after verified backups. The last pre-update dump is
  `backups/2026-10-26T01-23-41-227Z_665d3dbf-31ba-4822-af4f-a269ada99390.dump`;
  its manifest/checksum were verified before applying the attribution hardening.
- `db:validate-clean`: passed all 45 officially tracked migrations, seed, every SQL
  suite and concurrency test, including approval double-use, older-backup upgrade,
  and rejection of untracked DDL. All databases used were separate and disposable.
- New SQL tests also cover expired grants, changed amounts, PIN lock/hash privacy,
  immutable audit, cancellation documents and rollback when audit insertion fails.
  Account-creation attribution rejects user-editable metadata and accepts only
  server-controlled Auth app metadata from an active administrator.
- `check:text`: 440 UTF-8 files, zero issues. Lint and production build passed.
  Vitest: 37 passed. Native suites without live integration variables: 88 passed,
  28 integration cases skipped, zero failures. The printing suite covers discount
  receipts and cancellation snapshots on 58/80 mm in both languages.
- New HTTP approval suite: passed against the running stack; unauthenticated and
  forbidden roles, forged fields and invalid execution authorization are rejected.
  It performs no financial mutations and does not configure a development PIN.
- `test:visual`: passed desktop/mobile in Portuguese/Spanish, including security,
  audit, supervisor and the sensitive-action dialog. Reviewed captures are under
  ignored `artifacts/visual/2026-10-26T01-25-39.737Z/`; `results.json` has no failures.
  The visual run corrected audit-filter horizontal overflow and insufficiently
  visible form controls. A prior HTTP cleanup invalidated the browser session;
  the new suite now signs out only its own session.
- The aggregate `test:all` command and its legacy mutating live HTTP workflows were
  deliberately not run on development: this task prohibits business-data writes
  there beyond migrations. Those workflows need an isolated complete Auth/Realtime
  HTTP installation before claiming full end-to-end regression acceptance. SQL
  validation alone does not provide that installation. Manual real PIN/payment
  acceptance, physical printing and shared-device operational acceptance remain.
- The application and supervised workers were restarted for local acceptance.
  No commit, push, Windows task installation or printer-driver change was made.
