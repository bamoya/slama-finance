# Implementation sequence

Status: implementation plan, not completed work. This directory changes no API,
UI or database code. Read the [approved database design](../database-schema-design.md)
for the authoritative fields, constraints and scope; these files define delivery
order, module responsibilities and proposed HTTP/UI contracts.

Implementation status is recorded separately from the original plans: [identity UI](staff-rbac-ui.md), [personal profile](profile-ui.md), [company settings](company-settings.md), [clients](04-clients.md), [catalog](05-catalog.md), and [reporting](11-reporting.md). Settings, clients, catalog and sales-document management now have API-backed screens, including payments, PDFs and estimate revisions. Dashboard/reporting now use live API data, with contextual records, exports and scheduled frozen reports. Historical scaffolding notes below describe the starting point, not the current state.

## Current implementation handoff

Use the [remaining-features agent specification](remaining-features-spec.md) as
the acceptance baseline for the delivered dashboard/analysis, manual downloads, generic email
delivery/document sending, and scheduled reports/client notifications. It defines
contracts, database changes, module ownership, shared UI requirements, permission
gates, work packages and acceptance tests. These four workstreams are not sequences
01–04. The specification refines older reporting/notification plans and explicitly
identifies obsolete names and scaffolding that must not be reintroduced. The next
phase is release acceptance; consult the [audit and outstanding gates](remaining-features-progress.md#release-audit--october-2026).

The approved 2026-10-03 [visual reporting and scheduler refinement](11-reporting.md)
defines the new dashboard/report diagrams, removal of the old reports page after
live integration, scheduler configuration/preview/history, and frozen summary/PDF
emails. Read it alongside the agent specification before reporting work. The new
visual pages now use generated live queries; labeled samples remain only in the scheduler
preview. New version-3 captures include section-specific supporting tables and
PDF/Excel output selection (PDF by default), including email attachments. Historical
frozen formats remain compatible. See the
verification record in sequence 11 for the delivered behavior and compatibility notes.

## Reading order

Media is now implemented before Catalog: [module and lifecycle](media-management.md),
[local/OCI storage setup](media-storage.md). Company and template image fields use
media UUID references. Legacy files are not migrated; images must be re-uploaded.

| Sequence                                                         | Deliverable                                                     | Prerequisites        |
| ---------------------------------------------------------------- | --------------------------------------------------------------- | -------------------- |
| [00 — Foundation](00-foundation.md)                              | Contract conventions, test harness, audit and security plumbing | None                 |
| [01 — Authentication](01-authentication.md)                      | Users, sessions, single-use passwords, personal preferences     | 00                   |
| [02 — Staff and RBAC](02-staff-rbac.md)                          | Administrator-managed staff and dynamic roles                   | 01                   |
| [03 — Company settings](03-company-settings.md)                  | Company identity, bank accounts, document appearance            | 02                   |
| [04 — Clients](04-clients.md)                                    | Individual/company customer management                          | 02; defaults from 03 |
| [05 — Catalog](05-catalog.md)                                    | Categories and packaged product variants                        | 02; defaults from 03 |
| [06 — Documents and workers](06-document-delivery-foundation.md) | Artifacts, durable preparation jobs and generic email queue     | 03                   |
| [07 — Estimates](07-estimates.md)                                | Independent estimate lifecycle and PDFs                         | 04, 05, 06           |
| [08 — Invoices](08-invoices.md)                                  | Direct invoices and repeated estimate conversion                | 07                   |
| [09 — Delivery notes](09-delivery-notes.md)                      | Invoice-first delivery and delivery-first invoicing             | 08                   |
| [10 — Payments](10-payments.md)                                  | Installments, cash/transfers and cheque clearance               | 08, 03               |
| [11 — Reporting](11-reporting.md)                                | Live dashboard/analysis and frozen scheduled reports            | 09, 10, 06           |
| [12 — Notification policies](12-notification-policies.md)        | Customer preferences, rules and automated reminders             | 07–11                |
| [13 — Release](13-release.md)                                    | Cross-domain verification, migration rehearsal and recovery     | All above            |

Follow the numerical order for predictable delivery. Clients and catalog are
independent once their prerequisites exist; payments do not technically require
delivery notes. Foundational domains come first because other domains depend on
them, not because they need the most dependencies themselves.

```text
Foundation → Users/auth → Staff/RBAC → Company/settings
                                       ├── Clients ───────┐
                                       ├── Catalog ───────┤
                                       └── Files/jobs ────┤
                                                         ↓
Estimates → Invoices → Delivery notes + Payments → Reports
                 └───────────────────────────────────┬────┘
                                      Notification policies → Release
```

## Existing code is scaffolding, not the target implementation

- API: Fastify, Drizzle/PostgreSQL, existing `auth` and `rbac` route modules.
  Password helpers currently live in auth routes; extract them into a service.
- UI: Wouter explicit routes, React, TanStack Query/Form/Table, Tailwind and
  shadcn components. Reuse the POC feature pages; replace mock persistence one
  feature at a time. Do not introduce TanStack Router or a new global store.
- `ProtectedRoute` currently bypasses authentication; restore enforcement in 01.
- OpenAPI currently still contains Google OAuth paths. Replace that obsolete
  contract in 01; public registration and OAuth are not planned.
- Older `architecture.md` / `mvp-route-plan.md` describe broader domains and Redis
  queues. Approved scope here excludes organizations, inventory, credit notes,
  refunds, gateways and government e-invoicing. PostgreSQL queues supersede the
  earlier BullMQ/Redis proposal. Reconcile those files/dependencies in 00/06.
- Existing route names use `/v1/rbac` and permissions such as `roles.read`.
  Proposed routes below retain that namespace for RBAC, but normalize permissions
  to `.read` plus explicit write actions. This is now implemented; see the
  [permission standard](permission-standard.md) for current grants and migration mapping.

## Module boundaries

```text
api/src/modules/<domain>/
├── routes.ts          HTTP adaptation and contract validation
├── service.ts         business rules, transactions and orchestration
├── repository.ts      queries using an explicit transaction when needed
├── schemas.ts         runtime input/output validation
└── policy.ts          permissions/lifecycle rules when substantial

api/db/schema/<domain>.ts       API-owned models
api/openapi/openapi.yaml        source contract; may reference API-owned fragments
api/tests/<domain>/             unit, integration and contract tests

ui/src/features/<domain>/
├── pages/             route-level composition only
├── components/        reusable domain widgets and forms
├── api/               query keys, generated-client adapters and mutations
├── hooks/             feature orchestration
└── context/           only genuinely shared ephemeral editor state, if needed
```

Small API domains: auth, users, rbac, company-settings, bank-accounts,
document-templates, clients, categories, products, estimates, invoices,
delivery-notes, payments, reporting, notification-policies, notification-dispatches,
document-artifacts, background-jobs, notification-delivery and audit.
Keep shared decimal/weight/numbering helpers inside the API, not a shared package.
Business modules may orchestrate another module's service; do not call its HTTP
routes internally or expose its repositories as the cross-domain interface.

## Rules applied to every sequence

1. Define OpenAPI operations, request/response DTOs, permission and error cases.
2. Define Drizzle models, database checks, indexes, seeds and migration impact.
3. Implement repositories/services, transactional audit events and route guards.
4. Generate ignored UI contracts through `ui/openapi`; integrate real queries.
5. Connect pages/forms, navigation guards, loading/empty/error states and cache
   invalidation; remove that feature's mock writes.
6. Run domain tests plus formatting, lint, type checking and contract generation.
   A sequence is complete only when its API and UI acceptance cases pass.

Server data belongs in TanStack Query; form drafts in TanStack Form; pagination,
filters and sort in URL search params. Context exposes session/permissions and
theme, not copies of every server table. Never store passwords or session tokens
in localStorage. Shell/sidebar stay global with consistent page width and dark mode.

## Migration strategy

The repository has `0000_auth_foundation.sql`; this plan does not assume it was
applied. Verify the actual database and migration journal first. If the database
is still disposable/unapplied as previously stated, consolidate the approved
initial schema instead of producing corrective migrations for each discussion.
Sequence files describe logical model batches, not mandatory separate SQL files.
Once any shared/deployed database has applied a baseline, use forward migrations
and never rewrite applied history. Never reset data without explicit approval.

Drizzle source, authored migrations and source OpenAPI are versioned. Generated
UI schemas/clients, builds, caches and rendered artifacts remain ignored. If
existing ignore policy conflicts with reproducible migrations, resolve it before
creating the baseline; do not silently rely on untracked migration history.

## Decisions and launch gates

Manual exports are downloads, not emails or scheduled report runs. Report snapshots
are immutable, dashboard/analysis live. VAT is opt-in. Public numbers use prefix,
company-local assignment year and a random 10-digit suffix. Confirm statutory
numbering with the accountant before launch; exact retention periods, VAT choices,
rounding examples and final printed wording also require approval. Proposed route
and permission names in this plan are implementation specifications, not claims
that these endpoints already exist.
