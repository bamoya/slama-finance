# Owner organizations and the shared authorization boundary

Current architecture: platform ownership grants portal management and read-only aggregate financial visibility through dedicated repositories. It never grants an operational staff session. Each organization has an independently provisioned normal administrator and its own login. See [platform/organization boundaries](platform-organization-boundaries.md); earlier owner-to-workspace proposals below are superseded.

Status: owner organization metadata pages and the shared identity/RBAC authorization service are
implemented. Organization creation, trials, subscriptions, domains, finance entry and consolidated
financial analytics are still separate tasks.

## Delivered UI

```text
app.<domain>/                      Classic owner overview (see owner-dashboard.md)
app.<domain>/organizations         Owned organization cards, search, status and pagination
app.<domain>/organizations/{id}    Organization details and owner-access summary
app.<domain>/account               Owner profile summary and logout
app.<domain>/login                 Central owner authentication
```

The portal uses a shared OwnerPortalLayout with Classic desktop/sidebar and mobile bottom navigation,
a sticky header, BaMoYa branding, account menu, theme and language controls, and the same page container, PageHeader, actions context, cards,
status badges, shadcn select and server-driven pagination as the existing UI. French/English and dark
mode remain global. New organization pages are under `features/identity/owners`.

The cards show real name, slug, status and additional staff count. Disabled/current onboarding staff
count toward capacity; archived/deleted staff do not. The owner is not represented as staff and never
consumes a staff slot. Organization details use the shared day-month-year date formatter.

Selection currently opens the organization's metadata page. It does not silently log the owner into
legacy finance, mint a duplicate staff account or link to an unscoped dashboard. No successful creation, plan, financial figure or trial allowance is fabricated. The guided creation
action is explicitly unavailable until its service exists. See [the Classic dashboard integration](owner-dashboard.md)
for current overview behavior and remaining capabilities.

## Contract and layering

Modular OpenAPI source: `api/openapi/modules/identity/owner-organizations.yaml`.
API validators, UI transport types and Orval query hooks are generated; generated artifacts stay ignored.

| Method | Route                                          | Behavior                                                           |
| ------ | ---------------------------------------------- | ------------------------------------------------------------------ |
| GET    | `/api/v1/owner/organizations`                  | Owned organizations only; page/pageSize, search and status filters |
| GET    | `/api/v1/owner/organizations/{organizationId}` | Owned organization metadata; non-owned and missing both return 404 |

The existing `identity/owners` feature now has organization routes, controllers, services, repositories
and a mapper. It preserves the layered modular monolith rather than introducing a new top-level module.
The separate owner session cookie is required. A staff cookie or an invalid owner session is insufficient.

Owner endpoints use the shared `createRequirePortalOrigin` middleware: another tenant's trusted CORS
origin cannot read the central portal. Owner account management stays independent of organization staff authentication; the former
legacy company binding guard has been removed.

## Database read policy

The clean baseline `0000_initial_schema.sql` defines a SELECT-only policy to `organizations`:

```text
Verified owner session
        |
Resolve platform owner ID on the server
        |
Transaction-local actor_type=owner and owner_id
        |
RLS permits organization rows whose owner_id matches
```

Repository queries additionally filter by owner ID. The owner context clears organization scope for
the portal transaction and is discarded on commit/rollback. A browser parameter cannot choose owner ID.
Existing FORCE RLS remains enabled. An unknown context sees no rows, and setting an owner ID with a
staff actor type does not activate this policy.

This is not a general RLS bypass. It grants no organization/domain updates, cross-customer access,
finance records or staff credential reads. The runtime role still has reviewed SELECT-only grants on
organizations. Staff counts are explicitly correlated to each owned organization; business-table RLS
and the final financial aggregation path remain task 04/11 work.

## Shared authorization API

The identity module exposes an internal public interface, not an additional browser endpoint:

```text
identity.publicApi.authorizeOrganization({
    organizationId,
    identityType: owner | staff,
    token,
    permission
})
    -> verified { organizationId, actor: { type, id } }
    -> null when identity, ownership or permission is insufficient
```

- Owner: resolve an enabled verified owner session, require current ownership, require active
  organization status and a known permission from the global catalog. No staff role/account is used.
- Staff: resolve an organization-bound full session and require the requested role-derived permission.
  Restricted onboarding sessions cannot gain business access.
- The caller explicitly selects the identity flow; an invalid owner token never falls back to staff,
  and matching email addresses never merge identities.
- Unavailable organizations block business authorization with `ORGANIZATION_SUSPENDED`. Staff sessions
  are revoked; the owner's independent platform session remains usable for management.
- An owner can still view owned organization metadata when it is paused, suspended or pending deletion.
  Lifecycle presentation precedence is pending deletion, administrator suspension, owner pause, setup,
  then active; resolving a weaker restriction does not hide a stronger one.

The returned context can feed the existing transaction-local organization helper. This service performs
identity/RBAC checks only. Handlers must additionally enforce plan features and quotas once task 06 is
implemented. Do not treat owner authority as a bypass of subscription or lifecycle restrictions.

Existing finance guards are deliberately unchanged. Wiring owner actors into finance also requires
actor-aware audit attribution and tenant-aware finance repositories; using an owner UUID as an old
staff `user_id` FK would be incorrect. These are outstanding integration requirements, not delivered
by the metadata pages.

## Client cache isolation

Owner query keys use the generated API paths. Successful owner login clears the previous owner's
queries before setting the new session. Logout clears all owner portal/auth queries. Independent
staff query/session state is preserved. Owner portal 401 responses do not trigger the global staff
session-expired event. Organization detail keys contain their organization ID.

## Verification and local rollout

- Six focused PostgreSQL tests cover owned-only list/details, counts, pagination/filtering, status
  precedence, central-origin restrictions, unfiltered RLS reads, owner authority and scoped staff grants.
- Five portal UI tests cover real list/detail rendering, filtering, paused metadata availability and
  cache isolation across owner login/logout. Existing owner authentication tests continue to pass.
- A local backup was taken before the new read policy. The normal initializer applies forward
  migrations and reviewed runtime grants without bootstrapping staff.
- No owner account, password, staff account or financial record is seeded or rewritten by this policy.
- The live local check passed owner signup/verification/login, owned organization list/detail and
  denial of another owner's organization. Its temporary owner and organization were deleted.
- The baseline includes the canonical `notification_dispatches.is_manual` column directly.
  The former compatibility repair migration is removed for fresh installations.

## Final verification — 2026-10-28

- Root `pnpm check` passes: formatting, lint, TypeScript, API/UI tests and both production builds.
- API: 194 unit tests across 35 files, plus architecture and generator checks.
- UI: 391 tests across 63 files.
- PostgreSQL integration: 263 tests across 30 files passed; one optional storage test skipped.
- Local `/owner` responds with HTTP 200 and the generated owner-query export is served correctly.
- Live local authentication, metadata isolation and the read-only detail flow were exercised against
  the restricted runtime database role, using temporary records that were removed afterward.
- Local worker checks pass after migration 0011; no further failures were observed across subsequent
  worker polling/metrics intervals. The initializer applied new migrations only, with staff bootstrap
  explicitly disabled.
- Existing non-blocking tooling/bundle warnings remain. No hosted database change, real outbound
  email, permanent test account, commit or push was performed.

The next integration phase is owner/staff access to fully tenant-scoped finance repositories and
actor-aware auditing. Owner organization creation and trials still depend on plan/quota work.
