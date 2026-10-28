# Mesa Certa design foundation

Status: proposed foundation, 2026-10-28; implementation requires phase approval.
Companion documents: [UX audit](docs/ux-audit.md),
[frozen guidelines review](docs/ux-audit-guidelines.md),
[execution plan](docs/redesign-plan.md). This file defines future presentation;
it does not claim the current CSS or all current screens comply.

## Principles and operational identity

Priorities, in order: organized, efficient, lightweight, fluid, attractive.
The person serving a queue must find the next action without training. Keep a
stable location for ticket, outstanding amount, current cash session and primary
action. Name the restaurant and current workspace; the recognizable Mesa Certa
element is the ticket/production/handoff sequence, not a decorative dashboard.

Use `$design-taste-frontend`'s application workflow: low visual variation,
moderate density, minimal animation. No marketing workflow, image generation,
remote fonts, script-based style draws or omitted inspectors. Use the installed
`$web-design-guidelines` as a local advisory checklist, subordinate to AGENTS.md.

Keep the existing neutral Apple-derived grounds, system type and blue action
family; replace oversized promotional hierarchy with working-screen hierarchy.
IBM inspires legible aligned data, Cal grouped settings, Linear quiet navigation
and dark surface steps. Do not copy their brands, fonts or marketing effects.
One deliberate exception to generic app-skill size advice: tickets may be 48 px
because kitchen recognition matters more than a dashboard study's numeral cap.

Presentation never changes server prices, totals, discounts, payment currency,
refund allocation, approval, service-mode or license rules. Preserve RLS, request
UUID recovery, grant invalidation, manual refund confirmation and print uncertainty.
Do not turn UI simplification into a new financial default or extra permission.

## Semantic theme contract

The following variables are a **specification only**, not CSS installed by this
phase. Map legacy `--background`, `--surface`, `--foreground`, `--brand` and other
tokens once during a future foundation implementation; avoid two independent
theme systems. Theme selection remains automatic/light/dark with the user's
explicit selection winning. Automatic and explicit dark should use the same
palette; current CSS has differing dark grounds, noted by the audit.

| Role / proposed variable | Light | Dark | Purpose |
| --- | --- | --- | --- |
| `--canvas` | `#f5f5f7` | `#000000` | Page ground |
| `--surface` | `#ffffff` | `#1c1c1e` | Working panel |
| `--surface-raised` | `#ffffff` | `#2b2b30` | Menus/selected neutral areas |
| `--text-primary` | `#1d1d1f` | `#f5f5f7` | Main text, amounts |
| `--text-secondary` | `#5b5b63` | `#aaaab2` | Supporting text, never critical low-opacity text |
| `--border-subtle` | `#dedee3` | `#414147` | Nonessential separators |
| `--border-control` | `#7a7a85` | `#8a8a94` | Necessary input outlines/unchecked controls |
| `--restaurant-accent` / `--action-fill` | `#0071e3` | `#0071e3` | Primary fill with white text |
| `--action-hover` | `#0063c7` | `#0063c7` | Filled-button hover, without layout movement |
| `--action-text` / `--focus-ring` | `#0063c7` | `#2997ff` | Links and focus, distinct from fill |
| `--on-action` | `#ffffff` | `#ffffff` | Primary button label |
| `--success-text` / `--success-bg` | `#20653d` / `#e5f3e9` | `#8cdeb0` / `#193c2a` | Ready, within waiting threshold |
| `--warning-text` / `--warning-bg` | `#815200` / `#fff1d6` | `#f5cc7d` / `#3c301b` | Waiting attention, tolerances |
| `--danger-text` / `--danger-bg` | `#b42332` / `#fde9ec` | `#ffabb3` / `#421f28` | Failure, overdue, destructive warning |

### Contrast evidence and rules

Ratios below were calculated from these opaque sRGB hex pairs using relative
luminance and `(lighter + 0.05) / (darker + 0.05)`; rounded to two decimals.
They are not screenshots or a scan of the current application. Normal text must
meet 4.5:1, large text 3:1, necessary controls/focus boundaries 3:1 against adjacent
colors. Aim above thresholds rather than rounding a failing value up. Recheck
every actual state/background, including selected/hover, if tokens change.

