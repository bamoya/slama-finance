# 06 — Implement plans, feature gates and quota accounting

Status: nearly complete. Plan catalog, subscription read API, seven-calendar-day trial, expiry checks, concurrency-safe organization/staff admission and shared API/UI feature gates are implemented. Pooled storage/email consumption metering, usage summaries and owner 80% warnings are implemented. Owner exceptions migration decision 2026-10-31: the organization administrator counts toward the staff quota on all plans; counting is not changed. Audited plan exceptions and payment-confirmation administration remain open (task 12 administration).

Depends on: 03, 04.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [x] Model Essential/Business/Pro using the approved agreement table: 1/3/unlimited organizations and 0/5/unlimited additional staff per organization.
- [x] Implement shared API entitlement/quota checks and UI feature gates; owner bypass applies only to staff permissions.
- [x] Meter pooled storage and monthly business emails; trial has separate finite allowances. Use approved reset/recipient/retry rules from task 00.
- [x] Count disabled staff and suspended/pending-deletion organizations; exclude archived staff. Make admission checks concurrency-safe. Resolved 2026-10-31: agreed counting stays as implemented — the organization administrator counts as one staff member on every plan, including Essential's single-staff quota; archived/deleted staff are excluded, disabled staff and suspended/pending-deletion organizations are counted. Do not change this counting.
- [ ] Add usage summaries, approaching-limit warnings and audited platform exceptions. Usage summaries and 80% warnings are implemented; audited platform exceptions remain open and belong with task 12 administration. Exclude account/security email from business quotas.

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
