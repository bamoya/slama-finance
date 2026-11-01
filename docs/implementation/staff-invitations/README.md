# Organization staff invitations

Implementation began with OpenCode delegation. After both approved provider quotas were exhausted, the user authorized Codex to complete implementation and review.
Billing and the saved deferred billing stash are outside scope.

## Rules

- Invitations belong to one organization and create ordinary organization staff accounts. Platform accounts do not authenticate organization operations.
- Pending invitations do not consume staff slots. Acceptance atomically rechecks subscription access and locks/rechecks member capacity, including the administrator.
- Tokens are cryptographically random, hashed at rest, single-use and valid for 48 hours. Resending invalidates the previous token. Never log or persist plaintext tokens in jobs.
- An invitation cannot replace an existing staff account or change its credentials. Normalize email addresses and prevent duplicate pending invitations within an organization.
- Staff invitation creation requires staff.create; role assignment additionally requires roles.update, with existing anti-escalation checks. Resend/revoke require staff.update. Acceptance revalidates inviter authority and assigned roles.
- Delivery uses the existing security-email transport with French default and English support. Security mail does not consume business-email quota. Use leased delivery with bounded retries and token rotation, following initial administrator provisioning.
- Public acceptance reveals only necessary organization/invitation information after validating a token. It collects names and a new password, applies the existing password policy, and redirects to organization login without creating a platform session.
- Expired, revoked, accepted and unavailable organization cases must have clear safe UI states. Public endpoints are rate limited.
- Onboarding administrator invitations map to the organization admin role. The existing generic staff option has no seeded permission role: it must grant no implicit permissions, and UI must explain that permissions need assignment. Never silently grant administrator privileges.
- Prepared onboarding invitations are queued through the organization provisioning public interface after activation; platform controllers must not call organization repositories. Remove the current capacity check counting pending invitations as actual members.

## Architecture and contracts

Preserve platform/organization feature boundaries and controller/service/repository layers. Keep invitation internals under organization/identity, expose narrow provisioning methods for onboarding. Extend OpenAPI identity contracts first; generate API/UI Zod, types and Orval query hooks. Never edit generated outputs or commit them.

Reuse global authorization, shared shadcn controls, page headers, tables, dialogs, form errors and responsive layouts. French is default; add matching English translations. Dates use DD-MM-YYYY. Do not introduce a parallel HTTP client or query cache.

## Ordered delivery

1. OpenAPI contracts and generated-client validation.
2. Invitation persistence, RLS, tenant foreign keys, runtime grants and fresh baseline.
3. Layered create/list/resend/revoke services and permission checks.
4. Security email adapter and delivery worker.
5. Transactional public acceptance and security regression tests.
6. Staff invitation management UI and public acceptance UI.
7. Onboarding provisioning integration and translations.
8. Full integration, quality checks and browser review.

## Required verification

Replay the initial baseline in an isolated test schema. Test cross-tenant access, token replay/rotation/expiry/revocation, archived/deleted inviter, removed roles, existing user conflicts, paused organizations, delivery failure/retry, and concurrent acceptance at the last seat. Verify owner cookies cannot authorize staff management.

Run pnpm check, pnpm test:integration with the dedicated local test database, and pnpm contract:check. Verify desktop/mobile and both themes. Never reset primary/local user data or a hosted database.

## Implemented shape

```text
organization/identity/
  invitations/
    controllers/invitation.controller.ts
    routes/invitation.routes.ts
    services/invitation.service.ts
    repositories/invitation.repository.ts
```

The service uses existing staff permission/role repositories inside the same identity module. Platform setup calls only the public provisioning `invite` method. SMTP/Resend adapters remain in integrations, outside business modules.

```text
organizations 1 --- N staff_invitations N --- 0..1 users (inviter)
                          |
                          +---- 0..1 users (accepted account)
                          |
                          1
                          |
                          N
                  staff_invitation_roles N --- 0..1 roles
```

`staff_invitations` stores the normalized email, language, inviter/accepted account references, lifecycle timestamps, token hash/expiry, and leased delivery state. `staff_invitation_roles` preserves a null reference when a role is deleted; acceptance then rejects the missing required role. Both tables require organization scope and FORCE RLS; generated composite foreign keys enforce tenant consistency even with a privileged connection. Delivery metadata lives on the invitation rather than a second generic job queue. No plaintext token or password is persisted.

| Method | Route                                               | Access                                                     |
| ------ | --------------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/v1/staff/invitations`                         | `staff.read`                                               |
| POST   | `/api/v1/staff/invitations`                         | `staff.create`; assigned roles also require `roles.update` |
| POST   | `/api/v1/staff/invitations/:id/resend`              | `staff.update`; original inviter authority is rechecked    |
| POST   | `/api/v1/staff/invitations/:id/revoke`              | `staff.update`                                             |
| POST   | `/api/v1/auth/invitations/inspect` (`<slug>.` host) | Public, valid token, rate limited                          |
| POST   | `/api/v1/auth/invitations/accept` (`<slug>.` host)  | Public, valid token, rate limited                          |

UI paths inside an organization workspace: `/settings/staff/invitations` and `/settings/staff/invitations/new`. Public acceptance uses `/accept-invitation#token=…` on the `<slug>.` host; the fragment is removed immediately and API requests carry the token in the body. No automatic session is created on acceptance.

Invitation delivery uses the existing notification-worker interval but bypasses business notification rules and email quotas. Initial setup invitations wait for the administrator's mandatory password replacement. Other invalidated inviter/role cases become failed delivery instead of retrying indefinitely. Resend has a one-minute cooldown; provider delivery retries at most five times, with a new token per attempt. Revocation fences completion of in-flight jobs; an already-sent email may still arrive, but its revoked link cannot grant access.

Only the fresh SaaS baseline is regenerated. No hosted or primary development database is reset. A development server may need a restart after contract regeneration to discard cached generated response validators.
