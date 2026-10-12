# Fresh-install migration baseline

This history replaces the 34 development migrations. It is for **empty databases only**.
Do not apply it to a database that ran the previous history, and do not clear an
existing database's migration journal to force it. Use a new database/volume for
the fresh deployment; preserve any old database separately if its data is needed.

- `0000_fresh_baseline.sql`: all 35 final tables, constraints, indexes, foreign keys
  and the product/variant integrity triggers.
- `0001_required_defaults.sql`: the 53 current CRUD permissions, system admin
  role and grants, empty company singleton, and six bilingual HTML email rules.
  Notifications are disabled by default. No demo records or user passwords are seeded.

The startup initializer still creates the restricted runtime database role and
bootstraps the first administrator from deployment environment variables. Drizzle
records successful migrations; subsequent startups do not reapply them.

Keep future schema changes as new migrations generated from `db/schema`. Custom
PostgreSQL triggers are maintained in SQL; they are not represented in Drizzle
snapshots. Keep both SQL migration files and `meta/` snapshots/journal committed.
