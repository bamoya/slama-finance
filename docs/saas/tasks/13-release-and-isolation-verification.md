# 13 — Rehearse migration and validate SaaS release

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: 02–12 complete; outstanding gates resolved.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Run repository formatting/lint/types/unit/build checks and full database integration suite with dedicated test data.
- [ ] Rehearse new forward migrations against a restored populated baseline; verify data/file counts, links, credentials, RLS policies and runtime grants.
- [ ] Exercise owner/staff/domain isolation, cache switching, direct API bypasses, jobs, downloads, signed media, billing/tax, quotas and lifecycle boundaries.
- [ ] Validate shared UI layouts, mobile behavior, accessibility and French/English across all new screens.
- [ ] Document deployment config, domain/TLS operations, Resend setup, backup/restore, rollback checkpoints and operational alerts.
- [ ] Roll out only after every tenant-owned domain is scoped; no live multi-tenant interval with incomplete RLS/backfill.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] All required checks pass; failures and intentional exclusions are recorded rather than concealed.
- [ ] Migration rehearsal proves existing Slama data survives with no reset or applied-migration rewrite.
- [ ] Security review confirms tenant boundaries, session revocation and no cross-tenant artifact/job leakage.
- [ ] Release runbook has verified recovery steps; deployment itself requires separate authorization.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
