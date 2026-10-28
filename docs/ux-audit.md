# Mesa Certa usability audit — foundation

Date: 2026-10-28, America/Sao_Paulo. Branch: `redesign/ui`.

## Scope and evidence

This is a source-based audit, not an observed usability test. No services were
started, no installation or backup was read, and no customer/staff operation was
submitted. No screen, component, test, financial rule or database object changed.
The route inventory comes from `src/app/**/page.tsx`; navigation and access were
cross-checked against `src/features/auth/staff-shell.tsx`, `src/lib/auth.ts`,
`src/proxy.ts`, `requireStaff` and the print preview guards. Seeing a menu entry
and possessing permission are separate facts. SQL/RLS remains authoritative.

Applied `$design-taste-frontend` through `references/app-screens.md`: inventory,
one operational question per screen, quiet surfaces, restrained status color,
moderate density and minimal motion. Low variation means one shared component
family, not randomly dealt styles. No script-based style draw, inspector, image
search or screenshot gate was run; these helpers are intentionally absent.
Applied `$web-design-guidelines` using only its frozen local `command.md`;
findings are in [ux-audit-guidelines.md](ux-audit-guidelines.md).

Read the installed provenance, the three local reference documents, the current
operational guides (counter, payments, service modes, sessions, approvals,
refunds, printing), target/integration safety and the performance reports. IBM
suggests explicit data hierarchy; Cal suggests grouped settings; Linear suggests
quiet navigation and dark surface hierarchy. Their marketing examples are not
POS specifications. No brands, proprietary fonts or executable examples are used.

Historical findings are not automatically current defects. In particular,
`docs/performance-db.md` supersedes the old kitchen-query timings and documents
the fixed paging/RLS query work; current counter requests have a revision guard.
`docs/code-health-audit.md` remains the dated frontend baseline, not a new run.

## Current navigation by role

Source: `src/features/auth/staff-shell.tsx:66` and
`src/features/cashier/cashier-navigation.tsx:18`. Enabled service modes modify
visibility. The following describes the current code, not a proposed permission
expansion.

| Role | Main menu currently visible | Additional navigation / global content |
| --- | --- | --- |
| Cashier | Caixa; Balcão when enabled; Pedidos | Within `/cashier*`: Caixa e mesas (or Caixa), Pedido de balcão when enabled, Turnos de caixa. Printing queue, cash-session bar, operational/license alerts. |
| Kitchen | Meu painel → `/kitchen` | Printing queue before kitchen content. No cashier, settings or refund menu. Cancellation notices within kitchen. |
| Supervisor | Meu painel → `/supervisor`; Aprovações → the same route | Personal approval PIN and order review workbench; no financial collection/refund role. |
| Administrator | Meu painel, Caixa, conditional Balcão, Pedidos, Cozinha, Relatórios, Cardápio, conditional QR codes, Configurações, Aprovações | Up to ten destinations; printing and session chrome also on admin pages. Dashboard repeats shortcuts. Settings has another five-entry navigation. |
| Waiter, when enabled | Meu painel → `/waiter`; Pedidos | Table map, table detail and service calls. Disabled waiter mode prevents effective use; historical accounts remain. |
| Public customer | No staff menu | Local category/page controls, floating cart, theme/language, table service actions or offsite checkout steps; tracking link. No staff AuthProvider. |

Settings top navigation: Restaurante, Funcionários, Segurança e aprovações,
Auditoria, Licença (`settings-navigation.tsx`). Restaurante has eight local
sections: Backup e serviços locais, Pagamentos e câmbio, Balcão e dia comercial,
Atendimento, Entrega e taxas, Localização, Impressão, WhatsApp
(`settings-form.tsx:25`). Independent settings panels have independent saves.

## Page and route inventory

All paths below correspond to real `page.tsx` files under `src/app`. Route groups
`(staff)` and `(auth)` are omitted from URLs. API handlers are not user screens;
their operation paths appear in the workflow evidence below.