| Foreground / background | Ratio | Use |
| --- | ---: | --- |
| `#1d1d1f` / white; / light canvas | 16.83; 15.46 | Light primary text |
| `#5b5b63` / light canvas | 6.18 | Light secondary text |
| `#0063c7` / white; / light canvas | 5.82; 5.34 | Light links; current `#0071e3` on canvas is only 4.31 |
| white / `#0071e3` | 4.70 | Filled buttons in either theme |
| `#f5f5f7` / dark surface | 15.63 | Dark primary text |
| `#aaaab2` / dark surface | 7.37 | Dark secondary text |
| `#2997ff` / dark surface; / raised surface | 5.64; 4.67 | Dark links |
| `#20653d` / `#e5f3e9` | 6.13 | Light success/wait green |
| `#815200` / `#fff1d6` | 5.99 | Light wait yellow |
| `#b42332` / `#fde9ec` | 5.59 | Light wait red/error |
| `#8cdeb0` / `#193c2a` | 7.66 | Dark wait green |
| `#f5cc7d` / `#3c301b` | 8.47 | Dark wait yellow |
| `#ffabb3` / `#421f28` | 8.04 | Dark wait red/error |
| `#7a7a85` / white; / light canvas | 4.24; 3.90 | Essential light control boundary |
| `#8a8a94` / dark surface | 4.98 | Essential dark control boundary |

Status always includes a word and, when useful, an icon. Green means within
threshold, yellow attention, red overdue; these are not payment confirmations.
Ready, paid, delivered and print-sent remain distinct states. Ready-queue waiting
uses existing restaurant thresholds (defaults green through 2 min, yellow through
5 min, red after); preserve exact current boundary logic. Kitchen preparation
uses its own configured warning and must not show preparation wait on ready cards.

Future per-restaurant identity has one accent family and one optional local logo:
reserve `--restaurant-accent`, `--restaurant-accent-text`, `--on-action` and a
logo slot of 32–40 px with restaurant-name fallback. No settings field, database
column, upload or branding engine is added now. Future accent choices must derive
accessible text/fill pairs and cannot override semantic state colors. Do not
accept arbitrary URLs, remote fonts or unvalidated CSS as customization.

## Type and numbers

