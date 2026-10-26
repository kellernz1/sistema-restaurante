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

Use `docs/local-setup.md` for installation and LAN restrictions. Install Node **22.18+ or 24 LTS** (operational scripts share type-stripped TypeScript), Docker Desktop and dependencies. First provisioning uses `npm ci`, `npm run local:setup`, `npm run local:update`, then `npm run local:start`. First provisioning is for a NEW installation; never run a reset on an existing restaurant to fix an operational issue. This block does not install or change Windows settings.

Configure manually: Docker Desktop starts at Windows logon; disable sleep while serving (including closing the lid); reserve the notebook IP in the router; allow private LAN ports 3000 and 54321 only. Keep PostgreSQL/Studio private and never forward them publicly. Regenerate environment/build and QR links when IP changes. Use a UPS for notebook power, router and printer where possible. Real printer drivers remain block 4B.

## Daily operation and supervision

`npm run local:start` performs **no build and no project migration**. It waits up to 180 seconds for Docker, starts Supabase, waits for database readiness, starts a detached supervisor and checks app/database HTTP health. A production build and `.env.local` must already exist. Repeating start while the supervisor runs is a no-op. Interrupted/legacy processes require an explicit stop before restart.

The supervisor starts app, WhatsApp and file-test print workers; restarts an exited child with 3–15 second backoff, at most five starts per service per supervisor run. Exhaustion appears in the operational alert and `local:status`. Restarting the supervisor resets the budget; investigate logs before doing so. HTTP failure is alerted rather than repeatedly killing an active process. A dead app cannot display its own alert: use `local:status` from the notebook. Print RPC heartbeat/uncertainty protection is unchanged; restarting a worker does not authorize replay of uncertain jobs.

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