| URL | Page file below `src/app/` | Intended/effective role and screen |
| --- | --- | --- |
| `/` | `page.tsx` | Redirects to login; authenticated login redirects to role dashboard. |
| `/login` | `(auth)/login/page.tsx` | Staff email/password login; approval PIN is a separate mechanism. |
| `/unauthorized` | `unauthorized/page.tsx` | Access explanation, not an operational workspace. |
| `/cashier` | `(staff)/cashier/page.tsx` | Cashier/admin: ready counter queue; enabled QR confirmation, calls and tables. |
| `/cashier/counter` | `(staff)/cashier/counter/page.tsx` | Cashier/admin: counter launch, draft discount/payment, ready queue. Counter enabled required. |
| `/cashier/orders/new` | `(staff)/cashier/orders/new/page.tsx` | Cashier/admin: general staff entry for table, pickup and delivery; distinct from fast counter. |
| `/cashier/sessions` | `(staff)/cashier/sessions/page.tsx` | Cashier own sessions/movements/close; administrator can inspect permitted other sessions. |
| `/orders` | `(staff)/orders/page.tsx` | Cashier/admin/enabled waiter: orders hub/detail; inner actions retain their own role checks. |
| `/kitchen` | `(staff)/kitchen/page.tsx` | Kitchen/admin: grouped preparation board, item/group actions, cancellation warnings. |
| `/supervisor` | `(staff)/supervisor/page.tsx` | Supervisor/admin: personal PIN and sensitive-action workbench. |
| `/waiter` | `(staff)/waiter/page.tsx` | Enabled waiter; admin route override: table map and service calls. |
| `/waiter/tables/[tableId]` | `(staff)/waiter/tables/[tableId]/page.tsx` | Table order entry, still subject to effective mode/RLS permissions. |
| `/admin` | `(staff)/admin/page.tsx` | Administrator: counts, payment-business-day revenue, operations panel. |
| `/admin/menu` | `(staff)/admin/menu/page.tsx` | Administrator: products, photos, price and availability editing. |
| `/admin/tables/qr` | `(staff)/admin/tables/qr/page.tsx` | Administrator: table codes, only while table service enabled. |
| `/admin/reports` | `(staff)/admin/reports/page.tsx` | Administrator: business-day report. |
| `/admin/audit` | `(staff)/admin/audit/page.tsx` | Administrator: filtered immutable audit timeline. |
| `/admin/settings` | `(staff)/admin/settings/page.tsx` | Administrator: eight restaurant/operations settings sections. |
| `/admin/settings/employees` | `(staff)/admin/settings/employees/page.tsx` | Administrator: employees and roles. |
| `/admin/settings/security` | `(staff)/admin/settings/security/page.tsx` | Administrator: policy and personal approval PIN. |
| `/admin/settings/license` | `(staff)/admin/settings/license/page.tsx` | Administrator: license state/import/renewal. |
| `/print/counter/[orderId]` | `print/counter/[orderId]/page.tsx` | Cashier/admin via `OrderPrintPreview`, receipt preview; isolated from staff shell. |
| `/print/kitchen/[orderId]` | `print/kitchen/[orderId]/page.tsx` | Kitchen/cashier/admin/enabled waiter via preview guard and SQL: kitchen document. |
| `/print/jobs/[jobId]` | `print/jobs/[jobId]/page.tsx` | Kitchen/cashier/admin: authorized immutable document snapshot. |
| `/print/cash-session/[sessionId]` | `print/cash-session/[sessionId]/page.tsx` | Cashier/admin, authorized closed session report. |
| `/order` | `order/page.tsx` | Public pickup/delivery checkout, also reached from WhatsApp link. |
| `/t/[token]` | `t/[token]/page.tsx` | Public table QR/NFC, valid current token and service mode required. |
| `/track/[token]` | `track/[token]/page.tsx` | Public sanitized order tracking via non-guessable token. |
| `/dev/whatsapp` | `dev/whatsapp/page.tsx` | Local/mock-only simulator gated by `mockAllowed`; not a production role destination. |

Layouts also provide staff loading/error boundaries (`(staff)/loading.tsx`,
`error.tsx`) and common preference controls (`layout.tsx`). No standalone ready,
backup, printing-settings or payment page exists: these are embedded views. No
dedicated license/customer account menu exists for the public customer.

## Interaction counts: current implementation

