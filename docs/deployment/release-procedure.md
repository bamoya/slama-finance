# Production release procedure

## Image delivery

The manual `publish-images.yml` workflow validates the selected checkout, then
publishes AMD64 and ARM64 API, UI and release-tooling images to GHCR. Use one commit's images
together. Production pulls images; it does not build or automatically deploy when
CI finishes. Review the workflow result and image references before promoting.

The API Dockerfile's `release` target contains source, migration SQL and tooling.
Its default command invokes the installed migration CLI through Node and tsx
without downloading a package manager; it is a one-shot operator tool, not a
long-running application or public service. Runtime images do not auto-migrate.

## First-launch gates — not yet automated

For the current Hostinger/Dokploy deployment, runtime-role provisioning, explicit
grants, and migrations are now automated by the one-shot startup initializer;
see [Dokploy startup](dokploy-startup.md). The historical production Compose below
still uses manual release-profile migrations. Administrator bootstrap remains pending.

1. Initialize PostgreSQL in its persistent external volume. Keep its owner
   credential only in database/release administration, never in API settings.
2. Create a distinct non-owner runtime role and reviewed least-privilege grants.
   The existing `grant-sales-runtime.ts` is **partial**: it does not create the
   role or establish all identity/catalog/settings/media/schema permissions.
   Do not mistake successful execution for a complete production access policy.
3. Run reviewed migrations using `MIGRATION_DATABASE_URL` through the release
   profile. Verify the migration journal before starting the API.
4. Provision the initial administrator using a reviewed production procedure.
   **The existing bootstrap-admin.ts is deliberately local-only and refuses
   production. Do not bypass that safeguard or pretend it is a launch command.**
   A safe production bootstrap command and its tests remain required before go-live.
5. Verify all CRUD domains and protected issued-document behavior using the
   runtime role, including jobs, notification rules and scheduled reports.
6. Configure Resend's verified sender, trusted HTTPS reset URL and company identity.
7. Test storage upload/read/delete, PDF/Excel generation, recovery email and a
   scheduled report addressed to an authorized test recipient.
8. Verify trusted proxy rate limiting, HTTPS, network isolation and backup restore.

## Subsequent release

1. Record current image digests, database migration version and backup location.
2. Take and verify an off-server backup. Read migration compatibility/locking risks.
3. Run the one-shot release-profile migration with the new release image and
   owner connection. Use maintenance downtime if schema compatibility requires it.
4. Deploy matching API/UI images. Check readiness and application smoke tests.
5. Monitor job failures, memory, CPU, disk and delivery errors after deployment.

Use `-f infra/compose/docker-compose.production.yml` from the repository root for
operator commands, and `--env-file .env.production` when supplying a local secret
file (Coolify uses its secret settings). Never merge it
with the local Compose automatically. Supply secrets through Coolify or a protected
operator environment. Avoid printing `docker compose config` with real secrets.
When running release commands outside Coolify, use the same project name and
network identities or they will target a different Compose project.

## Rollback

Reverting an image does not revert database migrations. Roll back application
images only if the schema remains compatible. Otherwise use the documented restore
procedure in a controlled maintenance window and account for writes since backup.
Never use `docker compose down -v` or delete database volumes during an application
release. External volumes still require protection from manual deletion/pruning.
