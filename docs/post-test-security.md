# Block 9 post-test security review

Block 10 adds a separate fresh restaurant provider/bootstrap; see
[restaurant-provisioning.md](restaurant-provisioning.md). It does **not** rotate
the existing development provider keys. That rotation remains mandatory before
real customer data in the old instance. The linked document also records an early
test-isolation incident affecting development backup state and same-day retention;
do not interpret earlier validation statements as proof of an untouched environment
throughout block 10.

Follow-up authorized on **2026-10-27**: WHATSAPP_WORKER_SECRET and DEMO_PASSWORD
were rotated after a verified backup; five marked demo accounts had refresh
sessions globally revoked and login/refusal validated. The historical review and
proposal below predate that authorization. See the maintenance record in
[operations.md](operations.md). SUPABASE_SECRET_KEY was **not** rotated; unique,
persistently revocable provider credentials remain **mandatory before any real data**.

## Scope and inventory

This review reads variable **names**, not environment values. It does not rotate,
revoke, copy, log or publish any operational credential. Provider keys used by
temporary automated tests are unrelated fixtures, never restaurant credentials.

Categories: A = real external credential; B = local development credential;
C = public key or non-secret configuration (not necessarily sent to browsers).

| Variable name in the local inventory | Category | Meaning / action |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | C | Local API address; not an access credential |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | C | Public client API key; RLS still required |
| SUPABASE_SECRET_KEY | B | Privileged local provider credential; treat screenshot exposure as compromise |
| NEXT_PUBLIC_APP_URL | C | Application address |
| NEXT_TELEMETRY_DISABLED | C | Runtime option |
| APP_MODE | C | Runtime mode; does not itself grant access |
| WHATSAPP_MOCK | C | Simulator option |
| WHATSAPP_WORKER_SECRET | B | Worker and simulator bearer; treat as compromised |
| PUBLIC_TRUST_PROXY | C | Proxy trust option |
| PUBLIC_TEST_URL | C | Test URL |
| LOCAL_LAN_IP | C | Network configuration |
| DEMO_PASSWORD | B | Demo staff credential; treat existing accounts as compromised |
| LICENSE_PUBLIC_KEY | C | Ed25519 verification key; never rotate just because it was shown |

There are no category-A variable names in this inventory. Classification of
SUPABASE_SECRET_KEY as B follows the documented CLI-local deployment, not its
prefix or disclosure: a local service-role credential remains highly privileged.
If the endpoint is ever repointed to an external provider, reclassify it as A.
WhatsApp Cloud API and license-server administrative credentials are not present
in this inventory. Do not rotate the signing key on the basis of a public-key screenshot.

## Rotation plan: approval required, none executed

Before approved maintenance: preserve a verified `npm run db:backup`, inventory
all consumers by variable name, stop application/workers through `local:stop`,
retain the license installation identity and financial/audit data. No database
reset, restore over development, demo reseed or migration-history repair is a
credential-rotation method. Keep outputs captured/redacted; never run status
commands that print provider keys to the terminal or put new credentials in arguments.

### WHATSAPP_WORKER_SECRET

1. Generate 32 random bytes using Node crypto, entirely in memory; do not print,
   copy to clipboard or put the value in a shell command or transcript.
2. Atomically update **both** `.local-secrets/runtime.json` field
   `whatsappWorkerSecret` and `.env.local` variable `WHATSAPP_WORKER_SECRET` with
   the same value. Updating only `.env.local` is insufficient: `local:env` reuses
   the runtime file. A stopped process boundary prevents mixed consumers.
3. Update any separately scheduled caller of `/api/whatsapp/process` and local
   simulator bearer consumer using its protected configuration. No external Meta
   access token is changed by this rotation.
4. Run `local:update`, then `local:start`; the app, WhatsApp worker, simulator and
   authenticated worker callers must share the replacement credential. Printing
   does not consume this bearer. Verify health and validate
   that the old bearer is rejected and the new one accepted without logging either.
   For operational consistency restart all supervised workers, including licensing.

