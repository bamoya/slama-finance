# 12 — Build SaaS administrator operations

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: 02, 06, 07, 08, 10.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Provide protected customer/organization lists, subscription detail, manual payment confirmation, plan/quota management, restrictions, deletion oversight and usage/audit views.
- [ ] Require explicit platform-administrator capability; ordinary owners/staff cannot access this surface.
- [ ] Audit administrative activation, payment confirmation, overrides, suspension and recovery with actor and before/after context.
- [ ] Do not introduce silent impersonation or automatic finance-data access. Display support tier without inventing a response-time SLA.
- [ ] Reuse shared table filters, pagination, impact dialogs and action placement; expose only approved operational actions.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Unauthorized owner/staff requests fail at the API, not just navigation.
- [ ] Duplicate confirmations are safe; restriction changes do not bypass deletion or billing rules.
- [ ] Sensitive admin notes and cross-customer data never appear on public or tenant pages.
- [ ] All high-impact mutations have reviewable audit records.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
