# Code health audit — 2026-10-27

## Executive assessment

The first priorities are correctness and query shape, not a general rewrite. The
file-print worker currently exits at startup, and a staff-authorized kitchen
query becomes very slow after historical data accumulates. The payment creation
RPC and day reports were much faster in this experiment. Do not remove RLS,
financial/audit immutability, idempotency, or installation target checks to obtain
better numbers. No existing migration should be edited or consolidated.

Only this report was added to the project. Existing uncommitted work was left in
place. No application code, existing database, development backup, environment
file, Windows setting, firewall rule, or Docker Desktop configuration was changed.
Resource limits were applied only to freshly owned disposable containers; those
containers and volumes were subsequently removed by the existing runner.

## Method, evidence and limits

Read AGENTS.md, operations.md, target-safety.md and integration-testing.md first.
The measurement controller ran in memory, wrapping the existing integration
runner; no benchmark script or modified product source was saved. It retained the
existing create/activate/bind disposable target mechanism, randomly allocated
ports, official migrations, isolated environment and finally/cleanup path.
Database access used target-operations with the validated capability. Synthetic
history was inserted only in these instances with constraints, RLS definitions
and triggers intact. No immutable historical row was rewritten or deleted for
fixture cleanup. Each entire instance was destroyed instead.

Evidence retained in ignored directories (do not share target-owner.json, copied
environment files, or provisioning logs, which can contain temporary secrets):

| Run | Purpose | Outcome |
| --- | --- | --- |
| artifacts/integration/2965bcd5c6e19a9955fde933 | Clean chain, SQL/concurrency, functional suites, first collector | 51 migrations/SQL suites passed; 153 native/HTTP tests passed, zero skipped; 11/11 smoke checks passed. Collection then failed because optional public/ was absent; runner removed the instance. This was a collector error, not a product failure. |
| artifacts/integration/e69c6453930416766a458bbd/code-health-metrics.json | Container statistics, plans, bundles, Edge baseline/throttling, history | Completed and cleaned. First process collector failed; its three errors are retained rather than treated as zero usage. |
| artifacts/integration/8202885e2b728dc5e25e23ef/code-health-followup.json | History including refunds, creation/payment RPC, Windows processes | Completed and cleaned; corrected process collection succeeded. |

Both later runs also passed db:verify-history on their own instance. No statement
is made about the current development history: it was not queried.

Host: AMD Ryzen 7 5800X3D, 8 physical cores / 16 logical processors, 34,264,985,600
bytes physical memory reported by Windows. Docker reported 16 CPUs and
16,720,228,352 bytes available. Node 24.22.1; installed Edge 156.0.4314.42,
headless through the existing playwright-core dependency. Images/dependencies
were already cached; startup numbers exclude downloads and Docker Desktop boot.

### What the weak-machine experiment does and does not prove

The five Supabase containers received the following hard limits, with swap capped
to the same memory amount. Their budgets sum to **4,096 MiB and 2 CPUs**:

| Container role | Memory MiB | CPU quota |
| --- | ---: | ---: |
| PostgreSQL | 2,080 | 1.02 |
| PostgREST | 672 | 0.33 |
| Realtime | 672 | 0.33 |
| Auth | 336 | 0.16 |
| Kong | 336 | 0.16 |

Edge additionally used CDP Emulation.setCPUThrottlingRate with rate 4. The normal
rate was 1. These changes affected only disposable containers/browser sessions.

**This is not a complete 4-GB / two-core notebook certification.** The app and
workers are native Windows processes, not containers; neither they, the browser,
Windows, nor Docker's VM overhead are included in the container budget. CPU quota
also does not change the CPU count seen by every runtime. Limits were applied
after startup, so cold startup under those limits was not measured. No OOM or
navigation timeout occurred in the sampled capped run; saturation/failure capacity
was not established. Do not advertise 4-GB support from this result.

## 1. Resource measurements and production services

Three docker-stats samples were taken in each phase. CPU is Docker's percentage
of one CPU, not percentage of the whole 16-thread host. These are short snapshots,
not sustained peaks or a soak test.

