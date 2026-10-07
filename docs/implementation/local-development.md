# Local development setup

PostgreSQL, Redis and Mailpit run in Docker. The API and UI run locally with
`pnpm dev`; their Compose services are intentionally commented out.

| Service            | Address                        |
| ------------------ | ------------------------------ |
| UI                 | http://localhost:5173          |
| API                | http://localhost:3000          |
| Finance PostgreSQL | 127.0.0.1:5433 / slama_finance |
| Redis              | 127.0.0.1:6380                 |
| Mailpit web UI     | http://localhost:8025          |

Port 5432 is used by another project and is not used by Finance. Finance's
PostgreSQL and Redis published ports are bound to localhost only.

## Database state

The local Finance database was confirmed empty before initialization. The single
`0000_auth_foundation.sql` baseline now has matching Drizzle snapshot and journal
metadata and has been applied. It creates eight identity tables, the admin role
and four current permissions. Future changes must use forward migrations; do not
rewrite this now-applied baseline.

`api/.env` is Git-ignored and owner-readable only. `DATABASE_URL` uses the
non-owner `slama_app` login. `MIGRATION_DATABASE_URL` uses the local database owner
for schema changes and bootstrap. The API role has DML permissions on the existing
identity tables, but cannot create tables, databases or roles. Future migrations
must explicitly grant access to new tables as needed; no blanket future grants
were installed. Production privilege provisioning remains a separate task.

The catalog migration (`0004_catalog_variants.sql`) has been applied locally.
The local `slama_app` role was granted `SELECT, INSERT, UPDATE, DELETE` on
`product_categories`, `products`, and `product_variants`. A fresh deployment
using a separate runtime role must grant equivalent DML permissions after
running migrations as the schema owner.

The Clients migration (`0005_tiresome_sunset_bain.sql`) has also been applied
locally. `slama_app` was granted `SELECT, INSERT, UPDATE, DELETE` on `clients`; fresh
deployments with a separate runtime role need the same grants.

After applying the sales migrations (`0006`–`0010`), grant the separate API role
access to their nine new tables with `pnpm --dir api db:grant-sales-runtime`.
The script checks that the runtime and migration URLs target the same database,
then grants only the DML operations used by sales, artifacts, and PDF jobs. Run
it again safely after restoring a database; it does not grant schema ownership.

## Commands

```sh
docker compose -f infra/compose/docker-compose.yml up -d --wait postgres redis mailpit
pnpm --filter ./api db:migrate
pnpm --dir api db:grant-sales-runtime
pnpm dev
```

Drizzle commands load `api/.env`. The table-source list in `drizzle.config.ts`
must be extended when new schema files are added. `db:generate` currently reports
no schema drift and rerunning `db:migrate` is a no-op.

## Initial administrator

The local account is `admin@slamaagricole.ma`. Its randomly generated password was
provided separately to the operator; it is not stored in this document or source.
Use Change password in the UI after signing in. No registration is exposed.

For a new, empty local database only:

```sh
pnpm --filter ./api db:bootstrap-admin admin@slamaagricole.ma
```

This command accepts an email, generates a strong random password and prints it
once. It creates settings and assigns the system admin role atomically. It refuses
to run if any users already exist, does not reset passwords or grant access to
existing users, and is restricted to a localhost `slama_finance` database outside
production. The first administrator gets an established password/full session,
not a staff temporary-password onboarding session.

## Email and storage

Local object storage now uses MinIO in Docker Compose, sharing the production
S3 adapter. See [media storage setup](media-storage.md) for bucket initialization,
verification, environment values and the existing-file migration caveat.

Mailpit is running but not connected to the Resend delivery adapter. Password
recovery remains unavailable until all three Resend settings are configured:
`RESEND_API_KEY`, `EMAIL_FROM`, and `PASSWORD_RESET_URL`. Use
`http://localhost:5173/reset-password` locally. No real email was sent during setup.

The `postgres-data` Docker volume persists database data across normal restarts and
container recreation. Do not run `docker compose down -v` unless deliberately
discarding that database. A local volume is not a backup.
