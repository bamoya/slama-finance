# Local development setup

PostgreSQL, Redis and Mailpit run in Docker. The API and UI run locally with
`pnpm dev`; their Compose services are intentionally commented out.

| Service            | Address                        |
| ------------------ | ------------------------------ |
| UI (public site)   | http://localhost:5173          |
| Owner portal       | http://app.localhost:5173      |
| Administration     | http://admin.localhost:5173    |
| Organization       | http://\<slug\>.localhost:5173 |
| API (direct)       | http://localhost:3000          |
| Finance PostgreSQL | 127.0.0.1:5433 / slama_finance |
| Redis              | 127.0.0.1:6380                 |
| Mailpit web UI     | http://localhost:8025          |

Port 5432 is used by another project and is not used by Finance. Finance's
PostgreSQL and Redis published ports are bound to localhost only.

## Sites and hostnames

Sites are host-based, like production. Vite proxies `/api` to the API on port 3000 and keeps the
browser `Host`, so each site works on its own `*.localhost` origin:

- `http://localhost:5173` public site
- `http://app.localhost:5173` owner portal
- `http://admin.localhost:5173` platform administration
- `http://<slug>.localhost:5173` organization workspace, for example `http://acme.localhost:5173`
  or `http://atlas-compta.localhost:5173` (slugs are 3-40 characters: `a-z`, `0-9`, `-`; `app`,
  `admin`, `api`, `www` and other reserved names are rejected)

`api/.env` must contain:

```text
PLATFORM_DOMAIN=localhost:5173
PLATFORM_SCHEME=http
```

(`api/.env.example` already has both.) Cookies are host-only, so signing in on one site never
signs you in on another. Owners cannot yet sign in to a workspace from `app.`; log in as staff on
`<slug>.localhost:5173`.

Chrome, Edge and Firefox resolve `*.localhost` natively. Safari does not resolve arbitrary
subdomains; add the ones you use to `/etc/hosts`:

```text
127.0.0.1 app.localhost admin.localhost acme.localhost atlas-compta.localhost
```

`curl` needs nothing special: `curl -H 'Host: acme.localhost:5173' http://localhost:3000/api/v1/public/site`.

## Database state

`0000_initial_schema.sql` creates the current 42 tables, integrity triggers, RLS and reference
defaults directly. The local `127.0.0.1:5433/slama_finance` database was explicitly recreated on
30-10-2026. Existing hosted databases and unrelated local databases were not touched.

`api/.env` is ignored. `MIGRATION_DATABASE_URL` uses the schema owner; `DATABASE_URL` uses the
restricted runtime role. Run `node --env-file=api/.env api/scripts/initialize-database.mjs` from
the repository root. Initialization is serialized and repeat-safe; it creates no accounts.

## Subscription coverage periods

`SUBSCRIPTION_PERIOD_WRITES` defaults to `on` (S5b dual write) and `SUBSCRIPTION_COVERAGE_READS` to `periods`
(coverage periods decide). Set reads to `legacy`, or writes to `off` together with legacy reads, only to reproduce
the emergency rollback; see `docs/deployment.md`.

## First owner

Register on `http://app.localhost:5173` (`/register`), verify the email, then create an organization through onboarding.
There are no default passwords, Slama accounts or staff-admin bootstrap scripts. Guided setup can
be saved/resumed; activation and secure finance entry remain pending. See the SaaS rollout docs.
Local owner email delivery uses SMTP/Mailpit when configured for the development environment.

## Email and storage

Local object storage now uses MinIO in Docker Compose, sharing the production
S3 adapter. See [media storage setup](media-storage.md) for bucket initialization,
verification, environment values and the existing-file migration caveat.

Production password recovery uses Resend with:
`RESEND_API_KEY`, `EMAIL_FROM`, and `PASSWORD_RESET_URL`. Use
the reset page of the site you are testing locally (for example
`http://acme.localhost:5173/reset-password`). No real email was sent during setup.

The `postgres-data` Docker volume persists database data across normal restarts and
container recreation. Do not run `docker compose down -v` unless deliberately
discarding that database. A local volume is not a backup.

## Timezone data for subscription writes

The API compares Node's ICU zone data for `Africa/Casablanca` with PostgreSQL's at startup; when they
disagree, subscription boundary writes (payments, confirmations, plan changes) return 503
`TIMEZONE_DATA_MISMATCH` and `/ready` reports `timezoneData.status: mismatch`.

Use the official Node 22 build (`.nvmrc`; `nvm install && nvm use`), which bundles current tzdata (2026e at
the time of writing), and keep the PostgreSQL image current. Homebrew's `node@22` links the system ICU and
still carries older zone data (2026a), so it triggers the mismatch against the PostgreSQL image. The API
Docker image (`node:22-alpine`) and CI (`node-version: 22`) already use the official build. If you must run
an older Node, point it at newer ICU zone files (`unicode-org/icu-data`, `tzdata/icunew/<version>/44/le/*.res`):

```sh
mkdir -p ~/.cache/icu-tz && cd ~/.cache/icu-tz
for f in zoneinfo64 timezoneTypes metaZones windowsZones; do
  curl -fsSLO https://raw.githubusercontent.com/unicode-org/icu-data/main/tzdata/icunew/2026e/44/le/$f.res
done
ICU_TIMEZONE_FILES_DIR=~/.cache/icu-tz pnpm dev
```

Check `curl -s http://127.0.0.1:3000/ready` shows `"status":"consistent"`. Production must update the API and
database images together (see the subscription decisions record).
