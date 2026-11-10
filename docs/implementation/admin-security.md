# Administrator security and trial activation

Approved 2026-11-10 (`.agents/admin-security.md`). Admin-only; owner and staff authentication are unchanged.
Contract: `api/openapi/modules/administration/administration.yaml`.

Status: implemented and independently reviewed, 2026-11-10. Four initial security/correctness
findings were fixed and independently rechecked by Sol LOW, with no remaining actionable findings.
Final `pnpm check` passed (269 API tests, 574 UI tests, lint, types, structure checks and builds). Full isolated
integration passed: 412 tests, 1 opt-in S3 skip, 43 files. Browser tests mock the WebAuthn browser library;
API tests use real ES256 signatures. A physical-authenticator browser ceremony has not been exercised.
Reports and preserved final gate logs: `/tmp/slama-admin-security/`.
Tracking: [P6.5 — admin security and internal-note privacy](https://github.com/bamoya/slama-finance/issues/123).
Parent [P6 — administrator operations](https://github.com/bamoya/slama-finance/issues/17) has additional scope.

## Policy

- Routine subscription, payment, customer, organization and override actions use the authorized admin session,
  a reason (audit) and a UI confirmation. Request bodies carry no TOTP `code`; the API must not check one.
- Credential changes (passkey add/remove, recovery-code regeneration, TOTP reset) require a session
  reauthenticated within the last 5 minutes, else `403 REAUTHENTICATION_REQUIRED`.
- Sessions: 30-minute idle, 8-hour absolute, unchanged. Reauthentication never extends the absolute limit.
- Never log or audit passwords, TOTP codes, recovery codes, challenges, WebAuthn payloads or session tokens.

## Library

`@simplewebauthn/server` 14.0.3 (API, pinned exact; 14.1.0 was days old at install) and `@simplewebauthn/browser`
of the same major for the UI phase. `auth/services/admin-webauthn.service.ts` wraps
`generateAuthenticationOptions`/`verifyAuthenticationResponse` and
`generateRegistrationOptions`/`verifyRegistrationResponse` with `requireUserVerification: true`, the configured
`expectedOrigin`/`expectedRPID` and the stored challenge; any library error is a failed check. No custom signature
verification. The library enforces the signature counter (a non-zero counter must increase).

Relying party: `adminWebAuthn(env)` in `api/src/config/env.ts`. Defaults to `<PLATFORM_SCHEME>://admin.<PLATFORM_DOMAIN>`
and its host as RP ID; `ADMIN_WEBAUTHN_RP_ID`/`ADMIN_WEBAUTHN_ORIGIN` override. The RP ID must be the origin host or a
parent domain; production rejects non-HTTPS origins and `localhost` RP IDs. Request headers never select it.

## Storage (baseline schema, `api/db/schema/administration.ts`)

- `platform_admin_passkeys`: credential_id (unique base64url), public_key (bytea), counter, transports,
  device_type, backed_up, name, created_at, last_used_at. Maximum 10 per admin. Runtime grant S/I/U/D.
- `platform_admin_webauthn_challenges`: purpose `login` (no admin/session) or `reauth`/`register` (bound to the
  admin and the current session; CHECK enforced), challenge, expires_at (5 min), consumed_at. Runtime grant S/I/U/D.
  Retention: each `passkey/options` call deletes at most 50 challenges (any purpose) that expired more than one
  minute ago, oldest first through the expiry index, with `for update skip locked` (row locks only, concurrent calls
  never wait). Unexpired challenges are never deleted, so stored rows stay proportional to the request rate.
  A challenge is consumed by one conditional update (`purpose`, binding, `consumed_at is null`,
  `expires_at > now`) in its own committed transaction before verification, so it is spent even when verification
  fails and concurrent use yields at most one success.
- `platform_admin_recovery_codes`: code_hash = HMAC-SHA-256 of the normalized code under a key HKDF-derived from
  `ADMIN_TOTP_KEY` (80-bit random codes, so a keyed fast hash is sufficient and lookup is an indexed equality), used_at.
  Codes are `XXXX-XXXX-XXXX-XXXX` base32; case, spaces and dashes are ignored. Never logged or audited.
- `platform_admin_sessions.reauthenticated_at`, `reauth_failures`; `platform_admins.pending_totp_secret` (sealed).
- All tables: RLS `platform_admin` actor only. Lock order everywhere: admin row → sessions → passkeys/codes
  (concurrent recovery or credential changes would otherwise deadlock).

## Flows

1. Passkey login: `POST /admin/auth/passkey/options` (no session, discoverable, UV required) then
   `POST /admin/auth/passkey` → consume challenge, find credential, verify, require active admin, update counter
   and last_used_at, issue full session. The assertion's userHandle must equal the admin id bytes and the credential
   must belong to that enabled admin. TOTP enrolment is not required: passkeys retained after an operator
   `admin.reset_2fa` keep working. All failures: `401 INVALID_CREDENTIALS` and an
   `auth.login_failed` audit row. Rate limit 30/min per IP (assertions are signature-bound).
2. Password + TOTP fallback: existing `login` + `2fa`, unchanged.
3. Recovery: after `login` (pending session) the admin submits `POST /admin/auth/recovery` with one recovery code.
   Atomically mark the code used, revoke all other sessions, issue a fresh session with `reauthenticated_at=now`.
   This proves password + recovery code without needing the lost TOTP or passkey; the 5-minute window lets the
   admin reset TOTP, remove passkeys or regenerate codes. Failures count toward the pending five-failure limit.
   Total loss (password and codes) stays an operator CLI action (`admin.reset_2fa`).
4. Reauthentication: `POST /admin/auth/reauthentication/options` (allowCredentials = this admin's passkeys) then
   `POST /admin/auth/reauthentication` with `passkey` or `password_totp`. Sets `reauthenticated_at`. Five failures
   revoke the session.
5. Passkey management: `GET /admin/security`; `POST /admin/security/passkeys/options` + `POST
/admin/security/passkeys` (named, excludeCredentials, residentKey required, UV required); `DELETE
/admin/security/passkeys/{id}` (own passkeys only).
6. Recovery codes: `POST /admin/security/recovery-codes` returns 10 new codes once.
7. TOTP reset: `POST /admin/security/totp` (pending secret) then `/totp/confirm` with a code; the old secret stays
   valid until confirmation; confirmation revokes other sessions.
8. Activate a plan (trial only): `POST /admin/owners/{id}/subscription/activation` with plan, cycle, `startsOn`
   (inclusive) and `endsOn` (exclusive) calendar days in the customer timezone, and `settlement`
   `confirmed_payment` (method + received reference; confirmed activation payment at the plan/cycle price snapshot)
   or `complimentary` (confirmed 0-amount admin_adjustment marked `subscription_payments.graceless` + complimentary
   period, no grace after it under both read authorities: legacy TS/SQL skip grace when the latest-ending confirmed
   payment is graceless; other complimentary grants keep their legacy grace). Eligible: a
   started trial, running or ended, with no coverage at all; suspended → 409. `startsOn` today means now, later days
   start at local midnight; at most 3 years. The trial end is never moved. Coverage that has not started yet never
   bridges the gap after the trial: all four lifecycle resolvers (period/legacy TS, period/legacy SQL) report
   `expired` once the trial has ended until coverage starts; during the trial behaviour is unchanged. A confirmed
   payment method must be one of the billing settings' methods. The UI may offer a duration preset that fills
   `endsOn`. `Change plan` stays paid-only (409 NO_PAID_PERIOD) and keeps the paid-through end.

All security events are audited with the action names listed in `AdminAuditEntry.action`.

## Implementation status

Backend done 2026-11-10 (see `/tmp/slama-admin-security/backend-result.md`): schema/baseline, grants, config, API,
routine `code` removal (step-up deleted), activation, tests `api/tests/admin-security.integration.test.ts` and
`api/tests/admin-webauthn-config.test.ts` with a software authenticator (`api/tests/helpers/webauthn-authenticator.ts`)
producing real ES256 signatures verified by the library.

UI done 2026-11-10 (`@simplewebauthn/browser` ^14.0.0, `startAuthentication`/`startRegistration` with `{ optionsJSON }`):

- Sign-in: passkey button (hidden without WebAuthn support), recovery-code entry on the TOTP step, password + TOTP kept.
- `/security` page (`security/`): own named passkeys list/add/remove, recovery codes shown once in a dialog and dropped
  from memory on close, TOTP replacement (enrol + confirm). A 403 `REAUTHENTICATION_REQUIRED` parks the change, opens an
  accessible reauthentication dialog (passkey only when the security list has passkeys, else password + TOTP) and retries
  exactly once; secrets are cleared after every attempt and never stored or logged. Any 401, including one on the
  single retry after reauthentication, signs out (session cache, recovery codes and pending TOTP secret cleared).
- Customer actions: `Activate a plan` for trial customers (running or ended); `Change plan` stays for paid customers.
  `TwoFactorCodeField` is deleted: TOTP inputs remain only at login, re-enrolment and security reauthentication.

Review fixes 2026-11-10 (`/tmp/slama-admin-security/fixes-result.md`): retained passkeys after operator TOTP reset,
graceless complimentary activation under legacy reads, sign-out on a retried 401, bounded challenge pruning.
Independent recheck complete: all four findings resolved; no remaining actionable findings in the approved scope.
