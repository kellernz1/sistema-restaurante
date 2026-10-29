# Mesa Certa UI kit — foundation and navigation

## Foundation scope and boundaries (phase 2)

Implements DESIGN.md's semantic foundation, not the phase-3 cashier/navigation
redesign. No route, database, financial RPC, price, permission, print document,
driver or recovery protocol changed. Existing internal layouts remain in place.
The only dialog migrated is `features/approvals/sensitive-actions.tsx`; its
quote/approve/execute functions, request IDs, PIN handling, disabled conditions
and stored uncertain payload remain unchanged. Presentation gained safe focus,
Escape and background-scroll behavior.

Used the application workflow of `$design-taste-frontend` (low variation,
moderate density, minimal motion) and frozen `$web-design-guidelines`. No omitted
skill script, external asset/font/CDN, new dependency or global provider was used.

## Theme adoption

`src/app/ui-foundation.css` is imported after the existing feature styles, entirely
inside `@media screen`. It defines semantic color/type/space/radius/shadow tokens
and maps legacy color variables once. It does not replace existing screen layout
selectors, move printing chrome or touch thermal/print CSS. Automatic and explicit
dark now share neutral grounds. Light links use #0063c7: 5.34:1 on #f5f5f7 instead
of the previous 4.31:1. Filled action stays #0071e3 with white text (4.70:1).
The exact state pairs and calculated contrasts are in DESIGN.md and covered by
`tests/ui-foundation.test.mjs`; visual tests inspect rendered geometry/themes.

Logo/accent variables are semantic placeholders only, not a new branding setting,
database field, upload flow or remote URL. New component selectors use `ui-*`.
Existing page typography, navigation and decorative LineupCard layout are not
globally redesigned here. Existing primary cashier/kitchen actions receive a
52px minimum; new operational button variant is 56px.

## Presenters in src/components/ui.tsx

The existing module is now universal (no `use client`, hooks or provider).
It can render in Server Components; event handlers require a Client Component
caller. Visible content must already be translated with `getTranslation` or
`useTranslation`, as at existing call sites. Restaurant-entered content and money
formatting are passed through unchanged. Do not pass raw English labels or use
the component library to recalculate totals.

| Component | Variants / intended use |
| --- | --- |
| PillButton | Existing API retained; primary, secondary, danger; `operational` = 56px; native disabled/busy/pressed/ARIA props forwarded. Never enable a financial action just for visual consistency. |
| ArrowLink / ArrowButton | Navigation versus action, with decorative hidden arrow; at least 44px target and readable semantic link color. |
| StatusPill | neutral/info, success/ready/green, warning/open/yellow, danger/cancelled/red; always supply a translated status word, not color alone. |
| SegmentedControl | Existing controlled value/onChange/options retained; native grouped buttons with aria-pressed and counts. No new filter URL or behavior. |
| Panel / SectionTitle | Flat surface and responsive heading/action row; choose heading level 1, 2 or 3 according to document hierarchy. |
| FormField | Required stable unique id and translated label; optional help/error linked through aria-describedby; existing description IDs preserved; aria-invalid on error. Native input attributes forwarded, default name=id, text at least 16px. Use for textual/numeric inputs, not as a checkbox-group replacement. |
| Notice | info/success/warning/danger; polite status by default, `urgent` alert for an actionable problem. Keep unresolved financial/print/license/backup issues visible. |
| Toast | In-flow status with optional named dismiss button. No timer or new global portal/provider; do not auto-dismiss information that is needed to resolve uncertainty. Caller owns placement/state. |
| EmptyState | Title, explanation and optional action; distinguish empty from denied/loading/failed. |
| LoadingState | Polite text and stable spacing; no decorative animation or fabricated zero. |
| ErrorState | Alert plus optional recovery action; never generate a fresh operation ID or imply that a failed transfer is safe to repeat. |
| LineupCard | Compatibility presenter retained; its legacy screen layout is deferred to later phases. |

Shared presenters do not translate data twice, infer financial states or introduce
new defaults for payment lines. Bright state colors have matching text and tinted
surface in both themes. Controls wrap rather than clip longer Spanish labels.

## Isolated client boundary: ui-modal.tsx

`Modal` uses native dialog/top layer (background becomes inert), a labeled title,
explicit close button, Escape/onCancel handling, keyboard tab containment and
return to the still-connected originating element. Its content scrolls while
header/footer stay visible; body scroll is locked with balanced nested locks.
Busy prevents close-button and Escape dismissal. Closing a financial dialog must
not discard its stored uncertain submission; that remains the owning feature's
responsibility. Modal never stores PINs, passwords or authorization tokens.

Translate `title` and `closeLabel` in the caller. Keep the state/request owner
mounted; control `open` and `onRequestClose`. Do not use a close callback that
records a payment, retries an operation or clears recovery storage. Native
`showModal()` plus explicit trap is checked in installed Edge; other browsers,
assistive technology and virtual keyboards still need physical acceptance.

## Development-only component catalog

