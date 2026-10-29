# Redesign phase 2: measured UI baseline

Before run: `artifacts/integration/7385b0e0f39fd420cae73f3b/ui-performance.json`,
2026-10-28, branch redesign/ui, before any product source change. Its result is
passed/cleaned; the disposable production build, startup/liveness and tracked
history checks passed. No development environment, database or backup was used.

## Reproduction and method

Set `INTEGRATION_UI_PERFORMANCE=true` and
`INTEGRATION_UI_PERFORMANCE_ONLY=true`, then run `npm run test:integration`.
The existing target-safe controller owns provisioning, build and teardown. This
measurement-only mode deliberately does not run the HTTP suite; it is not a
test:all pass. Without these flags the aggregate remains unchanged.

Installed Edge 156.0.4314.50, headless, CDP CPU slowdown 4, 1366x768, Portuguese,
light theme. Five fresh contexts per view measure navigation through a visible
working selector (includes local server/network/hydration). Thirty warm actions
measure captured event through two animation frames, a **paint opportunity proxy**,
not INP, React commit profiling, bank acknowledgement or completed payment.
Cashier selects a table, counter adds a product, kitchen changes the alert-time
select, ready toggles its preparation disclosure. Repeated table selections may
be no-ops; use this only for like-for-like presentation regression, not capacity.

Synthetic disposable fixture: 50 active counter orders (20 ready), five active
table orders, seed catalog, unchanged prices/constraints/RLS. No money or handoff
is submitted by browser measurement. This small active fixture is not the
36,500-history SQL benchmark. Prontos is embedded in `/cashier`, not a new route.
Script counts are stable across all five samples: cashier/counter/ready 12,
kitchen 11. Byte maxima sum unique loaded JS resource encodedBodySize and
decodedBodySize, framework included, before actions; CSS and RSC are excluded.
Warm lazy-dialog bytes must also be inspected separately in visual acceptance.

## Before results and fixed ceilings

Decimal bytes; milliseconds. Five cold samples do not establish p95 cold load.
Initial bytes must satisfy both DESIGN.md's absolute ceiling and ≤3% growth
against this before build. No provisional budget exception is requested.

| View | Decoded JS | Encoded JS | Cold visible median / max ms | Local feedback p95 ms | Effective decoded / encoded ceiling |
| --- | ---: | ---: | ---: | ---: | ---: |
| Caixa | 1,044,301 | 300,782 | 826.0 / 966.1 | 12.0 | 1,050,000 / 309,805 |
| Balcão | 1,038,965 | 298,960 | 852.1 / 870.2 | 19.2 | 1,050,000 / 307,928 |
| Cozinha | 895,189 | 259,504 | 835.6 / 856.8 | 16.4 | 900,000 / 265,000 |
| Prontos | 1,044,301 | 300,782 | 1,025.6 / 1,033.3 | 11.2 | 1,050,000 / 309,805 |

Cold working view target ≤2 s and warm feedback p95 ≤100 ms remain acceptance
goals. Small timing differences are noise, not proven speed improvements. CPU
slowdown is not a weak GPU, real phone, 4-GB whole-machine or multi-terminal soak.

## After results

Final after run: `artifacts/integration/79fe1dd9e0cf9e647664738b/ui-performance.json`.
Same browser, fixture, five cold contexts and 30 warm actions; production build,
worker startup and disposable db:verify-history passed; instance removed.

| View | Decoded JS after (delta) | Encoded JS after (delta) | Cold visible median / max ms | Local feedback p95 ms before → after |
| --- | ---: | ---: | ---: | ---: |
| Caixa | 1,046,324 (+2,023) | 302,242 (+1,460) | 1,018.2 / 1,296.2 | 12.0 → 9.1 |
| Balcão | 1,040,988 (+2,023) | 301,033 (+2,073) | 1,070.6 / 1,130.7 | 19.2 → 30.6 |
| Cozinha | 895,575 (+386) | 259,647 (+143) | 1,102.5 / 1,185.6 | 16.4 → 30.4 |
| Prontos | 1,046,324 (+2,023) | 302,242 (+1,460) | 1,578.6 / 1,597.3 | 11.2 → 14.9 |

