# Foundation runbook

Current auth UI status: the earlier POC bypass described below has been removed.
See [Authentication UI](auth-ui.md) for implemented flows and local setup.

## Implemented in sequence 00

- Environment validation, request IDs, exact trusted-origin mutation checks,
  no-store responses, CORS/security headers, rate limits and safe error envelopes.
- Liveness `/health` and bounded PostgreSQL readiness `/ready`; one lazy connection
  pool per application, closed on shutdown. Missing local DATABASE_URL leaves
  liveness operational and readiness unavailable; production requires a URL.
- Decimal-string/date/UUID/version/list helpers, transaction helper, allowlisted
  transaction-only audit writer and storage/email interfaces.
- Validated OpenAPI for foundation and existing auth/RBAC scaffolding. Obsolete
  Google paths removed because they did not correspond to running handlers.
- Shared credentialed UI transport, structured errors, retry policy, shadcn-style
  Radix conflict dialog and loading/empty/error/forbidden/form states. The POC
  route authentication bypass remains for sequence 01; this is not a launch-ready
  authorization implementation.

## Local commands

Run from the repository root using Node 22+ and the pinned pnpm version:

```sh
pnpm install --frozen-lockfile
pnpm contract:check
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

API and UI dev/test/typecheck/build generate ignored contracts automatically.
See [Generated HTTP contracts](generated-contracts.md) before changing an endpoint.
`pnpm check`
also includes repo-wide formatting; existing unformatted documents outside this
sequence may need separate cleanup. Orval 7 may emit an esbuild import.meta/CJS
warning while inspecting the custom HTTP module; the actual UI builds as ESM.

UI requests use the shared Axios instance in `ui/src/api/http.ts` through
`apiRequest` or Orval-generated functions. It configures the API base URL,
cookie credentials, a 15-second timeout and AbortSignal cancellation. The wrapper
normalizes JSON responses, field errors and request IDs into the existing API
error model. Authentication uses the same transport; do not create per-feature
Axios instances or raw fetch calls.
The GitHub Actions check workflow runs `pnpm check` and the real PostgreSQL suite
against its own service database. It requires no production credentials.

The API server reads `api/.env` when launched from `api` (as workspace dev does).
See `api/.env.example`; never commit populated secrets. `CORS_ORIGIN` is a comma-
separated exact origin allowlist, no wildcard/path/trailing slash. Production
requires HTTPS origins and secure cookies. CLI mutation tests must send a trusted
Origin too, for example `Origin: http://localhost:5173`. CORS alone is not the
CSRF defense. Reverse-proxy trust is disabled until a specific topology is approved.

## Real database integration tests

```sh
docker compose -f infra/compose/docker-compose.yml --profile test up -d --wait postgres-test
TEST_DATABASE_URL=postgres://slama_test:slama_test@127.0.0.1:55439/slama_finance_test pnpm test:integration
docker compose -f infra/compose/docker-compose.yml --profile test stop postgres-test
```

The test service is localhost-only and uses tmpfs, no application data volume.
Tests fail, rather than silently skip, when TEST*DATABASE_URL is absent. The fixture
requires a localhost database ending `_test`, creates random `foundation_test*_`schemas and`foundation*app*_` roles, seeds a deterministic test user, and drops
only its generated identifiers. This requires an owner-level test connection.
Never use the application database URL. Tests verify audit rollback, constraints,
role restrictions and real readiness; they do not migrate your app database.

## Migration inventory and privilege boundary

Update: the local database is now initialized and the baseline journal/snapshot
have been reconciled. See [Local development setup](local-development.md).
The following inventory records the earlier sequence-00 state, not current setup.

Observed repository state at sequence 00: `api/db/schema/auth.ts` defines users,
user_settings, sessions, roles, permissions, user_roles and role_permissions.
`0000_auth_foundation.sql` exists, but `meta/_journal.json` has no entries. Therefore
the current migrate command cannot be assumed to apply that SQL. No configured
target database was available for read-only migration-history verification; other
projects' databases were deliberately not queried.

Do not apply/reset/rewrite anything based only on the empty local journal. In 01,
inspect the intended target's migration history and tables first. If confirmed
unapplied and disposable, consolidate the approved initial schema and matching
Drizzle metadata. Otherwise create forward migrations. Source schemas, authored
SQL and migration journal/snapshots are versioned; generated UI clients are not.

Production audit table/DDL is intentionally deferred to 01. Its SQL writer is
tested against fixture-only DDL. Use a migration-owner connection
(`MIGRATION_DATABASE_URL`) separately from the API's non-owner login
(`DATABASE_URL`). The API role needs schema usage, relevant business DML and
SELECT/INSERT on audit_events only, no audit UPDATE/DELETE/TRUNCATE, schema CREATE
or migration-owner membership. Object ownership must remain with the migration
role. The integration fixture proves this boundary; production grants are still
to be provisioned with the approved baseline.

## Contract and middleware conventions

Errors contain `code`, `message`, `requestId` and optional fieldErrors. 400 is input,
401 session, 403 access/origin, 404 missing, 409 conflict, 413 size, 415 media type,
429 rate limit, 503 readiness and 500 generic failure. Unknown exceptions and DB
details are not returned/logged raw. Zod validation messages must never embed
submitted secrets. Audit reason/value policies must never include credentials.

Origin/security hooks run before business handlers; authentication/full-session
and RBAC hooks follow in 01/02. Existing auth/RBAC handlers were adapted only to
the managed pool, shared errors and disabled-user checks. Their temporary password,
last-admin and permission-delegation changes remain future work.

Lists use bounded page/pageSize, allowlisted sort/direction and stable ID tie-breaker.
Repositories map validated sort keys to SQL columns. Future versioned updates must
compare expectedVersion inside their locking/update transaction; calling a helper
outside the transaction is not concurrency protection. Financial DTOs use strings,
date-only values are business dates, timestamps include offsets. The decimal helper
uses explicit half-up rounding pending final accountant-approved examples.

Reference documentation used for implementation:
[Fastify server](https://fastify.dev/docs/latest/Reference/Server/),
[Fastify errors](https://fastify.dev/docs/v5.0.x/Reference/Errors/),
[Axios instances](https://axios-http.com/docs/instance).
