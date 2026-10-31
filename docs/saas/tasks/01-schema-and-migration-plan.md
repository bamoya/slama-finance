# 01 — Design tenant schema and safe migration

Status: in progress. Initial foundation only; see completion evidence and rollout notes below.

Depends on: 00 for identity and retention decisions.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Inventory every existing table, unique constraint, FK, singleton setting, actor reference, storage key and worker payload.
- [ ] Design platform owners, organization staff, organizations, domains, actor-aware sessions/audits, plans, entitlements, subscriptions, billing and usage records.
- [ ] Produce ERDs for the fresh SaaS schema; no legacy customer-data mapping or adoption.
- [ ] Consolidate development schema directly into the initial baseline; retain separate migration/runtime roles and integrity policies. Use forward migrations after deployment.
- [ ] Define deployment compatibility and rollback checkpoints before enforcement; existing artifacts and document IDs must survive.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use the current clean baseline before deployment and forward migrations after deployment. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Every table is classified as global, organization-owned or owner/subscription-owned.
- [ ] Cross-tenant FK and uniqueness rules are documented, including deletes and nullable relationships.
- [ ] Fresh installation creates the current schema with no legacy adoption scripts or default credentials.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.

## Initial implementation progress

The current owner/organization/staff/onboarding schema is consolidated into one initial baseline.
Legacy company binding, upgrade migrations and global administrator bootstrap are removed.
The local application database was recreated explicitly on 30-10-2026.
This task remains in progress: finance tenant scoping and subscription/session/audit completion
are still required. See [foundation rollout](../foundation-rollout.md).
