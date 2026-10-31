# 05 — Build organization creation and owner navigation

Status: in progress. Persisted six-step setup, branding, transactional activation, secure owner workspace entry, trial and organization/staff admission checks are implemented. Invitation delivery and custom-domain/session handoff remain outstanding.

Depends on: 02, 04; plan/trial checks integrate with 06–07.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Create organizations using company name, unique slug and French/English language; optional identity fields must not block onboarding.
- [ ] Grant owner authority without creating a duplicate staff user or storing initial_admin_mode.
- [ ] Implement owner organization list, create/open/manage screens, account/profile navigation and a shared organization switcher.
- [ ] Namespace or clear TanStack Query caches and organization-local stores on switching; prevent stale data and in-flight responses appearing in the next tenant.
- [ ] Use the agreed identity entry flow; enforce organization capacity server-side once entitlements are connected.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Owner can create and enter an organization without an extra staff account.
- [ ] Organization switching cannot display cached data from a different organization.
- [ ] Forms use global headers, actions, errors and responsive controls; French/English are supported.
- [ ] Concurrent creation cannot exceed subscription capacity after task 06 integration.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.

## Implemented metadata slice

See [owner organization portal](../owner-organization-portal.md). Owners can list, search, filter,
paginate and inspect only their organizations through a shared portal layout. Creation, organization
switching into finance, trials and capacity enforcement remain outstanding; no create action is
exposed before those dependencies are ready.

Verified 2026-10-28: the owner list/detail and cache isolation tests pass, full root checks pass,
and the full integration suite passes (263 tests, one optional skip). Local metadata policy migration
is applied and the owner portal responds at `/owner`; finance entry and creation/trials remain open.

## Guided setup slice — 2026-10-30

See [organization onboarding](../organization-onboarding.md). New organization creation is now a real,
owner-scoped setup workflow with optional identity, private branding, document defaults, prepared
invitations, draft recovery and version conflicts. Forward migration 0012 and generated contracts
use the clean initial baseline; legacy workspace adoption is removed.

Completion records readiness but leaves the organization in Setup. Invitations are not sent and
finance access/trial capacity is not enabled. The remaining activation, domain/session, tenant-finance
and entitlement requirements keep this task in progress; do not treat draft creation as release-ready
subscription enforcement.

## Activation slice — 2026-10-30

Supersedes the earlier metadata-only boundary: completion now applies live company/template defaults and activates the workspace transactionally. Superseded by the independent-IAM implementation: platform creation now provisions a separate normal organization administrator, and entry uses the organization login with its own credentials. Trial and organization/staff capacity checks are enforced. Prepared invitations remain unsent. See [organization onboarding](../organization-onboarding.md) for remaining rollout boundaries.

### Verification of the activation slice

- Full UI suite: 416 tests passed across 67 files.
- Full PostgreSQL integration suite: 270 passed; one optional storage test skipped.
- API/UI typechecks, UI production build, lint and repository formatting passed. API lint retains two console warnings in the database initializer.
- Local API readiness and Vite return HTTP 200. Public-page browser smoke checks at 1440px and 390px found no runtime errors or horizontal overflow. Workspace business behavior is covered by integration tests; this smoke check is not a complete authenticated browser rehearsal.

## Independent organization administrator — current implementation

The platform/organization source split, independent administrator provisioning, leased credential delivery and ownership-scoped analytics are implemented. The initial administrator counts toward the member cap. Staff/profile/password operations are normal organization operations, with no Owner staff role or permission bypass. Prepared additional invitations, manual subscription administration and future custom-domain deployment remain separate tasks. See [the current agreement](../platform-organization-boundaries.md).
