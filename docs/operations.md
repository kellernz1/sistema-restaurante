# Local operations — block 7

Automated HTTP/native integration acceptance provisions and destroys a separate
full stack. Run `npm run test:all`; see [integration-testing.md](integration-testing.md)
for isolation guards, prerequisites, evidence and provider/hardware boundaries.

## Installation record

- Restaurant / responsible administrator: ____________________
- Notebook / Windows version / reserved LAN IP: ____________________
- Docker Desktop / Supabase CLI / Node versions: ____________________
- Printer model: ____________________
- Printer connection (USB / network / shared spooler): ____________________
- Paper width / codepage verified on hardware: ____________________
- External backup directory / custodian: ____________________
- Last recovery rehearsal / operator: ____________________
- Unique provider credentials provisioned and old shared keys revoked: ____________________
- First named administrator / individual staff accounts (no demo users): ____________________
- Studio disabled / local administrative access verified: ____________________
- Firewall dry-run reviewed / applied by owner / second-device acceptance: ____________________
- Full provider restore and private-LAN acceptance completed: ____________________

Use `docs/local-setup.md` for installation and LAN restrictions. Install Node **22.18+ or 24 LTS** (operational scripts share type-stripped TypeScript), Docker Desktop and dependencies. **The existing setup commands are for development/test provisioning; real restaurants must satisfy the restaurant-installation gate below first.** First test provisioning uses `npm ci`, `npm run local:setup`, `npm run local:update`, then `npm run local:start`. First provisioning is for a NEW installation; never run a reset on an existing restaurant to fix an operational issue. This block does not install or change Windows settings.

Configure manually: Docker Desktop starts at Windows logon; disable sleep while serving (including closing the lid); reserve the notebook IP in the router; allow private LAN ports 3000 and 54321 only. Keep PostgreSQL/Studio private and never forward them publicly. Regenerate environment/build and QR links when IP changes. Use a UPS for notebook power, router and printer where possible. Real printer drivers remain block 4B.

## Daily operation and supervision

`npm run local:start` performs **no build and no project migration**. It waits up to 180 seconds for Docker, starts Supabase, waits for database readiness, starts a detached supervisor and checks app/database HTTP health. A production build and `.env.local` must already exist. Repeating start while the supervisor runs is a no-op. Interrupted/legacy processes require an explicit stop before restart.

The supervisor starts app, WhatsApp, licensing and file-test print workers; restarts an exited child with 3–15 second backoff, at most five starts per service per supervisor run. Exhaustion appears in the operational alert and `local:status`. Restarting the supervisor resets the budget; investigate logs before doing so. HTTP failure is alerted rather than repeatedly killing an active process. A dead app cannot display its own alert: use `local:status` from the notebook. Print RPC heartbeat/uncertainty protection is unchanged; restarting a worker does not authorize replay of uncertain jobs.

Output logs rotate at 5 MiB per stream with three archived generations. State, config, request locks and heartbeats are in ignored `.local-secrets/operations/`. Status checks use deadlines; large backup/restore commands have a ten-minute deadline. Disk measurement covers the application/backup volume, not every Docker VHD or external volume.

Commands:

```text
npm run local:status
npm run local:stop
npm run local:autostart:install -- --dry-run
npm run local:autostart:remove -- --dry-run
```

Dry-run prints the exact PowerShell task plan without executing it. The installation task is `MesaCertaLocal`, at current-user logon, limited privileges, explicit executable/working directory, idempotent replacement. Removal is also idempotent. After reviewing, the administrator may run either command without `--dry-run`. Do not install while another operator is testing. Actual scheduler behavior, Windows permissions, detached process survival, Docker logon timing and sleep/power policies require a reboot acceptance test. They were **not installed or changed** during this task.

## Backup policy

Administrators configure Settings → Backup and local services. Defaults: six hours, after each cash-session closure, 14 daily representatives plus eight weekly representatives, stale alert after 24 hours, minimum free space 2048 MiB. The supervisor polls committed closing events and catches up after downtime; it does not change the cash transaction. Closures within a minute may be covered together by a later snapshot. Automatic backup requires the supervisor and Docker; no backup can run while the notebook is off. Backup failures are alerted and retried no more often than once per minute. With the app down use CLI/logs; there is no email/SMS alert in this local block.

