# Restaurant provider provenance

This is a deliberately small **self-hosted** Supabase profile, not an override of
the shared development CLI installation. Docker Compose is the provider lifecycle;
application migrations still run exclusively through the pinned official Supabase
CLI, with its migration history, a password-free connection argument and a private
`PGPASSWORD` environment. No application migration is executed through psql.

Templates `kong.yml`, `kong-entrypoint.sh`, `roles.sql`, `jwt.sql`, `realtime.sql`
and the MIT `LICENSE` come from the official
[Supabase Docker directory at a18539886c23365720c84f3121e81698fb98899b](https://github.com/supabase/supabase/tree/a18539886c23365720c84f3121e81698fb98899b/docker).
Component versions are pinned in `scripts/local/restaurant-provider.mjs`; these
match the available PostgreSQL 15 CLI generation, not floating `latest` images.
Image upgrades require isolated provisioning, restore and application acceptance.

Research against pinned CLI 2.121.0 found supported `auth.jwt_secret`,
`auth.publishable_key`, `auth.secret_key` and `auth.signing_keys_path` settings:
[Auth configuration](https://github.com/supabase/cli/blob/v2.121.0/apps/cli-go/pkg/config/auth.go).
However its TypeScript local DB connection construction uses the development
default database password, rather than a persistent supported custom password:
[local config values](https://github.com/supabase/cli/blob/v2.121.0/apps/cli/src/command-internal/local-config-values.ts).
Changing only Auth keys would leave database/developer credentials behind. The
restaurant alternative therefore uses the official self-hosted configuration
pattern, with independent OS-random database, JWT, opaque API and worker secrets.
See [self-hosted API keys](https://supabase.com/docs/guides/self-hosting/docker#api-keys).

Runtime adaptations, confined to ignored owned files:

- Cached Kong image uses `/docker-entrypoint.sh` instead of `/entrypoint.sh`.
- Initial role passwords are applied only to existing roles (this image omits
  `supabase_functions_admin`). All existing privileged/service roles are hardened
  before APIs start. PostgreSQL's default password is replaced.
- Kong's historical `*_ASYMMETRIC` substitution slots receive valid installation
  **HS256** anon/service JWTs. These are not asymmetric keys: the official gateway
  maps independent opaque publishable/secret keys onto those internal tokens.
  No license signing/private key is present here.
- PostgreSQL statement/audit logging and gateway access logging are suppressed to
  prevent generated credentials or Realtime query keys entering logs. Temporary
  elevated client logging options are removed after bootstrap; server and role
  settings retain suppression for ordinary maintenance and restarts.
- No Studio, storage HTTP service, mail tester, analytics or edge runtime is
  started. The database still contains auth/storage schemas for full backups.
  Product photos currently live in the database; adding Storage HTTP later
  requires an explicitly reviewed profile change.
- PostgreSQL uses an explicit persistent `pg_hba.conf`: host connections require
  SCRAM passwords (including loopback); only the container-local `supabase_admin`
  maintenance socket is trusted. Docker access is therefore privileged access.
- Only API/Realtime and the app face the LAN; PostgreSQL is published on loopback
  only. Windows firewall/second-device acceptance remains an operator task.
- The generated gateway rewrites the template's self-hosted Realtime DNS name to
  this Compose network's `realtime-dev` alias. The drill waits for replication
  readiness before asserting receipt of a real authenticated change event.

`development-fingerprints.json` contains SHA-256 fingerprints of three pinned CLI
development defaults, never raw keys. Preflight refuses those fingerprints and
checks generated secret provenance plus a live API request. It is not tamperproof
against an owner who can edit local files; protect the notebook and ignored files.
Windows file modes do not establish a new NTFS ACL: restrict the installation and
backup folders manually. Neither Compose metadata nor secrets belong in Git.
