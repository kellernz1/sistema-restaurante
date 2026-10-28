# Frozen Web Interface Guidelines review

Date: 2026-10-28. `$web-design-guidelines` source:
`.agents/skills/web-design-guidelines/command.md`, pinned to
`434b7f91364665f2f733b310ec54809bf8f37937`. Review scope: current application
routes, shared shell/UI, cashier/counter/kitchen/payment/approval/refund/customer
components and their CSS. This is manual static review using the skill, not an
executed third-party checker and not browser-measured compliance certification.
Line numbers refer to this revision; dense JSX/CSS can contain several controls
on one line. Severity and actionable exceptions follow the project rules.

## Findings: accessibility and navigation

- `src/features/auth/staff-shell.tsx:66` — Medium: no skip-to-content link; repeated navigation/printing chrome increases keyboard traversal before the main job.
- `src/features/auth/staff-shell.tsx:67` — Medium: most current main destinations lack `aria-current`; only the Caixa link explicitly marks the matching path.
- `src/features/approvals/sensitive-actions.tsx:69` — High: custom modal ARIA without native `showModal`, explicit focus trap, initial/return focus or Escape lifecycle. Background is not made inert in this component. Compare refund and bill dialogs before extracting a common presenter.
- `src/features/cash-sessions/sessions-panel.tsx:35` — Medium: movement-kind select has options but no associated label/accessible name; the enclosing legend describes the form, not this specific control.
- `src/features/settings/settings-form.tsx:117` — Medium: default-phone-country select relies on surrounding fieldset legend; add an associated control label in the later UI phase.
- `src/features/counter/counter-desk.tsx:107` — Medium: unconditional `autoFocus` on search; desktop intent is valid, but mobile keyboard behavior requires a viewport/input-aware approach.
- `src/features/counter/payment-draft.tsx:25` — Low/medium: repeated allocation inputs omit `name`, `inputMode` and explicit autocomplete metadata. Existing wrapping labels are valid; do not falsely report them all unlabeled.
- `src/features/counter/counter-desk.tsx:111` — Medium: changing quantity/cart count has no dedicated polite announcement; add concise status feedback without reading the entire cart at every keystroke.

## Findings: layout, contrast and touch

- `src/app/screen-theme.css:12` — High: `--brand: #0071e3` normal-size text on `--background: #f5f5f7` is 4.31:1; needs a darker link token. White button text on this blue is 4.70:1 and should not be indiscriminately replaced.
- `src/app/(staff)/cashier/counter/counter.css:27` — Medium: stepper declared width/min-width 42 px; target requirement is at least 44×44.
- `src/features/printing/print-queue.css:16` — Medium: filters declare 42 px minimum height; final cascade must be checked in browser.
- `src/features/printing/print-queue.css:42` — Medium: print actions declare 42 px height; full computed rectangles remain unmeasured.
- `src/features/cashier/bill-dialog.css:28` — Medium: payment-remove declares 36 px minimum; other global selectors may override. Require a computed-size regression check, not only a source constant.
- `src/app/customer-catalog.css:25` — Medium: 12 px, one-line product description; compact rows are useful, but important product information must remain accessible without unreadable type or truncating kitchen notes.
- `src/app/theme-picker.css:3` — Medium risk: fixed preference controls occupy operational/floating-action space; no new overlap is claimed from source alone. Test mobile keyboard, 200% zoom and safe areas.

## Findings: performance and content

- `src/app/screen-theme.css:112` — Medium risk: continuous sticky-header 20 px backdrop blur; remove from operational design budget. CPU slowdown alone cannot prove GPU paint cost.
- `src/features/cashier/cashier-navigation.css:1` — Medium risk: second sticky blur plus shadow; avoid layering effects over the cashier workspace.
- `src/app/approvals.css:1` — Low/medium risk: modal backdrop blur; flat translucent scrim is sufficient for the proposed design.
- `src/features/counter/counter-desk.tsx:109` — Medium: maps all filtered products; pagination/virtualization needed if catalog grows beyond a bounded visible set. Current public catalog already paginates; do not claim it is unbounded.
- `src/features/counter/counter-queue.tsx:32` — Medium: whole queue updates every second for minute labels and refreshes on all order events plus polling. Isolate presentation clocks and measure coalesced reads.
- `src/features/kitchen/kitchen-board.tsx:122` — Medium: per-second whole-board state and uncoalesced table invalidations; retained keyset paging solves DB completeness, not DOM rendering cost.
- `src/components/product-photo.tsx:11` — Medium: explicit dimensions/alt exist (pass), but unoptimized 1200×900 source can be excessive for compact catalog thumbnails. Network payload is not measured here.
- `src/features/cashier/bill-detail.tsx:117` — Medium: receipt-summary date uses hardcoded `pt-BR` and `America/Sao_Paulo`, not chosen locale/configured restaurant timezone. Display correction must not alter report boundaries.
- `src/features/cash-sessions/sessions-panel.tsx:34` — Medium: native `toLocaleString()` without chosen app locale; possible browser/UI-language mismatch.
- `src/features/settings/settings-form.tsx:43` — Low/medium: local section state does not provide a reproducible URL; safe section/filter deep links proposed, never financial requests or authorization secrets.

## Existing strengths / deliberate rule overrides

- `src/features/cashier/bill-detail.tsx:126`: native centered dialog, labeled
  heading, explicit close control, internal scroll and retained total/footer.
- `src/features/refunds/refund-actions.tsx:23`: focus lifecycle, keyboard trap,
  Escape and return focus already present; retain during visual extraction.
- `src/features/customer-ordering/floating-cart.tsx:45`: native dialog, accessible
  cart label/count, explicit close and retained draft.
- `src/app/screen-theme.css:54`: visible focus rule; `:309` reduced-motion
  handling; `theme-picker.css` sets explicit dark `color-scheme` and controls.
- Product images have intrinsic dimensions; semantic buttons/links and wrapping
  labels are used widely. No claim of a complete accessibility pass is made.
- `src/features/printing/print-request-button.tsx:20`: print-request result already
  uses `role="status"`; preserve this feedback instead of adding a duplicate alert.
- English Title Case, ampersand and quote rules are not imposed on pt-BR/es.
  Restaurant-entered names/descriptions are never rewritten by editorial rules.
- The generic "submit stays enabled" rule is overridden: all financial,
  authorization, license, uncertainty and validation blocks remain intact.
- Generic money-decimal examples are overridden by whole PYG via money.ts;
  BRL original cents and historical conversion remain unchanged.
- CDN/font/preconnect/download suggestions are not applicable: system fonts and
  local assets only. No new dependency is justified by this audit.
- Prefer safe pagination before adding a virtualization dependency; never
  truncate the active kitchen/ready queue or hide prior-day active work.

## Follow-up verification (not run in this phase)

In an owned disposable target: inspect computed rectangles, contrast on actual
composited backgrounds, focus/keyboard and accessibility tree, then screenshot
pt-BR/es × light/dark × 390/768/1366–1440 widths. Add 320 px reflow, 200% zoom,
mobile virtual keyboard, long names and empty/error/uncertain/blocked states.
Review pixels manually; the existing visual smoke cannot prove all these states.
Use the roadmap acceptance matrix before claiming any finding is fixed.
