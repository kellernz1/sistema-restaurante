# Script target safety

This boundary prevents accidental writes to a different Mesa Certa installation.
It changes maintenance/testing behavior, not restaurant product functionality.
Application RLS, atomic order/payment RPCs, license validation and immutable audit
remain unchanged. No application migration is introduced here.

## One resolved capability

`scripts/target-safety.mjs` issues frozen objects registered in a private WeakMap.
A JSON object, raw container name, arbitrary database name or spread copy is not a
capability. The public `.d.mts` contract brands contexts; `tests/target-types.ts`
contains compile-time negative cases. Targets contain the profile, real installation
identity once initialized, exact project/container/database, API/app URLs, DB port
and allowed filesystem roots. Credentials stay in private state and are never
logged. Resolution is cached, rather than guessing the target at every operation.

Profiles:

| Profile | Allowed behavior |
| --- | --- |
| Development | Explicit installation-bound maintenance only. No default authorization from local IP, APP_MODE, a known container or a single running container. |
| Disposable | Signed owner descriptor, independent ports/project, expiry, live controller, owned root and allocated database registry. Development is forbidden, even with flags. |
| Provisioned production | Normal runtime/backup on the verified installation; demo, cleanup, reset, migration, repair and replacement require enhanced authorization. |

Development commands require both `--allow-development` and `--installation-id`
matching `public.license_installation.installation_id` read in a read-only
transaction. Without explicit intent or a valid automation grant, resolution stops
before SQL, mutating HTTP or operational file creation. An incorrect ID cannot
authorize writing; checking a supplied ID necessarily performs a read-only lookup.
Existing environments must explicitly configure `LOCAL_DB_PASSWORD` and the exact
local URL/keys. No development database-password fallback is used. This task does
not populate or rotate those values in an existing `.env.local`.

Example only (do not substitute an arbitrary UUID):

```powershell
npm.cmd run db:backup -- --allow-development --installation-id ACTUAL_UUID
npm.cmd run local:update -- --allow-development --installation-id ACTUAL_UUID
```

Read the UUID from the existing installation's License screen or an explicitly
authorized read-only inspection. Do not bypass the barrier to bootstrap an unknown
existing database. Fresh restaurant provisioning has a separate new-project
bootstrap capability: it refuses existing environment/provider state, uses a new
project and binds the real database UUID after tracked migrations. Bootstrap
authorization is not a way to adopt/overwrite development.

## Disposable ownership

The runner creates `target-owner.json` under its own run directory and passes an
ephemeral HMAC key through child-process environment. The signed descriptor binds
paths, controller, expiry, ports, project, credentials and allocated database names.
Credentials/ownership files remain ignored artifacts; never attach them to tickets.
Database UUID binding is checked against the owned server. Existing signed context
identity cannot be changed to a different UUID.

Missing/partial contexts, altered signatures, expired ownership, wrong endpoints,
foreign containers, unallocated databases and unapproved paths fail closed.
Directory ancestry is checked with lstat/realpath, including dangling symlinks and
Windows junctions. Operations recheck the capability and current working directory;
changing cwd cannot redirect a resolved target. The normal controller cwd and its
owned copied-app cwd are validated separately when a child resolves its context.

