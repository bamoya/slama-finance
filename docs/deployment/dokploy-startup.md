# Dokploy database startup

Use `infra/compose/docker-compose.dokploy.yml` as a single raw Compose file.
The migration history is now a fresh-install baseline. Use an empty database/new
`POSTGRES_VOLUME_NAME`; do not reuse a volume initialized with the old 34 migrations.
See [migration baseline](../../api/db/migrations/README.md). No existing data is reset automatically.
Routing is host-based: every public host (apex, `www.`, `app.`, `admin.`, `api.`, `<slug>.`)
goes to `ui:8080`; the UI nginx sends `/api/*` to the API, `api.` to the API only and `www.` to the
apex. Follow [domains and TLS](domains-and-tls.md) for DNS, wildcard certificates and the Traefik
labels. Set `PLATFORM_DOMAIN` (required) and `PLATFORM_SCHEME` (default `https`) in Dokploy; the UI
reads `PLATFORM_DOMAIN` into `/config.js` at container start, so changing it recreates the
container without rebuilding. `API_BASE_URL`, `CORS_ORIGIN`, `OWNER_PORTAL_ORIGIN` and
`PUBLIC_ORIGIN` were removed. Never put secrets in runtime browser configuration. Axios uses
the relative `/api` base and the API uses secure, host-only session cookies. Verify the UI
container and Traefik addresses before setting `TRUST_PROXY_IPS` (see the guide).
Supply real R2
and Resend credentials and override both development password defaults.

Startup order is PostgreSQL healthy → migrate exits successfully → API healthy
→ UI. The `migrate` service no longer requires an explicit profile. It runs
`node scripts/initialize-database.mjs` and then `scripts/bootstrap-admin.ts` from the
release image. Its exit code blocks API startup on errors; do not disable this dependency
to bypass failures.

The initializer:

- Checks both URLs target the same database and use distinct owner/runtime roles.
- Holds a PostgreSQL advisory lock on a dedicated single connection across startup.
- Applies pending migrations with the existing Drizzle migration journal.
- Creates the runtime login only when absent, using the configured runtime password.
- Grants explicit application-table privileges, without schema creation, ownership,
  superuser privileges, or audit update/delete access.
- Checks existing runtime credentials and never rotates them implicitly.
- Verifies runtime access before returning success; errors redact SQL and credentials.

The administrator bootstrap then reads `ADMIN_EMAIL`, `ADMIN_PASSWORD` and optional
`ADMIN_NAME` (default `Administrator`) from the Dokploy environment:

- Both unset: skipped (existing deployments keep working; no administrator is created).
- Only one set, an invalid email or a password under 12 characters: `migrate` fails and
  the API does not start. Values are never logged.
- No administrator with that email: created once with a hashed password and one
  `admin.create` audit entry (actor `deployment`). Concurrent runs create one account.
- Administrator already exists (enabled or disabled): left completely unchanged. Changing
  `ADMIN_PASSWORD` later does not rotate the password, re-enable the account, reset TOTP,
  passkeys or recovery codes, or end sessions. Use the operator CLI for those.

After the first deployment, sign in at `admin.<PLATFORM_DOMAIN>` with the email and password,
enroll TOTP, then optionally register passkeys. You may then clear `ADMIN_PASSWORD` and
`ADMIN_EMAIL` from Dokploy (recommended); keeping them has no effect on the existing account.

## Deploying this change

1. Commit/publish the updated release image using the image workflow. The old
   `c0cebda` release image does NOT contain this initializer.
2. Set `RELEASE_IMAGE` to the new immutable release-image digest in Dokploy.
   The Compose file intentionally requires this rather than defaulting to the old image.
3. Replace the raw Compose content with the updated Dokploy file and redeploy.
4. Check `migrate` logs for successful completion, then API readiness.

Never run simultaneous deployment jobs. The database lock serializes this
initializer, not unrelated manual migration tools or old running API containers.
Use maintenance downtime for schema changes incompatible with an already running API.
On each release, change the image reference to ensure the initializer is recreated.
For manual retries, `docker compose run --rm migrate` runs the same repeat-safe flow.

The named database volume is created automatically on first deployment. Changing
password environment variables does not rotate existing database passwords. Never
delete the volume to fix credentials. Runtime passwords embedded in URLs must be
URL-safe (hexadecimal passwords are simplest).

## Remaining first-launch work

The initializer provisions schema/runtime access only. It creates no owner or staff credentials.
Owners register through the owner authentication flow. Organization activation and staff provisioning
remain separate rollout work; do not deploy the unfinished tenant finance rollout as production.
Configure and test backups independently; persistent volumes are not backups.
