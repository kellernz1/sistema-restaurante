# Mesa Certa redesign roadmap — foundation only

Date: 2026-10-28. Branch: `redesign/ui`. Phase 1 delivers documentation and a
DESIGN.md contract only. No application implementation is authorized by this
file. Approval is required before phase 2.

## Navigation proposal: one working space per role

Reuse current routes and authorization. Navigation is a presentation projection
of existing effective roles/service modes, never the access-control boundary.
Do not broaden supervisor, waiter or public permissions. No new SQL, financial
endpoint, order state or license mode is needed for this proposal.

| Role | Primary operating space | Secondary destinations |
| --- | --- | --- |
| Cashier | **Balcão** `/cashier/counter`; **Prontos** (ready section of `/cashier`); conditional **Mesas / Confirmar QR** (other sections of `/cashier`); **Pedidos** `/orders` | **Meu caixa** `/cashier/sessions`, always one navigation away. Account: language, theme, sign out. Health indicator opens authorized print detail; unresolved alerts remain visible. |
| Kitchen | **Cozinha** `/kitchen`, three production stages, sound/refresh | Own account preferences; authorized print/cancellation detail. No cash-session, cashier or administration menu. |
| Supervisor | **Aprovações** `/supervisor`, order review and own PIN | Own account/preferences. No turn report, money collection or refund execution. Approvals remain on the requesting cashier's device where currently required. |
| Administrator | Can explicitly switch between **Operação** (same cashier/kitchen destinations) and **Administração** `/admin` | Administration groups below. Keep the current route override only; do not assume it supersedes narrower server guards. |
| Enabled waiter | **Mesas** `/waiter`; table detail; allowed **Pedidos** `/orders` | Service calls and own account. Hidden/inactive waiter mode stays enforced. |
| Public customer | Table: categories → products → floating cart → submit/status. Offsite: type → catalog → cart → data/payment intent → tracking. | Language/theme in header/menu; attendant/bill actions for table flow stay reachable. No staff chrome or administrative links. |

There is no standalone ready route now. Initially use sections/anchors or a
safe view query on `/cashier` without changing data-loading/permission semantics.
Do not accidentally mount two CounterQueues or two print processors when
composing desktop/mobile views. Existing general launch `/cashier/orders/new`
remains reachable from appropriate table/pickup/delivery context, explicitly
distinct from the atomic counter editor. Do not combine their submission handlers.

Desktop: compact labeled operational navigation; an administrator's secondary
space can use a 216–232 px labeled rail. Do not permanently spend that width on
the kitchen's three columns. Tablet/mobile: labeled workspace choices and an
accessible secondary menu; no ten-link header, icon-only mystery navigation or
two overlapping sticky tab bars. Keep current session/status near the operating
header. Account preferences replace floating staff controls where feasible;
public cart remains the primary floating shortcut and must cover nothing.

### Secondary administration, grouped by subject

| Group | Existing destinations / content | Rule |
| --- | --- | --- |
| Overview | `/admin` summary and operational health | Concise counts and net payment-business-day revenue; no new reporting formula. |
| Catalog and service | `/admin/menu`, conditional `/admin/tables/qr`; settings Atendimento and Balcão | Menu editing, channels, ready thresholds; retain independent enablement switches. |
| Money | `/admin/reports`, permitted session inspection via `/cashier/sessions`; settings payments/FX and cash policy | Reports are secondary; opening/closing own cash remains quick operational access. |
| People and security | `/admin/settings/employees`, `/admin/settings/security`, `/admin/audit` | Personal PIN and policy clearly distinct; audit stays admin-only. |
| Restaurant and delivery | Name/contact country, timezone/cutoff, location, delivery/pricing, WhatsApp | Presentation grouping only. No duplicate sources of truth or changes to saved meaning. |
| Installation and support | Settings printing and backup/services; `/admin/settings/license` | License, backup and printing status with scoped saves and safe next steps. Recovery warnings also surface operationally when required. |

Use local section links/deep links before introducing routes. A route restructure,
if later justified, needs redirect/back-navigation acceptance; it must not change
guard prefixes or expose data to another role. Existing panel save boundaries
remain independent and clearly labeled, e.g. payments save versus general
restaurant save. Theme/logo customization is future scope; only semantic token
slots are planned now.

## Three levels of screens