| Service | Small-data RSS-like Docker usage MiB | After history MiB | Capped phase MiB | Observed CPU range across snapshots |
| --- | ---: | ---: | ---: | ---: |
| PostgreSQL | 127.1–127.3 | 531.3–531.6 | 530.5–531.2 | 0.07–3.86% |
| PostgREST | 17.12 | 89.13 | 89.12–89.13 | 0.06–0.07% |
| Realtime | 241.3–241.7 | 243.9–244.1 | 244.1–244.2 | 0.22–3.43% |
| Auth | 13.29–13.45 | 17.45 | 17.45–17.52 | 0–2.62% |
| Kong | 95.8–95.86 | 110.7 | 110.7–115.1 | 0.01–8.23% |

Container totals were approximately 495 MiB initially and 993 MiB after history.
PostgreSQL block-write counters grew from 121 MB to 703–737 MB; this includes
database/WAL activity and is not the retained database size.

Windows process samples, from the supplementary run:

| Process | Working set MiB, first → later | Private bytes MiB, first → later | CPU seconds, first → later |
| --- | ---: | ---: | ---: |
| Next production app | 128.75 → 108.75 | 176.97 → 112.05 | 1.140625 → 1.265625 |
| WhatsApp worker | 60.41 → 58.94 | 28.34 → 27.07 | 0.125 → 0.171875 |
| License worker | 65.48 → 61.81 | 35.91 → 30.35 | 0.296875 → 0.296875 |
| File-print worker | Exited with code 1 | Not a valid steady-state sample | ReferenceError at startup |

The first two samples span about 46.3 seconds. Approximate average CPU during that
window was 0.27% of one CPU for the app and 0.10% for WhatsApp; license CPU change
was below the counter resolution. This window primarily exercised SQL fixtures,
not a busy multi-terminal service. The audit controller and build processes are
measurement overhead, excluded here. A full daily supervisor was not started:
its periodic backup behavior was not part of this read-only audit. Its runtime
cost, real browser working set, print-worker steady-state cost, long-duration
peaks and startup under pressure remain unmeasured.

Startup, from the second run: Supabase CLI start took **34.196 s**. From audit
controller launch to healthy built app took **86.192 s**, including initial setup,
official migrations and compilation. That is not the daily local:start time.

Disk: isolated database grew from **16,063,847 bytes** to **112,516,455 bytes**.
The independent refund fixture measured **112,295,271 bytes**. The second run's
.next directory occupied **143,788,345 bytes**, including build/server artifacts.
Docker images, VM disk high-water marks, dependency cache, retained backups,
photos and external backup copies are not included. These fixtures had no photos.

### Services actually used

The measured minimal stack ran PostgreSQL, PostgREST, Auth, Realtime and Kong.
All five serve live application paths: database/RPCs, REST, staff sessions,
subscriptions and API routing. Realtime alone used roughly 244 MiB in this sample;
it cannot simply be disabled without changing current staff behavior.

supabase/config.toml additionally enables Studio and Inbucket for development.
Neither is needed for daily restaurant service. Storage and Edge Runtime are
explicitly disabled. Analytics is not explicitly disabled in that development
configuration; actual implicit CLI defaults were not inferred as running
services. The integration configuration explicitly disables Studio, mail,
Storage, Analytics and Edge Runtime. The provisioned provider already uses a
minimal owned profile: scripts/local/safety-internal/restaurant-provider.mjs and
infra/restaurant-provider/. Keep that distinction rather than trimming the
development profile and assuming it represents production.

Provisional sales policy: **8 GB RAM, a modern CPU with at least four logical
processors, and SSD** as a minimum candidate requiring real-device acceptance;
**16 GB RAM, four physical cores and SSD/NVMe** recommended. Avoid HDD-only and
4-GB machines for the initial supported offering. Reserve storage for Windows,
Docker images/VM growth, backups and photos, not just the 113-MB test database.
This recommendation is engineering headroom, not a measured hardware guarantee.
Before selling, rehearse service, backup, recovery and printing on the exact low-end
notebook; physical printer, UPS and Windows reboot acceptance remain mandatory.

## 2. Historical database and execution plans

Workload: 100 synthetic orders/day across 365 historical dates: **36,500 orders,
36,500 item rows (quantity two), 36,500 PYG cash payments, 36,572 audit events,
36,500 sent print jobs**. The follow-up adds **365 partial refunds**, one per
historical date, preserving the original ledger. Generation took 44.625 s and
42.726 s respectively. ANALYZE ran only on those disposable tables.

