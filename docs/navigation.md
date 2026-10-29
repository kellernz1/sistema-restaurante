# Staff navigation — redesign phase 3A

Scope: shell, account/preferences, operational status and existing-destination
links. No internal counter/kitchen/ready/payment layout, API, RLS, migration,
authorization or financial handler change. No route or guard prefix changed.

## Effective destinations

| Role | Workspaces | Header / secondary access |
| --- | --- | --- |
| Cashier | Counter and Ready when counter enabled; Tables and Confirm QR when table QR enabled; Orders | My cash always one link; own account; printing status/detail |
| Kitchen | Kitchen only | Own account and authorized printing status/detail; no cash session |
| Supervisor | Approvals only | Own account; no cashier/admin/printing access added |
| Administrator | Explicit Operation / Administration switch; operation includes cashier and Kitchen | Own cash/account/status; Approvals under People and security in the six grouped administration subjects |
| Waiter enabled | Tables and permitted Orders | Own account |
| Waiter disabled | No operating destinations; existing disabled-service explanation | Own account; server/API/RLS restrictions unchanged |
| Public | Existing customer flow only | Existing public language/theme and cart; no staff auth or navigation |

`navigation.ts` is a visual projection, never an access check. AuthProvider,
`proxy.ts`, server `requireStaff`, service-mode enforcement and database RLS keep
their authority. A hidden link does not grant or revoke access. In particular,
the existing proxy redirects forbidden staff routes; disabled waiter routes can
return their friendly shell, while API/RLS deny the actual work/data.

## One responsive shell

One destination navigation DOM, one labeled disclosure on tablet/phone, visible
labels on desktop, current-location markers, keyboard Escape and focus return.
No second cashier tab bar. Account contains language, theme and sign-out, using
the existing pickers/storage/cookies. Root preferences render on public/nonstaff
routes only; public pages never acquire AuthProvider. No new dependency, remote
asset, font, CDN or skill executable.

The single header's ResizeObserver maintains the existing counter sticky-offset
variables. Menus are flat, focus-visible and at least 44px. Expanded navigation
scrolls within its own bounded area on smaller screens. No blur/animation or
second fixed bar. The account is a native disclosure, not a financial modal.

CashSessionBar retains its original authenticated request, 15-second refresh and
cash-session/focus events, but lives once in the header. It shows own session,
opening time and current configured business-day display. An open prior-day
session additionally names its stored business date. The display projection is
not used to create orders, sessions or financial reports; PostgreSQL remains the
source of truth. Unknown/error state is never shown as a confirmed closed cash.

PrintQueue remains mounted once in its existing content location. A stable callback
projects its existing response into the header's status link; no second queue,
processor or health poll. The link anchors its authorized detail. Pending,
failed/uncertain and stalled warnings, license and backup alerts remain visible.
Separating print history/content is phase 6, not implemented here.

## Anchors, drafts and administration

Ready, QR and Tables use `#cashier-ready`, `#cashier-qr`, `#cashier-tables` on the
existing cashier view, with no new query or duplicate CounterQueue. While already
at counter, Ready points to that page's existing queue: the editor remains mounted.
Header navigation to another route, including My cash, while a counter discount section exists is stopped
with an inline explanation; complete the order or explicitly remove the discount.
This keeps its in-memory PIN/quote/grant owner intact rather than persisting secrets
or silently discarding authorization. Ordinary draft navigation continues through
the existing user-scoped sessionStorage restoration. Pending payload/UUID recovery
is unchanged. Native dialogs already make background navigation inert.

The general `/cashier/orders/new` remains a separate launcher reached from its
existing context; it is not the atomic counter editor.

Administration groups: Overview; Catalog and service; Money; People and security;
Restaurant and delivery; Installation and support. Existing routes and
`/admin/settings#settings-{section}` links are used. Settings reads these hashes,
including history navigation, without replacing its form or save handlers.
Independent payment/cash/service/printing/operations/general saves remain distinct.
The financial navigation caption uses "Dinheiro e pagamentos" / "Dinero y pagos"
so the existing cash payment translation ("Dinheiro" / "Efectivo") is not reused
incorrectly as a subject heading. Payment labels and codes are unchanged.
Local settings section controls update the same safe hash via native replaceState,
keeping current-location markers in sync without reloading or saving the form.
Restaurant name/timezone still live in the existing counter/day panel; no second
editor or duplicate configuration source is introduced. Former settings route
tabs are removed because the grouped menu now supplies those destinations.

## Adding a destination safely

