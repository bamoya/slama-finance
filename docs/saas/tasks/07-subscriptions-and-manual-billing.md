# 07 — Implement trial, manual payments and subscription lifecycle

Status: In progress. Billing core, owner screens and operator confirmation are implemented;
client confirmations and reminders remain open.

Depends on: 05, 06; tax and billing decisions from 00.

[Task index](README.md) · [Approved agreement](../README.md) · [Implementation record](../../../implementation/subscription-billing/README.md)

## Work

- [x] Start the one-time seven-calendar-day trial at first organization creation, atomically with onboarding. Apply Business features, one org, two additional staff, 50 total business emails and 1 GB.
- [x] Build owner subscription/usage/payment-instruction screens and reference submission. Administrator confirmation is required for paid activation and renewal.
- [x] Implement monthly/annual coverage, cancellation at period end, seven-day grace for previously paid subscriptions only, upgrades and next-renewal downgrades.
- [x] Persist HT, currency, applicable tax rate/amount and TTC snapshots for billing: 99/299/799 DH monthly HT and 990/2990/7990 DH annually HT; 20% TVA only when applicable.
- [x] Make confirmations and lifecycle jobs idempotent. Manual records must not be confused with tenant invoice payments.
- [x] Track 90-day expired-data retention from blocked access, but leave destructive execution gated by task 08/legal policy.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [ ] Tests cover exact trial/coverage/grace boundaries, weekends, duplicate confirmations and concurrent first-org creation.
- [x] No trial grace is added; cancellation preserves already-paid coverage.
- [x] Tax totals match the agreement and historical billing does not change when tax configuration changes.
- [ ] Renewal cannot lift an unrelated organization restriction; downgrade never deletes data.

## Completion evidence

Status: partially complete (billing core, owner screens and operator confirmation). Not complete:
client confirmations, downgrade retention selection and reminder emails.

**Implemented** (commits `d1259a1`, with lifecycle integration in `077233b` and `a055019`):

- Schema and baseline: `api/db/schema/subscriptions.ts`, `api/db/reference/plans.sql`,
  `api/db/migrations/0000_initial_schema.sql` (baseline rebuilt while undeployed, per repository rules).
- Contracts: subscriptions module OpenAPI under `api/openapi`; generated validators and UI client regenerated.
- API: `api/src/modules/platform/subscriptions/` (`billing.service.ts`, `coverage.ts`,
  `billing.repository.ts`, `subscription.controller.ts`, `subscription.routes.ts`).
- Operator CLI: `api/scripts/subscription-payment.ts` (`list`, `confirm`, `reject`).
- Owner UI: subscription page, plan checkout, payment history, status and cancellation cards
  (`ui/src`, subscriptions feature), with French localization.

**Tests:**

- `api/tests/subscription-coverage.test.ts` (coverage and period boundaries).
- `api/tests/subscription-billing.integration.test.ts` (payments, confirmation, upgrades, cancellation, grace).
- Owner subscription UI test in the subscriptions feature.
- Results are not recorded in the repository; run `pnpm check` and `pnpm test:integration` to confirm.

**Open items:**

- Client confirmation of accepted payment methods, TVA rate (default not applicable) and proration rule.
- Trial start: `provision_organization_defaults` trigger (`api/db/integrity/organization-defaults.sql`) and `admitOrganization` in `subscription.service.ts`, covered by owner onboarding and subscription usage integration tests.
- Owner selection of organizations and staff to retain on downgrade is not implemented.
- Worker plan gating reads `owner_subscriptions.plan_code`, which does not yet reflect scheduled changes.
- Owner reminder emails are not implemented.
- Boundary, weekend and concurrency tests listed above are not yet evidenced.
