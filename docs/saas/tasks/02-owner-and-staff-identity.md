# 05 — Build organization creation and owner navigation

Status: in progress. Owner organization list/detail navigation is implemented; creation, trial and
quota enforcement are outstanding.

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

## Shared organization authorization

The identity public interface now resolves explicit owner/staff sessions into a verified organization
actor context, with current ownership or role-derived permission checks. See the
[owner portal authorization boundary](../owner-organization-portal.md). Finance route/audit integration
and platform administrator authorization remain outstanding.
