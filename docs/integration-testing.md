# Disposable integration acceptance

All script data access now requires the signed target capability described in
[target-safety.md](target-safety.md), in addition to the integration nonce/marker.
No named/unique development container fallback or implicit SQL test database is
accepted. Backups and recovery artifacts stay inside the owned run directory;
test backups cannot observe the license clock, update operational state or prune
another installation's files. `test:visual` and `test:restore` are disposable
runner commands too. Do not call them with development credentials.

Run `npm run test:all`: text checks, Vitest, complete clean migration/SQL suites
and concurrency checks, then full HTTP/native acceptance in its own instance.
The aggregate also runs lint first, including `no-undef` for every script `.mjs`.
`npm run test:integration` and `test:smoke` run startup and HTTP/native acceptance;
`test:external` is a compatibility alias for the same safe runner. These commands
also include the long-running startup acceptance below.

## Isolation and lifecycle

Requirements: Docker Desktop running, Node 22.18+/24, installed npm dependencies,
the pinned Supabase CLI and enough memory/disk for another local stack. The first
run may download images/CLI dependencies. Development services can stay running.

`scripts/integration/run.mjs` creates a random owned Supabase project below the CLI
identifier length limit, preflights a free port block and copies the application
into ignored `artifacts/integration/<id>/app`. Only dependencies are linked;
source, environment, build output and operational files are separate. Root
`.env.local`, `.next`, operations policy and development services are untouched.

The official CLI starts separate PostgreSQL, Auth, PostgREST and Realtime services
and applies/tracks all migrations. The runner verifies the exact owned container
and CLI endpoint ports before seeding test-only real Auth accounts and menu/
restaurant fixtures. Optional waiter mode is explicitly enabled for legacy waiter
cases; production defaults are unchanged. Mandatory cash-session checks remain on.
The copied app builds/runs on a private loopback port.

### Long-running process startup acceptance

Before HTTP fixtures, the runner starts the **actual copied daily supervisor**.
It passes the owned app port through Next's `PORT` environment setting and starts
no Windows task or persistent authorization. The supervisor launches the real
Next app, WhatsApp worker, file-print worker and license worker against this
disposable capability. Automatic backup, if due, remains inside the owned run.

`scripts/integration/process-smoke.mjs` requires the disposable target and matching
integration marker. It waits at most 90 seconds for app health, a successful
WhatsApp processing log, a successful license tick log, print heartbeat and
supervisor state. Then it observes all five distinct PIDs for at least 11 seconds,
failing on an exit, disappearance or replacement PID. Print/supervisor heartbeats
must advance, and each child must still be on its first start with no supervisor
failures. A retry that masks a crashed worker cannot make this test pass.

Evidence is `artifacts/integration/<id>/process-smoke.json` and ignored startup
logs. Only fixed success fields are printed, never credentials or license tokens.
The runner stops its owned process tree and confirms the supervised PIDs exited
before starting the ordinary controlled HTTP fixture server. This prevents a
background print processor from racing with lease/uncertainty tests. Normal and
failure teardown still belong to the runner; no development process is adopted.

The observation helper has a negative test that starts a tiny process, receives
its readiness output and verifies that its subsequent exit is rejected. The lint
regression test checks that a missing identifier is caught without executing it;
a separate static test checks all relative script import/re-export file paths.

The previous gap was explicit: Next/TypeScript build checks exclude `.mjs`
(`allowJs: false`), the Next lint preset did not enable `no-undef` for these files,
and the old aggregate started a direct Next server plus function-level printing
tests, not the actual supervisor/workers. Therefore a missing worker import could
coexist with a successful build and aggregate. This startup test does not certify
hardware printing, real WhatsApp delivery, online licensing-provider availability,
Windows logon, restart recovery or a long-duration soak test.

### Worker startup fix validation — 2026-10-27

The missing `resolveTarget` import in `scripts/print-worker.mjs` was corrected.
Static inspection covered 82 `.mjs` scripts and 275 relative import/re-export paths;
no other undefined identifier or missing relative module path was found. The
license worker now emits a fixed, secret-free activity log once its first tick
succeeds, allowing startup acceptance without logging tokens or configuration.

The first disposable run (`c6a1a50b4849e1d5c1b814a9`) correctly failed the new
readiness check at its original 60-second deadline. WhatsApp can race initial app
startup and then wait its existing 60-second backoff. The bounded readiness window
was adjusted to 90 seconds, without weakening liveness, successful-activity or
no-restart assertions. No worker retry policy was changed.

