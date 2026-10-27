# Restaurant provisioning (block 10)

Use a **fresh checkout on the restaurant notebook**, without `.env.local`,
`.local-secrets`, development Docker volumes or demo records. This command is not
a converter/cleaner for the existing development installation. No migration was
added in this block; the existing ordered application chain is used as-is.

```powershell
npm.cmd ci
npm.cmd run local:provision
```

Spanish terminal prompts: `npm.cmd run local:provision -- --es`.
Docker Desktop must be running. Initial downloads need internet and free ports
3000/54321/54322. Reserve the notebook LAN IP first. Prepare an existing external
backup directory (prefer another physical device). The interactive command asks
for restaurant/admin names, admin email, PY/BR phone default, timezone, tables and
count, waiter/delivery modes, active payment codes, initial Gs/BRL rate, LAN IP,
external directory and optional license public key. Base currency is always PYG;
business-day cutoff starts at 05:00. WhatsApp starts disabled and its simulator is
disabled. Configure real Meta credentials separately if needed.

Enter a unique administrator password twice in the hidden terminal input: at least
12 characters with upper/lowercase, digit and symbol. No password argument, file
or terminal echo is used. It is sent to local Auth and held only in process memory;
Auth stores a hash. Retain it in the owner's password manager. The command tests
login and revokes that acceptance session. It never prints keys, passwords or
tokens. It creates exactly that one administrator, no menu and no demo identities.

The isolated self-hosted profile and pinned component provenance are explained
in [infra/restaurant-provider/README.md](../infra/restaurant-provider/README.md).
Secrets, generated Compose/CLI configuration and stage records live under ignored
`.local-secrets/`; app keys also populate ignored `.env.local`. Database, Auth JWT,
API and worker credentials are independent per installation. Studio is absent,
database publication is loopback-only. The CLI still applies/records migrations.
Protect any persistent `db-config` encryption/key material as well: a database
dump is not a substitute for provider configuration or encryption-key recovery.
Moving the installation to another notebook requires a separately rehearsed
recovery procedure, not blindly copying the root-bound ownership marker.

Provisioning verifies an initial full backup and external copy, then builds the
app. Successful completion prints the installation UUID and license instructions.
An interrupted command can resume with identical non-password answers; configuration
is claimed by a durable hash, Auth account inspection and a transaction marker.
It never deletes business data. A completed empty installation returns the same ID.
If business data exists, the default is refusal. The explicit command below permits
**read-only inspection only**, not reprovisioning or deletion:

```powershell
npm.cmd run local:provision -- --confirm-existing INSTALLATION_UUID
```

Keep the source path unchanged: provider ownership is bound to its absolute root.
Do not copy generated provider metadata to a different path or notebook as an
installation method. Recovery needs an owned fresh provider and a verified restore
candidate; [operations.md](operations.md) remains the recovery guide. Protect
`.env.local`, provider configuration and owner/license material outside the dump.

## Activation and acceptance

```powershell
npm.cmd run local:start
npm.cmd run db:verify-history
npm.cmd run local:preflight
```

Log in with the administrator entered above. Issue a license on the **owner's
separate machine**, bound to the printed installation UUID; configure its public
key/import the signed token in Settings → License. Never copy the private key to
the restaurant. Add staff, categories, products/prices/photos and test a complete
order/payment/kitchen/receipt flow. No default rate should be treated as a quote:
the operator explicitly enters the initial rate, then maintains it in Settings.

`local:preflight` exits nonzero on missing evidence. PT default/`--es` reports are
operator-facing; `--json` uses stable English check codes and causes, no secrets.
It checks no demo markers/Auth identities, unique credential fingerprints and
working server key, Studio absence, loopback DB publication, configured recent
checksummed backup/external copy, current valid license, tracked history, the
enabled Windows logon task targeting this checkout, restaurant mode and SQL license
guards. Real printer acceptance is a **warning** with current browser/file drivers.
It does not prove firewall effectiveness from a remote device, physical printing,
power-loss recovery or a restore of this new profile. Perform those operational
checks before live service. A missing/unverifiable scheduled task fails closed.

The automated drill injects only the scheduled-task result; it never installs a
Windows task or firewall rule. Its passing preflight is not Windows acceptance.
Run install scripts in dry-run first; apply manually after owner review.

## Development and demonstrations

