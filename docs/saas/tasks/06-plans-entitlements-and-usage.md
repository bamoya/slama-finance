# 06 — Implement plans, feature gates and quota accounting

Status: partially implemented. Plan catalog, subscription read API, seven-calendar-day trial, expiry checks, concurrency-safe organization/staff admission and selected API/UI feature gates are implemented. Pooled storage/email consumption metering and owner usage warnings are implemented. Audited exceptions, payment-confirmation administration and the full restore/plan matrix remain open.

Depends on: 03, 04.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [x] Model Essential/Business/Pro using the approved agreement table: 1/3/unlimited organizations and 0/5/unlimited additional staff per organization.
- [ ] Implement shared API entitlement/quota checks and UI feature gates; owner bypass applies only to staff permissions.
- [x] Meter pooled storage and monthly business emails; trial has separate finite allowances. Use approved reset/recipient/retry rules from task 00.
- [ ] Count disabled staff and suspended/pending-deletion organizations; exclude archived staff. Make admission checks concurrency-safe.
- [ ] Add usage summaries, approaching-limit warnings and audited platform exceptions. Exclude account/security email from business quotas.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Plan-matrix tests cover features, quotas, archive/restore and concurrent create/send/upload operations.
- [ ] Business storage/email pools span all owned organizations; Pro unlimited counts do not imply unlimited resource usage.
- [ ] API rejects restricted operations even if the UI is bypassed.
- [ ] Existing data is preserved when a quota is exceeded.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.

## Usage implementation — 2026-10-30

See [subscription usage](../subscription-usage.md) for approved counting rules, concurrent admission, reservations, maintenance, UI and remaining boundaries.
