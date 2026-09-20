# Architecture

## Principles

Slama Finance is a TypeScript `pnpm` workspace with two first-class projects at
the repository root: `api` and `ui`. There are deliberately no `apps/`,
`packages/`, or shared-code workspace directories.

The API is the system of record for business rules, persistence, and the HTTP
contract. The UI is a separately buildable web application that consumes that
contract. Each application has its own `Dockerfile`; the root Compose file
orchestrates the complete local development environment.

## Repository layout

```text
slama-finance/
|
|- api/                              # Backend and e-invoicing domain
|  |- src/
|  |  |- app/                        # Application composition and startup
|  |  |- config/                     # Environment and runtime configuration
|  |  |- middlewares/                # Auth, tenant scope, validation, errors
|  |  |- modules/                    # Feature-oriented domain modules
|  |  |  |- auth/
|  |  |  |- organizations/
|  |  |  |- users/
|  |  |  |- customers/
|  |  |  |- catalog/
|  |  |  |- invoices/
|  |  |  |- credit-notes/
|  |  |  |- payments/
|  |  |  |- tax/
|  |  |  |- e-invoicing/
|  |  |  |- documents/
|  |  |  |- reporting/
|  |  |  `- audit/
|  |  |- integrations/               # Storage, email, payments, providers
|  |  |- jobs/                       # Asynchronous and retryable work
|  |  `- lib/
|  |- db/                            # API-owned database definition
|  |  |- schema/
|  |  |- migrations/
|  |  `- seeds/
|  |- openapi/
|  |  `- openapi.yaml                # Source HTTP contract
|  |- tests/
|  |- scripts/
|  |- Dockerfile
|  |- package.json
|  `- .env.example
|
|- ui/                               # Web application
|  |- src/
|  |  |- app/                        # Routing, layouts, providers
|  |  |- features/                   # Dashboard, invoices, customers, etc.
|  |  |- components/
|  |  |- api/                        # Generated API client and schemas
|  |  |- hooks/
|  |  |- i18n/
|  |  |- styles/
|  |  `- test/
|  |- public/
|  |- scripts/
|  |- openapi -> ../api/openapi      # Relative symbolic link
|  |- Dockerfile
|  |- package.json
|  `- .env.example
|
|- docs/
|- scripts/
|- .github/workflows/
|- docker-compose.yml                # Local stack orchestration
|- package.json                      # Workspace commands only
`- pnpm-workspace.yaml
```

## API contract ownership

`api/openapi/openapi.yaml` is the single source of truth for the HTTP API.
The UI references the API's `openapi` directory using a relative symbolic link
and generates its client and validation schemas locally. This keeps the API
contract adjacent to the implementation it describes without introducing a
third shared package.

```text
api/openapi/openapi.yaml
             |
             `-- ui/openapi (symbolic link) --> generated UI client and schemas
```

## Local containers

`docker-compose.yml` is intentionally global because it describes the local
system as a whole. It builds each application from its own Dockerfile and
starts the shared development services.

```text
docker-compose.yml
|- api       -> ./api/Dockerfile
|- ui        -> ./ui/Dockerfile
|- postgres  -> primary relational database
|- redis     -> job queue and transient state
`- mailpit   -> local email capture
```

## Ownership boundaries

| Area | Owner |
| --- | --- |
| Database schema, migrations, and seeds | `api` |
| OpenAPI specification | `api` |
| Invoice lifecycle, tax logic, audit trail | `api` |
| E-invoice provider integrations | `api` |
| Generated API client and UI validation schemas | `ui` |
| Pages, navigation, forms, and localisation | `ui` |
| Local multi-service environment | Root `docker-compose.yml` |

## UI dependency strategy

The UI uses the TanStack ecosystem as its default application-state and
interaction stack. This avoids overlapping router, server-state, form, and
table libraries, while retaining a typed workflow from route to API request.

```text
React + Vite
|
|- TanStack Router     -> typed routes, route guards, loaders, search params
|- TanStack Query      -> API cache, mutations, loading and error state
|- TanStack Form       -> form state and validation integration
|- TanStack Table      -> invoice, customer, payment, and audit registers
|- TanStack Virtual    -> efficient rendering of large data sets
`- Query Devtools      -> development-only query inspection
```

The UI dependency baseline is:

| Dependency | Responsibility |
| --- | --- |
| `react`, `react-dom`, `vite` | UI runtime and build tooling |
| `@tanstack/react-router` | Typed navigation, route protection, route data |
| `@tanstack/react-query` | Server state, caching, mutations, invalidation |
| `@tanstack/react-form` | Typed customer, invoice, payment, and settings forms |
| `@tanstack/react-table` | Sortable, filterable, paginated financial registers |
| `@tanstack/react-virtual` | Large invoice and audit-history lists |
| `@tanstack/react-query-devtools` | Development-only query inspection |
| `zod` | Client-side data and form validation |
| `orval` | Generated typed API client from `ui/openapi` |
| `i18next`, `react-i18next` | French, Arabic, and English localisation |
| `tailwindcss`, `shadcn/ui` | Styling and accessible UI primitives |

TanStack Store is not part of the initial baseline: Query owns server state and
Form owns form state. It can be introduced later only for genuinely shared,
client-only state that neither package should own.

## API dependency strategy

The API is a modular, PostgreSQL-backed HTTP service. Dependencies are chosen
to keep financial calculations exact, persistence explicit, and background
delivery resilient.

| Dependency | Responsibility |
| --- | --- |
| `fastify` | HTTP server, routing, request lifecycle, and plugins |
| `zod` | Request, configuration, and integration-payload validation |
| `drizzle-orm`, `drizzle-kit`, PostgreSQL driver | Schema, migrations, and typed SQL access |
| `decimal.js` | Exact money, VAT, discount, and balance arithmetic; JavaScript floating point must not be used for monetary values |
| `bullmq`, Redis client | Background jobs, retries, and scheduled work |
| `pino` | Structured application and audit-safe operational logging |
| S3-compatible storage SDK | Invoice PDF/XML storage and backup upload integration |
| PDF and XML/UBL libraries | Invoice artifact generation and e-invoice payloads |
| `vitest` | Unit and integration tests |

The authentication mechanism will be selected when the user, organisation, and
role model is specified. Financial records must retain an immutable audit trail
regardless of that choice.

`api/modules/e-invoicing` exposes provider adapters so jurisdiction-specific
submission requirements do not leak into the invoice core.