`local:setup` and `local:setup -- --no-demo` now both create an empty **development**
stack, without seeding accounts/menu or creating `DEMO_PASSWORD`. They do not
upgrade shared CLI credentials into production secrets. They also do not erase
demo data from an existing installation. Demonstrations are explicit:

```powershell
npm.cmd run local:setup:demo
```

`local:info` omits all credentials and QR tokens, and only lists demonstration
accounts when demo mode is configured. Never use the demo path for a restaurant.

## Automated validation and limits

`test:provision` owns a separate random Compose project, database volumes, ports,
checkout, environment and external-copy directory under ignored artifacts. It
provisions, verifies admin authentication/empty menu/independent secrets, imports
a test-only signed license, checks preflight, injects a demo marker and verifies
rejection, checks repeat/existing-data refusal, restarts the provider and checks
credentials persist, verifies unrelated API/DB keys fail and scans provider logs
in memory for secrets. It always removes only its owned containers/volumes.
`test:all` includes this drill and the ordinary disposable SQL/HTTP application
suite, which exercises `local:setup --no-demo` before installing its own fixtures.
No physical printer, Windows configuration or real Meta service is used.

### Development-boundary incident during implementation

An early drill exposed a pre-existing helper bug: `run()` ignored the requested
working directory. The copied backup subprocess ran in the development checkout.
This **violated the task's development-write restriction**. It created development
backup files, updated operational backup state and observed backup time through
`license_tick`. Automatic daily retention removed the earlier same-day backup
`backups/2026-10-27T03-23-45-469Z_3f9aaedb-11db-4ec0-a81e-02eb796ff56c.dump`.
A replacement valid backup remained at
`backups/2026-10-27T04-49-43-665Z_e45e3656-5073-4482-a0f3-3e9f12b0308a.dump`.
No order/payment command, reset, restore, reseed or migration was sent to development
by those drills. No attempt was made to rewrite audit/clock history or hide effects.

The helper now honors `cwd`; a regression unit test verifies it. The provisioning
backup entry point additionally requires owned provider metadata, matching checkout
and a configured stage **before** resolving any default database. Later drills
snapshot development backup filenames/operational state and assert no changes.
That assertion covers later runs, not the whole implementation. Existing provider
key rotation remains mandatory before real data in the old development instance.

## Validation record (2026-10-27)

- `check:text`: 506 UTF-8 files, zero issues; ESLint passed; production build and
  TypeScript passed. Node emitted the existing typeless-package warning; no module
  mode change was made merely to hide it.
- Final `test:all` exited zero: 53 Vitest cases, native/HTTP suite without skips,
  11/11 smoke checks, the five focused provisioning guards and the full owned
  restaurant drill including its production build. Ordinary integration evidence:
  `artifacts/integration/b78df374c5671b55b7979ac6/`; provision evidence:
  `artifacts/provision-tests/ec229cb3bdfe51802951af59/`.
- All 51 migrations applied/tracked officially in the clean separate candidate;
  SQL/concurrency suites and older-backup upgrade passed. Read-only development
  `db:verify-history` remained green, 51 files/51 rows. No new migration was needed.
- The full provision drill passed admin login, empty menu, unique credentials,
  anonymous RLS, real Realtime delivery, backup/external-copy preflight, demo
  rejection, repeat/existing-data guards, restart persistence, unrelated API/DB
  credential refusal and in-memory Docker log scanning. Its development backup/
  operational-state boundary snapshot was unchanged. Scheduled-task existence was
  injected; no Windows task/firewall/settings were installed or changed.
- Failures found and corrected: inherited helper ignored `cwd`; old backup
  metadata query used a lower-privilege DB role incompatible with hardened client
  settings; inherited local DB trust authentication accepted unrelated passwords;
  Kong's Realtime DNS alias differed from this Compose network; a cold replication
  subscription needed readiness before generating its assertion event. These
  failures were not skipped or treated as successful acceptance.
- The replacement development backup cited above was revalidated read-only for
  manifest, SHA-256 and archive readability after the incident. No restoration or
  rollback of development was performed. No commit or push was performed.
- Pending operational acceptance: real interactive operator walkthrough, Windows
  logon/Docker Desktop, remote LAN/firewall check, physical printer/UPS/power-loss
  and full disaster recovery of this specific self-hosted profile on another
  notebook. The existing development provider's secret-key rotation is still
  required before any real data there. No application screen changed in this block;
  no new browser visual acceptance is claimed for the terminal commands.