All byte ceilings pass without exception: decoded growth ≤0.20%, encoded growth
≤0.70%. The new modal and shared presenter code add a small client payload; the
universal ui.tsx avoids adding another provider/client entry. All local feedback
p95 values are below 100ms and five cold maxima below 2s in this run. No speedup
is claimed. Ready median rose about 553ms; cold samples are small, include async
queue arrival/polling/server effects and were not interleaved across builds.
This is a recorded variation, not a proven causal CSS/React regression. Repeat
with more samples on actual low-end equipment before making capacity claims.

The production-style measurements exclude the dev catalog; the visual-test build
injects that route only into its owned copy. No performance ceiling was raised.
An intermediate after run (`77fa0cad58c9c174b2863198`) also passed, before the
closed-dialog DOM/legacy-field-specificity refinements; it is superseded by the
final table above, not mixed into its sample counts.
The existing application screen layouts/navigation and periodic reads are not
optimized here; timer/request improvements remain later scoped work.

## Functional and visual validation

Full `npm run test:all` passed with `INTEGRATION_VISUAL=true`, using integration
run `f5ebf6830fb67db969be3704` (passed/cleaned) and provision run
`6ea509bbf25b231d208bcb8b` (passed/owned provider removed):

- Text: 572 UTF-8 files, zero issues; lint passed.
- Production `npm run build` passed in the copied app, never root development.
- 53 Vitest tests, 162 native/HTTP tests, zero failures/skips, 11 smoke flows.
- 53 official migrations, complete clean SQL/concurrency suites and 522 RLS
  before/after visibility comparisons; disposable db:verify-history green.
- Supervisor/app/three workers passed actual startup and stable liveness checks.
- 128 visual combinations (16 routes/views × two locales × two viewports × two
  themes), including the catalog and real approval presenter with mocked
  negative approval responses; no financial execution by that browser test.
- Five provision guards and isolated provision/preflight/restart rehearsal passed;
  its evidence confirms development backup/state unchanged and Windows unmodified.

The first explicit visual run (`66c73106018a0db54ce16c0f`) failed eight catalog
cases on zero-sized closed-modal controls; it remains recorded as failed/cleaned.
Mounting content only while open resolved those failures. Manual screenshot
review also tightened legacy modal field-style precedence and found a serif
empty-state heading and undersized status/count labels; those typography-only
fixes passed the final explicit `npm run test:visual`, run
`c15f506cbd03585afe4729c2` (exit 0, passed/cleaned). It rebuilt the latest source,
passed startup/history, 162 native/HTTP tests with zero skips, 11 smoke flows and
all 128 visual combinations. Captures are in its ignored
`visual/2026-10-29T00-14-21.458Z/` directory. Manual review covered all eight
catalog language/theme/viewport combinations, selected long-dialog and PIN-error
captures in both languages/themes and widths, and representative cashier/kitchen
views. No clipping, new horizontal overflow or serif/status-size issue remains
in the reviewed foundation captures. Automated checks cover geometry, 44px
targets, 16px fields, 14px status/count labels, theme equivalence, focus trapping,
Escape, focus return and body-only scrolling. These are not manual screen-reader
or real-device certification. No failures or unavailable tests are silently
counted as passing. Existing Node module-type
reparsing warnings remain nonfatal.

An exploratory visual run (`1a09d6da8fd324f48a56c6f4`) copied the app before the
last typography refinement and was interrupted, not counted as passing. Windows
terminated its owner before JavaScript cleanup completed. Its orphan was stopped
with the pinned official Supabase CLI and exact verified temporary workdir
(`stop --no-backup`); the copied app/logs remain ignored evidence. No ownership
marker was forged or development fallback used. The final run starts from a new
owned disposable instance. Existing print panels still dominate the operational
screens vertically; their separation remains phase 6, not this foundation change.

Browser fixtures are synthetic, not real restaurant money or bank operations.
Physical printers, actual phones/keyboards/screen readers, low-GPU equipment,
Windows startup and multi-terminal soak remain outside this phase's acceptance.
No development services, migrations, backup, secrets or Windows settings were
changed; no commit/push. Navigation/counter redesign (phase 3) and printing
separation (phase 6) are not implemented.

