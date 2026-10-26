# Disposable integration acceptance

Run `npm run test:all`: text checks, Vitest, complete clean migration/SQL suites
and concurrency checks, then full HTTP/native acceptance in its own instance.
`npm run test:integration` and `test:smoke` run only the HTTP/native portion;
`test:external` is a compatibility alias for the same safe runner.

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
