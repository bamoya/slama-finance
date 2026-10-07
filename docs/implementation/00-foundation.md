# 00 — Contract, persistence and security foundation

[Index](README.md) · Next: [Authentication](01-authentication.md)

Implementation status: foundation code and tests implemented. See the
[runbook](foundation-runbook.md) for commands, migration inventory and deferred
production grants. No application migration was applied. Sequence 01 still owns
temporary-password onboarding, authentication enforcement and audit-table DDL.

## Outcome and boundaries

Establish the shared implementation conventions before domain work. No financial
feature or new infrastructure service is introduced. Review existing Fastify
plugins, UI layout, OpenAPI generation, environment validation and migrations.

## Models and migration work

- Inventory current `api/db/schema/auth.ts` and migration state. Map existing
  names/types to the approved design without deleting user data.
- Introduce `audit_events` alongside the users baseline in 01 so its actor FK
  resolves; implement the audit writer/interface and tests now. Use allowlisted
  changed values, request ID and transaction context, never credentials/bodies.
- Standardize UUIDs, UTC timestamps, company-local dates, decimal strings in DTOs
  and exact Decimal arithmetic. Do not serialize money through JS floating point.
- Plan application/migration DB privileges separately; application writes cannot
  update/delete audit history. Verify transaction rollback includes audit writes.

## API conventions and routes

| Route         | Behavior                                                      |
| ------------- | ------------------------------------------------------------- |
| `GET /health` | Process liveness; no configuration/secrets                    |
| `GET /ready`  | Bounded DB connectivity/readiness check; 503 when unavailable |

All domain routes below use `/v1`. Lists accept `page`, bounded `pageSize`, `q`
and allowlisted sort/filter fields; return `{items, page, pageSize, total}`.
Specify stable secondary sorting by ID. Use 201 for creation, 202 for accepted
jobs, 204 for successful no-body actions. Standard errors contain `code`,
`message`, optional `fieldErrors` and `requestId`: 400 validation, 401 session,
403 permission, 404 missing, 409 conflict, 429 rate limit. Never leak SQL details.
Versioned updates send `expectedVersion`; stale writes return 409 and do not mutate.
Define distinct create/update/detail DTOs rather than exposing database rows.

## Middleware and services

- Request IDs, structured/redacted logs, central Zod/DB error mapping, request
  body limits and safe CORS origin allowlist. Secure cookie defaults and headers.
- Cookie-authenticated mutations require trusted Origin/CSRF protection, not
  just CORS. Apply this to login, logout and password changes too.
- Reusable validation, pagination, transaction and audit helpers. Auth/RBAC
  hooks are wired in 01/02; authorization remains server-enforced.
- Define storage and email provider interfaces, but implement them in 03/06.
  Secrets stay in runtime configuration, never policy tables or generated UI.

## UI, contexts and state

Retain `app/router`, `AppShell` and common `PageHeader`. Define reusable page
loading/error/empty/403/404 states, form errors and conflict dialogs. Keep a single
QueryClient. Generated API calls must include credentials and use one error
adapter. No business context/store is introduced in this sequence.

## Contract-first and verification

- Establish OpenAPI validation and response-shape tests; generate the UI client
  with `pnpm --filter @slama/ui api:generate` without committing generated output.
- Add a real PostgreSQL integration-test fixture with isolated database/schema,
  deterministic test users and cleanup limited to test resources. Do not rely on
  SQLite or mocked repositories for locking/constraint tests.
- Test health/readiness, field errors, unsafe Origin, body limits and redaction.
- Run relevant package tests, typecheck, lint and format checks. Reconcile older
  documentation where it conflicts with the approved single-company scope.

Exit: a reproducible local/test foundation and a documented initial migration
strategy; no domain may bypass these conventions later.