Limits of realism: one popular product, pickup orders, no BRL/discount/photo mix,
one synthetic audit/print document per order, and one operator's open cash session
spanning the fixture. The latter deliberately stresses a much larger session
than a normal turn. Closed orders retain ready item status. These fixtures are
not a simulation of 365 correctly opened/closed turns or many concurrent devices.
No historical payment was updated to backdate it: timestamps were supplied on
synthetic INSERT. Refund fixtures are ledger fixtures, not evidence of executing
real bank refunds. Data is synthetic and never copied from development.

### Timings

EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) was used with transaction-local staff JWT
claims and SET LOCAL ROLE authenticated. The comparison role supabase_admin is
a diagnostic control, not a proposed application replacement for RLS. Measured
staff identity was an administrator, not every staff role. The kitchen query is
a SQL equivalent of kitchen-query.ts, not an EXPLAIN of PostgREST's exact generated
SQL. The browser measurements below exercise the real page separately.

| Query | Small data, staff ms | Historical data, staff ms | Capped containers, staff ms |
| --- | ---: | ---: | ---: |
| Kitchen equivalent, zero active rows returned | 0.904 | **18,468.393** | **18,450.194** |
| Ready-counter queue, empty result | 0.009 | 0.010 | 0.009 |
| Audit day, LIMIT 101 | 0.046 | 1.805 (100 rows) | 1.890 |
| Print status counts, grouped diagnostic query | 0.082 | 299.187 | 333.620 |
| Audit session count | 0.089 | 4.186 | 4.151 |

The ready-counter measurement is an empty-queue/index check, not evidence that a
large live ready queue is fast. Historical fixtures were non-counter pickup.

Supplementary run including refunds, medians of three calls:

| Actual RPC path | Uncapped ms | Capped ms |
| --- | ---: | ---: |
| create_counter_order with one item and full cash payment | 30.122 | 27.134 |
| cash_day_report on a historical day | 52.606 | 51.738 |
| cash_session_report, deliberately year-sized session | 112.455 | 111.186 |
| refund_quote plus fixture lookup | 12.730 | 12.953 |

Creation used the actual authoritative transactional RPC inside a transaction
rolled back after EXPLAIN. Its timing excludes final commit/fsync, HTTP, operator
input and actual printer delivery. Refund timing includes a synthetic notes-based
lookup, not just quote cost. No causal speedup from CPU limits is claimed: cache
warming/noise and three samples can explain the small differences. These are
observed ranges/medians, not p95 or throughput measurements.

### Slow plan evidence

Kitchen, authenticated, historical data (abridged from the saved JSON):

```text
Sort: 0 output rows, execution 18468.393 ms, shared hits 4,799,563
  Nested Loop
    Nested Loop: 36,500 rows
      Seq Scan products: 30 rows, RLS current_user_role/auth.uid filter
      Seq Scan order_items: 36,500 rows, 30 loops
        status IN (pending, preparing, ready), per-row RLS filters
    Index Scan orders_pkey: 36,500 loops
      status IN (open, ready), each historical closed order rejected
```

Privileged control on the same history: **16.171 ms**, starting with
orders_status_idx, then order_items_order_id_idx; historical staff query overhead
was about 1,142 times that control. A later warm control was 0.522 ms while staff
remained 18.45 s. This is a plan/security-filter interaction, not proof that all
18 seconds are attributable exclusively to the role helper. Logical shared-buffer
hits are repeated accesses, not 4.8 million distinct blocks in RAM.

printCounts under staff RLS:

```text
Aggregate -> Sort -> Seq Scan print_jobs
  36,500 rows, archived_at IS NULL
  current_user_role checks / cashier cash-session subplan
  execution 299.187 ms; 74,074 shared hits
```

Privileged grouped control: 8.797 ms. The actual endpoint issues five separate
exact counts, not this single grouped query; its end-to-end latency was not
isolated. Audit-session plan scans 36,572 events to return zero matching fixture
events (4.186 ms), demonstrating the missing session access path at this size.

### Index and RLS proposals, not implemented

- Preserve RLS and active/disabled-role semantics. Examine scalar per-statement
  InitPlans for auth.uid/current_user_role in policies and a query shape that
  starts with active orders. current_user_role also consults service_policy for
  waiter access (202610250013_service_modes.sql:47); never cache it across users
  or transactions. Re-run role, permission and regression suites after any change.