Final `test:all` passed: lint, text check, 53 Vitest cases, 156 native/HTTP cases
with zero skipped, 11/11 smoke flows, five additional provision guards and the
disposable provision rehearsal. The production build and complete clean chain of
51 officially tracked migrations/SQL/concurrency suites passed inside the owned
stack. TypeScript no-emit/incremental-disabled validation also passed. The existing
MODULE_TYPELESS_PACKAGE_JSON warning remains; it is not a lint/build failure.

Startup evidence: `artifacts/integration/140d8eaa7663b9b886a74469/process-smoke.json`
records five stable PIDs, 44 checks over 11,007 ms, app health, successful WhatsApp
and licensing logs, and advancing supervisor/print heartbeats. No child restarted.
History verification was green on that isolated stack. Provision evidence is in
`artifacts/provision-tests/9ef0025cf7601a4f14d87359/`, including an assertion that
development backup/state stayed unchanged. Owned containers/volumes were removed.
No existing installation was started or authorized; no development database,
backup, Windows task or firewall configuration was changed. No commit/push.

In the aggregate, clean SQL databases also use this owned stack as their provider.
The validated context pins its container, database port and disposable password;
it never falls back to the development database/credentials. `test:all` therefore
needs only Docker/dependencies, not a running development Supabase installation.

Every HTTP suite imports `tests/helpers/integration-guard.mjs`. It rejects missing
ownership, ordinary development URLs, mixed app/API ports and expired instances
before clients are created. Do not target an existing stack with individual HTTP
tests. Use the runner. The guarded SQL helper is for fixture preconditions only,
never a replacement for authorization on the action under test.

Native files run sequentially to avoid shared fixture/configuration races. Test
and command deadlines limit hangs. The native aggregate **fails if any case is
skipped**, including absent integration credentials.

Finally, on success, ordinary failure or a handled interruption, the runner stops
its children and the exact temporary project with official `stop --no-backup`,
checks that its containers/volumes are gone, unlinks dependencies and deletes the
verified copied app. The owner marker is expired before teardown. No development
reset, restoration, migration or financial fixture cleanup occurs.

A forced OS kill/power loss cannot guarantee JavaScript cleanup. Inspect the
recorded owner project and exact temporary workdir before manually stopping any
orphan. Never substitute the development workdir. Normal failed runs also exercise
the automatic cleanup path.

## Fixtures, evidence and provider boundaries

Immutable orders, payments, audit/print history and referenced users survive until
the instance is destroyed. Tests no longer delete those records to clean up;
configuration restoration/menu fixture hiding remains where later tests need it.
No production RLS, grants or append-only triggers are weakened.

The routing HTTP fixture returns a deterministic OSRM-compatible route and
waypoints. The real app still validates/caches the quote and charges its fee.
Signed WhatsApp webhook ingestion, simulator, canonical contacts and PostgreSQL
queues use the real temporary stack with mock transport. These are provider
contract tests, not real OSRM/Google/Meta availability or bank confirmation.

Ignored `result.json`, `native.tap` and stage logs retain evidence. Provisioning
logs can include disposable credentials; keep artifacts private. The copied
environment is removed with the app. No real customer data is copied.

Not covered: physical printers/drivers, silent printing, real bank/Pix refunds,
live Meta/road-provider acceptance, Windows logon/reboot behavior or physical
power-loss reconciliation. Optional Google short-link acceptance remains manual.
Browser visual/touch checks remain the separate `test:visual` workflow; no
interface changed in this task.
Successful financial refund/approval behavior is covered by transactional SQL;
the HTTP suite covers its authorization/error boundaries. A complete browser/PIN
payout workflow and live Realtime reconnection remain separate acceptance work.

## Validation on 2026-10-26

The aggregate passed 53 Vitest tests, 121 native/HTTP tests with zero skips,
11/11 smoke checks, 49 officially tracked migrations, seed, 21 SQL suites and
concurrency checks. The owned integration instance and its containers/volumes
were removed. Evidence: `artifacts/integration/20067905842fe7a518959f4b/`.

Corrections: fixture/user deletion conflicted with immutable block 5–8B history;
cleanup now belongs to instance disposal. Printing preconditions use guarded
temporary SQL instead of direct service-role writes that financial guards reject.
The routing fixture supplies required waypoint distances. ESLint now ignores
generated artifacts, avoiding a race while temporary build files disappear.
Daily-report reconciliation now subtracts returns on their own business date,
using authenticated administrator RLS rather than granting service-role access.
New guard tests reject ordinary targets, wrong nonces, mixed URLs and expired runs.
No application migration, RLS relaxation, commit or push was needed.