Manual: `npm run db:backup`. New backups are full-database PostgreSQL **custom archives**, including available application/Auth/Storage metadata, migration history, owners and ACLs. They restore with `supabase_admin` on a compatible local Supabase cluster, preserving original security-definer ownership (not remapping everything to the restoring user). Database roles/extensions are cluster prerequisites installed by matching Supabase, not recreated arbitrarily from a database dump. Current local Storage is disabled; product photos are database records. If Storage is enabled later, its physical object files must be backed up separately: metadata alone does not contain blobs.

Publication: unique UTC timestamp through seconds/milliseconds plus UUID; exclusive temporary file; successful pg_dump; full pg_restore decompression to `/dev/null`; SHA-256; no-overwrite hard-link publication on the same filesystem; manifest published last. A valid backup is the archive **and** matching manifest. Ordinary failures remove temporary files; power loss can leave ignored `.tmp`/orphan files, never a valid published partial archive. Do not use those as recovery sources. Check filesystem support (NTFS supports hard links). Archives are read into memory for validation/restore: large deployments need a streamed driver in a later operational revision.

Manifest fields: creation time, application version, app's migration ceiling, database's recorded last migration, byte size, SHA-256, result, reason and history-warning flag. Structural/checksum validation does not replace recovery rehearsal.

Retention groups by UTC day and Monday-based UTC week, keeping the newest valid representative for each configured daily/weekly slot and always the newest valid archive. Invalid and old legacy SQL files are never automatically deleted. Multiple six-hour archives on the same day may be pruned once a newer valid one is available. External retention is deliberately not destructive: capacity there must be monitored by its custodian.

External destination must be an existing absolute folder, preferably another device, network share or synchronized folder. Failure to reach it does not erase the valid local backup. Copy uses a temporary file, verifies SHA-256 and publishes the manifest; errors appear in admin/cashier alerts. Validation proves the local destination bytes, **not** that a cloud provider has uploaded them. A directory on the same disk is not disaster protection. First configure/test using a disposable external directory before real removable/network media.

Backups include personal names/phones, Auth records and potentially credentials/tokens in integration data. Restrict ACLs, use encrypted removable media or protected cloud storage, and limit staff access. Do not attach dumps to tickets/chat or commit them. The manifest hash detects corruption, not malicious replacement of both files; keep trusted protected copies.

## Safe restoration and disaster recovery

1. On a new notebook install the same project/dependencies and compatible Docker/Supabase versions. Provision the baseline local services in isolation from customers. Restore `.env.local`, `.local-secrets/` operational settings and necessary provider secrets from protected separate storage. For a new IP regenerate URLs and rebuild; do not publish old IP links.
2. Copy the selected archive **and `.json` manifest** into `backups/`. Run `npm run local:restore -- --file backups/<name>.dump`. It validates checksum/structure/version before asking for typed `RESTORE`, then makes a rescue backup of the current database.
3. A random protected `mesa_restore_<24 hex>` database is created from `template0`. Restore is a single transaction in that empty database. Newer recorded migration versions are refused. Pending project migrations are applied there in order and tracked. Health checks query migration version, order/payment/Auth counts, optional Storage metadata and critical RLS flags. Failure retains the candidate for diagnosis, with no live cutover.
4. **Review the candidate and rehearsals first.** To replace the operational database deliberately, stop app/supervisor/workers, keep the database container available, and rerun with `--replace-local`. It requires a second typed confirmation naming the candidate, makes another rescue backup, stops other local Supabase service containers, disconnects clients and renames databases. The prior database remains as `mesa_previous_<24 hex>` with connections disabled. This path is destructive cutover code and was **not executed on development**. It needs a separately provisioned full-stack acceptance rehearsal before restaurant production.
5. Before cutover, pending/processing print jobs in the candidate are quarantined as uncertain and old claims/leases cleared; the engine waits for manual review rather than replaying output that might already have occurred after the backup. Start services, check `/api/health`, login, open orders/payment balances, RLS, photos, LAN access and public links. SQL health is **not** GoTrue/PostgREST/Realtime HTTP acceptance. Review every uncertain printing job and stop old OS/printer output before any manual reprint. Never auto-reprint after recovery. Keep real WhatsApp outbound processing disabled until restored outbox state is checked against provider deliveries.
6. For failed cutover, keep app/workers stopped and have a database administrator reconnect/rename the retained previous database through a maintenance database. Never delete the previous database or rescue dump until acceptance completes.