- Existing orders_status_idx, order_items_order_id_idx and counter_ready_queue
  already exist. Do not propose duplicate indexes as the first kitchen fix.
  The slow authenticated plan fails to exploit the useful order-first path.
- Consider a measured index on audit_events(cash_session_id, created_at), and
  print-job status/time access paths scoped to unarchived rows. They are candidates,
  not guaranteed improvements: most test print jobs are unarchived/sent and a
  low-selectivity status count can still favor a sequential scan.
- Audit action/day/actor filters and deep OFFSET pagination should be tested with
  the actual audit_timeline RPC before adding composite indexes. The current
  audit_events_day/actor/approver indexes already work for simple day queries.
- Any database correction belongs in a new officially tracked migration. Do not
  squash or rewrite the 51 existing migrations.

## 3. Frontend and continuous load

Production build emitted **46 top-level JS chunk files**, 1,940,803 bytes raw,
596,211 bytes gzip calculated locally. This is not total route download: routes
share chunks; server artifacts and CSS are separate. Resource Timing below gives
actual script bodies loaded by each route, including framework/shared scripts.

Two fresh browser contexts per route/rate/phase, desktop 1366x768: 48 navigations.
Metrics below are medians of two samples, rounded; too few samples for p95. Normal
baseline used small data; capped phase followed history generation, so those two
columns change both data volume and limits. The separate uncapped historical SQL
plans above isolate the historical query problem more clearly.

| Route | JS decoded bytes | JS encoded bytes | Baseline load ms | Baseline CPU 4x ms | History+capped load ms | History+capped CPU 4x ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| /cashier | 1,038,234 | 298,490 | 190 | 323 | 126 | 302 |
| /cashier/counter | 1,032,889 | 296,743 | 127 | 307 | 119 | 318 |
| /kitchen | 889,694 | 257,485 | 101 | 293 | **4,356** | **4,338** |
| /admin/reports | 885,772 | 255,551 | 107 | 300 | 110 | 305 |
| /admin/audit | 881,502 | 254,505 | 107 | 299 | 105 | 303 |
| /order | 921,746 | 266,666 | 96 | 292 | 81 | 279 |

All 48 navigations returned HTTP 200 at the intended path; no navigation exceeded
the 45-second deadline. load is the navigation load event, not a guarantee that
all asynchronous data/actions are usable. Observation continued for 1.8 seconds;
it can miss later polling/slow fetch completion. This was not an input-to-payment
or full checkout timing test. No page-render console-error census, mobile/touch,
Spanish, dark-mode, or full visual regression run was performed in this audit.
No interface changed; this was performance instrumentation, not test:visual.

Long tasks with 4x CPU reached **261 ms** on the counter screen, 146 ms cashier,
141 ms kitchen, 137 ms reports, 138 ms audit/public checkout. These can delay an
input handler. A task trace was not attributed to individual components; do not
label a specific component or blur effect as the measured cause. DOM mutation
counts were collected, but are not React render counts. A production React
Profiler/commit trace is still needed to quantify unnecessary renders.

### Realtime, polling and repeated requests

- cashier-board.tsx: initial refresh plus another on SUBSCRIBED; every orders or
  tables event refreshes the full table query. Revision guards prevent stale UI
  commits but do not cancel/coalesce network requests.
- kitchen-board.tsx: two table subscriptions, whole-query invalidation for each
  event. setNow every second recomputes groupKitchenOrders and sorts unchanged
  items. No per-event debounce or bounded in-flight refresh is present.
- counter-queue.tsx: all open/ready counter orders with select('*'), global orders
  subscription, polling every 15 s, full component clock update every second;
  no revision guard for overlapping refresh results. Query is unbounded client-side.
- print-queue.tsx: polls every 5 s even when history is collapsed or the tab hidden
  (only browser output/heartbeat is visibility gated). GET printing executes up to
  11 PostgREST/RPC calls: jobs, devices, destinations, issues, problems, health and
  five counts. This is **up to 132 backend calls/minute/tab**, before request auth.
- cash-session bar polls every 15 s; its endpoint makes three database queries,
  another 12 calls/minute/tab. License polls every 15 s, operations every 30 s,
  staff profile every 30 s while visible, kitchen cancellation notices every 5 s.
  Together these show a nontrivial idle floor before order-change bursts.
