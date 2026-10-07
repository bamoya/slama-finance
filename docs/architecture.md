# Architecture

## Principles

The API is a seven-module modular monolith with layered internal
features. See [API architecture enforcement](implementation/api-architecture-rules.md)
for the enforced import boundaries and explicit transition exceptions. Existing
auth, staff creation and RBAC logic now follow this structure in `identity`.
Permission keys follow `resource.action`: `read`, `create`, `update`, `delete` (View/Create/Edit/Delete). State changes use Edit; Delete means permanent deletion. Unsupported operations have no grant, and reports retain the single `reports.read` capability. See [the permission standard](implementation/permission-standard.md) for migration and delegation rules.

Reporting deliberately uses one capability, `reports.read`, for all reports,
exports, schedules and receipt. The interface defaults to French with a persistent
French/English selector on public and authenticated pages; see
[UI localization](implementation/ui-localization.md). UI language does not mutate
customer data or frozen document content.

Company settings, bank accounts, document templates and private branding assets now follow the same layering in `settings`; see [implementation details](implementation/company-settings.md). Other target modules are implemented incrementally, not scaffolded in advance.

The current delivery baseline is [the implementation sequence](implementation/README.md)
and [approved database design](database-schema-design.md). Scope is one company,
administrator-created email/password accounts and PostgreSQL-backed background
work. Inventory, payment gateways, credit notes and government submission are
outside this MVP. Foundation runtime/test details are in
[the foundation runbook](implementation/foundation-runbook.md).

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
|- api/                              # Backend and finance domains
|  |- src/
|  |  |- app.ts                      # Application composition
|  |  |- server.ts                   # Startup and shutdown
|  |  |- middlewares/                # Shared HTTP authorization adapters
|  |  |- config/                     # Environment and runtime configuration
|  |  |- lib/                        # Validation, errors, transactions and logging
|  |  |- modules/                    # Business module boundaries
|  |  |  |- identity/                # auth, staff, rbac internal features
|  |  |  |- settings/
|  |  |  |- media/
|  |  |  |- clients/
|  |  |  |- catalog/
|  |  |  |- sales/                   # estimates, invoices, delivery notes, payments
|  |  |  `- reporting/
|  |  |- support/                    # Business-agnostic supporting capabilities
|  |  |  |- artifacts/
|  |  |  |- jobs/
|  |  |  `- notifications/
|  |  |- integrations/               # Storage, email, payments, providers
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
|  |  |- app/                        # Application composition and explicit routes
|  |  |  |- router/
|  |  |  |  |- public-routes.tsx    # Login and future unauthenticated pages
|  |  |  |  |- protected-routes.tsx # Internal finance routes
|  |  |  |  `- protected-route.tsx  # Shared shell and auth/RBAC boundary
|  |  |  `- pages/                  # Application-level 404 and fallback pages
|  |  |- features/                   # Dashboard, invoices, customers, etc.
|  |  |- components/                 # Shared UI and layout components
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
|- infra/
|  |- compose/                       # Local and production Compose definitions
|  |- aws/                           # Lightsail + S3 launch definitions
|  `- oci/                           # Retained OCI fallback and existing state
|- package.json                      # Workspace commands only
`- pnpm-workspace.yaml
```

## API contract ownership

Reporting uses sales-owned read projections through public module interfaces. The
dashboard and reports share the same metric definitions; manual PDF/CSV exports
are downloads, not emails. Scheduled runs preserve a frozen snapshot and private
output. Notifications use a generic PostgreSQL-backed sender: business producers
own eligibility, message composition and dispatch associations. The sender knows
only payloads and attachment keys. See the [remaining-feature specification](implementation/remaining-features-spec.md),
[execution record](implementation/remaining-features-progress.md) and
[delivery behavior](implementation/notification-delivery-status.md) for verification
status and operational limitations.

Authentication screens, session protection and permission-aware UI access are
documented in [Authentication UI](implementation/auth-ui.md).
API-integrated staff and role pages are documented in
[Staff and RBAC UI](implementation/staff-rbac-ui.md).

`api/openapi/openapi.yaml` is the entry point to the single source of truth for the HTTP API.
It references feature contracts under `modules/identity`, `modules/settings` and reusable definitions
under `shared`. Both API runtime validators and transport types are generated;
business modules must not maintain handwritten copies.
The UI references the API's `openapi` directory using a relative symbolic link
and generates its client and validation schemas locally. This keeps the API
contract adjacent to the implementation it describes without introducing a
third shared package.

```text
api/openapi/openapi.yaml
             |
             |-- generated API Zod validators and inferred transport types
             `-- ui/openapi (symbolic link) --> generated UI client and schemas
```

