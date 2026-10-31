# 00 — Resolve implementation design gates

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: None.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Record final decisions for central owner authentication on custom domains, session/recovery boundaries and account linking. The prior handoff flow is a proposal, not an approved implementation.
- [ ] Define Basic versus Full analytics, Essential branding controls, manual payment methods, administrator delegation, coverage timestamps, proration, quota units/reset rules and storage downgrade handling.
- [ ] Define domain sharing/removal, owner transfer/recovery, trial-abuse controls, legal billing retention and deletion/backup policy.
- [ ] Map each decision to its dependent task; unresolved decisions block only their dependent slice.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] A decision log distinguishes approved rules, proposals and unresolved questions.
- [ ] Authentication and data-deletion designs receive explicit review before implementation.
- [ ] Every remaining agreement question has an owner and a dependent task.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