## Phase 3A — navigation baseline

Before any phase-3A product edit, fresh run `6b821d832d7bfe099488ec6b` passed and
removed its owned instance. Same Edge/CPU4x fixture, five cold contexts and thirty
warm feedback samples per view as phase 2; no existing installation or backup.

| View | Decoded JS before | Encoded JS before | Cold visible median ms | Feedback proxy p95 ms |
| --- | ---: | ---: | ---: | ---: |
| Cashier | 1,046,338 | 302,269 | 815.3 | 10.2 |
| Counter | 1,040,996 | 301,055 | 850.9 | 23.0 |
| Kitchen | 895,585 | 259,663 | 932.6 | 24.6 |
| Ready | 1,046,338 | 302,269 | 1,065.2 | 11.3 |

Final after run `d5812b1e6d9e8e4666f0a2dc` passed/cleaned on the corrected source,
including build, actual worker startup/activity and disposable history verification.
The measurement now asserts the unchanged absolute byte ceilings and <=100ms
local-feedback proxy; these byte caps are stricter than this baseline plus 3%.

| View | Decoded JS after (delta) | Encoded JS after (delta) | Cold median / max ms | Feedback proxy p95 before -> after ms |
| --- | ---: | ---: | ---: | ---: |
| Cashier | 1,049,949 (+3,611) | 303,856 (+1,587) | 964.7 / 1,090.5 | 10.2 -> 10.1 |
| Counter | 1,044,218 (+3,222) | 302,485 (+1,430) | 1,050.0 / 1,090.3 | 23.0 -> 29.9 |
| Kitchen | 899,112 (+3,527) | 261,214 (+1,551) | 1,056.5 / 1,070.9 | 24.6 -> 23.8 |
| Ready | 1,049,949 (+3,611) | 303,856 (+1,587) | 1,504.2 / 1,562.7 | 11.3 -> 10.3 |

All ceilings pass without exception: maximum decoded growth 0.40%, encoded 0.60%.
The cashier has only 51 decoded bytes of remaining absolute headroom. Phase 3B
must remove/attribute existing client payload before adding more initial code;
do not silently raise DESIGN.md's limit. Operational menus/account require no
new lazy chunk; the rarely used administration groups load on opening them in
the administrative space, outside operational route budgets.

Five cold samples and thirty two-frame event samples are not field INP or proof
of speed improvement. Cold medians rose approximately 124-439ms here. Other disposable acceptance
jobs ran on the same host during after measurements, so CPU/network contention
and noninterleaved builds limit causal comparisons. All observed cold maxima
were below 2s, warm feedback below 100ms. Physical low-end devices/weak GPUs and
bank/network acknowledgement are not certified by this test.

Intermediate measurements: `29ae162d898f66909e0e0732` completed its runner but
failed the manual absolute-budget check (cashier +993 bytes over ceiling, kitchen
+146). Lazy administration removed that initial payload; `9dd40a03f0c7c894b5989757`
still exceeded cashier by 68 bytes. Reusing the session refresh pulse, factoring
the displayed day and shortening repetitive header text resolved it.
`8a134b3c818b1d710acf1014` passed bytes but precedes final supervisor/label fixes;
its timing samples are superseded, not mixed into the table.
`49fc715226935bbd041eabdf` also passed bytes but precedes the final administrative
heading translation context; it is superseded by the final after run above.
`d49529da035701d9dad43397` passed before the final header-wide draft guard and
administration approval placement, and is also superseded. Importing the UI-kit
barrel in the header exceeded the budget in `4f1532ef93b290b474fc43a5`.
A leaf entry reduced this, but `ad68d4bfcfd59b771e6ac907` still exceeded cashier
by 194 bytes. The final shortcut uses the kit's existing classes on Next Link,
without the additional wrapper/barrel. No component contract or ceiling changed.

