# 12 — Build SaaS administrator operations

Status: In progress. Administrator API, `/admin` portal v1, customer lifecycle actions and operator CLI are
implemented. Multiple roles, an admin management UI and a separate admin deployment remain open.

Depends on: 02, 06, 07, 08, 10.

[Task index](README.md) · [Approved agreement](../README.md) · [Operator guide](../../../implementation/administration/README.md)

## Work

- [ ] Provide protected customer/organization lists, subscription detail, manual payment confirmation, plan/quota management, restrictions, deletion oversight and usage/audit views.
- [x] Require explicit platform-administrator capability; ordinary owners/staff cannot access this surface.
- [x] Audit administrative activation, payment confirmation, overrides, suspension and recovery with actor and before/after context.
- [ ] Do not introduce silent impersonation or automatic finance-data access. Display support tier without inventing a response-time SLA.
- [x] Reuse shared table filters, pagination, impact dialogs and action placement; expose only approved operational actions.

## Required implementation discipline

- Preserve `api/` and `ui/`, existing domain boundaries and controller/service/repository layering. Extend public module interfaces instead of bypassing architecture rules.
- Define modular OpenAPI contracts first; regenerate API validation/types and Orval UI consumers. Do not handwrite duplicate transport schemas or generated files.
- Use new forward migrations and preserve deployed data. Reuse shared permissions, authorization, forms, tables, headers, dialogs and global theme/localization resources.
- Include meaningful unit/integration checks for changed business rules and tenant boundaries. Report changed contracts/migrations, verification and unresolved risks.

## Acceptance criteria

- [x] Unauthorized owner/staff requests fail at the API, not just navigation.
- [ ] Duplicate confirmations are safe; restriction changes do not bypass deletion or billing rules.
- [ ] Sensitive admin notes and cross-customer data never appear on public or tenant pages.
- [x] All high-impact mutations have reviewable audit records.

## Completion evidence

Status: in progress.

**Implemented** (commits `2ab9ff1`, `93d14c0`, `172db8b`, `c46f5a2`, `f575084`, `a055019`, `fd0f6bd`):

- Administrator realm separate from owner and staff identities; verified passkey login with device user
  verification and password + TOTP fallback. Sessions last 8 hours with a 30-minute idle timeout.
- Admin API: `api/src/modules/platform/administration/` (routes, controllers, services, repositories),
  with domain splits for auth, customers, payments, billing settings, audit and overview counts.
- Payments: confirm and reject with a reason. Billing settings and overview counts are exposed.
- Customers: list with status filter, detail view, customer lifecycle actions (block owner, suspend
  organization, subscription suspend/resume, scheduled deletion with a 30-day grace and cancellation that
  restores the previous state), and create customer with a set-password invitation.
- Routine actions use session authorization, internal audit reasons and confirmations without fresh TOTP.
  Reauthentication protects security changes. Multiple named passkeys and single-use recovery codes are
  implemented; see the [approved security flows and verification](../../implementation/admin-security.md).
- Trial customers can activate a plan with explicit coverage and confirmed payment or complimentary access;
  paid customers retain Change plan within their existing coverage dates.
- Audit: append-only administrative audit log with actor and before/after context.
- UI: `/admin` portal with sign-in and 2FA enrollment, overview, customers, payments and billing settings,
  built on shared portal shell and table/dialog components.
- Operator CLI: `pnpm --filter ./api admin:create | admin:disable | admin:reset-2fa`.
- Migrations and contracts: `api/db/schema/administration.ts`, `api/db/integrity/platform-administration.sql`,
  `api/openapi/.../administration.yaml`, baseline rebuilt while undeployed.

**Tests:**

- `api/tests/platform-administration.integration.test.ts`
- `api/tests/customer-lifecycle.integration.test.ts`
- `api/tests/totp.test.ts`
- New security coverage: `api/tests/admin-security.integration.test.ts` and admin UI security/activation tests.
- Final 2026-11-10 gates: `pnpm check` passed; isolated integration 412 passed / 1 opt-in skip. Physical
  authenticator/browser testing remains unrun. See the linked implementation record for evidence and limits.

**Open items:**

- Multiple administrator roles (only a single administrator capability exists).
- Administrator management UI (accounts are managed through the CLI).
- Separate admin deployment (deferred decision).
- Plan/quota management and deletion oversight are not evidenced in the commits.
- Silent impersonation is not introduced; no impersonation feature exists.
