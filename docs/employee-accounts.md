# Employee accounts

Administrators manage the team under **Configurações → Funcionários** at
`/admin/settings/employees`. The adjacent **Restaurante** tab retains the existing
restaurant configuration form and its behavior.

## Usage

- **Cadastrar funcionário** requires name, unique login email, password (8–72
  characters) and role: Administrador, Caixa, Garçom or Cozinha. Access can be
  enabled immediately or left blocked. Provide the chosen password to the employee.
- **Editar** changes the name and role. The email is shown read-only. Existing
  orders remain associated with the same profile ID.
- **Bloquear** removes application permissions while retaining the account and
  its history. **Reativar** restores access with its assigned role.
- An administrator cannot block their own account or change their own role away
  from administrator. PostgreSQL also prevents removing/demoting/blocking the last
  active administrator, including direct profile writes.

## Security and implementation

- `/api/staff/employees` and `/api/staff/employees/[employeeId]` require an active
  administrator. Strict schemas reject caller-selected IDs and unsupported fields.
- Creation uses Supabase Auth Admin from server-only code. The new Auth account
  is initially banned, its profile is saved inactive, then Auth is enabled and the
  profile activated if requested. Incomplete provisioning leaves a recoverable
  blocked account; refresh the list, check the role and reactivate it.
- Passwords are passed only to Auth creation. They are not stored in profiles,
  browser storage, application logs or employee API responses. Responses expose
  only ID, name, email, role, active status and creation date.
- `profiles.is_active` defaults to true for existing accounts. The role helper
  returns no effective role for inactive profiles. This blocks RLS reads/writes
  immediately even when an existing Auth JWT has not expired. New staff requests
  are also rejected by `requireStaff` and protected pages by `proxy.ts`.
- The login form rejects blocked profiles. AuthProvider watches the user's profile
  through Realtime, with focus/visibility refresh and a 30-second fallback poll.
  The staff shell hides protected content after access is lost. Role changes refresh
  the staff route; reactivation can return an open session to its assigned dashboard.
- Blocking depends on application authorization, not waiting for Auth JWT expiry.
  The Auth service may still recognize an old token, but that token cannot operate
  the restaurant. Realtime/polling updates the browser presentation separately.
- Administrator retention uses a transaction advisory lock in a database trigger.
  `open_table` and `close_order` now explicitly reject null effective roles; the
  service-role cashier creation RPC also rejects inactive actor profiles.

Migration `202610230003_employee_accounts.sql` has been applied locally and types
regenerated. Apply it before deploying the new application code elsewhere.

## Validation

- ESLint, production build and TypeScript passed.
- Native schema tests cover identity normalization, role allowlists, password/name
  limits and rejected credential/actor overrides in updates.
- `employee_access_test.sql` checks blocked JWT RLS behavior, null-role privileged
  RPC rejection, blocked cashier actor rejection and last-administrator protection.
  All seven SQL test files passed with their changes rolled back.
- Live HTTP tests created disposable accounts in all four roles and verified login,
  correct database roles, duplicate-email rejection, whitelist-only responses,
  self-protection, blocked old sessions/page access, reactivation and role changes.
  Temporary Auth accounts were removed by their tracked IDs.
- Existing cashier and menu-management HTTP tests passed again, including kitchen
  transitions, product photos, archival and historical prices.

Manual browser acceptance: sign in as administrator, open the Funcionários tab,
create a test employee, then sign in with that account in another browser profile.
Block/reactivate it and check the existing page changes access, then change its role
and verify its dashboard. Check both themes and phone/tablet/desktop layouts.
No browser automation surface was connected; visual interaction remains manual.
