# Installation subscriptions (block 9)

Post-test hardening, variable-name-only inventory, proposed credential rotation,
LAN exposure and Git path audit are documented in [post-test-security.md](post-test-security.md).
No rotation is authorized by importing a license or by this documentation.
Use the owner tool's `--out` walkthrough to avoid empty license files and token
output; import errors are now shown next to the Import button with specific causes.

## Trust, storage and first activation

Ed25519 signs `MesaCertaLicense/v1.` plus the exact base64url-encoded UTF-8 JSON
payload. The envelope is `payload.signature`. Node verifies renewal proofs and
PostgreSQL independently verifies imports through the installed `pgsodium`
extension. No custom elliptic-curve implementation or external crypto dependency
is used. The Supabase PostgreSQL 15 image must provide `pgsodium`; clean and full
stack tests exercise that prerequisite.

Claims: version 1, license UUID, installation UUID, restaurant name, plan, feature
codes, monotonic integer sequence, issued/expiry/grace UTC timestamps and signed
suspension. Online proof also contains a request nonce. Validity is at most 31
days from issuance, with owner-selected grace (default seven, maximum 31 days).
This is a rolling monthly renewal requirement; the weekly default renews earlier.
Renewal never silently extends the subscription's paid-through date.

The first migration/execution generates the installation UUID in PostgreSQL.
`license_installation` and `license_current` have RLS and no ordinary table grants,
including no service-role direct DML. The database stores public verification
material, signed token/claims, replay ceiling, clock watermark, safe boundary and
renewal metadata. It stores **no production private key**.

Owner setup:

1. On a separate trusted owner machine, use [the owner tool](../owner-tools/licensing/README.md)
   to create/store the key and registry outside the checkout/restaurant.
2. In the restaurant environment set `LICENSE_PUBLIC_KEY` to the public JSON's
   64-character hex value, then build/restart through the local operational flow.
   Never add a private key or administrative server bearer to `.env.local`.
3. Settings → License shows/copies the generated installation ID. Send it to the
   owner; issue a pilot token with all features and import it in the admin screen.
4. Configure the renewal endpoint, normally `https://owner.example/v1/renew`, and
   the 1–7 day interval. Plain HTTP is accepted only for loopback reference tests.
   URLs must have no credentials/query/fragment; redirects are refused.

There is no unsigned perpetual pilot or built-in production signing key. A fresh
unactivated installation cannot take new orders. During an upgrade with an active
cash session, missing/expired licensing is deferred to the safe boundary below.
Unconfigured deployments remain administrable and preserve all historical data.
First public-key pinning is server-only; a different existing trust key is refused.
Key rotation/replacement requires a separately reviewed owner maintenance procedure.

## Enforcement and service boundaries

States: active; expiring (warnings throughout the last seven days, including the
three-day warning); grace; restricted. Administrator and cashier see banners.
Settings → License shows plan, features, validity, grace, remaining days, last
online renewal, installation ID, import/configuration and manual renewal.

After grace, suspension or due clock debt, restriction becomes effective only on
opening/reopening a cash session or advancing the configured business day. With
no session open, the installation is already at an idle safe boundary. A request
already committed before a boundary is not undone. Opening remains possible and
displays the banner; closing a session never modifies orders or licensing rights.
Simultaneous operators share one installation boundary: any successful new opening
is such a boundary, as is the business-day rollover.

Read-only SQL enforcement calculates due restrictions even if the worker is down;
it does not add a global write lock to every order. Private pulse/import/opening
operations persist state transitions and audit. The renewal worker and authenticated
status polling persist observed changes. A rejected creation transaction cannot
commit its own audit update; its enforcement nevertheless remains effective.

Triggers protect new `orders`, `order_items` and staged `qr_requests`, including
direct writes and internal/public creators. New additions count as new sales.
Successful idempotent creation retries do not insert again and retain their saved
response. Previously accepted QR requests may still be confirmed/materialized and
paid through the role-checked `qr_review`; a private transaction context permits
only that continuation/table and is not a spoofable session setting.