- bill-detail.tsx performs order lookup then item lookup sequentially on refresh;
  its item subscription is not filtered by order. The history endpoint's event
  actor names are fetched in a batch, so that path is not a per-event N+1.
- Initial browser observations saw 18 API/REST requests on cashier, 11 counter,
  13 kitchen, 12 reports and 11 audit, versus one public-menu request on /order.
  These are browser calls, not the additional server-to-database calls inside APIs.

There was no multi-device websocket burst/soak test and no measured Realtime
messages/second capacity. The counts above combine observed initial traffic with
source-derived subscription/polling structure. Do not turn them into a claimed
maximum number of terminals. A five-terminal order burst is a priority follow-up.

### Visual and rendering candidates

screen-theme.css uses a blurred header; cashier-navigation.css adds another sticky
20-pixel blur; settings.css has a blurred sticky save bar; sheet/dialog overlays
use blur and large shadows. These are candidates on weak GPUs, not proven
bottlenecks here. CDP CPU slowdown does not model weak GPU/compositor behavior.
Reduced-motion handling already exists and should be preserved.

globals.css imports multiple global override sheets and print styles. Separating
screen/feature styles could simplify the cascade, but first verify computed styles
and screenshots across themes/locales; removing shadows globally is not the
first optimization supported by the measurements.

Shared payment editors and table/offsite menus duplicate some presentation/state
handling, while monetary and phone rules already have shared authoritative
helpers. Consolidate small presentational parts only after documenting the
different submission/idempotency semantics; do not merge the creation and later
settlement transactions just to reduce lines.

## 4. Code, dependencies and tooling

Static census over src, scripts, tests and migrations: **436 code/style/SQL files,
27,709 lines, 1,892,027 bytes**. Generated database.types.ts has 1,976 lines;
large historical migrations and generated types are not refactor targets merely
because of their size.

| Hand-maintained file | Lines | Bytes | Review concern |
| --- | ---: | ---: | --- |
| src/app/globals.css | 1,161 | 32,478 | Global cascade/feature and print imports |
| scripts/visual-smoke.mjs | 299 | 30,426 | Many independent scenarios in one script |
| scripts/target-safety.mjs | 247 | 24,170 | Security-critical parsing, authorization, paths and transport in one dense module |
| src/features/customer-ordering/offsite-menu.tsx | 145 | 16,911 | Many form/state and submission concerns |
| src/features/orders/orders-hub.tsx | 179 | 16,759 | Refresh, actions, audio, details and rendering |
| src/features/settings/settings-form.tsx | 142 | 16,402 | Dense mixed configuration JSX |
| scripts/local/provision.mjs | 115 | 15,697 | Dense security-sensitive orchestration |
| src/features/counter/counter-desk.tsx | 134 | 13,848 | Draft, discount, payment and recovery lifecycles |

Largest AST function bodies include TableGrid (234 lines), KitchenBoard (227),
TableOrder (157), OrdersHub (122), ProductManager (119), CounterDesk (114).
There are 102 source/script lines longer than 500 characters; offsite-menu reaches
1,613 characters on one line. Line counts alone understate some modules' density.

Checks executed without autofix or incremental build output in the root:

- npm run lint: exit 0, no reported warnings/errors.
- tsc --noEmit --incremental false: exit 0.
- An additional ESLint no-undef rule over scripts/**/*.mjs found exactly two
  references to the same missing import in scripts/print-worker.mjs:17.
- npm audit --json: exit 0, **zero known vulnerabilities**, 529 dependency entries
  reported (not necessarily 529 runtime packages). This is a registry snapshot,
  not proof of absence of security defects.
- npm outdated --json: expected exit 1 for updates available:
  next and eslint-config-next 16.4.2 → 16.4.3; lucide-react 1.61.0 → 1.62.0;
  eslint 9.39.5 → 10.13.0; typescript 6.0.3 → 7.0.2. No update was installed.
- MODULE_TYPELESS_PACKAGE_JSON appeared in operational runs. It is a startup
  parsing/module-mode warning, not a build failure. Do not change package module
  mode casually; scripts/config compatibility needs testing first.

