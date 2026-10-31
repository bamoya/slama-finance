# 07 — Implement trial, manual payments and subscription lifecycle

Status: In progress. Documentation only; no implementation is performed by this task file.

Depends on: 05, 06; tax and billing decisions from 00.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Start the one-time seven-calendar-day trial at first organization creation, atomically with onboarding. Apply Business features, one org, two additional staff, 50 total business emails and 1 GB.
- [ ] Build owner subscription/usage/payment-instruction screens and reference submission. Administrator confirmation is required for paid activation and renewal.
- [ ] Implement monthly/annual coverage, cancellation at period end, seven-day grace for previously paid subscriptions only, upgrades and next-renewal downgrades.
- [ ] Persist HT, currency, applicable tax rate/amount and TTC snapshots for billing: 99/299/799 DH monthly HT and 990/2990/7990 DH annually HT; 20% TVA only when applicable.
- [ ] Make confirmations and lifecycle jobs idempotent. Manual records must not be confused with tenant invoice payments.
- [ ] Track 90-day expired-data retention from blocked access, but leave destructive execution gated by task 08/legal policy.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Tests cover exact trial/coverage/grace boundaries, weekends, duplicate confirmations and concurrent first-org creation.
- [ ] No trial grace is added; cancellation preserves already-paid coverage.
- [ ] Tax totals match the agreement and historical billing does not change when tax configuration changes.
- [ ] Renewal cannot lift an unrelated organization restriction; downgrade never deletes data.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