These are reproducible source walkthroughs, **not measured human task times**.
One tap means one button activation or focusing one editable field. Typing the
field's contents is not counted as individual key presses; required fields are
listed. A native select costs two taps (open + choose). Scrolling, login, scanning
the QR, network waits, optional notes and OS print dialogs are excluded. Each
extra product costs one tap; changing category/page adds one each. Starting state:
authorized, healthy, enabled mode, open session, valid rate, first payment method
cash, one visible product and no recovery request. Other configurations add steps.
"View" means a page or a materially different dialog stage, not a React render.

| Job / start | Tap sequence and minimum | Pages / views | Source and caveats |
| --- | --- | --- | --- |
| Counter + exact cash, `/cashier/counter` | Product 1 + create/pay 1 = **2**. Tender above total: focus received field +1 = **3**, then type amount. | 1 page, editor → success (2 views) | `counter-desk.tsx`, `payment-draft.tsx`. Blank tender uses exact amount. Cash not first: method selection +2. No printer invocation included. |
| Counter + Pix | Product 1 + method select 2 + create/pay 1 = **4** | 1 page, 2 views | Same files. BRL/calculated amount shown; manual confirmation of real-world receipt remains the operator's job, not automatic Pix settlement. |
| Counter + split cash/Pix | Product 1 + focus first allocation 1 + add line 1 + second method select 2 + submit 1 = **6** | 1 page, 2 views | Enter partial Gs; second line defaults to remaining. Cash change adds one field focus. Configuration/invalid drafts may prevent submission. |
| Settle a table from `/cashier` | Table 1 + Fechar conta 1 + Adicionar pagamento 1 + register 1 = **4** exact cash; Pix **6**; split cash/Pix **8** | 1 page; bill → payment modal → result | `cashier-board.tsx`, `bill-detail.tsx`, `payment-panel.tsx`. PaymentPanel initially has zero lines, unlike counter. Split adds one allocation focus, one added line, two method taps. |
| Call ready ticket, ready list visible | Read ticket/name and call aloud: **0** system taps; mark delivered **1** when ready AND paid | 1 view; removed on success | `counter-queue.tsx`. There is no electronic "called" state. Unpaid ticket instead opens payment; do not remove that requirement. From counter to list on `/cashier`: +1 navigation if needed. |
| Counter discount before payment | Add discount 1 + amount focus 1 + reason focus 1 + quote 1 = **4** admin; cashier adds approver select 2 + PIN focus 1 + authorize 1 = **8** | 1 page; collapsed → form → PIN/result | `counter-discount.tsx`. Default fixed Gs; percentage +2. Cart submit is additional; cart changes invalidate grant. |
| Discount existing selected order | Open actions 1 + amount focus 1 + reason focus 1 + quote 1 + confirm 1 = **5** admin; cashier adds approver select 2 + PIN focus 1 = **8** | Base detail + dialog form + quote/PIN = 3 views | `sensitive-actions.tsx`. Default action discount. Opening the order from a list +1; percentage +2. Approval is server-dependent. |
| Cancel and refund selected paid order | Open refunds 1 + reason focus 1 + quote 1 + manual-return checkbox 1 + register 1 = **5** admin; cashier adds approver select 2 + PIN focus 1 + authorize 1 = **9** | Detail + form + quote + optional authorized/manual-return stage = 3–4 views | `refund-actions.tsx`. Partial refund adds action select 2 + amount focus 1: **8/12**. Actual external money return is outside tap count and must not be automated or repeated on uncertainty. |
| Close shift from `/cashier` | Turnos link 1 + counted-cash focus 1 + confirm 1 = **3** | 2 pages, open form → closed report | `cashier-navigation.tsx`, `sessions-panel.tsx`. One required counted amount; notes optional. From already selected own session: 2 taps. Denomination expansion/counts add taps. No extra confirmation dialog currently. |
| Open shift on sessions page | Opening-fund focus 1 + open 1 = **2** | 1 page, 2 views | `sessions-panel.tsx`. Session exclusivity and licensing can refuse; no redesign bypass. |
| Kitchen group ready | Preparing group: Marcar tudo como pronto **1**; received group: Iniciar pedido 1 then mark ready 1 = **2** | 1 page; column changes, no dialog | `kitchen-board.tsx`, atomic `/api/staff/orders/[id]/kitchen`. Per-item alternative also exists; failed/uncertain operations are separate recovery paths. |
| Customer table QR order | Add product 1 + floating cart 1 + name focus 1 + send 1 = **4** | 1 page; catalog → cart → sent/tracking | `table-menu.tsx`, `menu-cart.tsx`, `floating-cart.tsx`. Name required, default phone optional/off. Required phone adds 1 focus; country change +2. Send creates a request, not guaranteed immediate kitchen approval. |