Exploratory visual runs `51487be3d5073eb9c07fb5e8`, `9db5722df4d08caa966ec3f4`
and `1f429957528ee30c5a34f214` are not successful final acceptance. Old smoke
assertions still targeted removed cashier tabs/floating staff preferences; those
were updated while retaining draft restoration and cart-layout checks. Real
supervisor coverage found an unnecessary service-mode read denied by existing
RLS (406). The supervisor now skips that unused read; loading/role transitions
are an explicit hook dependency. No permission was broadened and console errors
are not suppressed to pass. Expanded destination tests also cover translations
whose identical PT/ES names previously relied on fallback (Mesas/WhatsApp).
Further exploratory failures were in test assumptions: `6a0e3fdf25bd07a966c45d58`
matched the wrong Spanish grammatical ending for the disabled-waiter message;
the assertion now uses the existing translation. `dcb5a7e1adc48bd9a6f2e8b4`
read destinations before mode hydration; the test waits for the expected IDs.
`b27786ac55d4bca2cd8b3d3e` read a cached browser URL before history notification;
it now waits for the settings hash. `40197a0e1327fd6027318df0` passed the visual
matrix on an earlier copied app; only the final visual run is final-source evidence.

Final explicit `npm run test:visual` passed in `dc147727e99aea432557471f`, with
an exact matching copy of the changed product source (SHA-256 comparison before
the run). Its build, 165 native/HTTP cases without skips, 11 smoke checks,
processor startup/liveness and disposable history verification passed. Visual
coverage: the existing 128 combinations, plus 48 role/mode cases, 168
role/theme/locale/viewport cases, 24 public cases and 96 real server/API/RLS
refusals; no failures. The owned stack was removed normally.

Captures are under
`artifacts/integration/dc147727e99aea432557471f/visual/2026-10-29T05-57-09.048Z/`.
Manually reviewed final counter headers (PT desktop and ES phone), kitchen PT
tablet, cashier ES dark 320px expanded menu, administration ES dark phone,
supervisor PT desktop, waiter automatic-dark ES tablet/account, disabled waiter
PT phone and public automatic-dark ES 320px. These cover all four target widths,
both languages, light/dark/automatic, account focus, wrapping and role hierarchy.
The complete matrix was automated; not every capture was individually inspected.
No horizontal navigation overflow, console errors or under-44px header targets
were found by the automated checks. Open administration navigation uses bounded
internal scrolling; the original print panel remains intentionally prominent.

The final sequential `npm run test:all` retry exited 0. Integration
`3fb1a71ebd464fea49703c1a` passed/cleaned: 53 Vitest, 165 native/HTTP (zero
skips), 11 smoke flows, 53 tracked migrations and SQL/concurrency suites,
522 RLS comparisons, actual supervisor/app/three-worker activity and liveness,
and green history. Five provision guard unit tests and full provision acceptance
`447760e5c84caf6157b8c979` passed. The owned provider was removed; its evidence
confirms unchanged development backup/state and no Windows modification.
Final check:text (578 UTF-8 files, zero issues), lint (zero warnings),
check:targets (two cases) and git diff whitespace checks passed.
Absolute DESIGN.md ceilings and the 3% relative cap remain unchanged; no exception
is approved. Historical phase-2 results above remain historical evidence.

Aggregate `e4052de82c48e46e00a7c79a` passed before the last presentation-only
shortcut payload reduction, including 53 Vitest tests, 165 native/HTTP cases
(zero skips), 11 smoke flows, 53 tracked migrations, all SQL/concurrency suites,
522 RLS comparisons and worker startup/liveness. Provision acceptance
`ee086f6ee9091279e374112f` passed and confirmed unchanged development backup/state
and no Windows modifications. A later exact-source aggregate
`d0459b6c2e474e6a22f66e81` failed: Windows returned EPERM replacing the disposable
supervisor's processes.json during liveness acceptance. Its clean SQL/RLS/build
stages passed; the runner removed its instance. This is recorded as a failed run,
not hidden or bypassed. Supervisor/file-transport changes are outside navigation
scope. The sequential final retry above passed; EPERM did not recur. This does
not prove its underlying Windows/file-lock cause is fixed. Investigate recurrent
atomic-file replacement failures in a separate operations task, without weakening
worker acceptance or the target barrier. Physical device/assistive-technology and
multi-terminal soak acceptance remain pending. No phase-3B implementation,
development mutation, commit or push was performed.