| Level | Screens/views | Sequence |
| --- | --- | --- |
| 1 — continuous/daily | Counter launch, ready list, kitchen, cash opening, cash closing, payment modal/editor, counter receipt | Stabilize shared shell and primitives, then one view per step. |
| 2 — frequent but contextual | Orders hub/detail with discount/refund dialogs; general staff order entry; public offsite catalog/checkout; table QR/catalog/cart; tracking; QR confirmation queue/service calls; enabled waiter tables | Preserve financial/approval/uncertainty stages; improve hierarchy and compactness after level 1. |
| 3 — management | Admin summary, menu/QR management, daily reports, audit, employees, security/PIN, settings, license, backup/services, printing history/configuration, shift report/history | Group subjects and scoped save feedback after operational paths are accepted. |

Login/access/error/loading are cross-cutting, not a new fourth level. Isolated
print-job/kitchen/session-report previews follow the receipt toolbar/accessibility
pattern without changing document generation. Simulator is development-only and
not part of restaurant navigation. Alerts from level 3 still appear at level 1
when relevant; moving a management panel must not hide a real failure.

## Shared level-1 acceptance protocol

Touch counts use the exact definitions/starting assumptions in `ux-audit.md`.
They are target maxima for the named simple fixture, not every possible order.
No budget removes a mandatory approval, reason, blind-count rule, manual refund
confirmation, session requirement or uncertain-operation recovery. Native select
costs two taps, field focus one; typing/scrolling separately recorded. Test both
keyboard and touch. Preserve item notes and request bindings across navigation.

At 1366×768, 768×1024, 390×844, plus 320 px reflow and 200% zoom: no page overflow,
no clipped label/amount, no footer over focused input, no preference/cart overlap.
Test pt-BR and Spanish (including ≥30% expanded labels), light/dark/automatic,
reduced motion, long product/customer names, many items and pending/error states.

All targets ≥44×44 px; cashier primary and kitchen group actions ≥52 px tall
(prefer 56); money and critical inputs ≥16 px text. Follow DESIGN.md theme pairs,
focus, modal and motion contracts. Test with installed Edge at CPU rate 4 in an
owned disposable stack. Sample 30 warm interactions for p95; report cold routes
separately. Byte ceilings and measurement semantics are in DESIGN.md; values
below are proposed acceptance, **not results of this documentation phase**.

### 1. Counter launch — what is the next item and amount to receive?

```text
[Restaurant / Balcao | Prontos n | Pedidos | Meu caixa: open | Account]
[Visible unresolved operational/printing/license warning, only if needed]
[Search product________________]             [Current order        n]
[All | category | category]                  [Optional calling name]
[Product name       Gs. 25.000] [Product]     [2 x item      amount]
[Product name       Gs. 18.000] [Product]     [-  quantity  +  Remove]
[Visible result/action feedback]             [Item note, expandable]
                                             [Discount / net summary]
                                             [Payment lines]
                                             [Total Gs. ...]
                                             [Create and pay order]
```

Mobile uses the same catalog and a persistent order/total shortcut to the draft;
the draft view has a scrollable body and visible total/submit. This is a proposed
presentation; keep the current single state owner so closing it does not clear
cart, approvals or uncertain UUIDs.

- Max taps: exact cash **2**, cash with tender **3**, Pix **4**, cash/Pix split
  **6**, under baseline assumptions. Opening category/page adds one; preserve
  existing category memory and search/Enter semantics. Do not add a confirmation
  just to imitate marketing checkout.
- Search and first results, cart count, net total and primary submit visible on
  desktop. Name/notes/discount secondary; configured pay-at-end stays clear.
- Components: workspace nav, SearchField, category group, ProductButton,
  OrderLine/Stepper/Notes, CounterDiscount presenter, PaymentLine, StickyTotal,
  InlineStatus. Keep domain handlers in `features/counter`.
- CPU-4×: add/edit/search-to-paint p95 ≤100 ms, no interaction task >200 ms,
  usable ≤2 s after route response. JS ceiling 1,050,000 decoded / 310,000 encoded.
- Risks: cart edits invalidating a grant; unmount losing recovery; Enter adding
  wrong-looking result; mobile keyboard hiding total; full catalog DOM. Test
  invalidated quote, stale price, unavailable product and uncertain submit.

### 2. Ready queue — who can be handed over now?

```text
[Prontos para chamar 20] [Updated / Refresh]
[SENHA 24        optional name] [Paid]
[Ready 3 min | Attention]      [Mark delivered]
[Receipt]                     [Other permitted actions]
[SENHA 25 ...]
[In preparation count / expand]
```

- Max taps: call aloud **0**, mark paid ready order delivered **1**; navigate
  from counter **+1** if ready list is not already in view. Unpaid → existing
  payment flow, never silent delivery. No new "called" database state.