The project has no existing rotation command for this pair of files. Implement a
small atomic maintenance operation after explicit approval; do not delete runtime
state and hope regeneration synchronizes consumers.

### DEMO_PASSWORD

1. Generate a new strong random password in memory and set `DEMO_PASSWORD` in
   `.env.local` without printing it. This alone does **not** change Auth users.
2. Use the server-only Supabase Admin Auth API `updateUserById` to update the
   existing demo accounts identified by the demo manifest/account list. Preserve
   user UUIDs, profile roles, approvals and transaction history. Do not run
   `seed:demo`: it changes business fixtures as well as staff passwords.
3. Revoke their refresh sessions. One explicit Auth-supported route is signing
   each updated account in using the new password in memory and calling
   `auth.signOut({scope:'global'})`; do not persist/print the temporary sessions.
   Existing access JWTs can remain valid until expiry; this is not instant access
   token revocation. Test against the local Auth version before maintenance.
4. Update authorized visual-test credentials by variable name if they override
   DEMO_PASSWORD. Run `local:update` and `local:start`, then test old-password
   refusal and new-password login without logging either. Staff must log in again.
   Production accounts should have individual passwords, not the shared demo one.

There is no safe project command that performs these Auth changes today; changing
an environment file or running a seed is not a substitute. Approval must cover
both the Auth update and session revocation.

### SUPABASE_SECRET_KEY

`local:env` reads the key from the provider and writes application configuration;
it does **not** rotate or revoke the provider's key. Inventing a random replacement
in `.env.local` would break the app and leave the leaked key valid. `local:stop`
and `local:start` are not evidence of credential revocation either.

The current CLI-managed provider has no key-rotation command wired into this
repository. A provider-specific persisted rotation must be prepared and proved
in a separate candidate before owner approval. The exact required sequence is:

1. Contain LAN exposure of privileged services first (separate approval; no firewall
   or Docker publication was changed in this review).
2. In an isolated provider candidate with the same pinned CLI/image, configure a
   **persistent supported provider key set**, generate a new secret API key in
   memory, revoke the old mapping at the gateway and restart all affected provider
   consumers. Prove that a normal provider restart does not restore the old key.
   Do not alter generated container files as a permanent fix; the CLI may replace
   them. If the CLI cannot persist custom API keys, use the official self-hosted
   configuration path, validate backup/restoration and plan a controlled cutover
   separately. This provider change is not implemented or claimed as tested here.
3. Synchronize the replacement provider key to `.env.local` variable
   SUPABASE_SECRET_KEY. Update NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY **only if the
   provider rotation also changes the public client key**. Preserve all unrelated
   environment settings; avoid terminal `supabase status -o env` output.
4. Run `local:update` then `local:start`, rebuilding browser consumers if the
   public key changed. Restart app, all workers, external service-role consumers
   and provider services affected by their own key mapping.
5. Prove old-key refusal, new-key Auth/admin RPC access, browser/RLS/Realtime,
   address-reuse and signed delivery-token behavior. Shared HMAC tokens bound to
   the service key may become invalid and need to be requested again.