SQL tests no longer default to `postgres`: the database is obtained from the owned
capability (which may explicitly name the disposable instance's main `postgres`),
or an already allocated child database. Names such as `mesa_clean_*` alone are not
ownership. All concurrency helpers go through that check. The integration marker
also has to match the new signed capability, closing the older marker-only path.

## Data access boundary

Scripts import helpers through `scripts/target-operations.mjs`. Implementations
live under `scripts/local/safety-internal/` and require the capability before I/O.
SQL/restoration/database create/drop/migration functions no longer accept a free
container/database pair. Backup rejects container/database overrides. Backup/copy/
retention directory arguments are branded `TargetDirectory` capabilities issued
by the boundary; free directory strings and directories from another context are
rejected by runtime checks and types. File paths must stay within approved roots. Reparse
points are refused. Private transports live in `target-process.mjs` and
`target-client.mjs`; the static import test rejects new scripts importing raw
process/SDK transports or private writer implementations.

Migration commands still use the official pinned Supabase CLI. Workdirs, remote
database URL hosts/ports/names and context must agree. Application migration SQL
is never applied directly. Production destructive SQL requires the migration
authorization too. Existing migration files remain immutable.

`npm run check:targets` checks the import boundary. It is also included in the native
suite via automatic discovery. This is a regression guard for cooperating project
scripts, not an OS sandbox: someone able to edit code can remove the checks.

## Backup, license and retention

`createBackup(context, options)` uses the context's container/database and backup
root. A disposable backup forces operational recording off, regardless of the
caller option: it does not patch operational state, call `license_tick`, run
retention or copy into another installation's external directory. Explicit test
copies must stay within the same owned run directory. Preflight's disposable proof
is derived from owned manifests/copy checksums, without creating fake live state.

Retention requires a valid capability and exactly that installation's backup
directory. It cannot be redirected to an arbitrary directory. External copies are
restricted to an approved configured destination and checked paths. Runtime backup
publication and the existing last-valid retention guarantee are preserved.

The backup implementation's filesystem-only unit tests use a separate capability
that can operate only in a generated OS temporary directory and cannot execute SQL.

## Persistent automation

Grant runtime/periodic backup deliberately once, with the actual installation ID:

```powershell
npm.cmd run local:authorize-automation -- --allow-development --installation-id ACTUAL_UUID --operations backup,runtime
```

For production omit `--allow-development`, but keep the actual `--installation-id`.
The ignored grant is HMAC-bound to root, project, installation UUID, URLs, DB port
and credential fingerprints, using a separate ignored `target-automation.key`.
Changed identity/configuration invalidates it; worker bearer rotation does not
silently invalidate an otherwise unchanged installation target.
Daily supervision refuses to start without the runtime grant. Scheduled backups
require the backup grant; the supervisor delegates that same verified installation
ID to the backup subprocess. No per-interval prompt is needed. The backup still
verifies identity before writing; it cannot discover a different default target.

If Docker/PostgreSQL is stopped, startup may use only a previously verified,
configuration-bound runtime grant as a restricted boot capability. It can start
that exact infrastructure, but cannot write SQL, run backups or issue mutable HTTP.
The database UUID and API UUID must agree again before the app/workers, logs and
operational state are started. No offline grant is inferred from a generic flag.
This boot-to-live transition is exercised against the disposable provider; actual
Windows logon and an existing installation's grant remain operator acceptance.

No grant was created for an existing installation during this implementation.
Existing development startup therefore intentionally requires an operator migration
step; do not weaken checks merely to preserve the old zero-argument startup.

## Enhanced production authorization

For a production-sensitive command, pass
`--allow-production-maintenance --installation-id ACTUAL_UUID` and type the exact
operation plus UUID when prompted, for example `RESET ACTUAL_UUID`. No noninteractive
flag substitutes for the typed confirmation. Migration/update is conservatively
treated as sensitive, even if its pending SQL is ultimately additive. Demo seeding
also needs cleanup authorization because it invokes cleanup. Database integrity
triggers may still refuse deleting referenced/immutable historical records; never
disable them to make a demo seed succeed.

Restore first builds a separately allocated candidate. Its existing `RESTORE`
confirmations remain required; production replacement also requires enhanced
authorization. No production replacement/reset was exercised on an existing system.

## Commands after this change

- `db:backup`, `local:update`, `local:setup`, repair, seeds and cleanup require the
  appropriate verified capability/authorization before operational writes.
- `local:start` and the supervisor use installation-bound automation. Workers pin
  the API/app URL and credentials to the resolved context.
- `test:sql` and direct concurrency calls require a disposable context; no implicit
  developer target is accepted.
- `test:all`, `test:smoke`, `test:integration`, `test:external` create their own stack.
- `test:visual` now launches a disposable seeded stack; direct `visual-smoke.mjs`
  refuses an existing installation. Visual quotes/login are not called read-only.
- `test:restore` now launches a disposable stack; its drill cannot silently copy a
  development dump to artifacts. Direct test/clean-validation entry points also
  reject a developer target even when development flags are supplied.
- `db:verify-history` is checked against the owned instance during validation. A
  stopped development instance is not started merely to report it green.

## Test boundary and limitations

Tests cover forged contexts, no authorization, test overrides, mixed paths/ports/
containers, unallocated DBs, cwd changes, marker expiry/tampering, junctions,
retention isolation and production policy. SQL/HTTP acceptance uses only newly
owned stacks. Clean-chain SQL validation is not physical printer, Windows logon,
power-loss or production restore acceptance.

This design protects against accidental target mixups, not a hostile machine
administrator or concurrent attacker rewriting files between OS calls. Secure
installation/backup ACLs and normal database authorization remain essential.

Disposable controllers must prove that their exact Docker project, containers and volumes do not already exist before activating transport. Staged contexts cannot connect. Environment, log, process-state and file-print writers also require the same context and owned directories.

## Validation record (2026-10-27)

Lint, the UTF-8/text check (525 files) and TypeScript no-emit checks passed. The disposable chain applies all 51 migrations with official history and passes SQL/concurrency suites; the isolated history check reports 51 files and 51 records. Native/HTTP suites report 153 passed, zero skipped, plus 11 smoke checks and 53 Vitest cases. Restore and 60 visual cases (Portuguese/Spanish, desktop/mobile) passed in owned integration run 1c7af332add35cb074138a2f. A subsequent full aggregate uses run fcd76967bbf4b80bb2acab38.

An initial provision acceptance exposed an invalid direct read of the protected license table. The identity probe now uses the existing read-only license_status RPC, preserving permissions; provision acceptance then passed, including restart and unchanged development backup/state evidence. No existing installation was migrated, granted automation, restored or reset. Existing development history was not queried or declared healthy: it remains stopped. No Windows task or firewall changes were applied.

Actual development/production authorization grants, typed production cutover and Windows automatic startup still require separate operational acceptance. Interrupted bootstrap with an unverifiable owner context is deliberately refused; recover it explicitly rather than deleting state or adopting a known container.

The final test:all aggregate passed, including disposable provision run d076f77f4914a0db7650a8db. Its evidence confirms that development backup/state remained unchanged.