The catalog source lives in `dev/ui-catalog`, outside `src/app`. It is **not a
route in a restaurant build**. Only the owned integration controller, when
`INTEGRATION_VISUAL=true`, copies it to its disposable app as `/dev/ui-kit`.
No existing installation is started and no production environment flag exposes
a route that was shipped secretly. The native test asserts the source is absent
from the production route tree. Do not copy it into a live installation manually.

Run `npm run test:visual` with Docker and installed Edge available. Screenshots
and results remain in ignored `artifacts/integration/<run>/visual/<timestamp>/`.
The matrix now includes light/dark, pt-BR/es, 1440px/390px, catalog variants,
field associations, minimum targets, long modal scrolling, busy Escape block,
focus return and the real approval presenter with browser-only mocked negative
responses. It never executes an approval/financial mutation through those mocks.
The full SQL/HTTP suite remains the authority for transactional/security rules.

## Manual review in a dedicated disposable acceptance session

1. Inspect catalog button, field/error/help, notice/status, empty/loading/error and
   toast states in both themes and languages; expand labels by at least 30%.
2. Open its long dialog, Tab/Shift+Tab at both ends, scroll the body, test busy
   Escape and then ordinary Escape; confirm focus returns and page scroll unlocks.
3. In Aprovações open discounts/cancellations: quote, missing approver, invalid
   PIN, remaining-attempt feedback; confirm existing submission blocks remain.
   Real successful approval/discount acceptance uses synthetic accounts/data only.
4. Recheck cashier/counter/kitchen/public catalog screenshots: same navigation,
   same internal tasks, no unexpected overflow or touched print document layout.
5. At 200% zoom, 320px reflow and on a real phone/tablet, verify keyboard/safe-area
   behavior and no focused field hidden by the footer. Automated desktop/phone
   viewport screenshots do not certify physical devices or screen readers.

## Verification record

The first explicit `npm run test:visual` run
(`artifacts/integration/66c73106018a0db54ce16c0f/`) passed 162 native/HTTP tests
and 120 visual combinations, but failed all eight catalog combinations because
closed-dialog controls remained in the DOM and had zero-sized rectangles. It is
recorded as failed/cleaned, not a successful visual run. Closed modal content now
mounts only when open; the feature's financial state owner remains mounted.
Screenshot review also found legacy security styles overriding modal field
borders; a narrowly scoped selector and computed-style assertion address that.
Manual review of the passing aggregate captures found an inherited serif in the
new empty-state heading and undersized inherited status/count labels. Scoped
system-font and 14px rules fix them; the final visual run checks heading families
and computed label sizes as well as geometry and focus.

An initial shell-based addition corrupted six new translation strings. The text
guard rejected them; they were repaired with apply_patch and UTF-8 validation
passed afterward. No corrupted release, runtime secret or customer data was
involved. The visual harness now explicitly loads the validated disposable
environment, removing its unnecessary root-environment read before visual work.

Before/after performance and exact run evidence are maintained in
`docs/redesign-baseline.md`. The full aggregate passed in integration run
`f5ebf6830fb67db969be3704`, including 53 Vitest cases, 162 native/HTTP cases with
zero skips, 11 smoke flows, 53 tracked migrations and SQL/concurrency validation,
522 RLS comparisons, worker liveness and 128 visual combinations. Provision run
`6ea509bbf25b231d208bcb8b` passed with unchanged development backup/state and no
Windows modifications. The final explicit `test:visual` after the typography
refinement passed in run `c15f506cbd03585afe4729c2`: latest copied-app build,
162 native/HTTP tests without skips, 11 smoke flows and 128 visual combinations;
the owned instance was removed. All eight catalog locale/theme/viewport captures
and selected approval/long-dialog and operational views were manually reviewed.
Exact paths, timings and limits are recorded in the baseline report. No
financial/server source changed after that aggregate.
That phase included no commit/push or phase-3 implementation. The current
phase-3A navigation additions are documented below.

## Phase 3A navigation additions

`features/auth/WorkspaceNavigation` projects the pure role/mode destinations into
one labeled responsive navigation. Desktop links and mobile disclosure share
the same DOM; administration uses six subject groups. `StaffShell` owns the
single header, native account disclosure, skip link and stable print-status
projection. CashSessionBar stays a single feature owner in that header.
The header's capture-phase guard also covers My cash and workspace switching
while a counter discount/approval owner must remain mounted. It never stores a
PIN or grant. The printing shortcut uses the existing `ui-link` / `arrow-link`
classes on Next Link without importing the entire UI barrel into the header.

Root `PublicPreferences` keeps the existing public pickers without mounting any
staff auth. Staff pickers move into Account with their original IDs and storage.
Use navigation.ts current-location logic and translated labels when adding a
destination; do not add a second page-specific cashier/settings route menu.
See navigation.md for modes, in-memory approval preservation and manual checks.
Phase-3A acceptance passed in disposable visual run `dc147727e99aea432557471f`
and final aggregate integration run `3fb1a71ebd464fea49703c1a`. Exact counts,
CPU4x before/after measurements, screenshot review and an earlier intermittent
Windows EPERM failure are recorded in `docs/redesign-baseline.md`.