Existing `.sql` backups remain readable through `--legacy` into an isolated candidate. They have no trustworthy manifest/migration provenance and were produced without ownership/ACLs. They are **not automatically promoted or migrated**: an administrator must establish the historical application version, repair ownership/grants against that version in the candidate, generate a new custom archive and rehearse it. Treat this as historical data recovery, not a proven full-system restore. SQL from an untrusted source executes code: never import an unknown dump.

### Development history reconciliation

Block 7 found recorded migration `202610240010` although later schema existed and deliberately did not repair it. In the separately authorized maintenance task on 2026-10-25, a clean reference migrated by the official CLI matched the application schema/security exactly. A verified backup preceded official metadata repair of 19 missing entries. Development now records 41/41; public schema/data and its original 22 history rows remained unchanged. Nine editable restaurant settings were preserved. Full file lists, comparison scope, evidence and limits are in [migration-history.md](migration-history.md). Pre-repair backups retain their original history/provenance; prefer the verified post-repair archive for ordinary recovery.

Always use the official tracked CLI through the maintained scripts for new installation, update, restored-candidate upgrade and clean validation. Never execute application migration files directly or manually insert history. Run `db:verify-history`; `local:status` includes the same check. Applied files are immutable. `local:update -- --dry-run` compares the installed schema with its officially migrated recorded prefix and reports pending work without applying development migrations or building. Full update validates a rescue backup before tracked application and verifies history afterward. A version-list match alone is not proof that arbitrary manual DDL is safe; use `db:audit-history` for full comparison.

## Updates

Finish service and stop the local app/workers first (`local:stop` also stops Supabase). Fetch/review approved code, install pinned dependencies, then `npm run local:update`. It waits for Docker, starts Supabase, makes a verified rescue backup, checks the known history discrepancy, applies pending migrations without reset and builds. A failed backup aborts before migrations. A failed migration/build leaves the app stopped; do not blindly restart an old build against a changed schema. Diagnose logs and use tested restore if needed. `local:start` is only the daily start. Secret/env changes affecting browser URLs require a new build.

## Power-loss acceptance

Never simulate destructive interruption on the active restaurant database. Automated lower-level tests cover interrupted backup writes, transactional payment/creation SQL and printing lost acknowledgement. `npm run test:restore` uses randomly named temporary databases, creates Unicode fixtures, backs up, destroys an isolated target, restores and compares rows, counts and payment totals. It copies the live database read-only into the temporary source; fixtures never enter development. Its Storage object fixture is synthetic because Storage is disabled locally. Evidence contains private data and remains ignored under `artifacts/restore-drill/`.

For a full acceptance rehearsal provision another local Supabase stack/volume and isolated ports/secrets. Record order/request/payment UUIDs and current printer job state; submit orders and split payments, then kill the app/worker at controlled response boundaries. Restart using daily start. Retry only the same idempotency keys; check one order/payment, open orders preserved, cash-session totals consistent and uncertain jobs not resent. Repeat by interrupting Docker only in that disposable stack. Finally test an actual controlled notebook reboot/power interruption with a UPS/approved test dataset. This task does not kill the active database or submit financial fixtures to it. A physical in-flight print result cannot be inferred from a file driver.

## Troubleshooting and validation boundary

- Docker unavailable: open Docker Desktop, inspect its status and rerun daily start within the configured readiness window.
- Missing build: run the update workflow; daily start intentionally never compiles.
- Backup stale/failure: inspect `logs/backup.error.log`, `local:status`, disk space and destination permissions. A local valid copy can coexist with failed external replication.
- Supervisor exhausted: inspect its/service logs, fix the cause and restart the supervisor intentionally. Check print uncertainty first.
- Migration discrepancy/newer backup: stop; obtain matching code or reconcile verified history in a candidate. Never bypass by reset.
- Restore failed: retain its candidate and rescue dump, inspect diagnostics, do not cut over.

