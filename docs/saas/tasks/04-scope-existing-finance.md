# 04 — Scope every existing finance domain and support resource

Status: backend isolation implemented. Workspace UI scope/cache binding is pending task 05.

See [implementation and verification](../finance-isolation.md).

Depends on: 03.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [x] Apply organization scoping to settings, staff/RBAC, clients, catalog, estimates, invoices, BLs, payments, templates, media, artifacts, notifications and reporting.
- [x] Replace singleton company assumptions. Scope repository queries, search, impact previews, bulk actions, exports, document regeneration and relation lookup.
- [x] Add organization identifiers to jobs and establish tenant context in workers. Authorize file uploads/downloads and signed URLs; use private organization-prefixed storage.
- [x] Preserve frozen document/business rules, latest-identity regeneration behavior and approved deletion/cascade semantics within each organization.
- [x] Update modular contracts and generated consumers; do not handwrite duplicated transport schemas.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [x] The fresh baseline defines tenant scope directly; legacy Slama adoption is removed. Existing local owner/setup data was preserved during schema installation.
- [ ] Complete the end-to-end two-organization export/PDF and bulk-cascade release matrix after workspace activation. Current non-bypass coverage includes relationship guards, mixed-tenant selections, private downloads, storage prefixes and worker execution.
- [x] Company settings are tenant-local and database policies require scope for all finance tables.
- [x] Existing finance regression tests pass with explicit fixture organization scope.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.

## Implementation evidence — 30-10-2026

Required organization scope and FORCE RLS cover 34 tables, with 89 cross-tenant foreign-key checks.
The shared request/database boundary, tenant-local defaults/uniqueness and worker/storage execution
are implemented without changing controller/service/repository boundaries or duplicating DTO schemas.
Non-bypass integration tests validate scoped queries, raw SQL, bulk selection and private downloads.
The activation slice must still connect owner entry and the UI request/cache scope before release.
