# Database migrations

The deployed `0000`/`0001` baseline is immutable. Existing installations that
already applied those files receive changes through `0002` and later migrations.
Never clear the migration journal, reset a volume or edit an applied migration.
The initial baseline replaced 34 pre-deployment development migrations; databases
using that older history require a separately reviewed upgrade, not a forced reset.

- `0000_fresh_baseline.sql`: original 35 tables, constraints, indexes, foreign keys
  and product/variant integrity triggers. Preserved byte-for-byte as deployed.
- `0001_required_defaults.sql`: the 53 current CRUD permissions, system admin
  role and grants, empty company singleton, and six bilingual HTML email rules.
  Notifications are disabled by default. No demo records or user passwords are seeded.
- `0002_flexible_document_lifecycle.sql`: additive lifecycle upgrade. Adds hidden
  staff deletion attribution, nullable document client links, source-estimate and
  payment-bank snapshots, cancelled-draft BL support, and one-invoice-per-BL
  integrity triggers. Backfills existing snapshot references without rewriting
  issued printable content or deleting business records. Unambiguous legacy BL
  ownership is inferred from existing links; conflicting owners block and roll
  back the migration with the affected BL IDs for explicit reconciliation.

The startup initializer still creates the restricted runtime database role and
bootstraps the first administrator from deployment environment variables. Drizzle
records successful migrations; subsequent startups do not reapply them.

Back up the deployed database before deployment. Publish/deploy the updated release
image and run its normal migration/initialization step before starting the new API.
Existing data and migration history are retained. This repository change does not
itself execute anything against the hosted database.

Keep future schema changes as new migrations generated from `db/schema`. Custom
PostgreSQL triggers are maintained in SQL; they are not represented in Drizzle
snapshots. Keep both SQL migration files and `meta/` snapshots/journal committed.