Validation commands: `check:text`, `lint`, `build`, `test:operations`, `test:restore`, `db:validate-clean`, `test:whatsapp`, read-only/gated native tests and `test:visual` (pt-BR/es, desktop/mobile). Full legacy HTTP smoke creates records/changes settings, so it must not run against the protected development database during this block. Run it only against an isolated complete HTTP stack. SQL validation is not a second complete Auth/Realtime installation. Actual Windows task installation/logon, hardware power loss, real removable/network/cloud destinations, full HTTP cutover and physical printer output remain operational acceptance.

No database migration or generated-type change is needed for this block: operational settings/state are local protected files, and committed cash-session events are polled read-only. This does not introduce browser filesystem access or weaken RLS. Operations endpoints authorize active staff on the server; only administrators can change policy. Financial/order mutations and automatic printing rules are unchanged outside explicit recovery quarantine in an isolated candidate.

## Validation record — 2026-10-25

- `check:text`: 407 project text files, zero issues; lint and production build/TypeScript passed.
- Native suite: 81 passed, zero failed, 27 environment-gated skips (includes the nine operations unit tests). The operational HTTP role/status test was separately run with the local environment and passed; it records no financial data and does not change policy.
- Vitest: 37 passed. The existing mutating HTTP smoke was intentionally not run against protected development.
- Clean installation: all 41 ordered migrations, seed, all 17 SQL suites and independent-session concurrency cases passed. A backup from migration 40 was restored to a separate candidate and migration 41 applied successfully. Temporary databases were removed; development was not reset or migrated.
- Restore rehearsal: custom archive data, Unicode fixtures, counts, payment totals, Auth, synthetic Storage metadata, RLS policies, function owners and critical role permissions matched source/restored. Legacy SQL data also matched in its inspection-only candidate. Candidate print quarantine left no dispatchable pending/processing jobs. Evidence: `artifacts/restore-drill/2026-10-25T22-57-09-572Z/result.json`.
- Supervised start passed with unchanged `.next/BUILD_ID` timestamp (no compilation); app/database health and all three child PIDs were checked. Retry budget, scheduling, partial backup failure, retention, bad manifest/checksum/newer version, external temp-folder copy/failure, alerts and log rotation passed unit tests. No real cash closure was created for a scheduler test.
- Windows install/remove commands were run only with `--dry-run`; no task/system configuration was installed or changed.
- Visual: 44 light and 44 dark checks passed in pt-BR/es at desktop/mobile widths, including the new admin dashboard and operational settings. Screenshots reviewed under `artifacts/visual/2026-10-25T22-52-12.054Z/` and `artifacts/visual/2026-10-25T22-53-38.371Z/`.
- Still unvalidated: real Windows logon, Docker startup after reboot, actual power loss during business transactions, real external media/network/cloud replication, final HTTP service cutover, real printer output and automatic backup following a real cash closure. Migration-history reconciliation and legacy SQL promotion remain explicit maintenance work; no guessed version or live repair was applied.
- No commit or push was made. Prior uncommitted bulk-print UI work was preserved.

## Installation licensing

Configure only `LICENSE_PUBLIC_KEY` (32-byte Ed25519 public key encoded as 64 hex characters), then import an owner-issued token matching the installation UUID in Settings / License. Never copy the owner private key or registry onto a restaurant notebook. A fresh unlicensed installation refuses new orders; existing settlement, refunds, reports, backups and restoration remain available. See [licensing.md](licensing.md) for activation, weekly renewal, safe shift boundaries, offline import and recovery.

The supervised licensing worker reconnects after database/network failures and observes successful backup timestamps. Renewal failure preserves the last signed license and produces an audit event. Public notices contain no license token or installation identifier. Keep the owner service URL reachable by HTTPS; hosting, billing and production key custody are separate deployment tasks. A restored database retains its installation identity and anti-rollback state; do not create a new identity to bypass renewal.

## Network exposure and the single-port option

Current staff phones/tablets require direct API port **54321**. Evidence:

- `src/utils/supabase/client.ts` and `public-env.ts` select the configured Supabase
  origin. The alternate same-origin URL is enabled only for protected tunnel
  preview, not ordinary LAN use.