Existing item preparation/delivery, bill/order closure, payment, refund, cancellation,
printing, reporting/export reads, backup and restoration are not license-gated.
No record is hidden or erased. Public menu/table responses expose only availability
and a friendly ordering notice, never installation/token/private licensing data.

Delivery and WhatsApp feature gates apply independently of restaurant service
switches; enabling a switch cannot override a signed plan. Delivery quoting and
creation are gated. Signed incoming WhatsApp webhooks are still acknowledged and
stored; when unavailable the handler commits a friendly human-handoff reply instead
of soliciting a new sale. Existing outbound notifications/operational histories are
not disabled by subscription expiry. Real Meta/provider acceptance remains separate.

## Renewal and offline import

The supervised independent `licenseWorker` pulses every 30 seconds, reconnects on
database failures and attempts renewal when due. RPC/fetch waits have ten-second
deadlines. The database reserves a nonce/lease and retries network failures after
an hour; the worker also uses monotonic time for failure backoff and weekly checks
while running. Manual renewal may recover a stale claim; superseded responses are
rejected. No monetary subscription charge happens in this protocol.

Request/response contract and owner administration are documented in the
[reference server README](../owner-tools/licensing/README.md). Only installation
identity, nonce and current signed license are transmitted: no orders, customers,
payments or database keys. Response size is bounded to 16 KiB. Online nonce binding,
signature and replay ceiling are checked before one transactional installation.
Repeating the same accepted proof/token is idempotent. A failed response preserves
the installed license; outages do not prematurely revoke its signed validity/grace.

Offline import is the explicit exception for a notebook without monthly internet:
an owner-issued new signed token substitutes manual renewal. It **does not** update
`last_online_at`, prove connectivity or clear a clock-related online requirement.
An older sequence/issuance or different installation/license identity is refused.
Importing the exact current token does not duplicate the audit event.

## Clock and recovery

The effective reference is the maximum of PostgreSQL time, persisted high-water
mark, order/payment creation times, print-worker heartbeat, successful backup
observation and verified online issuance. Backup observation is best-effort and
never turns a valid backup into a failure or blocks recovery. Watermarks do not
decrease during ordinary application operation.
New order timestamps are server-owned and client timestamp updates are refused,
so an authenticated operator cannot forge future clock evidence. Trusted owner
maintenance/rolled-back SQL fixtures retain their explicit timestamp capability.

A computer time more than two minutes behind that reference is suspicious. The
small skew allowance avoids false alerts from scheduling/round trips. Suspicion
is audited and requests online renewal, but a still-valid period is allowed until
its saved validity deadline; then a safe boundary is required before restriction.
Offline import does not extend that clock deadline. A nonce-bound signed online
proof clears the debt for its verified period. Check/correct Windows time too.

An erroneously far-future historical clock can require owner reconciliation after
online verification; the app does not silently lower its replay/time watermark.
Frozen clocks, repeated process restarts and offline downtime cannot be measured
perfectly without an external trusted clock/hardware. This is not hardware security.

Backups include installation ID, current license, watermark and replay ceiling.
Restore those together for the same installation; do not clone one licensed database
to another restaurant. A pre-licensing backup generates a new installation ID on
upgrade and needs owner activation. An older full backup can roll back local replay
history: contact the issuer and obtain current signed proof before resuming service.

## Audit and threat model

Immutable audit records cover imports, online renewals, renewal failures, effective
state changes and clock suspicion. They record installation/sequence/plan/dates or
a narrow failure code, never private keys, signed blobs, PINs or customer details.
Existing role checks, RLS and append-only financial/audit history are preserved.

This boundary deters ordinary UI/API bypass, tampered/copied tokens and replay on
an intact database. A machine/database owner can modify code/triggers, replace
environment/key material, clone an installation UUID or restore older data. They
can ultimately bypass checks. It is contractual control/deterrence, not absolute
DRM or tamper-proof audit. Protect OS/database credentials, owner key/registry and
backups. A compromised owner signing key requires an explicit recovery/rotation plan.