See [Generated HTTP contracts](implementation/generated-contracts.md) for the
generation workflow, supported validation and ownership rules.

## Local containers

Compose definitions live in `infra/compose/` because they describe the system
as a whole. Application Dockerfiles remain in `api/` and `ui/`. Run commands
from the repository root with an explicit `-f` path. Local Compose pins the
`slama-finance` project name to preserve existing volume names; if you previously
used a custom `-p` project name, continue using it.

```text
infra/compose/docker-compose.yml
|- api       -> api/Dockerfile (currently commented out)
|- ui        -> ui/Dockerfile (currently commented out)
|- postgres  -> primary relational database
|- postgres-test -> isolated opt-in test profile
`- mailpit   -> local email capture
```

## Ownership boundaries

| Area                                             | Owner            |
| ------------------------------------------------ | ---------------- |
| Database schema, migrations, and seeds           | `api`            |
| OpenAPI specification                            | `api`            |
| Invoice lifecycle, tax logic, audit trail        | `api`            |
| Private file storage and email delivery adapters | `api`            |
| Generated API client and UI validation schemas   | `ui`             |
| Pages, navigation, forms, and localisation       | `ui`             |
| Local and production container orchestration     | `infra/compose/` |

Private uploaded images are managed by the `media` API/UI module. Company and
template records reference `media_assets` UUIDs rather than raw object keys.
OpenAPI generates both API validation and UI Query hooks. See
[Media management](implementation/media-management.md) for lifecycle, permissions,
cleanup and the deliberate re-upload of legacy images without file backfilling.

## UI dependency strategy

The UI uses Wouter for explicit client-side routing, following the routing
pattern established in the Thimar UI. TanStack libraries remain responsible
for the areas where their focused primitives are valuable: server state,
forms, tables, and virtualized collections.

```text
React + Vite
|
|- Wouter              -> lightweight explicit routes and navigation
|- TanStack Query      -> API cache, mutations, loading and error state
|- TanStack Form       -> form state and validation integration
|- TanStack Table      -> invoice, customer, payment, and audit registers
|- TanStack Virtual    -> efficient rendering of large data sets
`- Query Devtools      -> development-only query inspection
```

The UI dependency baseline is:

| Dependency                       | Responsibility                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| `react`, `react-dom`, `vite`     | UI runtime and build tooling                                       |
| `wouter`                         | Client-side routing, navigation, redirects, and route parameters   |
| `@tanstack/react-query`          | Server state, caching, mutations, invalidation                     |
| `@tanstack/react-form`           | Typed customer, invoice, payment, and settings forms               |
| `@tanstack/react-table`          | Sortable, filterable, paginated financial registers                |
| `@tanstack/react-virtual`        | Large invoice and audit-history lists                              |
| `@tanstack/react-query-devtools` | Development-only query inspection                                  |
| `zod`                            | Client-side data and form validation                               |
| `orval`                          | Generated typed API client from `ui/openapi`                       |
| `axios`                          | Shared HTTP instance, cookie credentials, timeout and cancellation |
| `i18next`, `react-i18next`       | French, Arabic, and English localisation                           |
| `tailwindcss`, `shadcn/ui`       | Styling and accessible UI primitives                               |

### UI routing structure

Routes are declared explicitly rather than inferred from filenames. Route
declarations stay thin: they map URLs to feature pages and apply shared
boundaries. Product page implementation remains inside `features/`.

