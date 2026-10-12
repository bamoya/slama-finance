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

Fresh installations use `0000_fresh_baseline.sql` (all 35 final tables and integrity
triggers) and `0001_required_defaults.sql` (current permissions/admin role, company
singleton and disabled bilingual email rules). No demo business data is inserted.

Use an empty database or a new Compose volume. The consolidated history is not an
upgrade for a local/deployed database that used the previous development migrations.
This change does not reset or migrate any existing local database automatically.

`api/.env` remains Git-ignored. `MIGRATION_DATABASE_URL` uses the schema owner;
`DATABASE_URL` uses a distinct restricted runtime role. The deployment initializer
applies migrations, creates that role, grants required table privileges and bootstraps
the first administrator. Repeated successful startups do not reapply migrations.
Future schema changes must use new forward migrations.

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
