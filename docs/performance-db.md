# Historical database query performance

## Scope and reproducibility

This block does not migrate, start, authorize or read the development installation
or its backups. All database work uses installation-bound disposable capabilities
from `scripts/target-safety.mjs`. Application migrations are applied and tracked
by the official Supabase CLI, including baseline and upgraded comparison databases.

Run `npm run test:performance-db` for the large fixtures and the disposable HTTP
acceptance suite. Set `INTEGRATION_PERFORMANCE_DB=true` when running `npm run
test:all` to include the same measurements in the full aggregate. Set
`INTEGRATION_VISUAL=true` to include the existing browser checks. These commands
own and remove their temporary Supabase instance; no development authorization is
needed or accepted. Plans and timings are saved in ignored
`artifacts/integration/<run>/performance-db.json`.

The historical baseline is migration `202610260010`; the final chain includes
`202610270001` and `202610270002`. Each volume has its own database. Fixtures
contain 36,500 or 100,000 closed orders, their items, cash payments, audit events
and sent print jobs over 365 days, plus 100 active counter orders and five active
table orders. Some active orders are two days old: no today-only filter may hide
unfinished work. Prices and totals follow the actual PostgreSQL triggers.

Measurements use authenticated administrator JWT claims and database RLS, not
the service role. Each query runs in a separate transaction with
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`: three baseline samples and 30 upgraded
samples. Baseline ranges are observations, not a statistically robust p95. The
upgraded p95 is nearest rank (sample 29 of 30). These are PostgreSQL execution
times, excluding HTTP, browser rendering and Docker command startup; planning
times and complete buffer/plan trees remain in the artifact. They are not
physical low-end notebook acceptance results.

The session report deliberately uses the operator's populated open session, not
the other operator's empty session. It contains the whole historical fixture,
an unusually large single-session stress test. The daily report and audit use a
historical business date, not an empty current day. Reports retain their existing
business-day, refund, discount and authorization semantics.

## Changes and access boundary

`202610270001` keeps the active-profile/waiter-mode identity semantics, owner,
security-definer flag and function permissions. Scalar identity subqueries in
RLS allow PostgreSQL to initialize stable identity once per statement instead
of querying the profile for every candidate row. Policy names, commands, roles
and permissiveness remain unchanged. Partial indexes cover active kitchen and
counter orders; a session/time audit index supports adjustment summaries.

Identity caching alone lowered the initial 36,500-order kitchen observation from
about 15 seconds to p95 226 ms, still missing the target. Its plan still joined
30 products against historical items before filtering active orders, producing
over one million rejected join pairs. `202610270002` adds a bounded, keyset-paged
`kitchen_queue_page` SQL function: materialize visible active orders, look up their
items through the existing order-item index, then decorate the bounded page with
product names. It is **security invoker**, executable only by authenticated users;
base-table RLS and column grants remain authoritative. No privileged bypass or
new public endpoint is introduced.

The kitchen client loads successive 250-row keyset pages. The counter queue uses
explicit columns and ordered 250-row ranges. Both retrieve all active rows even
above the API's default 1,000-row ceiling; neither limits work to today's orders.
A failed later page discards the partial result rather than presenting it as a
complete queue. No layout, status, payment or settlement rule changes.

## Security regression proof

`supabase/fixtures/performance-data.sql` records exact primary-key arrays (not
just counts) for every RLS-enabled public table before and after the migrations.
`performance-visibility-assert.sql` rejects any symmetric difference in visibility
or permission errors. Identities: administrator, supervisor, cashier, kitchen,
waiter, a second cashier, inactive staff, public customer and anonymous. It also
compares table/column ACLs, policy applicability and existing function
owners/ACLs/security flags/search paths.

The old kitchen join's visible item IDs are additionally compared with the union
of all new RPC pages for every identity. Anonymous execution remains denied.
The clean-chain aggregate runs a second fixture with waiter mode disabled and
1,100 active counter orders, exercising multiple pages and inactive-role access.
A deliberately changed snapshot is required to fail the comparison, then rolled
back. Large-volume runs exercise waiter mode enabled. Existing transactional SQL,
HTTP authorization and target-safety tests remain part of `test:all`.

This finite synthetic comparison is regression evidence, not a formal proof for
all possible database contents or simultaneous queue mutations. Existing write
policy tests complement the read comparison. Keyset pagination prevents the
historical ceiling; a queue can still change between page requests and Realtime
refreshes reconcile it. Offset pagination in the counter list has the same
between-request mutation limitation.

## Results and remaining acceptance

Evidence run: `artifacts/integration/fc3b19f798e15cdd9ca19cd0/`.

36,500 historical orders, milliseconds:

| Query | Before range (3 samples) | After p95 (30 samples) |
| --- | ---: | ---: |
| Kitchen | 15,808.651–16,077.723 | 10.162 (actual RPC) |
| Kitchen inner plan | same old query above | 6.527 |
| Ready counter orders | 0.618–1.136 | 1.192 |
| Active cashier tables | 0.864–1.227 | 1.799 |
| Business-day report | 54.550–63.938 | 69.612 |
| Populated open-session report | 114.785–122.269 | 131.638 |
| Audit timeline | 5.622–6.109 | 9.375 |

The kitchen and ready targets of 100 ms and both report targets of 300 ms are
met at 36,500 orders. Already-fast queries were retained; small millisecond
variation is not claimed as an improvement.

100,000 historical orders, milliseconds:

| Query | Before range (3 samples) | After p95 (30 samples) |
| --- | ---: | ---: |
| Kitchen | 43,546.489–45,721.903 | 11.063 (actual RPC) |
| Kitchen inner plan | same old query above | 5.449 |
| Ready counter orders | 0.563–0.656 | 1.132 |
| Active cashier tables | 0.846–0.958 | 1.352 |
| Business-day report | 146.349–167.123 | 143.133 |
| Populated open-session report | 336.414–340.168 | **350.944** |
| Audit timeline | 6.548–7.022 | 9.025 |

The kitchen remains independent of closed history at this active-queue size.
The day report meets 300 ms at 100,000 orders. The extreme open-session report
does **not**: p95 350.944 ms, about 51 ms over the goal. This is not presented as
a success or a regression proven by three baseline samples. It aggregates all
100,000 payments in one session, including multiple summary passes for methods,
service types and financial adjustments. Closed-session reports already return
their immutable saved snapshot; changing that history is not required.

The first upgraded turn plan records 7,839 temporary blocks read and 5,181
written. The day plan records 1,079/1,081. This supports investigating aggregate
materialization/spills rather than attributing the entire remainder to RLS.
Next work for that outlier: inspect nested summary plans, consolidate repeated
ledger aggregation while preserving exact historical refund/discount semantics,
compare report JSON before/after, and measure realistic per-day sessions as well
as this pathological session. This block deliberately does not rewrite the
financial summary chain just to hide the stress result. EXPLAIN of PL/pgSQL
report calls records their overall execution and buffers; its outer Result/Limit
node does not expose each nested statement's plan. No unmeasured nested cause or
missing financial index is asserted as proven.

Representative kitchen plan at this volume: the baseline scanned 36,605 items
30 times (one per product), rejected 1,061,545 join pairs, then probed orders
36,605 times. It used 2,416,185 shared buffer hits and zero physical reads.
The upgraded inner plan found 105 active orders through the partial bitmap
index, then made 105 indexed item lookups and bounded the decorated page. It
used 532 shared buffer hits and zero physical reads. Thus the measured benefit
is elimination of repeated historical work even with warm database buffers,
not an assumed disk-cache improvement. The JSON artifact retains all six
baseline query plans and all seven final plans (including the actual RPC).

Real multi-terminal concurrency, network latency, cold filesystem caches and
physical modest-notebook acceptance remain separate operational tests.
The bulk historical fixture uses cash/PYG and one item per order. Mixed-currency,
split-payment, discount, refund and cancellation correctness is exercised by the
regular SQL/HTTP suites, not by an equivalent large-volume mixed-ledger benchmark.
Very large simultaneously active queues are tested for completeness, not covered
by the 105-active-item latency claim. The cashier measurement is the active-order
SQL projection, not the complete HTTP/React table bill or the 200-row historical
orders hub. The existing audit API already bounds its page; its filter and
pagination behavior is unchanged.

The development installation is intentionally **not upgraded** by this block.
Deploy the app and new migrations together through the authorized `local:update`
workflow, with its verified backup and official migration tracking, before using
the new kitchen client against an existing installation. A pre-upgrade database
does not yet have the new RPC. History verification in this report refers only
to the disposable databases; it does not assert that development was updated.

## Validation record

Final aggregate run (2026-10-27 local time / 2026-10-28 UTC):
`INTEGRATION_PERFORMANCE_DB=true`, `INTEGRATION_VISUAL=true`, `npm run test:all`.
Evidence: `artifacts/integration/fc3b19f798e15cdd9ca19cd0/`; its `result.json`
records passed and cleaned. The final provisioning acceptance is in
`artifacts/provision-tests/87051217711a83ef9a047878/result.json` (passed,
development backup/operational state unchanged). Its owned containers and
volumes were separately confirmed absent. Ignored evidence files remain.

- `check:text`: 541 UTF-8 project files, zero issues; lint and target-import
  checks passed. A separate non-emitting source-only TypeScript check passed.
- Production build passed in the copied app; development `.next` was not used
  for building. The new RPC type was generated by the temporary Supabase CLI.
- 53 Vitest tests; 159 native/HTTP tests, zero failures and zero skips; 11/11
  application smoke checks.
- Full 53-migration clean chain, 22 existing SQL files and concurrency suites;
  before/after access comparisons also passed in the small disabled-waiter
  fixture and both large fixtures (522 comparisons per fixture).
- `db:verify-history` passed on the owned running instance; large measurement
  databases also passed tracked-history verification.
- Supervisor, Next app and all three workers passed startup, heartbeat/log and
  stable-process liveness checks for 11 seconds after readiness.
- Installed Edge: all 60 route/locale/viewport combinations passed. No unexpected
  console errors, suspicious text or page overflow. Captures are under the run's
  `visual/2026-10-28T02-05-26.943Z/`. Portuguese desktop kitchen and Spanish mobile
  cashier screenshots were additionally inspected. This is smoke coverage, not
  a full multi-terminal Realtime/concurrent paging soak or physical-device test.

Exploratory failures were not counted as passing: the first fixture attempted
two simultaneous sessions under the real exclusive-session default; only the
synthetic fixture policy was corrected. A previously running intermediate
52-migration experiment encountered the newer 53-migration RPC assertion and
failed; it was disposed and replaced by the fresh complete run above. No real
installation was repaired, seeded or migrated to resolve either failure.
Existing Node module-type reparsing warnings remain warnings, not test failures.