Do not present these minima as upper bounds for arbitrary carts or disabled modes.
At 390 px the location of an offscreen control may require scroll gestures, which
must be counted separately in the later device study. Keyboard users can use
search/Enter on counter; actual focus order and IME behavior need browser testing.

## Findings and severity

Severity: **high** delays a daily task or risks a financial/action misunderstanding;
**medium** increases search, missed feedback or accessibility barriers;
**low** is a secondary consistency issue. Source-confirmed means the code contains
the mechanism. Risk means its actual geometry/frequency is not measured here.

| ID | Severity / evidence | Finding and proposed presentation correction |
| --- | --- | --- |
| U01 | High; `staff-shell.tsx`, `cashier-navigation.tsx` | Main and cashier navigation repeat Caixa/Balcão; admin has up to ten top-level links. Supervisor repeats the same destination. Separate operating workspace from a secondary administrative space; preserve route guards. |
| U02 | High; `staff-shell.tsx:98`, `print-queue.tsx` | Printing queue precedes every kitchen and multiple admin/cashier views, with activation/history/debug text. This competes with the main job even when healthy. Propose compact health indicator with persistent actionable failure/uncertain alerts; history and configuration stay reachable. Browser processor behavior must survive moving its presentation. |
| U03 | High; `sensitive-actions.tsx:69` versus `refund-actions.tsx:23` and `bill-detail.tsx` | Sensitive dialog declares modal ARIA but lacks the explicit focus containment, Escape handling and return-focus lifecycle present in refunds/native payment dialog. Standardize accessible modal presentation without changing approval stages or disabled rules. |
| U04 | High; `payment-panel.tsx:17`, `payment-draft.tsx:25` | Counter starts with a payment line; existing-order settlement starts empty. Same task has differing layouts and button names. Use shared visual payment-line/summary presenters; preserve distinct atomic create-and-pay versus later-ledger paths and recovery UUIDs. |
| U05 | High; `counter-desk.tsx:110`, `payment-draft.tsx` | Cart combines identification, per-item notes, discount and payments inside one long body. Desktop footer is already outside the scroll region (do not report the old overlap as still broken). Reduce visual repetition, retain amount/submit visibility and reveal optional sections progressively. Test narrow heights and virtual keyboard. |
| U06 | High accessibility; `screen-theme.css:12,69` | Current blue `#0071e3` has 4.70:1 on white but only 4.31:1 on page `#f5f5f7`, below normal-text AA when used as link there. Proposal: distinct darker light-theme link token, preserve blue button on white text. See DESIGN.md for calculated pairs. Actual translucent/composited colors still need browser verification. |
| U07 | Medium/high accessibility; `counter.css:27`, `print-queue.css:16,42`, `bill-dialog.css:28` | Declared control minima include 42 px stepper width, 42 px print filters/actions, 36 px payment removal. Other global minima can win some cascade cases; no universal 44×44 guarantee. Require computed rectangles and a 44 px floor, 52–56 px primary cashier actions. |
| U08 | High performance risk; `kitchen-board.tsx:122`, `counter-queue.tsx:32`, historical H05/H06 | Whole boards tick each second while displayed wait is in minutes; event bursts refetch complete queues. Isolate clocks/memoize grouping and coalesce only UI reads in future, preserving thresholds, reconnects and exact operation replay. No SQL change needed for this design proposal. |
| U09 | Medium/high; `print-queue.tsx:29`, H03 in code-health audit | Collapsed print history still polls every 5 s; hiding panels alone will not reduce cost. Separate essential health from history rendering; measure polling floor. Changes to health APIs/worker behavior require a separate approved scope. |
| U10 | Medium; `kitchen-board.tsx:244`, `screen-theme.css:169` | Counter ticket is in the small header span while the customer name is the h3; product text competes with per-item and whole-order buttons. Propose ticket 36–48 px and item/notes 20–24 px. Distance readability is unverified; test 1.5–2 m on actual kitchen screen. |
| U11 | Medium; `settings-form.tsx:25,106,139`, `settings-navigation.tsx` | Two navigation layers; identity/day grouped with counter; service modes spread across delivery/WhatsApp/operations; nested panels save independently of main save bar. Group by subject and label save scope. Do not merge policy transactions or discard unsaved form state. |
| U12 | Medium; `theme-picker.css:3`, `lineup.css:55`, `counter.css` | Global fixed preferences and floating cart/footer need coordinated space on every viewport. Current QR already has a floating cart and six-product category pagination; do not reinvent them. Move preferences to account/header presentation; recheck safe areas, zoom and keyboard without claiming a new overlap has been observed. |
| U13 | Medium; `screen-theme.css:42,122`, `lineup` dashboard | Large 36–60 px page headings, 56 px top padding and decorative metric cards consume operational viewport. Use 24–28 px working titles and compact data bands; reserve large numerals for ticket/amount. |
| U14 | Medium; `staff-shell.tsx:66`, `settings-form.tsx:43`, `menu-cart.tsx:25` | Most top links lack current-location markers; settings/category/page state mostly lives locally. Improve current-location cues, safe deep links for non-sensitive filters and return navigation. Never serialize PINs, grants or private financial payloads into URLs. |
| U15 | Medium; `sessions-panel.tsx:34`, `bill-detail.tsx:117` | Session selector can expose operator UUIDs; table close dates hardcode Brazilian timezone/locale despite Paraguay business day. Propose human-readable operator identity and configured date display. Do not reinterpret stored business dates or financial reporting periods. |
| U16 | Medium; `counter-desk.tsx:107` | Unconditional search autofocus may summon a mobile keyboard; Enter adds first filtered item even with multiple matches. Keep existing Enter semantics in this scope, make the first result visually explicit and only autofocus on suitable desktop context in a later approved UI phase. |
| U17 | Medium; `ProductPhoto` and `customer-catalog.css:25` | Image rendered at 1200×900 unoptimized even when CSS thumbnail is 44–56 px; descriptions as small as 12 px / one line. Propose bounded local thumbnails and readable expanded product text; endpoint/image processing work is a separate approval if required. |
| U18 | Medium; `bill-detail.tsx:112`, `refund-actions.tsx:54`, `counter-queue.tsx:54` | Sensitive and refund entry points compete with ordinary receipt/handoff actions. Put financial exceptions in a clearly named secondary actions group while preserving discoverability, explicit confirmation and manual-return warning. Never hide an unresolved request. |
| U19 | Medium; `src/features/counter/counter-desk.tsx:113`, `src/features/counter/domain.ts:1` | Optional calling-name input permits 120 raw characters, while the shared normalizer rejects over 30 normalized characters. Explain the real limit next to the field and align presentation validation in a future phase without weakening the server rule or changing Unicode normalization. |

