# 11 — Build consolidated owner analytics

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: 04, 05, 06.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Define authorized aggregate contracts for revenue, collections, outstanding/overdue balances and organization comparisons.
- [ ] Scope each query to currently owned organizations; group currencies separately. Avoid profitability claims without costs/expenses.
- [ ] Build owner overview with meaningful charts, period filters, clear metric definitions and organization navigation using shared report components.
- [ ] Apply approved Basic/Full feature boundaries without weakening tenant query isolation or changing frozen report data.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Totals reconcile with each included organization for the same period/status rules.
- [ ] Foreign organization IDs and revoked ownership do not expose data through filters or caches.
- [ ] Empty, partial, loading, mobile and French/English states are usable.
- [ ] No chart describes revenue as profit.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
