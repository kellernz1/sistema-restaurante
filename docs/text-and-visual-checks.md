# Text integrity and browser smoke checks

## Commands

- `npm run check:text`: offline text/encoding/catalog validation; exits nonzero on any issue.
- `npm run test:visual`: running local app/Supabase and seeded admin required; launches installed Edge headlessly, saves screenshots/results to ignored `artifacts/visual/<timestamp>/`.
- `npm run test:all`: text guard, Vitest, native/HTTP tests, local integration and SQL suites. HTTP files run sequentially because they share restaurant settings and the public menu. SQL concurrency tests still use actual simultaneous database sessions.
- `npm run db:validate-clean`: all migrations and SQL suites in a separate temporary database; never resets development.

## Text approach and limits

The checker enumerates tracked and unignored new project text files with Git, excluding dependencies, builds, secrets, backups and artifacts through gitignore. It decodes bytes with fatal UTF-8 validation, rejects NULs (including likely UTF-16 text), U+FFFD and characteristic UTF-8/legacy-encoding corruption sequences. Known source/config/document/SQL extensions are checked; binary assets are not text. ASCII is a valid subset of UTF-8. The checker reports paths and lines and never rewrites files.

TypeScript's existing parser extracts string literals, template fragments and JSX text from `src/`. Suspicious question marks between letters are checked there and in both catalog languages. Operators are not interpreted as visible text. URLs are removed before the question-mark heuristic; normal end-of-sentence questions and Spanish inverted punctuation are valid. The heuristic deliberately does not guess missing accents in ordinary words or inspect customer-entered database values. Literal technical strings are checked too, a conservative superset of visible text. Dynamic assembled labels and all runtime states still require browser/manual acceptance.

The existing catalog is one Portuguese-to-Spanish object, not two independent locale files: each key is the Portuguese source and its nonempty string value is Spanish. Thus both locale inventories share the same keys by construction. The checker validates every pair, matching interpolation placeholders and coverage of literal `t(...)` calls. Dynamic calls are not statically resolved; the existing catalog tests and browser smoke complement this limit. No duplicated Portuguese catalog was added.

Use apply_patch or explicit UTF-8 Node/Python reads and writes. Avoid piping accented source through Windows shell defaults. With PowerShell, specify `-Encoding utf8` on both reads and writes. Verify the resulting bytes with `check:text`, rather than relying on how the terminal renders accents.

## Browser matrix

`playwright-core` is development-only and does not download a browser. It uses the installed Edge executable, with `VISUAL_BROWSER_PATH` as an override for another installed Chromium browser. This avoids a second browser download and any production dependency. `PUBLIC_TEST_URL` overrides the local app URL. `VISUAL_EMAIL` / `VISUAL_PASSWORD` override seeded admin credentials; keep credentials in environment variables, never committed files.

The smoke opens cashier, sessions, counter, kitchen, settings, daily reports and public checkout in pt-BR/es at 1440 and 390 pixels (28 combinations). It checks successful responses, unexpected redirects, suspicious visible text, page-level horizontal overflow, uncaught exceptions, error-level console messages and cash fieldset headings escaping their card. All combinations get full-page PNGs, including failures, and results JSON. Screenshots may contain local customer/order data: they stay ignored and must not be published blindly.

This is a smoke check, not pixel-diff coverage or proof of every layout. It does not submit orders/payments, open/close shifts or dispatch printing. The public checkout landing state is covered; product selection, cart and final form interactions remain manual acceptance. Collapsed sections, unavailable states, different menu content, hardware printing and real devices remain manual checks. Review the screenshots before concluding a UI block; horizontal scrolling inside an intentionally scrollable table is allowed as long as the page itself does not overflow.

## Findings in this block

- Fixed the administrative dashboard's damaged receipt-description accent.
- Added missing Spanish entries for save failure and cash closure labels (three literal call sites).
- Fixed a pre-existing corrupted cancellation reason in the original table-service migration. This changes clean-install function text only; applied database functions/old stored reasons are not rewritten. No new migration or business logic change was introduced.
- Added an application SVG tab icon after the browser detected an automatic favicon request returning 404.
- Updated two stale smoke expectations to the current contract: selecting Pix alone does not mark an unpaid order paid, and an unused written address field is null.
- Serialized HTTP test files after observing one suite selecting another suite's temporary public product, causing cleanup foreign-key failure. This changes test execution only.

No commit or push is part of this task. Validation results are recorded after execution; a clean SQL installation is not a full second Auth/Realtime environment.

## Validation performed (2026-10-25)

Lint, production build and `check:text` passed (369 project text files at validation). Vitest: 37 passed. Native/HTTP: 88 passed, zero failed, four explicitly skipped by their environment gates (contact identity, external road routing and two configured WhatsApp webhook checks). Local smoke: 12/12 checks passed. All 17 SQL files passed, with print concurrency checks; the clean isolated database also passed all 35 ordered migrations, seed, SQL and concurrency tests, including cash closing. It was removed afterward without resetting development.

The final Edge smoke passed all 28 locale/viewport/page combinations with no suspicious visible text, page overflow, out-of-card cash headings or console errors. Captures are in `artifacts/visual/2026-10-25T06-07-49.088Z/`. Desktop Portuguese and mobile Spanish session screenshots were additionally inspected visually. These captures are a sample of current states, not exhaustive screenshot approval of all interactions. An earlier failed parallel test run left a referenced menu fixture. That exact fixture was deactivated, preserving referenced order history; no financial records were deleted.
