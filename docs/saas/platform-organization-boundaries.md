# Platform and organization boundaries

Approved 2026-10-30. This agreement supersedes the shared owner/staff workspace identity flow.

The platform owns marketing, platform accounts, organization ownership/provisioning, subscriptions and owner analytics. Organization owns independent staff credentials, roles and all business operations. Creating an organization creates an ordinary administrator using the platform owner's email as an initial contact; no password or session is shared. The administrator consumes a member slot, has no protected Owner role and follows ordinary administrator safeguards.

The organization login accepts organization credentials only. The platform links to that login rather than entering as an owner. Password changes and profiles remain independent. The first password is generated, expiring and single-use; a restricted session forces its replacement.

Platform owner analytics uses dedicated read-only repositories scoped through organization ownership. Direct aggregate reads of the shared finance schema are an intentional exception, not permission to reuse organization repositories or mutate business data. Splitting services later requires replacing these reads with a reporting projection.

Both application areas keep controller/service/repository layers. Cross-area workflows use explicit public interfaces. Infrastructure, generated contracts and shared UI primitives stay outside the areas. The modular OpenAPI contract namespaces/operation IDs remain stable during the source reorganization; physical code ownership is defined by the platform/organization trees.

Member limits include the initial administrator: Essential 1, Business 5, trial 2, Pro unlimited. Existing business records must not be removed by this restructuring. Platform provisioning is the only account-creation bridge; it grants no organization access to a platform session.

## Implemented flow

1. The authenticated platform owner creates an organization. The transaction admits the organization, starts its trial when appropriate, and provisions exactly one independent administrator through the organization identity public interface. A repeated request does not duplicate the user.
2. Setup and branding remain platform workflows. Completion applies organization defaults and activates the workspace. Prepared additional staff invitations remain unsent.
3. The organization-owned delivery worker claims the administrator delivery job, generates a temporary password, saves only its hash, then sends the credential and organization login link through the configured security email transport. Security mail does not consume business email allowance.
4. The password expires after 24 hours and is consumed by first login. A restricted session forces replacement before business access. Failed delivery retries rotate the temporary credential; latest delivered credentials supersede earlier ones. Leases and completion fencing prevent concurrent claims. Delivery stops after five attempts or when the administrator has already used/replaced credentials or become unavailable. Operator recovery after terminal failure belongs to the future administration dashboard.
5. Platform links lead to `/organizations/{id}/login`. Organization workspaces use `/organizations/{id}/workspace/...` and accept only staff sessions. Profiles, roles, logout and recovery stay within the organization IAM.
6. `/v1/owner/analytics/financial-summary` returns owned-organization MAD totals and daily trends, with a bounded inclusive reporting period. Revenue and collections use the requested period; outstanding and overdue are current snapshots. No FX conversion or profitability is implied. Queries run in a repeatable-read, read-only transaction and never return individual client records.

The initial administrator counts as one member: trial 2 total, Essential 1 total, Business 5 total, Pro unlimited. Disabled members count; archived/deleted members do not. No current local account password is reset by the development schema update.

## Validation

Full regression checks passed: 205 API unit tests, 19 architecture checks, five generator checks, 277 PostgreSQL integration tests (one optional storage test skipped) and 419 UI tests. Builds, types, lint and formatting passed. Real local owner-session browser checks confirmed financial summaries on desktop/mobile without overflow, independent organization-login links, and rejection of the platform cookie by organization workspace authentication. Existing local organization administrators were preserved; no account password was reset.
