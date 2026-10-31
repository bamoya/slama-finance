# Organization staff authentication

Staff identities are independent of platform owners. An owner does not need a duplicate
staff account. Organization-scoped authentication is implemented; tenant finance activation remains pending. Business repositories/workers now use the shared
[tenant isolation layer](finance-isolation.md).

## Schema and access

The clean `0000_initial_schema.sql` baseline defines staff, role, session and recovery scopes,
organization-local uniqueness and composite credential foreign keys. Deferred triggers reject
cross-organization role assignments, credential links and assigning-user references.
Organization scope is required on all staff, role, assignment and credential records. An absent
factory argument uses the active database tenant context; missing context matches no staff rows.
There is no unassigned/global staff fallback or administrator bootstrap.

The old company binding table, binding CLI, `LEGACY_ORGANIZATION_ID` configuration and Slama
administrator bootstrap have been removed. Fresh installations have no accounts or customer data.
Owner registration is the entry point. There is no supported legacy-data adoption procedure.

## Routes

Contracts: `api/openapi/modules/identity/organization-auth.yaml`.

Under `/v1/organizations/{organizationId}/auth`:

- POST login, logout, change-password and password-reset/request or password-reset/confirm.
- GET session.
- PATCH profile.

Authentication derives scope from the route, checks availability, and uses a secure organization
cookie. Staff credentials and recovery tokens cannot authenticate another organization.
Paused, suspended, unactivated or deletion-pending organizations deny login and revoke sessions.
The UI shows an unavailable page instead of an actionable workspace.

The scoped personal authentication pages live under `/organizations/{organizationId}`.
Custom-domain discovery, owner workspace entry and finance activation remain separate tasks.

## Verification

Integration tests cover independent same-email accounts, cross-organization credential rejection,
role assignment integrity, recovery isolation and pause/reactivation. Fresh-database tests validate
the baseline and runtime provisioning. No hosted databases are modified by these tests.
