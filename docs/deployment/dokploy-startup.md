# Dokploy database startup

Use `infra/compose/docker-compose.dokploy.yml` as a single raw Compose file.
Configure HTTPS in Dokploy Domains for `slama-finance.bamoya.com` → `ui:8080`
and `api-slama-finance.bamoya.com` → `api:3000`. Point both DNS A records to
the Hostinger server. Dokploy supplies Traefik routing; no host port mappings
are required. Nginx serves React assets and SPA routes only.
The image publishing workflow builds the UI with
GitHub Actions variable `VITE_API_BASE_URL`, defaulting to
`https://api-slama-finance.bamoya.com`. Configure it under repository Settings →
Secrets and variables → Actions → Variables. Publish a new UI image
and set `UI_IMAGE` to its digest. Setting this variable at container runtime
does not modify a compiled Vite build. Keep `PUBLIC_ORIGIN` set to the UI origin;
it controls API CORS and reset links. Axios already enables credentials and the
API uses secure, host-only session cookies. Verify the Traefik address before
setting `TRUST_PROXY_IPS` for accurate client rate limits.
Supply real R2
and Resend credentials and override both development password defaults.

Startup order is PostgreSQL healthy → migrate exits successfully → API healthy
→ UI. The `migrate` service no longer requires an explicit profile. It runs
`node scripts/initialize-database.mjs` from the release image. Its exit code
blocks API startup on errors; do not disable this dependency to bypass failures.

The initializer:

- Checks both URLs target the same database and use distinct owner/runtime roles.
- Holds a PostgreSQL advisory lock on a dedicated single connection across startup.
- Applies pending migrations with the existing Drizzle migration journal.
- Creates the runtime login only when absent, using the configured runtime password.
- Grants explicit application-table privileges, without schema creation, ownership,
  superuser privileges, or audit update/delete access.
- Checks existing runtime credentials and never rotates them implicitly.
- Verifies runtime access before returning success; errors redact SQL and credentials.

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

Initial administrator provisioning is NOT performed by this service. The existing
local bootstrap script remains local-only; do not bypass that restriction. Complete
a reviewed administrator bootstrap before opening the app to users. Configure and
test backups independently; persistent volumes are not backups.