- `src/features/auth/login-form.tsx` calls browser `auth.signInWithPassword`,
  `auth.getUser` and profile reads; `auth-provider.tsx` maintains Auth and profile
  Realtime subscriptions.
- `cashier/cashier-board.tsx`, `cashier/cashier-query.ts`,
  `kitchen/kitchen-board.tsx` and settings/menu/table modules use PostgREST and
  WebSocket Realtime. Blocking 54321 now breaks those browser flows.
- Public customer pages use validated application endpoints on **3000**, including
  polling; they do not need direct Supabase access.
- `src/proxy.ts` performs session/route checks; it is **not** a universal backend
  transport proxy. `next.config.ts` currently defines no such rewrites.
- `scripts/local/admin-preview-gateway.mjs` already forwards selected HTTP and
  Realtime WebSocket paths for a protected temporary tunnel. It is useful design
  evidence, not a production LAN proxy or permission bypass.

Serving staff through only 3000 is feasible without replacing RLS: introduce a
same-origin, allowlisted reverse proxy for Auth, REST and Realtime, forward the
original anon key/user JWT, and keep the service-role key server-only. It must
support WebSocket Upgrade, query strings, refresh cookies, origin/host checks,
timeouts, reconnects and large/photo requests. A generic open proxy or a plain
HTTP Next rewrite alone is not demonstrated Realtime support.

Recommended follow-up: a dedicated local reverse proxy listens on 3000, with
Next on a loopback-only internal port and Supabase on loopback. Separate browser
and server backend URLs; preserve cookie storage names and regenerate the build
and QR links. Adapt daily supervisor/health/readiness/backup recovery accordingly.
Acceptance: login/refresh/logout, RLS, ordering, two-device Realtime, restart,
uploads and loss/recovery of backend connections; verify 54321 is unreachable
from a second device while everything remains functional on 3000.

Planning estimate: **3–5 engineering days** for the proxy/environment/supervisor
changes and acceptance, subject to Windows distribution/WebSocket behavior. A
full backend-for-frontend conversion replacing browser SDK usage and Realtime is
a larger alternative, roughly **1–3 weeks**. These are estimates, not implemented
features. This task does not block 54321 or change application routing.

## Prepared Windows administrative-port restriction

The prepared script owns only two named rules: `MesaCerta-LocalAdmin-IPv4` and
`MesaCerta-LocalAdmin-IPv6`. It blocks inbound TCP 54322/54323 from non-loopback
sources on all profiles; it excludes IPv4 127/8 and IPv6 ::1. It leaves 3000 and
54321, global firewall settings, unrelated rules and Docker settings untouched.
Idempotent installation updates existing owned rules; removal affects only these
names. Default invocation is dry-run; applying requires explicit `--apply` and
an elevated PowerShell. No rules were applied during implementation.

Review the exact PowerShell command first (no administrator rights needed):

```powershell
node scripts/local/firewall.mjs install --dry-run
```

Only the owner executes this afterward in **elevated PowerShell**:

```powershell
node scripts/local/firewall.mjs install --apply
```

Preview safe removal:

```powershell
node scripts/local/firewall.mjs remove --dry-run
```

Owner-executed removal, if needed:

```powershell
node scripts/local/firewall.mjs remove --apply
```

After applying, verify `localhost`/127.0.0.1/::1 access from the notebook, Auth/
Realtime on 54321 and the app on 3000. From a **different** LAN device verify
54322/54323 refusal, including IPv6, while 3000/54321 work. Repeat after reboot
and Docker restart. Testing the LAN IP from the same notebook cannot prove this.
Windows/Docker/WSL forwarding and organization firewall policy may affect effective
filtering: dry-run/unit tests are not proof of real packet rejection. If rejection
cannot be demonstrated, do not use real data; use loopback-only provider port
publication as defense in depth through a reviewed persistent provider setup.
Do not edit generated container config and assume the CLI will preserve it.

Other published development ports (mail/analytics) require their own hardening.
This narrow script intentionally covers only PostgreSQL and Studio. Studio can
still be reached through loopback after applying the rules; disable it altogether
for restaurant installations as described below.

## Restaurant installation gate: unique secrets, no demo identity