```text
App
|- public-routes
|  `- /login
|- protected-routes
|  |- /dashboard
|  |- /invoices
|  |- /clients
|  |- /payments
|  |- /reports
|  `- /settings
`- not-found
```

`ProtectedRoute` is the single boundary for internal pages. It resumes the
user session, redirects unauthenticated visitors to `/login`, enforces
password-change onboarding and checks route-level RBAC.
The `AppShell` owns shared navigation and the top bar; feature pages are passed
to it as children.

TanStack Store is not part of the initial baseline: Query owns server state and
Form owns form state. It can be introduced later only for genuinely shared,
client-only state that neither package should own.

## Consistent page actions

- Detail pages place primary actions (Edit, Issue, Download, Record payment) in
  the shared `PageHeader` action slot. Actions wrap below the title on narrow screens.
- Secondary actions (Archive, Cancel, Restore, Delete) live in the shared
  `MoreActions` menu. Permission-gated action controllers register only the
  allowed items; an empty menu is not shown. Confirmations and cancellation
  reason dialogs stay mounted independently of the dropdown.
- Create/edit management pages put Save/Create and Cancel in `FormActionBar`, a
  sticky bottom footer outside multi-column field grids, within the form boundary.
  Public authentication screens retain their compact card-local actions.
- Tables retain compact icon actions in the final column. Contextual controls
  such as adding a variant or selecting media remain beside their fields.
- Use these shared components for future pages rather than adding separate
  action sections in page content.

## Shared form appearance

Inputs, textareas, selects, comboboxes and date-range triggers share
`components/ui/form-control-styles.ts`. Their background and border use the global
`--field-bg` / `--field-border` tokens in both themes, with consistent focus,
invalid and disabled styles. Date-range triggers use the Button `field` variant;
ordinary action buttons retain their existing variants. Switches use theme tokens
for their track and thumb, and checkboxes retain distinct checked states.

Pages must reuse these controls rather than native text fields or per-page color,
border and radius overrides. Keep field-specific layout classes only. Timezone
selection uses `TimezoneSelect`, preserving IANA identifiers and searchable labels.

## UI module alignment and generated queries

Implemented UI features mirror the API modules: `features/identity` contains
auth, staff and roles; `features/settings` contains company, bank accounts,
document templates, assets and shared forms. Each module exposes an `index.ts`;
ESLint allows internal collaboration but blocks cross-module deep imports.
POC-only domains remain separate until their corresponding API modules exist.

Orval generates TanStack Query v5 hooks, mutation hooks, options and key factories
under `ui/src/api/generated/{identity,settings,shared}`. Requests use the shared
Axios transport. Generated Zod response validators run before data enters the
cache. Session semantics, sensitive mutation cleanup, permissions and related-cache
invalidation remain application-owned. See
[the migration notes](implementation/ui-module-query-migration.md) for the full structure.

## API dependency strategy

The API is a modular, PostgreSQL-backed HTTP service. Dependencies are chosen
to keep financial calculations exact, persistence explicit, and background
delivery resilient.

| Dependency                                      | Responsibility                                                                                                     |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fastify`                                       | HTTP server, routing, request lifecycle, and plugins                                                               |
| `zod`                                           | Request, configuration, and integration-payload validation                                                         |
| `drizzle-orm`, `drizzle-kit`, PostgreSQL driver | Schema, migrations, and typed SQL access                                                                           |
| `decimal.js`                                    | Exact money, VAT, discount, and balance arithmetic; JavaScript floating point must not be used for monetary values |
| PostgreSQL job tables                           | Background jobs, leases, retries and scheduled work; no Redis requirement                                          |
| `pino`                                          | Structured application and audit-safe operational logging                                                          |
| S3-compatible storage SDK                       | Shared adapter: MinIO locally, private AWS S3 for the selected launch; OCI Object Storage remains a fallback       |
| PDF libraries                                   | Immutable printable document generation                                                                            |
| `vitest`                                        | Unit and integration tests                                                                                         |

Authentication uses server-side cookie sessions and administrator-created accounts,
with single-use temporary-password onboarding delivered in sequence 01. Dynamic
RBAC follows in 02. The current Compose/dependency scaffold still includes unused
Redis/BullMQ entries; remove those during sequence 06 after checking consumers.
They are not the approved queue design. Audit writer plumbing exists in 00;
production audit DDL and least-privilege grants are installed with the 01 baseline.
