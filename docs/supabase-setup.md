# Supabase setup

## Apply the database

1. For the current local-first deployment follow `docs/local-setup.md` and `docs/operations.md`. New installation uses `local:setup`; updates use `local:update`, both with official CLI migration tracking. Never apply files individually in SQL Editor or psql.
2. Before and after database maintenance run `npm run db:verify-history`. For drift use `db:audit-history`; do not repair history unless a clean comparison and verified backup establish equivalence. See `docs/migration-history.md`.
3. If deploying separately to a managed Supabase project, use its explicitly linked official CLI migration workflow with backup/dry-run review. Do not copy local connection strings or run a local reset against a remote database.
4. In **Authentication > Users**, create these four users with passwords of your choice:
   - `admin@restaurante.local`
   - `garcom@restaurante.local`
   - `cozinha@restaurante.local`
   - `caixa@restaurante.local`
5. Run `supabase/seed.sql`. It assigns the roles and inserts the sample data.
6. Run `supabase/tests/rls_smoke_test.sql`. A successful execution ends with `ROLLBACK` and no exception.
   Current QR/service-mode coverage is `supabase/tests/service_modes_test.sql`; the old table-self-service suite was superseded. Run the complete suite through `db:validate-clean` on its isolated database. See `docs/qr-nfc-setup.md` for physical tag setup.
   Run `supabase/tests/offsite_orders_test.sql` for Phase 9 totals, delivery minimum, change, readiness, transitions, permissions, and table isolation. See `docs/phase-9-validation.md` for UI acceptance.
   Run `supabase/tests/whatsapp_bot_test.sql` for Phase 10 atomic turns, duplicate IDs, order types, and restricted table/function access. Follow `docs/whatsapp-setup.md` for mock/Meta/worker setup.

The seed is idempotent. The smoke test is transactional and does not retain its fixtures.

## Configure the application

Copy `.env.example` to `.env.local` and fill in:

- `NEXT_PUBLIC_SUPABASE_URL`: Project URL from **Settings > API**.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anon key from **Settings > API**.
- `SUPABASE_SERVICE_ROLE_KEY`: secret service-role key. Keep it server-only.
- `NEXT_PUBLIC_APP_URL`: `http://localhost:3000` during local development.

Never expose `SUPABASE_SERVICE_ROLE_KEY` in a variable prefixed with `NEXT_PUBLIC_`.

## Regenerate TypeScript database types

The repository includes types matching the migration. After applying schema changes, regenerate them from the live project with Supabase CLI:

```powershell
npx supabase gen types typescript --project-id YOUR_PROJECT_REF --schema public | Set-Content -Encoding utf8 src/types/database.types.ts
```

Replace `YOUR_PROJECT_REF` with the reference shown in the project URL. Then run:

```powershell
npm run lint
npm run build
```

## Security notes

- RLS is enabled on every application table.
- `anon` has no table policies and cannot call `create_customer_order`.
- Public customer endpoints added in later phases must use the server-only admin client.
- Product prices are always copied from `products.price` by a database trigger.
- QR tokens and public order tokens use 32 random bytes encoded as hexadecimal.
