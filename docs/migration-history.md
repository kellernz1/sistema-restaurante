# Migration history audit and reconciliation

## Result (2026-10-25, America/Sao_Paulo)

Development originally had **22 recorded migrations for 41 files**: 19 missing entries, no orphaned versions and no renamed entries. The officially migrated clean reference and development had **zero structural/security differences**. Only the 19 missing metadata entries were repaired through the official Supabase CLI after a verified backup. No migration SQL was replayed against development. Public schema and all 41 public tables' row counts/content fingerprints remained unchanged; the original 22 history rows, including their stored statements, remained unchanged.

Evidence (ignored/private artifacts, UTC directory timestamps):

- Before: `artifacts/migration-history/2026-10-25T23-10-20-874Z/history.json`, `report.json`, `clean.json`, `development.json`.
- Backup verification and data fingerprints: `before-repair.json` in that directory.
- Official metadata repair: `official-repair.log`; verified outcome: `reconciled.json`.
- Protected pre-repair archive/manifest: `safety-backup/2026-10-25T23-17-16-109Z_5e54f95d-132c-43d6-9f24-758933395af4.dump` in that directory.
- Verified post-repair archive: `backups/2026-10-25T23-32-03-296Z_08e7dcce-38be-4328-b539-d601e58b23f2.dump`, with its `.json` manifest.
- Final full audit: `artifacts/migration-history/2026-10-26T00-00-32-453Z/report.json` (41/41, zero schema differences). UTC rolled to October 26; the operator's local date remained October 25.

These artifacts/backups may contain private configuration and data; do not publish or commit them.

## Originally recorded files

```text
202610220001_initial_schema.sql
202610220002_table_self_service.sql
202610220003_offsite_orders.sql
202610220004_whatsapp_bot.sql
202610230001_cashier_order_entry.sql
202610230002_menu_management.sql
202610230003_employee_accounts.sql
202610230004_delivery_location_address.sql
202610230005_distance_delivery_pricing.sql
202610230006_delivery_distance_snapshot.sql
202610230007_kitchen_print_queue.sql
202610230008_manual_kitchen_print.sql
202610240001_payment_transfer.sql
202610240002_payments_and_currency.sql
202610240003_payment_guards.sql
202610240004_payment_settlement.sql
202610240005_payment_balance_protection.sql
202610240006_payment_currency_guard.sql
202610240007_paraguay_contacts.sql
202610240008_counter_flow.sql
202610240009_counter_creation_boundary.sql
202610240010_counter_integrity.sql
```

## Missing entries now recorded

```text
202610240011_cash_pyg_only.sql
202610250001_atomic_kitchen_actions.sql
202610250002_print_engine.sql
202610250003_print_review_and_markers.sql
202610250004_print_review_resolution.sql
202610250005_print_order_notes.sql
202610250006_print_payment_privacy.sql
202610250007_print_closed_order_guard.sql
202610250008_print_manual_supersession.sql
202610250009_print_reprint_lock.sql
202610250010_print_reliability.sql
202610250011_cash_sessions.sql
202610250012_cash_delivery_fee_snapshot.sql
202610250013_service_modes.sql
202610250014_service_integrity.sql
202610250015_qr_validation.sql
202610250016_service_guards.sql
202610250017_qr_payload_guard.sql
202610250018_legacy_qr_review.sql
```

There were no history versions without corresponding files.

## Evidence about the cause

The history stopped at `202610240010`, while later tables/functions/guards were present and matched the later migration chain exactly. Previous operational records in `docs/printing-architecture.md`, `docs/printing-reliability.md`, `docs/cash-sessions.md` and `docs/service-modes.md` describe local schema application for these later blocks. The old `docs/supabase-setup.md` explicitly instructed running migration files in SQL Editor; the old phase-9 validation repeated that workflow. Reproduce that historical advice with `git show ddb015d:docs/supabase-setup.md` and `git show ddb015d:docs/phase-9-validation.md`.

Direct SQL application bypasses the CLI history table and explains this pattern. However, retained evidence does **not** identify the exact operator, command or DDL execution time; deletion of history rows cannot be independently excluded. This is the supported likely mechanism, not an invented execution log. The old clean-validation helper also manually applied SQL and inserted history in its temporary database; that was not proof of official tracking and has now been replaced.

## Comparison method and real differences

The reference was created from `template0` with a protected random name. Only provider-owned Auth definitions were copied as prerequisites, never application objects or application data. Public grants/default privileges were reproduced from the official Supabase image bootstrap (`00000000000000-initial-schema.sql`), not inferred from modified application objects. Existing cluster roles were reused without changing them. All application migrations were then applied by pinned Supabase CLI `migration up --db-url <isolated database>`, which recorded every migration itself.