**Mandatory before any real customer data:** complete and prove persistent
`SUPABASE_SECRET_KEY` rotation/unique provider provisioning. This task deliberately
did not rotate it. A new `.env.local` string or `local:env` is not provider rotation.
See [post-test-security.md](post-test-security.md). Until that gate and network
acceptance pass, this notebook remains a test installation.

Proposed procedure for a **new, separate installation**, not a recipe to reset
this development database:

1. Provision a new isolated provider/data volume and installation identity. Use a
   supported persistent self-hosted provider configuration with per-installation
   database/admin credentials, service API key and Auth signing material. Generate
   using OS cryptographic randomness into protected ignored configuration, without
   terminal output. The corresponding public publishable key is not a secret.
   Keep signing/verification consumers synchronized and validate old-key refusal
   plus persistence across provider restarts. Never reuse CLI defaults/shared
   development credentials as restaurant security.
2. Generate a unique worker bearer (32 random bytes) and persist it consistently
   in protected runtime configuration and `.env.local`. Generate independent
   webhook/verification/provider credentials only when real WhatsApp is configured;
   do not reuse the worker bearer or licensing-owner private key. Keep owner license
   signing material outside the restaurant. Issue/import its installation license.
3. Apply the official tracked migration chain and review the base operational seed.
   Create exactly the first named administrator using the server-only Admin Auth
   API and a unique password via secure input; then create individual staff accounts
   through the application. Do not set `DEMO_PASSWORD`, create demo identities or
   execute `seed:demo`. Preserve UUID ownership/audit when maintaining an existing
   installation; do not delete historical demo-linked financial records.
4. Use `npm run local:provision` in a fresh checkout for a restaurant. It generates
   exclusive provider/database/worker credentials, creates exactly the entered
   administrator and leaves the menu empty. `local:setup --no-demo` is fixed but
   remains development-only; demonstrations require `--demo`. Follow
   [restaurant-provisioning.md](restaurant-provisioning.md).
5. Before first provider startup in that new profile, set `[studio] enabled = false`
   in its Supabase configuration and verify that no Studio container/54323 listener
   exists. Disable mail-test, analytics and other unneeded developer services.
   Enforce loopback-only administrative publication and owner-reviewed firewall rules.
   CLI start flags/config must persist across daily start, update and recovery.
6. Configure URLs, LAN reservation, TLS/proxy plan, backups/external copy, license,
   restaurant data/menu/prices, printer record and restore rehearsal. Check no demo
   Auth users exist, demo password is absent, credentials are unique, signup remains
   disabled and server authorization/RLS are intact. Prove network restrictions
   from a second device before admitting any real data.

The above is the proposed deployment gate, not a claim that current CLI defaults
or the development notebook were silently converted into production.

## New restaurant checklist (block 10)

- [ ] Notebook: supported patched Windows, encrypted disk, restricted owner account,
  Node 22.18+/24 LTS, Git, Docker Desktop and virtualization. Review Docker licensing;
  initial packages/images require internet.
- [ ] Reserve the LAN IP. Separate guest Wi-Fi from staff/admin services. If guests
  order by QR, deliberately review access to the public app without exposing the
  database/Studio. Staff still need API/Realtime 54321; a single-port proxy remains
  out of scope. Never forward these ports to the public internet.
- [ ] UPS for notebook/router/printer: size and test runtime/graceful shutdown.
  Configure no sleep/lid suspension manually for service hours.
- [ ] Printer model: ________; connection: ________; paper: 58 / 80 mm;
  driver: ________. Real TCP/spooler drivers remain block 4B. Validate paper,
  accents, QR, cutter and actual delivery with the hardware before service.
- [ ] Fresh checkout → `npm ci` → `npm run local:provision`. Enter the first admin
  password privately and actual restaurant/service/payment settings. Choose an
  existing external backup directory; do not copy demo users/env/provider volumes.
- [ ] Protect ignored environment/provider files with owner-only NTFS access and
  encrypted off-notebook recovery copies. Backups contain personal data; use a
  separate device, not merely another folder on the same notebook.
- [ ] `local:start`, admin login, issue/import license for the printed installation
  UUID. Keep the owner's signing private key off the notebook. Configure renewal.
