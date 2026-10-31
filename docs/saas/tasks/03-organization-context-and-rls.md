# 03 — Implement tenant context and PostgreSQL isolation

Status: in progress. Initial foundation only; see completion evidence and rollout notes below.

Depends on: 01, 02.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Implement one verified organization-context boundary for requests and worker transactions; define runtime RLS policies with fail-closed missing context.
- [ ] Use transaction-local context compatible with pooling; repository filters and composite FKs remain required defense layers.
- [ ] Add organization-aware uniqueness and query conventions, trusted host resolution hooks, actor-aware audit plumbing and platform/global table policies.
- [ ] Keep privileged migrations separate. Design an explicit owned-organization aggregation path instead of globally bypassing RLS.
- [ ] Coordinate additive migrations with task 04; do not enable public multi-tenant access while any domain remains unscoped.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Integration tests prove isolation for reads, writes, bulk operations, forged IDs and foreign-key relationships.
- [ ] Missing context and pooled-connection reuse cannot expose another tenant.
- [ ] Runtime role cannot bypass RLS, including through table ownership.
- [ ] Owner aggregation only includes currently owned organizations.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.

## Initial implementation progress

The internal transaction-local context helper and regression tests are implemented. It is not yet wired
to request authentication or workers; forced RLS is implemented for the new organization/domain tables. Existing finance tenant columns,
RLS policies, composite business FKs and runtime grants remain outstanding. This task is in progress, not complete, and the app is still single-company.

Verification: three real-PostgreSQL RLS tests pass for missing-context denial, cross-tenant
reads/writes, forced RLS under a non-bypass table owner and separate organization requests.
Five foundation/migration tests also pass. Full database regression: 243 passed, one optional
storage test skipped. No production or application database was changed.

Owner metadata now has a separately scoped read-only RLS path, tested without repository filters
under a restricted role. It does not bypass finance RLS. See the owner portal document for the
verified shared authorization context and remaining finance integration requirements.