- Largest ticket 36–48 px, optional name ≥20 px, wait/status ≥16 px; oldest first.
  Distinguish ready wait from preparation wait, and paid from ready.
- Components: ReadyOrderCard, TicketIdentity, WaitLabel, StatusBadge,
  primary handoff action, secondary receipt/exception actions.
- CPU-4×: busy feedback p95 ≤100 ms; result visible ≤1 s after response; 20 ready
  rows must not all rerender each second. Shared cashier byte ceiling applies.
- Risks: timer-driven reordering, duplicate delivery click, payment-required
  accounts, old-business-day active tickets. Preserve complete paged fetches.

### 3. Kitchen — which complete order should be prepared next?

```text
[Kitchen | Connection | Print warning if any] [Sound] [Refresh]
[Urgent cancellation notice with order and items]
[Received n]           [Preparing n]            [Ready n]
[SENHA 24 / name]      [SENHA 21 / name]        [SENHA 20]
[2 x product]          [Product + notes]        [Product]
[NO ONION]             [Wait 5 min]             [Ready]
[Start order]          [Mark all ready]
[Per-item controls available, secondary]
```

- Max taps: received → preparing **1**, preparing → ready **1**. Both stages
  remain; do not bypass the existing state machine. Existing per-item controls
  remain accessible, not mixed indistinguishably with whole-order actions.
- Ticket ≥36 px; quantities/items/notes 20–24 px; group button 56 px. At narrow
  widths stage navigation must preserve all counts/items and selected stage.
- Components: ProductionColumns, KitchenOrderCard, TicketIdentity, ItemNotes,
  WaitLabel, CancellationNotice, ConnectionStatus. Do not replace typed queries.
- CPU-4×: action feedback p95 ≤100 ms; acknowledged column update ≤1 s after
  response; incoming queue change ≤1 s after received Realtime event. Initial
  JS ≤900,000 decoded / 265,000 encoded. Keep current query/paging performance.
- Risks: lost focus on Realtime, group/per-item race, incomplete pages, old
  cancelled items reappearing, confusing ready wait. Retain uncertain action
  recovery. Physically verify readability at 1.5–2 m; not certified by screenshots.

### 4. Open cash — which operator/session will receive money?

```text
[Meu caixa | Closed | Operator name | Business day]
[Open cash]
[Initial fund (Gs.) ___________]
[Rule/license warning if required]
[Open cash]   [Return to counter]
```

- Max taps **2** on form (fund focus, open); **3** including navigation. Default
  zero must not be invented to bypass explicit input or session exclusivity.
- Operator, day and submitted fund visible; main action ≥52 px. Do not show
  another operator's session as available for payment.
- Components: SessionHeader, AmountField, InlineAlert, ScopedSubmit.
- CPU-4×: input p95 ≤100 ms, result ≤1 s after response, usable ≤2 s after route
  response. Provisional parent cashier JS ceiling until baseline measured.
- Risks: opening twice/two tabs, shared drawer rule, license safe-boundary refusal,
  retained uncertain command. Preserve existing server ownership/idempotency.

### 5. Close cash — how much was physically counted?

```text
[Own open session / operator / opening time / business day]
[Counted cash (Gs.) __________]
[Expand denominations (optional)]
[Closing observation_________]
[Unpaid order warning/list, per current availability]
[Confirm closure] [Back]
After success:
[Counted | Expected | Difference] [Report / Print]
[Events with operator names and reason]
```

- Max taps **2** on selected own form, **3** including navigation; optional
  denomination/name/note fields add taps. Do not add a new quote/save stage.
- Keep counted field and submit in the main task flow; no expected amount before
  existing blind-count policy permits it. Do not display hidden report data just
  because it exists in a client object. Unpaid orders warn without blocking.
- Components: SessionHeader, CountForm, DenominationDisclosure, CloseSummary,
  UnpaidWarning, ReportView. Movement/sangria remains a distinct sibling task,
  not the primary close action.
- CPU-4×: editing p95 ≤100 ms; 100-event closed report visible ≤1 s after response.
  Parent cashier JS ceiling provisional. SQL stress-report outlier is separately
  documented; do not alter financial aggregation in a visual phase.
- Risks: accidental close, loss of count on rerender, exposing expected cash,
  double close, historical snapshot alteration. Admin reopening remains audited
  with required reason; never allow cosmetic editing of a closed session.

### 6. Payment modal — what remains, how is it paid, what is the change?