The comparison covers the application's public schema plus application triggers attached to Auth: 45 relations (41 tables, three sequences, one view), 359 columns, 230 constraints, 90 indexes, eight enum/domain types, 95 functions with owners/security attributes, 35 triggers, 52 RLS policies, schema/table/column/function/type/default grants and seven Realtime memberships. Details are in `scripts/local/schema-snapshot.sql`.

Catalog OIDs, table row order, JSON key order, generated constraint/index names, physical column ordering and sequence progress are not schema differences. Enum label order, duplicate index multiplicity, constraint validation, function bodies/owners, grant options and RLS settings remain meaningful and are compared. Snapshot definitions use stable names and normalize CRLF in function-definition text; they do not broadly collapse whitespace, rewrite identifiers or infer semantic equivalence of different SQL. Provider internals are prerequisites, not a second full Auth/Realtime installation; this is application SQL/schema validation, not provider HTTP acceptance.

After normalization, migration-created service policy, cash-session policy, printing policy, device/destination settings and lease singleton matched. Random printer UUIDs are compared through the device name; lease ownership/expiry and last print success are runtime state. Nine editable restaurant fields differed:

| Field | Clean default | Existing value preserved |
| --- | --- | --- |
| delivery_fee | 0 Gs | 6,000 Gs |
| min_delivery_order | 0 Gs | 25,000 Gs |
| delivery_distance_step_fee | 6 Gs | 6,000 Gs |
| delivery_fee_mode | fixed | distance |
| whatsapp_enabled | false | true |
| estimated_pickup_minutes | 30 | 20 |
| estimated_delivery_minutes | 50 | 45 |
| delivery_origin_latitude | null | configured |
| delivery_origin_longitude | null | configured |

These are existing operational settings, not missing schema changes. No defaults were reinserted or restored; menu, orders, payments and configuration were preserved. In particular, historical monetary migration defaults do not establish realistic restaurant prices. New installations still require reviewing the menu/fees in Gs.

## Prevention and commands

- `npm run db:verify-history`: read-only file/history comparison; exit 0 for matching versions/names, 1 for divergence, 2 for unavailable verification. It rejects duplicate/invalid migration filenames. It does not claim that presence alone proves schema equality.
- `npm run local:status`: includes current history status even when the app is stopped.
- `npm run db:audit-history`: officially migrated temporary reference, complete comparison and private JSON/log evidence. It never repairs development. Drift blocks reconciliation.
- `npm run local:update -- --dry-run`: checks installed schema against an officially migrated reference of its recorded prefix, then uses official `db push --dry-run --skip-vault`. It makes no development migration, backup or build. Verified outcome after repair: `upToDate: true`, empty migrations/seeds/roles.
- `npm run local:update`: refuses gaps/orphans/renames and schema drift; verifies its backup, uses official migration application, verifies history again, then builds.
- `local:setup`: no reset, including first install; refuses `--reset`, checks existing provenance and uses official tracked migration application. Existing installations with pending/divergent history must use the backed-up update workflow instead. Do not use setup as a recovery shortcut.
- `db:validate-clean`: official CLI for the 40-migration prefix and final migration, then all SQL/concurrency suites. Candidate restoration also upgrades through the official CLI, never by directly executing migration files or manually inserting their history.

Applied migration files are immutable. Make a new corrective migration for real changes. Do not use SQL Editor/psql to execute application migration files. SQL fixtures/bootstrap prerequisites are separate from versioned application migrations. Never run metadata repair simply to silence a version check.

The explicit reconciliation script requires an audit report, unchanged migration hashes, matching current schema, matching fixed migration configuration, stopped app/workers and a verified backup. It uses official `migration repair`, proves public data/schema and previous history unchanged, and makes a post-repair backup. It is not a normal update command. If any schema or fixed-data difference is real, stop and propose a new corrective migration instead; never mark unproven work applied.

## Validation

Text check, ESLint, production build/TypeScript and 15 targeted history/operations tests passed. The complete native run passed 87 tests with 27 environment-gated skips; 37 Vitest tests passed. The official clean-chain validation passed all 41 migrations, seed, all 17 SQL suites and concurrency cases, including candidate restoration with a pending migration applied through the official CLI. No corrective application migration or generated database-type change was necessary. No reset or restoration over development occurred; only 19 history rows were added. No commit/push was made.
