# Database migrations

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

This baseline replaces the development migration history. Existing development databases
must be recreated before using it; it is not an upgrade path for previously deployed Slama
installations. Do not run it against an old hosted database. Once this SaaS is deployed,
keep applied files immutable and use new forward migrations for subsequent changes.

Tenant finance scoping, owner workspace entry and per-workspace frontend caches are implemented. Actor guards validate audit attribution. Organization/staff admission and trial expiry are enforced; pooled storage/email metering is implemented. Payment administration remains pending.

`organization_admin_deliveries` stores retry/lease state for independent initial administrator credentials. It stores no cleartext password. The administrator is a normal tenant user and counts toward the member allowance.
