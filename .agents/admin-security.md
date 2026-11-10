# Approved admin authentication and subscription changes

User approval: 2026-11-10. This supersedes previous routine-action fresh-TOTP requirements.

Status: COMPLETE. Contract/schema/API/French UI/tests implemented. Independent Sol LOW
review and recheck passed after four findings were fixed. Final pnpm check passed (API269/UI574); isolated
integration412 passed/1 S3 opt-in skip,43 files. Physical-authenticator browser testing remains unrun.
Details: docs/implementation/admin-security.md and /tmp/slama-admin-security/final-review.md.

## Scope

- Existing trial customers: Activate a plan with plan, coverage dates/duration and confirmed-payment or
  complimentary access. Paid subscriptions retain Change plan within their existing coverage dates.
- Routine subscription, payment and customer-management actions use the authenticated authorized admin session,
  audit reasons and confirmations; no fresh TOTP prompts or code requirement.
- Login supports verified passkeys with required device user verification, without an additional TOTP challenge.
  Password plus TOTP remains the initial fallback. Multiple named passkeys can be listed and removed.
- Provide securely stored single-use recovery codes and regeneration. Reauthentication protects credential
  changes, passkey additions/removals and recovery. Preserve 30-minute idle and 8-hour absolute session limits.

## Execution

1. Opus LOW: inspect current admin boundaries, record security decisions, update OpenAPI first, generate API
   then UI contracts serially. Report a bounded API/schema/UI acceptance map before implementation.
2. Main implementer: current baseline/schema, API enforcement, WebAuthn validation, recovery/reauthentication,
   trial conversion and meaningful API/security integration coverage. Use vetted WebAuthn verification.
3. UI implementer after contract stability: passkey login/management, recovery and security reauthentication,
   Activate a plan, retain paid Change plan, remove routine TOTP prompts, French localization and tests.
4. Independent reviewer in a separate session: replay/races, origin/RP/challenge/UV checks, hashed recovery
   codes, recovery/session invalidation, permission boundaries, session expiry and trial/paid transitions.
5. Run pnpm check and full isolated integration, resolve findings, update durable docs and final results.

Coordinator owns dispatch and integration; no nested agents. Check live provider usage at dispatch boundaries,
balance available Codex/Claude capacity and keep efforts low. Launch through Herdr and await completion without
duplicating investigation. No production/development DB changes or volume removal. Use the single pre-client
baseline and isolated test DB. No commit/push/deploy unless requested for this work.
