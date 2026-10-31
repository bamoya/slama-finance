# Central owner authentication

Status: initial central email/password slice implemented. Organization staff scoping, owner access to
organization finance, custom-domain handoffs and external identity providers are not implemented here.

## Structure and contract

- API: `api/src/modules/identity/owners/{routes,controllers,services,repositories}` inside the existing
  identity module. It reuses the existing password hashing service and shared HTTP security hooks.
- Contract: `api/openapi/modules/identity/owner-auth.yaml`, referenced by the root OpenAPI document.
  API schemas/types, UI validators and Orval TanStack Query hooks are generated from that contract.
- UI: `ui/src/features/identity/owners/pages`, using the existing AuthLayout, AuthForm, Button,
  FormError, theme controls and French/English translations. Routes live in the shared public router.
- Migration: `0000_initial_schema.sql` adds owner sessions, purpose-bound security tokens and
  owner language. All existing migrations and staff identities remain unchanged.

| Method | Endpoint                                | Behavior                                                              |
| ------ | --------------------------------------- | --------------------------------------------------------------------- |
| POST   | `/v1/owner-auth/register`               | Generic 202 response; creates pending owner and requests verification |
| POST   | `/v1/owner-auth/verification/request`   | Generic 202 response, verification resend                             |
| POST   | `/v1/owner-auth/verification/confirm`   | Consumes a valid one-use verification token                           |
| POST   | `/v1/owner-auth/login`                  | Requires verified, enabled owner; creates independent session         |
| GET    | `/v1/owner-auth/session`                | Returns only public owner account fields                              |
| POST   | `/v1/owner-auth/logout`                 | Revokes the owner session and clears its cookie                       |
| POST   | `/v1/owner-auth/password-reset/request` | Generic 202 response, eligible-owner recovery email                   |
| POST   | `/v1/owner-auth/password-reset/confirm` | Consumes one-use reset token and revokes all owner sessions           |

Sensitive POST endpoints are limited to five requests/minute per client IP per API instance, per route.
All browser mutations retain exact trusted-Origin validation. Owner endpoints additionally reject
requests carrying an Origin other than the configured central portal, even if it is another trusted
organization origin. Session cookies are HttpOnly, SameSite=Lax,
Secure in production and host-only. Owner cookie `slama_owner_session` is separate from `slama_session`.

## Security and recovery

- Owners are independent `platform_users`; signup never creates or changes a staff account.
- Duplicate registration cannot change existing credentials, names or language, and does not reveal
  account existence. Email delivery failures also use the generic public response.
- Passwords require 12–128 characters and use the existing salted scrypt service.
- Verification links expire after 24 hours; reset links expire after 15 minutes.
- Each account/purpose permits at most one issued email per minute. New links invalidate older links
  of the same purpose. Only SHA-256 token/session digests are stored.
- Tokens appear in URL fragments, not query strings. UI removes fragments from browser history and
  requires an explicit confirmation click for verification. Tokens are not returned in API JSON.
- Account-row locking serializes token mutation; concurrent use of the same reset succeeds only once.
- Login session issuance rechecks the password hash under the owner lock, preventing stale credentials
  from establishing a session after a concurrent password reset.
- Reset does not silently verify an unverified email. Disabled owners cannot log in, recover or use
  previously issued sessions.
- Owner sessions do not grant access to current unscoped staff/finance APIs. That integration must wait
  for organization scoping. A staff cookie does not authenticate an owner.
- Owner 401 responses do not dispatch the staff-session-expired event or clear staff authentication.

## UI routes

```text
/owner/login
/owner/register
/owner/resend-verification
/owner/verify-email#token=...
/owner/forgot-password
/owner/reset-password#token=...
/owner
```

`/owner` currently displays the authenticated owner account and sign-out action. It is not yet an
organization dashboard. Each auth mode has an independent component key so navigation clears previous
form/status/token state. Staff sign-in stays at `/login`.

## Enabling locally or in deployment

Public owner authentication is disabled by default. Apply forward migrations with the normal release
initializer, which grants its reviewed runtime access to `platform_users`, `owner_sessions` and
`owner_account_tokens`. Organization/domain runtime grants remain withheld.

```dotenv
OWNER_AUTH_ENABLED=true
OWNER_PORTAL_ORIGIN=http://localhost:5173
```

In production, use the exact central portal HTTPS origin instead. It must be included in `CORS_ORIGIN`
and cannot contain a path, query, fragment or trailing slash. Keep the existing Resend credentials and
verified `EMAIL_FROM` configuration; production owner security emails use the backend's Resend adapter,
independent of business notification preferences or quotas. In development, `NOTIFICATION_TRANSPORT=smtp`
uses the existing local Mailpit adapter (`SMTP_HOST`/`SMTP_PORT`), with a local-only sender fallback.
SMTP remains rejected in production. Never configure a customer domain as the central portal
origin without implementing the reviewed domain-authentication flow.

Both production and Dokploy Compose files forward these new variables; they remain disabled unless
explicitly enabled. No local/application/hosted database is migrated by adding these source files.
No owner account or default owner password is seeded. Use the registration and verification flow.

For database integration tests, inject `ownerAccountDelivery` through AppOptions. Tests capture emails
without sending real messages. Missing delivery configuration rejects signup/recovery with 503 rather
than creating unusable accounts. The UI does not contain provider keys or manually maintained DTOs.

## Remaining task-02 work

- Organization-scoped staff identities, sessions and recovery are now delivered; see
  [staff authentication and binding](organization-staff-authentication.md).
- Owner organization access resolution and actor-aware audit integration.
- Explicit platform-administrator authorization and operator provisioning.
- Reviewed central/custom-domain login handoff and later external-provider linking.
- Owner account management beyond sign-in/recovery, including transfer and account-deletion policy.

This is partial completion of task 02, not a claim that the SaaS migration is complete.

## Verification record — 2026-10-27

- Full root `pnpm check`: passed (formatting, lint, types, unit/UI tests and API/UI production builds).
- API unit tests: 192 passed across 34 files, plus architecture and contract-generator checks.
- UI tests: 382 passed across 61 files, including five owner UI behavior tests.
- Full PostgreSQL integration suite: 250 passed across 27 files, one optional storage test skipped.
  Includes seven owner authentication tests, populated forward-migration checks and real RLS checks.
- Repeated schema generation: no drift. Dokploy Compose parses with placeholder validation values;
  this check did not deploy services or contact Resend.
- Local UI owner-login route responds with HTTP 200. Local API responds with the expected gated
  `OWNER_AUTH_UNAVAILABLE` code while owner authentication is disabled.
- Existing non-blocking initializer console, Orval import-meta, jsdom chart sizing and bundle warnings
  are unchanged. No production/application database migration, real email, commit or push was performed.

## Local activation follow-up

Owner authentication has now been enabled in the ignored local `api/.env`. The existing local
PostgreSQL, Redis and Mailpit services were restarted, and the normal initializer applied pending
forward migrations and runtime grants to the local `slama_finance` database on port 5433. Existing
records were preserved; no database was reset and no hosted database was modified.

Mailpit now exposes SMTP on localhost:1025 and its inbox on http://localhost:8025. A live local smoke
check passed registration, captured verification email, verification confirmation and login. Its
random temporary owner was removed afterward; no default owner credentials were created.

To use the feature, register at http://localhost:5173/owner/register, open the verification email in
Mailpit, then sign in at http://localhost:5173/owner/login. No real email is sent in local SMTP mode.