No hosting, automatic billing, multi-restaurant cloud, hardware fingerprint,
obfuscation, fiscal invoices or real printer drivers are provided.

## Validation and manual acceptance

Use `npm run test:all` for complete clean SQL chain and disposable Auth/HTTP stack;
no business fixtures target development. The test harness supplies unrelated,
ephemeral signed pilot keys in test-only state. Private fixture keys never enter
the copied restaurant app. `INTEGRATION_VISUAL=true` also runs `test:visual` there.

SQL covers signatures, installation/replay/monthly bounds, warnings, shift/day
transitions, clock rollback, plan gates, RLS, continued payment/refund/reporting.
HTTP covers real import/nonce-bound renewal, outages, restriction, existing payment
and refund, print/report pages, plus checksummed backup and separate restoration
of a restricted installation. Owner CLI/reference-server tests cover keys, issuing,
extension, replay and authenticated suspension/query contracts.

Manual:

1. Configure only the owner's public key, obtain the shown installation ID, and
   import a matching pilot token. Check active plan/features in Portuguese/Spanish.
2. Start the reference server on the owner machine (loopback only for same-machine
   development). Configure the renewal URL and click Renew now. Verify signed
   sequence and last-online time; stop it and confirm failure preserves current use.
3. Use separately issued test tokens/settings in a disposable instance to inspect
   seven/three-day warnings and grace. Leave a session open: no mid-shift stop.
   At the next opening/day boundary, new sales fail while old settlement works.
4. Test a basic plan without delivery/WhatsApp. Public ordering hides delivery;
   forged delivery/WhatsApp creation still fails in PostgreSQL. Check human handoff.
5. Re-import older/modified/foreign-installation tokens; they must fail. Simulate
   clock rollback only in temporary data, renew online and inspect audit.

Do not change the production notebook clock or expire its live license for tests.
Real remote HTTPS hosting, key custody/ACLs, monthly connectivity, shared-device
acceptance, actual Windows power/restart and physical printing remain operational
acceptance tasks. No commit or push is part of this block.

## Validation evidence (2026-10-26)

The final clean-chain run applied 51 migrations through the official Supabase CLI, upgraded an older backup in a separate candidate, and passed all SQL suites and concurrency checks. The development database was not used for those fixtures. During validation, the server-owned order timestamp was aligned with transaction time to preserve the existing atomic WhatsApp staging invariant; the regression is covered by the existing WhatsApp SQL suite.

- Final `test:all` with `INTEGRATION_VISUAL=true`: 53 Vitest tests, 126 native/HTTP tests (zero skipped), 11/11 smoke checks, clean SQL/concurrency validation, and 64 route/language/width combinations plus license-state captures passed. Evidence: `artifacts/integration/932969be106c90b500936291/`.
- Visual captures: `artifacts/visual/2026-10-26T22-52-56.590Z/`; reviewed Spanish mobile restricted and Portuguese desktop expiring states. The existing floating language/theme controls still overlay some shared print-panel content at small widths; unrelated to the license panel and not changed in this block.
- `check:text` passed (486 files, zero issues); ESLint passed. The disposable production build passed.
- Development update verified the manifest/checksum of `backups/2026-10-26T22-55-11-441Z_b94db51e-eede-4a16-bb49-ebbc24bab39c.dump` before officially applying only migrations 202610260009 and 202610260010. No reset/restore, history repair, production signing key, Windows task installation, commit or push was performed.
- Early validation caught a timestamp regression in the legacy WhatsApp staging invariant and a SQL delimiter editing mistake; both were corrected before development migration. An initial sandboxed retry could not access Docker; the final successful run used the approved Docker context.

Final local acceptance: `local:update` production build and TypeScript passed; generated database types refreshed. `db:verify-history` is green (51 files / 51 registered, no missing/orphaned/renamed versions). `local:start` and `local:status` confirmed Docker, Supabase, app, WhatsApp worker, print worker and license worker running with no operational alerts at `http://192.168.100.8:3000`. No production trust key or license was installed; owner activation remains required for new sales.