## What is already useful and must survive

- Whole-Gs formatting and historical BRL/rate information are centralized.
- Counter drafts, uncertain UUID replay, cart approval invalidation and sticky
  submission footer already exist; these are not redesign inventions.
- Kitchen orders are grouped and group actions atomic; ready-column elapsed
  preparation timer is already hidden. Counter ready wait is a different clock.
- Table QR catalog is already paginated by category; floating dialog retains
  draft, name, contact and request status. Public flows use server endpoints.
- Payment/refund/printing uncertainty, lockout feedback, mandatory reasons, blind
  cash count and permission blocks must remain visible and authoritative.
- Automatic and explicit themes, system font and reduced-motion rules exist.

## Acceptance gaps and priority

First: U01–U05, U06–U07 and U10 (navigation, financial clarity, modal access,
usable targets and readable production tickets). Next: U08–U09 with measured
request/render traces. Then U11–U18 incrementally, retaining stable labels.

No live contrast scan, actual touch count, keyboard trap exercise, screen-reader
test, low-GPU measurement, print-output test or new CPU-throttled run happened
in this documentation phase. Screenshots from historical checks are dated
evidence, not approval of the proposed design. Proposed budgets and wireframes
are in DESIGN.md and [redesign-plan.md](redesign-plan.md); implementation awaits
explicit approval.