Font stack: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI",
Inter, Roboto, sans-serif`; installed fonts only, no font download. No serif
titles. Body weight 400, controls 600, section titles 650–700. Use tabular numerals
for money, tickets, time and aligned table columns. PYG remains whole Gs through
`src/lib/money.ts`; BRL and historical FX use existing helpers. Do not abbreviate
an amount being paid/refunded, or invent precision by rounding it in presentation.

| Context | Size / line height | Notes |
| --- | --- | --- |
| Supporting metadata | 14 / 20 px | 12 px only for nonessential secondary metadata in level 3, never a critical warning |
| Body and form inputs | 16 / 24 px | Avoid mobile input zoom and unreadable form labels |
| Product/order title | 18 / 24 px | 600; wrap long entered names |
| Section / modal title | 22–24 / 28–32 px | Left aligned, no eyebrow required |
| Working page title | 24–28 / 32–36 px | Maximum 32 px in administration; not 48–60 px heroes |
| Payable total | 28–32 / 36–40 px | Currency prefix kept with amount |
| Ready/kitchen ticket | 36–48 / 44–56 px | Identifier leads; optional name 20–24 px |
| Kitchen item / important note | 20–24 / 28–32 px | Notes never truncated; quantity bold |

Letter spacing: body normal; titles no tighter than -0.02em. No all-caps paragraphs
or condensed type. Important labels remain readable at 200% zoom. Test ñ, ¿, ¡,
ã, õ, ç and accented product names. Date display follows selected locale and
configured restaurant timezone without changing stored business dates.

## Spacing, surfaces and density

Spacing scale in pixels: 4, 8, 12, 16, 24, 32, 48. Use one primary workspace gap
of 16 px, 24 px between unrelated sections. Panel padding 16–24 px; mobile page
gutter 16 px (12 only at 320 px), desktop 24 px. Working content uses available
width; avoid empty marketing bands above the catalog or production queue.

Radii: 8 px inputs/compact rows; 12 px cards; 16 px dialog; full pill for status
and optionally primary action. Maximum three radius families per screen. Cards
are flat: one tone step or separator, not nested raised containers everywhere.
Operational shadows: none. Menus/dialog may use one static small shadow
(`0 4px 16px rgb(0 0 0 / 12%)`); scrim uses flat black at 45–55%, without blur.
No gradient cards, glass layers, backdrop filters or oversized soft shadows in
continuous-use screens. Public menu can use a static neutral image placeholder.

Touch targets are at least **44×44 CSS px**, including icon controls, remove,
stepper and print filters. Cashier primary actions and kitchen group actions:
52–56 px tall, minimum 120 px wide when text permits; 8 px minimum gap between
adjacent targets, 12 px around destructive actions. Full width when narrow.
Do not shrink buttons to make a Spanish label fit.

| Context | Density / structure |
| --- | --- |
| Counter / payment | Moderate, rows 64–80 px before expanded notes; 16 px input text, total and submit fixed in their panel |
| Kitchen | Comfortable, fewer large cards, ticket/items/notes dominate; controls 56 px |
| Ready queue | Moderate, ticket/name/elapsed/action; oldest first, no giant decoration |
| Public menu | Compact but readable, local 44–64 px thumbnail, 16 px product name, 14 px description, 44 px add action; preserve category pagination |
| Administration / reports | Moderate tables, 48 px interactive rows, numeric alignment; optional compact read-only rows must not shrink touch controls |

On desktop ≥1100 px counter uses catalog + 360–440 px current-order panel;
at tablet widths use proportions only when both sides retain usable controls;
below that use catalog plus accessible cart/order view, with draft preserved.
Kitchen uses three columns when legible; at narrow widths use labeled stage
navigation and counts with no lost stage. These are proposed responsive
presentations of the same data, not new order states or permission changes.

## Component contract

| Component | Presentation and required states |
| --- | --- |
| Button/link | Primary filled action for the current decision; secondary text/outline; destructive explicit label plus warning. Native button for action, Link for navigation. Hover must not move targets; visible focus, pressed, busy, disabled and uncertain states. Disabled reason nearby; never erase a financial block to comply with generic form advice. |
| Card | Clear heading/identifier, metadata then one dominant next action. Status tint only in a small area. No card-inside-card for every label. Do not make container clickable if it contains competing nested controls. |
| Centered modal | Native dialog or equivalent correctly trapped/inert implementation; labeled title, explicit close, focus entry/return and Escape respecting in-flight lock. Header/total/footer remain visible; body scroll only, `overscroll-behavior: contain`. At mobile fit viewport/safe area/keyboard. Financial confirmation and recovery stages retained. |
| Form | Persistent associated label, units, helper/error association, proper type/inputMode/autocomplete, paste allowed. Inline error near the field and action; focus first invalid field when safe. Optional fields clearly marked. Required reasons/PIN/grants remain required. |
| Table/list | Semantic headers/captions, numbers right aligned, tabular figures, clear sorting/filter state and accessible pagination. On phone use labeled cards or an explicitly contained scroll area. No page-wide horizontal overflow. All active work remains reachable. |
| Badge | Text plus color; type, status and urgency use separate labels. Not a button unless actually interactive. Never imply ready equals paid. |
| Warning/alert | Inline near affected job; polite live region for normal feedback, alert for actionable failure. Persistent unresolved payment/print/license/backup warning, with role-permitted next action. Repeated polling must not repeatedly steal focus or flood announcements. |
| Empty | Explain true zero and next permitted action. Distinguish empty from loading, denied, disabled and failed. No decorative illustration dependency. |
| Loading | Reserve stable row/amount geometry; small status text; no whole-screen transition on each refresh. Do not display zero revenue while data is unknown. |
| Error/uncertainty | Preserve entered data; explain a safe next step. Show `Consultar envio` for the original operation. No automatic new UUID, payment, refund or uncertain print resend; keep existing application recovery logic. |

Use existing `src/components/ui.tsx` where sensible, and feature presenters inside
their existing `src/features/*` boundaries. Server Components remain default;
do not put the whole shared UI package behind a new client provider merely for
styling. Dynamic splitting may load rare dialog presentation on demand, but must
retain the owning request/authorization lifecycle outside an unmount boundary.

## Operational patterns

**Order card:** ticket/order number and customer/table first; readable item
summary; type + state; amount; elapsed time with explicit baseline (received,
ready). Primary next action; details and financial exceptions secondary. Pending,
paid, ready, cancelled and uncertain never share an indistinguishable label.

**Ready queue:** largest ticket, optional name, "Pronto há … min", urgency label,
paid/remaining state and one permitted handoff/payment action. Keep oldest first.
Calling is a human activity today; do not add a "called" state in a restyle.

**Cashier panel:** current operator/session near navigation; catalog/category/search
and order pane dominate; total/net discount/remaining/change stay visible where
decisions are made. Use the same payment-line visual language for draft and
existing-order payments, with their different submit semantics clearly labeled.
Advanced financial actions are accessible but not competing primary buttons.

**Kitchen:** compact chrome and connection/print/cancellation alerts, then columns
Received / Preparing / Ready (translated). Large ticket, quantities, product names,
notes and group action; per-item actions remain available. No financial settings,
turn closure or administrative menu in this role. At 1366×768 test reading at
1.5–2 m; actual distance acceptance remains physical, not a CSS guarantee.

**Receipt:** isolated white thermal document and separate screen-only toolbar
(back + print + status); neither toolbar nor preference controls appear on paper.
Keep current immutable document generator, 58/80 mm widths, QR, discount/payment/
refund data and "comprovante não fiscal" meaning. This redesign does not change
ESC/POS bytes, drivers or physical-print compatibility.

## Motion, localization and accessibility

Operational content appears immediately. Only necessary control feedback/modal
opening may use 100–150 ms transform/opacity; optional nonoperational feedback
maximum 200 ms. No entry animation on queue cards, animated gradients, autoplay,
scroll hijacking, `transition: all`, size/position animation or focus movement on
timer ticks. Respect `prefers-reduced-motion`: no nonessential transforms or fades.
Do not reorder the queue under a finger with decorative animation.

Allow Spanish labels at least **30% extra width/length**, with wrapping and auto
height rather than clipping. This is a fixture margin, not a claim every Spanish
phrase is 30% longer. Use natural pt-BR/es sentence case, existing translation
helpers and plural/placeholder handling; restaurant content is not translated or
shortened editorially. Preserve labels familiar to current operators where clear.

Keyboard: logical tab order, skip link, visible 3 px focus with offset, all actions
reachable without hover/drag, no global Enter that submits a financial dialog
unexpectedly. Preserve current explicit shortcuts and disclose their target.
Use semantic landmarks, accessible names for icons and translated dialogs;
decorative Lucide icons `aria-hidden`. No color-only state; screen-reader error
association and live feedback required. Permit zoom, no fixed-height text boxes
that clip at 200%. At 320 CSS px reflow without page-wide horizontal scrolling;
intentional table scroll has a label. Mobile overlays must respect safe areas and
the virtual keyboard and must not cover total, focused field or submit action.

## Performance budget and measurement protocol

Baseline is **historical**, from `docs/code-health-audit.md`, 1366×768,
two navigations per rate/phase (not p95). JS includes shared/framework resources:
cashier 1,038,234 decoded / 298,490 encoded bytes; counter 1,032,889 / 296,743;
kitchen 889,694 / 257,485. Counter longest observed CPU-4× task 261 ms.
No separate session/payment/receipt route-byte measurement was recorded. SQL is
not browser latency: newer `docs/performance-db.md` kitchen p95 is 10.162 ms at
36,500 historical orders, ready 1.192 ms; 100k stress turn report remains 350.944
ms. Do not repeat the obsolete 18.5 s kitchen result as current performance.

### JavaScript ceilings

Decimal bytes, per fresh route context; sum unique script resources actually
loaded before ready for input, including framework/shared scripts. Do not add
all `.next` files or count cached transfer zero as a smaller bundle. Record both
decoded and encoded sizes and compression; if headers expose no encoded size,
report that metric unavailable rather than substituting decoded bytes.

| Operational route/view | Initial maximum decoded / encoded bytes | Longer-term target, separately measured |
| --- | ---: | --- |
| `/cashier`, ready queue and mounted payment modal | 1,050,000 / 310,000 | 900,000 / 260,000 after lazy presentation attribution |
| `/cashier/counter` | 1,050,000 / 310,000 | 900,000 / 260,000 |
| `/kitchen` | 900,000 / 265,000 | 800,000 / 235,000 |
| `/cashier/sessions` | 1,050,000 / 310,000 provisional parent-workspace ceiling | Establish its own baseline before editing |
| `/print/counter/[id]` | 900,000 / 265,000 provisional ceiling, not a claimed current size | 500,000 / 150,000 if attribution supports isolation |

Rebaseline unmeasured routes and updated build in the disposable environment
before implementation; do not quietly raise a ceiling to pass. Record exceptions
for approval. At each step compare like-for-like both absolute ceiling and no
more than 3% increase from that fresh baseline. Lazy dialog bytes also count in
their first-open measurement, not hidden from the budget.

### CPU-slow acceptance for every level-1 screen

Use production build in the existing owned disposable workflow, installed Edge via
Playwright/CDP CPU rate **4**, same fixtures before/after; desktop 1366×768,
tablet 768×1024 and phone 390×844; pt-BR/es × light/dark. Use at least 30 warm
interactions for p95; separately record five cold navigations. Distinguish network/
SQL time from input-to-next-paint and durable server acknowledgement. Suggested
fixtures: 100 catalog products, 20 cart lines, 50 active orders, 20 ready tickets,
and a 36,500-order history where DB fixtures are already supported. Run complete
queues above 1,000 items for correctness separately, not as a latency claim.

| Screen | CPU-4× acceptance gate (proposal, not measured in phase 1) |
| --- | --- |
| Counter launch | Search/key-to-result and add/quantity-to-total paint p95 ≤100 ms; no interaction task >200 ms; ready-for-input ≤2 s after route response on local healthy stack. |
| Ready list | Ticket handoff press shows busy feedback p95 ≤100 ms; acknowledged changed queue visible ≤1 s after server response; time-label tick must not rerender unchanged item bodies. |
| Kitchen | Stage action busy feedback p95 ≤100 ms; confirmed column update ≤1 s after response; incoming visible change ≤1 s after delivered Realtime event, including coalescing. |
| Open cash | Amount typing feedback p95 ≤100 ms; open-session result visible ≤1 s after response; form usable ≤2 s after route response. |
| Close cash | Count/note input p95 ≤100 ms; report renders ≤1 s after response with 100 event rows; blind expected amount stays hidden until existing server rules allow it. |
| Payment modal | Open usable ≤300 ms when config loaded, ≤1 s after required config response otherwise; edit/change/remaining feedback p95 ≤100 ms; server success visible ≤1 s after response. |
| Counter receipt | Preview usable ≤1 s after response; toolbar feedback p95 ≤100 ms; 58/80 mm preview does not reflow continuously; QR/100 lines readable with bounded document rendering. OS dialog/hardware time excluded. |

Also record long tasks, DOM size, request counts and a 60-second idle trace.
No hidden/history-collapsed refresh of a full history list solely to repaint a
status badge. No more than one in-flight read per logical queue with one trailing
refresh; prefer existing staff Realtime with 100–200 ms debounce, maximum 500 ms
wait under bursts. Never debounce mutations, replay keys or permission checks.
Retain necessary polling/reconnect fallback and urgency alerts; public flows
continue using validated endpoints/polling, not direct Supabase subscriptions.
Any backend health-summary redesign is separately scoped, not assumed free here.

Isolate elapsed labels and memoize grouping/rows; an idle minute clock must not
resort every order each second. Paginate history; window/virtualize long active
lists only with accessible reachability and no dropped work. Current SQL keyset
paging remains intact; DOM windowing is a different concern. Avoid new heavy
list/chart/motion dependencies without a measured need and approval.

Use local menu thumbnails, dimensions/aspect ratio, lazy loading below fold,
no remote asset/font request. Initial public catalog should not eagerly load
hidden pages. Source-image size and local image endpoint changes require separate
measurement/approval if presentation alone cannot meet the budget.

CPU throttling is not a weak-GPU, 4-GB whole-notebook or physical-touch guarantee.
Record actual host, build, fixture, sample count and browser version. No new
measurement or browser acceptance is claimed by this foundation document.