1. Confirm the existing route's server guard, effective mode and RLS; navigation
   is not authorization. A new permission/route requires separate scope.
2. Add the pure destination/group with a stable ID, translated PT/ES label and
   existing local route/anchor; never put private payloads/PIN/grants in URLs.
3. Use the existing navigation link renderer, current-location predicate and
   header-level draft guard. Preserve one lifecycle owner for queues/workers/financial drafts.
4. Add role/mode and direct-server-refusal tests, keyboard/current-location checks,
   text expansion and all responsive/theme/locale captures. Measure CPU4x/bundles.
5. Run check:text, lint, test:visual and test:all only in owned disposable targets.

## Manual acceptance (disposable only)

Run `npm run test:visual` with Docker/installed Edge. Its controller creates,
builds and removes a separate instance; inspect ignored captures/results under
`artifacts/integration/<run>/visual/<timestamp>/navigation-*`.
Spanish navigation captures deliberately append a 30%-length suffix in the test
DOM only to stress wrapping. This is not production copy. The mode/role matrix
uses all eight flag combinations; the expanded visual matrix covers every role,
disabled waiter and public pages across both locales, three themes and four widths.

In a dedicated owned disposable browser session:

1. For every role, compare links against the table; toggle all combinations of
   counter, table QR and waiter flags. Kitchen/supervisor must not acquire money
   or settings links. Check disabled waiter explanation and direct API refusals.
2. On 1366x768, 768x1024, 390x844 and 320px: Tab from skip link, use disclosure,
   Escape and account preferences; check visible focus/current location, no horizontal
   overflow, both languages and automatic/light/dark. Inspect longer Spanish labels.
3. Add a counter item, name, notes and payment draft; visit Ready via the anchor,
   return to the editor, navigate away/back and verify existing draft restoration.
   With discount/PIN in progress, cross-route navigation must stay on the editor;
   no fresh grant, request or payment may be created by navigation.
4. Open administration groups and settings hashes, edit without saving, change
   settings section and verify the existing form stays owned. Save each policy
   only through its original independent button; no financial defaults change.
5. Check print status opens detail, unresolved alerts stay visible, only one queue
   and one processor exist, current session/day agrees with server records around
   cutoff, and the public cart/preferences remain clear of one another.

Physical mobile keyboards, screen readers, low-GPU paint, hardware printing and
long-duration multi-terminal operation still require device acceptance. Automated
matrix evidence and performance results are recorded in redesign-baseline.md.
Final visual evidence: `dc147727e99aea432557471f` passed/cleaned, including
48 mode/role cases, 168 responsive/theme/locale cases, 24 public cases and
96 server/API/RLS refusals, with zero failures. Screenshots were reviewed for
each role, both locales and all four widths; this does not certify physical
devices or assistive technology. Exact run paths and review sample are in the
baseline report.

## Design review boundaries

Used the approved Taste application workflow with low variation/moderate density,
the phase-2 system tokens and the frozen local Web Interface Guidelines. No style
draw, omitted inspector, asset search or third-party executable was run. Navigation
asks one question: which authorized workspace is needed next? The existing Mesa
Certa mark and operator/session scope identify the product; neutral selected links
and restrained status colors keep the header quieter than operational data.

Reviewed source locations: `features/auth/staff-shell.tsx` (single shell/provider
boundary, skip link/account/status); `workspace-navigation.tsx` (labeled disclosure,
current location); `staff-shell.tsx` (header-level in-memory draft guard);
`staff-navigation.css` (44px/focus,
flat screen-only surfaces, wrapping and bounded mobile menu); `public-preferences.tsx`
(public isolation). Account uses disclosure semantics, not an incomplete ARIA menu.
Administration groups are lazy-loaded only when opened, keeping rare navigation
copy/presentation out of the operational initial payload. No menu count is invented.
The printing shortcut reuses the UI kit's link classes on the already imported
Next Link, avoiding the full UI barrel in the continuously mounted header. The
three cashier-body rules formerly colocated with the removed tabs are preserved
verbatim in screen-only shell CSS; removing duplicate navigation does not redesign
the page body.

Manual capture review evaluates labels, hierarchy, wrapping, focus and theme pairs;
it does not certify unchanged legacy screen interiors. Print panels still dominate
parts of those interiors, as the phase-1 audit records; changing them is phase 6.
Physical readability, virtual keyboards and assistive technology remain separate
acceptance. Execution outcomes and any failed exploratory runs are reported in
redesign-baseline.md rather than presented as a skill-inspector score.