- [ ] Review firewall/autostart `--dry-run`, then install manually. Configure Docker
  start-on-login manually. Check filtering from a second device and no Studio
  listener. This implementation task never installs Windows settings.
- [ ] `local:preflight` must approve; physical printer warnings need acceptance.
  Verify recent backup/external copy and rehearse restore on a separate owned
  candidate, never live data. Preserve application revision and environment/secret
  recovery material separately; those files are not in the database dump.
- [ ] Create named staff and real menu/prices. Test first counter order, kitchen,
  payment/Pix/split/change, receipt and turn report. Test tablet reconnection,
  restart and power-loss procedure before accepting real customers. Record results.

See [restaurant-provisioning.md](restaurant-provisioning.md) for exact commands,
validation limits and the disclosed development-backup boundary incident.

## Authorized test-credential maintenance (2026-10-27)

`scripts/local/rotate-test-credentials.mjs` defaults to `--dry-run`; `--execute`
requires a stopped application/worker set and an explicit local mock environment.
It verifies a database backup before changing credentials, updates only marked
existing demo users (no reseed), rotates the worker runtime/environment together,
and globally revokes their Auth refresh sessions. It validates old-password and
old-refresh refusal, new login and simulator behavior. It never prints credentials.
The new demo password is retained only in `.env.local` (atomic same-file staging
is immediately renamed); Auth stores its password hash. The ignored maintenance
journal stores only stage/counts/backup reference, never credentials or tokens.

If interrupted, keep services stopped and inspect only the journal stage. After
diagnosis use the same command with `--execute --resume`, reusing credentials
already saved in `.env.local` instead of generating replacements. Do not rerun
`--execute` for a completed rotation unless a new rotation was authorized.
Existing JWT access tokens can remain valid until expiry despite refresh-session
revocation; no Auth signing-key/provider-key rotation was authorized here.

Reference behavior: [Supabase sign-out](https://supabase.com/docs/guides/auth/signout),
[Docker Desktop networking](https://docs.docker.com/desktop/features/networking/),
[Windows Firewall rules](https://learn.microsoft.com/en-us/windows/security/operating-system-security/network-security/windows-firewall/configure).

### Maintenance validation record (2026-10-27)

- Before any credential change, custom backup plus manifest/checksum and archive verification passed: `backups/2026-10-27T03-23-45-469Z_3f9aaedb-11db-4ec0-a81e-02eb796ff56c.dump`. No development reset/restore/reseed was performed.
- Five existing marked demo accounts updated; previous passwords and captured previous refresh tokens rejected for all five; global revocation completed. A final read-only Auth session count for marked demo accounts was zero. Administrator and cashier authenticated application pages returned HTTP 200; those acceptance sessions were also revoked.
- Worker bearer replaced in both environment/runtime; old bearer rejected (403), new simulator conversation completed (200 with replies). No financial order was created by this acceptance. Provider key equality was verified in memory and unchanged.
- New plaintext demo password was not found in runtime metadata, logs or production build output; it is retained only in `.env.local`. No password/token value is in this report or the maintenance journal.
- Production build completed successfully during authorized restart; app and workers restarted. `check:text` (493 files) and lint passed. Five focused maintenance/firewall tests passed, including local-target rejection and repeatable dry runs. PowerShell AST validation passed without executing firewall commands.
- Standard `test:all` passed: 53 Vitest, 135 native/HTTP (zero skipped), 11/11 smoke, and clean 51-migration SQL/concurrency validation in an isolated provider. Evidence: `artifacts/integration/5b3db93ed478b7bb2a5fb1a1/`. The subsequently added local-target unit guard was separately exercised in the five focused tests. `db:verify-history`: 51/51 green.
- Example-only credential assignment review, paths/lines only: `.env.example:3`, `.env.example:14`, `.env.example:17`, `.env.example:19`, `.env.example:20`, `.env.example:30`, `owner-tools/licensing/README.md:185`. No live credential shape was found in either file.
- No firewall rule/Windows setting, provider key, Studio setting or application routing was changed. Effective filtering from another LAN device and the production no-demo provider/bootstrap remain unvalidated deployment gates. No commit/push performed.
