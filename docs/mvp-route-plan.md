# MVP delivery plan

> Superseded planning reference. Do not implement the OAuth, organization or
> compliance sections below. The approved scope and sequence are now in
> [implementation/README.md](implementation/README.md) and
> [database-schema-design.md](database-schema-design.md). Retained for history only.

The API contract is authored in `api/openapi/openapi.yaml`, then the UI runs
`pnpm api:generate` against its `ui/openapi` symbolic link. Generated output is
ignored; the OpenAPI file, database schema, and migrations are the sources of
truth.

## Delivery sequence

| Phase           | Migration / tables                                                             | API routes                                           | UI route / outcome                                      |
| --------------- | ------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------------- |
| 1. Identity     | `users`, `user_settings`, `oauth_accounts`, `sessions`, `oauth_authorizations` | Google OAuth, session, logout, current-user settings | `/login`, authenticated shell, profile/settings menu    |
| 1b. Global RBAC | `roles`, `permissions`, `role_permissions`, `user_roles`                       | dynamic role/permission and staff-role assignment    | `/settings/team-and-roles`, permission-gated navigation |
| 2. Organisation | `organizations`, `organization_members`                                        | create/select organisation, member roles             | onboarding and workspace selector                       |
| 3. Customers    | `customers`, addresses                                                         | list/create/update/archive customers                 | `/customers`, customer form and profile                 |
| 4. Catalog      | `products`, tax categories                                                     | product CRUD                                         | `/catalog` and item selector                            |
| 5. Invoices     | `invoices`, `invoice_lines`, `invoice_events`, sequences                       | draft, issue, list, detail, PDF/XML job request      | `/invoices`, compose/edit/detail screens                |
| 6. Payments     | `payments`, payment allocations                                                | record/reconcile payment                             | invoice payment drawer and payment register             |
| 7. Compliance   | `document_artifacts`, submission attempts, audit entries                       | e-invoice submission/status, downloads               | invoice compliance status and audit timeline            |
| 8. Reporting    | materialized/query views only when needed                                      | dashboard/cash-flow endpoints                        | current dashboard wired to real data                    |

Every phase follows the same order: schema and migration, API contract,
repository/service/routes and tests, client regeneration, UI query/form/table,
then integration tests. Financial state transitions are append-only events and
audit records; money uses `decimal.js`, never JavaScript floats.

## Phase 1 contract

| Route                          | Purpose                                                            | UI consumer                  |
| ------------------------------ | ------------------------------------------------------------------ | ---------------------------- |
| `GET /v1/auth/google`          | Begin OAuth authorization-code + PKCE flow                         | Login button redirect        |
| `GET /v1/auth/google/callback` | Consume single-use state, provision identity/session, return to UI | Browser redirect only        |
| `GET /v1/auth/session`         | Return authenticated user and settings                             | route guard and profile menu |
| `POST /v1/auth/logout`         | Revoke current session and clear cookie                            | profile menu                 |
| `GET /v1/users/me/settings`    | Read user preferences                                              | settings route               |
| `PATCH /v1/users/me/settings`  | Update locale, timezone, theme                                     | settings form                |

Google client credentials are deployment secrets. Local and production redirect
URIs must be registered in Google Cloud before login is enabled.