```text
              [Mesa/order/ticket]            [Close]
              [Total Gs. ...]
              [Remaining | After these lines]
              [Line 1: Method | Currency]
              [Allocation Gs. | Converted amount]
              [Tender if cash | Change Gs.]
              [Line 2 ... / Add payment]
              [Current rate / historical payment summary]
              [Inline error or original-request recovery]
              [Cancel] [Add line] [Register payments]
              [Pix/manual confirmation disclaimer]
```

- From selected table flow: exact cash max **4** including table/close/add/submit;
  Pix **6**, split **8** under audit assumptions. Do not silently add a payment
  line as a visual change to reduce this count. Counter draft retains its own
  configured initial line and atomic create/pay label.
- Modal centered on desktop, fitted on phone; header/total and footer visible,
  body scroll only, minimum 44 px remove and 52 px submit, 16 px inputs. Preserve
  all row/currency choices actually allowed, including cash PYG-only restriction.
- Components: ModalFrame, PaymentSummary, PaymentLine, AmountField, InlineError,
  ActionFooter. Share presentation with `payment-draft.tsx`, not ledger state.
- CPU-4×: usable within 300 ms with loaded config, or ≤1 s after required config
  response; edit/change p95 ≤100 ms. First-open lazy bytes counted, parent cashier
  ceiling applies to complete mounted flow.
- Risks: stale bill/rate, underpayment, duplicate payment, modal close during
  submission, uncertain result, stolen focus. Preserve all existing locks,
  fingerprint checks and request replay. Pix is not bank-confirmed by the app.

### 7. Counter receipt — did the sale finish and how can the operator return?

```text
[Back to counter] [Print receipt] [Queue/result status]  <- screen only
                  RESTAURANT
                   SENHA 24
                   optional name
                  items / notes
                  discount / total
                  original payments / historical FX
                  QR tracking / date
                  non-fiscal disclaimer
```

- Max taps from successful order: open receipt **1**, request print **+1**,
  return to counter **1**. Reprint review and native OS dialog are separate,
  existing safety steps, not removed from the design.
- Toolbar outside paper; paper preview stays white/readable in both screen
  themes. Verify 58/80 mm preview; no toolbar or preferences in print stylesheet.
- Components: current ReceiptPrintButton, PrintRequestButton, PrintDocumentView;
  standard toolbar/feedback presentation only. Keep generator/snapshots unchanged.
- CPU-4×: preview usable ≤1 s after response, toolbar feedback p95 ≤100 ms with
  up to 100 lines. Provisional JS ceiling 900,000 decoded / 265,000 encoded until
  its own baseline; review separate byte target in DESIGN.md.
- Risks: printing twice on ambiguity, archived job actions, losing return path,
  snapshot/document changes. File/browser previews do not validate thermal
  hardware, accents/codepage or silent printing; those remain block 4B.

## Shared component inventory and ownership

Names below are planned presentation roles, not files created by phase 1.

| Existing location | Reuse / proposed extraction | Boundary to preserve |
| --- | --- | --- |
| `src/components/ui.tsx` | Buttons/links, status pill, segmented group; evolve flat panel/title pattern rather than duplicating a kit | Avoid a new all-client UI barrel/provider; Server Components default |
| `src/features/auth/staff-shell.tsx` | Role navigation, account menu, compact operational status | Existing AuthProvider, effective modes, server guards and worker mounting |
| `src/features/cashier/cashier-navigation.*` | One cashier workspace navigation | Existing routes, responsive focus and draft continuity |
| `src/features/counter/counter-desk.tsx`, `payment-draft.tsx` | Product button, order line/stepper, sticky total, draft payment visual row | Atomic create/pay/discount and exact pending payload |
| `src/features/payments/payment-panel.tsx`, `cashier/bill-detail.tsx` | Payment row/summary/footer and modal frame | Existing-order ledger/history and bill fingerprint validation |
| `src/features/counter/counter-queue.tsx`, `kitchen/kitchen-board.tsx` | Ticket identity, isolated wait label, order notes/status | Separate production vs ready clocks; group/item state semantics |
| `src/features/cash-sessions/*` | Session header, count/movement form groups and report rows | Blind count, session ownership, immutable report snapshots |
| `src/features/approvals/*`, `refunds/refund-actions.tsx` | Accessible dialog presentation and inline PIN feedback | Separate quote/authorize/execute, PIN never persisted, manual return confirmed |
| `src/features/customer-ordering/*`, `src/components/product-*` | Existing paginated catalog/cart, thumbnail and quantity controls | Validated public endpoints, table request access token, phone selection, retained cart |
| `src/features/printing/*`, `counter/receipt-print-button.tsx` | Compact status, details/history, isolated preview toolbar | One processor lifecycle, all alerts, explicit uncertain review, no automatic resend |
| `src/features/settings/*`, `operations/*`, `licensing/*` | Subject navigation, scoped save/error, common status/empty presentation | Separate config save commands, license/backup security boundaries |
| `src/app/globals.css`, `screen-theme.css`, feature CSS | Semantic tokens then gradual scoped adoption | Preserve print CSS and both themes; no broad global selector rewrite |

