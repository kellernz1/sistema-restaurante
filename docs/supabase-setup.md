# Supabase setup

## Apply the database

1. Create a Supabase project.
2. Open **SQL Editor** in the Supabase Dashboard.
3. Run `supabase/migrations/202610220001_initial_schema.sql` as one script.
   Then run `supabase/migrations/202610220002_table_self_service.sql`. On an existing Phase 7 environment, run only the new migration.
4. In **Authentication > Users**, create these four users with passwords of your choice:
   - `admin@restaurante.local`
   - `garcom@restaurante.local`
   - `cozinha@restaurante.local`
   - `caixa@restaurante.local`
5. Run `supabase/seed.sql`. It assigns the roles and inserts the sample data.
6. Run `supabase/tests/rls_smoke_test.sql`. A successful execution ends with `ROLLBACK` and no exception.
   Run `supabase/tests/table_self_service_test.sql` to validate the Phase 8 functions, token rotation, requests, and database throttling. See `docs/qr-nfc-setup.md` for deployment and physical tag setup.

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
