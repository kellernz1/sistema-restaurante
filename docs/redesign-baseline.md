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
