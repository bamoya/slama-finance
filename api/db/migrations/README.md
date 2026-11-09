# Database migrations

## Current policy — pre-client fresh baseline (2026-11-09)

There are no real clients yet; the operator replaces the database volume instead of upgrading it.
The schema is one canonical fresh baseline, `0000_initial_schema.sql`, generated with
`node api/scripts/rebuild-baseline.mjs --fresh` from `api/db/schema` plus the explicit SQL in
`api/db/reference/` and `api/db/integrity/` (including the subscription catalog, overrides and
coverage periods files). When changing tables, edit the schema/SQL sources and regenerate the
baseline; do not add forward migrations, upgrade backfills or frozen-hash checks. Never hand-edit the
generated SQL or snapshot. Reintroduce immutable forward-only migrations before the first real client.

Do not reset or recreate an existing development/production database as part of a code change; the
operator provisions a replacement volume and runs the normal initializer.

## Initial baseline history

This SaaS uses a clean installation baseline: `0000_initial_schema.sql`.
It creates the current 48 tables, final columns, constraints, indexes, foreign keys,
row policies and integrity triggers directly. There are no historical column alterations,
legacy-company bindings, upgrade backfills or repair migrations.

The migration installs only the global permission catalog. An organization-creation trigger
provisions organization-local roles, company defaults and six disabled bilingual HTML email rules.
There is no global company record, owner/staff credential or sample business data.
Owners register through owner authentication. Owner workspace activation applies organization defaults atomically; staff invitations remain a separate rollout.

All 35 finance/support tables have required tenant scope and FORCE RLS. Company settings are keyed
by `(organization_id,id)`. 46 SQL-managed composite foreign keys reject cross-tenant relationships
while preserving existing lifecycle deletion behavior. See
[finance isolation](../../../docs/saas/finance-isolation.md) for execution, workers, storage and tests.

Run the normal release initializer (`node api/scripts/initialize-database.mjs` from the
repository root, with `DATABASE_URL` and `MIGRATION_DATABASE_URL` configured). It serializes
initialization, runs Drizzle migrations, and provisions the restricted runtime role.
Successful migrations are recorded once; restarting initialization is safe.

`meta/0000_snapshot.json` is generated from the current Drizzle schema. PostgreSQL integrity
functions, constraint triggers and FORCE RLS clauses are maintained explicitly in SQL.
Foreign-key declarations use ALTER TABLE after table/index creation to resolve references;
they do not modify an earlier schema version.

The baseline is not an upgrade path for an existing schema. Fresh installations apply it once; the
subscription coverage periods are authoritative from the start (`SUBSCRIPTION_COVERAGE_READS=periods`
by default) with no legacy-to-periods backfill. `subscription_periods_reconcile()` remains an
operator catch-up only after emergency legacy-only writes (`SUBSCRIPTION_PERIOD_WRITES=off`).

Tenant finance scoping, owner workspace entry and per-workspace frontend caches are implemented. Actor guards validate audit attribution. Organization/staff admission and trial expiry are enforced; pooled storage/email metering is implemented. Payment administration remains pending.

`organization_admin_deliveries` stores retry/lease state for independent initial administrator credentials. It stores no cleartext password. The administrator is a normal tenant user and counts toward the member allowance.
