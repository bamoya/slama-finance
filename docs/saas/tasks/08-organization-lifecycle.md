# 08 — Implement suspension, deletion and recovery

Status: In progress. Restriction sources, enforcement and administrator-driven lifecycle actions are
implemented. Owner self-service deletion, retention jobs and the permanent purge remain open.

Depends on: 04, 07; approved retention policy from 00.

[Task index](README.md) · [Approved agreement](../README.md)

## Work

- [x] Represent organization state/restriction sources separately from subscription eligibility so renewal cannot undo administrator suspension.
- [ ] On pause/suspension/expiry block, revoke organization sessions, reject new logins and serve a static unavailable page with no actions or sensitive notes.
- [x] Pause business workers while preserving essential platform/security/maintenance operations. Reactivation requires fresh login and avoids missed-email replay.
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

Status: in progress.

**Implemented** (commits `6a5d875`, `077233b`, `604b4d9`, `0adfa0c`, `d545e4b`, `a055019`, `fd0f6bd`):

- Restriction columns on organizations and subscription suspension with frozen coverage, kept separate from
  subscription eligibility (`api/db/schema/organizations.ts`, `api/db/schema/subscriptions.ts`).
- Administrator actions: block owner, suspend organization, subscription suspend/resume (frozen clock), and
  scheduled deletion with a 30-day grace; cancelling a deletion restores the previous state
  (`customer-lifecycle` service, controller, repository and routes under `api/src/modules/platform/administration/`).
- Enforcement: organization sessions are revoked, owner and organization login is rejected, the
  `ORGANIZATION_SUSPENDED` error is returned, and tenant workers skip restricted organizations
  (`api/src/lib/tenant-workers.ts`, auth repositories).
- Owner invitation acceptance and blocked owner sign-in rejection (`0adfa0c`).
- Pre-existing organization suspensions without a recorded source are allowed (`d545e4b`).

**Tests:**

- `api/tests/customer-lifecycle.integration.test.ts` (lifecycle, enforcement, invitations).
- `api/tests/subscription-coverage.test.ts`.
- Results are not recorded in the repository; run `pnpm check` and `pnpm test:integration` to confirm.

**Open items:**

- Permanent purge job: blocked on legal/backup policy approval.
- Owner self-service deletion with reauthentication, impact confirmation and portal export.
- Owner pause UI review (unavailable page with no actions or notes).
- Past-due grace is not restored after subscription suspension.
- Reactivation without missed-email replay and the job-race tests listed above are not yet evidenced.