Keep data fetch/permission/transaction code in its current feature boundaries.
Share pure display only after listing each caller's different lifecycle. Do not
merge table/offsite/counter order creation as a cosmetic refactor. No dependency
installation, component code or backend refactor is included in this roadmap.

## Small execution phases after approval

| Phase | Deliverable / constraint | Verification before next phase |
| --- | --- | --- |
| 1 — this change | Audit, frozen-rule findings, DESIGN.md, roadmap, AGENTS rule | `check:text`, lint, changed-path review; stop for approval |
| 2 — measurable tokens/primitives | Capture fresh disposable before baseline; contrast, type, targets, states and focus. Scoped adoption without changing routes/financial handlers. | `check:text`, lint, disposable `test:visual`, manual screenshot review; `test:all` for shared UI regression, fresh byte/CPU baseline |
| 3 — navigation and counter | One operational nav, current session/alerts, counter catalog/cart. One view at a time. | Same checks; `test:all`; exact cash, Pix, split, discount invalidation, draft/recovery, all role/mode combinations in disposable target |
| 4 — ready and kitchen | Large tickets, distinct clocks, restrained actions; independently measure render/read coalescing changes. | `test:visual`, `test:all`, completeness beyond 1,000 active items, no old-day loss, group/item concurrency and uncertainty; CPU-4×/idle traces |
| 5 — sessions and payment | Visual opening/count/closing, centered shared modal presentation; preserve differing financial state owners | `test:visual`, `test:all`; blinded count, difference, session locks, discounted/split/refund interactions, focus/keyboard/long Spanish |
| 6 — receipt and level 2 | Screen-only receipt controls, order details, approval/refund dialogs, QR/offsite/client flows | `check:text`, lint, `test:visual`, `test:all`; preview both paper widths; explicit manual device/print acceptance limits |
| 7 — secondary administration | Grouped navigation/settings/report/audit/license/backup presentation; scoped saves | Same checks, permissions/modes and unknown/error/blocked states; no fixture touches development |

Run `check:text` and lint at each small step. Use existing `npm run test:visual`
and `npm run test:all` only through their owned disposable target workflows.
Do not use development credentials, enable printer output or start skill scripts.
Review screenshots in ignored artifacts for both languages/themes; the current
smoke does not cover every proposed modal/role/keyboard state. Extending tests is
future-phase work, explicitly not performed in phase 1. Real financial mutations
must be exercised only with synthetic disposable fixtures and original replay keys.

Any new SQL requirement or change in financial/permission behavior stops the
presentation phase for separate scope/approval; no migration is planned here.
Do not apply migrations, run repair or declare development `db:verify-history`
green from documentation work. Keep the already measured DB improvement and
historical test evidence intact. No migration consolidation.

## Approval decision and remaining evidence

Approve the navigation grouping, level-1 wireframes, contrast/type/target tokens
and provisional performance ceilings before implementation. Then obtain fresh
CPU/bundle baselines in a disposable build; adjust unmeasured-route budgets only
with recorded evidence and explicit exception. Physical kitchen readability,
mobile touch/keyboard, low-GPU paint behavior, sustained multi-terminal operation
and real thermal printing require device acceptance. Phase 1 certifies none of
them. No commit/push, runtime start or functional change is part of this phase.

## Phase-1 validation record

`npm run check:text` passed: 563 UTF-8 files, zero issues. `npm run lint` passed
with exit code 0. `git diff --check` passed (only the existing Git LF/CRLF
normalization warning for AGENTS.md). Changes made in this phase are exactly
DESIGN.md, these three new audit/roadmap documents and one added AGENTS.md rule.
Earlier skill/reference installation changes were present before this phase and
were preserved. No application, test, database, backup, environment or Windows
change; no service start, commit or push. Build, test:all and test:visual were not
run because this is documentation-only; no new runtime/visual result is claimed.