Import inventory finds explicit use of the principal runtime dependencies:
React/Next, Supabase SSR/SDK, Zod, Lucide, libphonenumber, sharp and qrcode;
Tailwind/TypeScript/ESLint/Playwright/Vitest also have tooling/config use. No direct
dependency is proven unused. No dead-code removal is proposed from grep alone.
Legacy SQL print tables/functions remain for historical compatibility; the old
enqueue trigger was explicitly dropped in 202610250002_print_engine.sql. Their
presence is not evidence that two automatic queues are actively accumulating.

Backup validation/restore currently reads a whole archive into a Buffer
(safety-internal/backup.mjs:44,117; restore.mjs:58,61). This is a real linear-memory
growth mechanism, but large-photo/large-archive RSS was not measured. Future
streaming should retain checksums, publication guarantees, owners/ACLs, deadlines
and the no-uncertain-retry rule. It is not justification to reduce backup checks.

## 5. Coverage and documentation gaps

The first run's native/HTTP and SQL suites passed despite the print worker startup
defect. Existing printing tests exercise driver/process functions; the aggregate
does not start the actual file-worker entry point as daily supervision does.
Add an owned-runtime entry-point/heartbeat smoke test, plus no-undef for scripts.

Existing tests cover substantial financial/permission/idempotency behavior, but
no line/branch coverage percentage was collected. Counting tests is not coverage.
Missing performance/acceptance coverage includes historical RLS query plans,
busy ready queues, realistic 365 closed turns, mixed Pix/discount/refund history,
concurrent websocket invalidation, long-running tab memory, full React commit
profiling, GPU paints, cold constrained startup and native-process resource caps.
Physical printer, real Meta/maps/bank behavior and power loss remain external
acceptance. The supplementary refund quote test does not certify real payout.

Documentation contradictions/operational friction found:

1. operations.md, Power-loss acceptance, still says test:restore copies the live
   database. scripts/restore-test.mjs now launches a disposable integration stack.
   That sentence contradicts the current safety boundary and must be corrected.
2. The introductory first-test setup sequence and some daily examples omit the
   new authorization/bootstrap prerequisites. local:setup resolves its target
   before it can initialize a fresh ordinary development instance; development
   also requires LOCAL_DB_PASSWORD and a real identity. A safe first-install/
   first-authorization path is not interchangeable with daily local:start.
3. local:start resolves identity before its advertised Docker wait. Without a
   prior valid automation record, a stopped existing installation cannot reach
   that wait. This fails closed, but requires an explicit documented operator
   bootstrap path; it is not a reason to restore container guessing.
4. local:status uses verifyHistory queries, so runtime/backup automation alone
   does not imply authorization for every status/history SQL path. Examples need
   explicit maintenance flags or a deliberately designed read-only capability.
5. Dated 41-/49-migration validation records are historical evidence, not current
   status. Keep their dates; add a current summary instead of silently rewriting
   past acceptance claims. Current isolated chain measured here is 51.

## 6. Prioritized findings and proposed small steps

Effort estimates refer to focused engineering plus tests, not a delivery promise.
Regression risk is the risk of the proposed correction, not permission to skip it.
Measured findings and source-based hypotheses are distinguished below.