**Limitation:** there is not yet an executable, validated in-place provider-key
rotation procedure for this pinned CLI in the project. No command is presented as
such. Establishing it is required before calling this credential remediated.
Provider references: [API keys](https://supabase.com/docs/guides/getting-started/api-keys),
[self-hosted key configuration](https://supabase.com/docs/guides/self-hosting/self-hosted-auth-keys).
Dashboard rotation instructions for managed cloud projects do not automatically
apply to this CLI-local stack.

## Network observations (read-only)

Docker publishes API 54321, PostgreSQL 54322 and Studio 54323 on all host
interfaces (IPv4 and IPv6). Windows listener inspection confirms the publication.
TCP handshakes to the notebook's LAN address also succeeded for 54321, 54322 and
54323 from the notebook itself; 54320 did not respond. No credentials were sent.
Application 3000 also listens on all IPv4 interfaces. Other development services
are published too: mail testing 54324/54325/54326 and analytics 54327.
No listener was observed on shadow port 54320. This is not proof of public-internet
reachability or of another LAN device passing Windows firewall rules.

Treat the private LAN as potentially able to reach these services until a second
device/firewall review proves otherwise. Only 3000 and 54321 are intended LAN
entry points. A leaked service-role key plus reachable 54321 can bypass RLS;
reachable Studio/database/mail services compound exposure. Do not forward these
ports to the internet. Firewall restrictions, loopback-only administrative
publication and provider hardening require separate explicit approval here.

## Git and content review

`node scripts/audit-secret-paths.mjs` reports **paths only**, scanning current tracked
paths and reachable Git objects from local refs/reflogs. It checks private-key
headers and common secret shapes without outputting matches. It cannot prove
absence of arbitrary, encrypted, split or unsupported secret formats, deleted
remote refs or external chat/shell transcripts.

No sensitive key/license/environment path was tracked or found in scanned history.
Content heuristic candidates (paths only):

- `.env.example`
- `owner-tools/licensing/README.md`

These are example/documentation candidates, not evidence that live credentials
were committed. The scan does not claim their strings are restaurant credentials.
New ignore rules cover PEM/KEY/PFX/P12/JKS, common private-key names, issuer registry
paths, issued license files and environment-file variants. `.env.example` remains
tracked intentionally and must contain only examples. Ignore rules do not remove
previously committed data and do not replace OS ACLs or safe owner-key custody.

## License feedback and issuer behavior

License errors next to Import distinguish malformed envelopes, invalid signatures,
foreign installation, older versions, missing/invalid public keys and pinned-key
conflicts. Mapping exposes only fixed translations, not raw database details.
Server validation remains authoritative. Existing SQL verification, RLS, audit and
anti-rollback rules were not changed; no migration is required for these messages.

GET exposes only the public-key environment validation state, never its contents.
A valid key already pinned in the database remains usable when the environment is
absent; the UI still warns about the missing configuration. Invalid explicit
configuration is refused; `local:update` and `local:env` validate its format.

The CLI's `--out` validates issuance before creating output, writes to a temporary
file, atomically publishes without overwriting and sanitizes failures. Empty files
are refused by the UI. Follow the one-command-at-a-time owner README; never pipe
failed native output directly into PowerShell `Set-Content`.

## Validation record (2026-10-26 local time)

- `check:text`: 490 files, zero issues; ESLint and production build/TypeScript passed.
- Nine focused validation/issuer/Git-ignore tests passed. The isolated native/HTTP suite passed 131 tests with zero skipped; smoke passed 11/11.
- All 51 officially tracked migrations, seed, SQL suites and concurrency checks passed in a separate candidate. Development was not migrated/reset/restored; `db:verify-history` remained green at 51/51.
- `test:visual` passed in Portuguese/Spanish at desktop/mobile widths, including mocked import errors and missing/invalid-key warnings; captures: `artifacts/visual/2026-10-27T00-14-08.043Z/`. Portuguese mobile and Spanish desktop/mobile import captures were reviewed. Existing floating language/theme controls may overlay content at some scroll positions; that shared layout was not changed by this security scope.
- Initial integration failure exposed an existing contact-test race with the webhook after() worker. A bounded committed-identity wait fixed the test without changing production WhatsApp logic. The visual guard was also narrowed to exempt only its explicitly mocked 400 import responses, retaining unexpected console/runtime-error checks.
- The local application was rebuilt/restarted with unchanged credentials. No rotation, firewall change, signing-key replacement, commit or push was performed. The external owner-tool copy was not overwritten: follow the updated README copy step before using its new --out option.

Final standard `test:all` exited successfully: evidence `artifacts/integration/7d3a73fb0e3189e9b85a2854/`. It included 53 Vitest tests, the clean SQL chain, 131 native/HTTP tests without skips and 11/11 smoke checks. The separate final visual run exited successfully with no failures. No credential values are included in this report.
