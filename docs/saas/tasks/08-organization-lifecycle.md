# 08 — Implement suspension, deletion and recovery

Status: not started. Documentation only; no implementation is performed by this task file.

Depends on: 04, 07; approved retention policy from 00.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [ ] Represent organization state/restriction sources separately from subscription eligibility so renewal cannot undo administrator suspension.
- [ ] On pause/suspension/expiry block, revoke organization sessions, reject new logins and serve a static unavailable page with no actions or sensitive notes.
- [ ] Pause business workers while preserving essential platform/security/maintenance operations. Reactivation requires fresh login and avoids missed-email replay.
- [ ] Add owner reauthenticated deletion request, impact confirmation, 30-day grace, cancellation to prior eligibility and permitted portal exports.
- [ ] Implement idempotent tenant/file deletion and expired-data retention jobs only after legal/backup policy approval. Preserve unrelated tenants and required billing records.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Already logged-in users lose business access immediately and see no login/action controls on the unavailable domain.
- [ ] Tests cover pause versus billing/admin restrictions, payment recovery, deletion cancellation and job races.
- [ ] One tenant deletion never removes another tenant’s identity, data or files.
- [ ] Retention/export/deletion operations are audited and safely retryable.

## Completion evidence

Record implemented files, migration/contract changes, test commands/results and remaining blockers here when work is completed. Do not mark complete based only on scaffolding.