| ID | Area / evidence | Severity and impact | Effort | Regression risk | Proposed correction, not implemented |
| --- | --- | --- | --- | --- | --- |
| H01 | Actual print worker exits; missing resolveTarget import at line 17 | High: independent automatic file processing unavailable; supervisor can exhaust restart budget | Small, <1 day | Low | Correct import; enable no-undef for JS scripts; test actual worker entry point and heartbeat in disposable runtime |
| H02 | Historical kitchen staff plan 18.47 s / 4.8M shared hits | High: kitchen delayed even with an empty active queue | Medium, 1–3 days | High: authorization-sensitive | Profile exact PostgREST plans per role; preserve RLS; test statement-local auth/role InitPlans and active-order-first query shape in a new migration |
| H03 | Printing 5-s polling, up to 11 calls each; status count 299–334 ms | High scaling impact: repeated history scans and background requests per terminal | Medium, 1–2 days | Medium | One authorized summary query, coalesced/shared polling, separate history snapshots from compact health, measured indexes; preserve alerts and uncertainty safeguards |
| H04 | Kitchen/counter active queries unbounded; Supabase API max_rows=1000 | High potential correctness impact: large backlog can be truncated or expensive | Medium, 1–2 days | Medium/high | Explicit bounded paging/backlog warning or active-order grouping; prove no active item disappears; do not merely lower limits |
| H05 | Broad Realtime invalidation and duplicate initial refresh | Medium/high under bursts: redundant joined reads; counter queue can accept stale overlapping responses | Medium, 1–2 days | Medium | Single in-flight/coalesced refresh with revision/abort handling; test order bursts, reconnects and stale responses |
| H06 | Whole kitchen/counter components update every second | Medium: avoidable sorting/re-render work on continuous screens | Small, 0.5–1 day | Low/medium | Memoize grouping; isolate elapsed-time labels; adjust clock resolution to displayed units while preserving threshold behavior |
| H07 | ~0.88–1.04 MB decoded scripts per route; 261-ms long task at CPU 4x | Medium: input responsiveness on weak devices | Medium, 1–2 days after trace | Medium | Attribute chunks/tasks first; lazy-load rarely opened action dialogs; retain authoritative validation and error recovery |
| H08 | Audit-session Seq Scan 36,572 rows; print history access lacks a tailored general path | Low now / medium with growth | Small/medium | Low/medium | Benchmark new session/status indexes and actual API queries before a new migration; no duplicate existing indexes |
| H09 | Whole-archive Buffer reads in backup/restore | Medium future risk: memory spikes as photos/history grow | Medium, 1–2 days | High operational risk | Stream verified archive validation/restore; test interruption, corruption, bounded memory and target ownership |
| H10 | Dense target/provision/UI modules; 102 very long lines | Medium maintenance impact, no measured throughput defect from size alone | Medium, staged | High for security core | Format/extract pure parsers and small presenters with behavior tests; keep opaque capabilities and transactional boundaries intact |
| H11 | Active docs conflict with disposable restore / bootstrap prerequisites | Medium: unsafe or blocked operator instructions | Small, <1 day | Low | Align current command recipes with actual target resolution; retain dated history and explicit recovery boundaries |
| H12 | No full native/OS weak-machine cap or multi-terminal soak | High release-confidence gap | Medium, 1–3 days + hardware | Low code risk | Dedicated low-end acceptance setup, real startup and memory pressure, complete process tree and sustained terminal load |
| H13 | Patch and major dependency updates available; npm audit clean | Low immediate measured risk | Small for patches; separate majors | Medium/high for majors | Review Next/config patch together; defer ESLint/TypeScript major upgrades to dedicated compatibility work |
| H14 | Stacked blur/shadows and globally imported feature styles | Low/unproven performance impact | Small/medium after GPU trace | Medium visual risk | Measure paints/compositing/scroll first; offer reduced effects only if beneficial; visual tests in both locales/themes |
| H15 | Studio/mail enabled in development; not required in production | Medium deployment exposure/resource risk, not measured as running here | Small | Low | Keep minimal provisioned profile, prove preflight and effective LAN restrictions; do not disable Auth/Realtime/PostgREST |

### Suggested execution order

**Infrastructure/database:** (1) H01 runtime correctness and entry-point tests;
(2) H11 operator recipes/bootstrap acceptance; (3) H02 with role-preserving SQL
performance regressions; (4) H03/H08 grouped summaries and justified indexes;
(5) H04 backlog correctness; (6) H09 bounded-memory backup rehearsal; (7) H12 real
low-end, startup, restart and multi-terminal acceptance. Keep firewall/secret and
physical-printer deployment gates explicit. No migration consolidation.

**Interface:** after query correctness, (1) H05 request coalescing/reconnect tests;
(2) H06 small clock/grouping changes; (3) H07 route/chunk/task attribution and
dialog splitting; (4) H14 GPU/visual work only if measurements justify it.
Presentation consolidation under H10 can follow these small steps. Patch updates
H13 should be isolated from performance changes to make regressions attributable.

After every step, compare the same fixture/roles and preserve functional SQL,
idempotency, audit and permission tests. Proposed acceptance targets to negotiate:
no worker startup failure; no silent active-backlog truncation; historical kitchen
staff reads comfortably below one second with 36,500 historical orders and a
representative active queue; compact printing health must not rescan all history
per terminal every five seconds. Establish robust sample counts before enforcing
p95 thresholds in CI. Re-run CPU 4x navigation and actual input/action timing,
not only HTTP 200 or the load event.

No optimization or functional correction described above was implemented.
