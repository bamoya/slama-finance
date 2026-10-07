# 01 — Users, authentication and personal settings

[Index](README.md) · Depends on 00 · Next: [Staff/RBAC](02-staff-rbac.md)

## Models

Extend existing `users`, `sessions`, `user_settings`; create `audit_events` with
its actor FK now. Users require normalized unique email, hashed password,
`must_change_password`, temporary expiry/consumed timestamps, password-change
timestamp and disable timestamp. Sessions have hashed tokens, expiry/revocation
and purpose `full | password_change`. User settings hold locale/timezone/theme.
Apply approved L3 timestamps/actors, indexes and CHECK constraints. Never return
hashes. Bootstrap an initial operator through a controlled CLI, not a public route;
02 completes administrator role/grant seeding before staff operations are enabled.

## API contract

| Route                           | Business behavior                                                                       |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| `POST /v1/auth/login`           | Validate credentials; return safe user and session purpose, set cookie                  |
| `GET /v1/auth/session`          | Return active user, purpose, preferences; permissions populated in 02                   |
| `POST /v1/auth/change-password` | Consume restricted session or verify current password for full session; rotate sessions |
| `POST /v1/auth/logout`          | Idempotently revoke cookie session and clear cookie                                     |
| `GET /v1/me/settings`           | Own preferences, full session only                                                      |
| `PATCH /v1/me/settings`         | Validate and update own locale/timezone/theme                                           |

Remove obsolete OAuth operations from OpenAPI; no public registration.
Self-service email recovery is now approved: `POST /v1/auth/password-reset/request`
accepts email and returns a generic 202; `POST /v1/auth/password-reset/confirm`
accepts token/password and returns 204. Hashed tokens expire in 15 minutes and
are consumed atomically with password replacement and session revocation. The
implemented API automatically uses Resend when configured; tests can inject an
in-memory adapter. Production requires Resend configuration at startup. Local
unconfigured delivery returns 503 for all request emails. Recovery UI remains pending.
Specify cookie security and the restricted-session response as part
of the contract. Invalid credentials produce the same public error regardless
of unknown, disabled or expired account status.

## Services, transactions and guards

Implemented: staff creation generates a one-use 24-hour temporary password;
successful temporary login atomically consumes it and issues a 15-minute restricted
session. `/v1/auth/change-password` requires the current password for full sessions,
or the restricted session itself during onboarding. It rejects password reuse,
revokes old sessions and reset tokens, clears onboarding flags, and issues a new
full session. `/v1/staff/:userId/temporary-password` supports administrator reissue.
See [onboarding and Resend setup](auth-onboarding-and-resend.md) for contracts and rollout.

Login currently allows five requests per minute per client IP, independently
of other auth routes. All attempts count; excess requests return the standard
429 `RATE_LIMITED` envelope and `Retry-After`. The limiter is in-memory per API
instance, so restarts reset counters and multiple replicas do not share them.
Forwarded headers are not trusted by default. Production reverse-proxy deployment
must explicitly trust only the known proxy addresses to identify clients safely;
do not enable unrestricted proxy trust. Distributed/account-based controls remain
additional hardening, not a claim that this alone prevents all brute-force attacks.

- Extract password hashing/verifying from routes; handle malformed stored hashes
  safely. Rate-limit login by appropriate client/account signals and redact input.
- Temporary credential login checks and consumes under a user-row lock so only
  one concurrent request succeeds, then creates a short-lived restricted session
  in the same transaction. No general dashboard access until replacement.
- Replacement must differ from the temporary password. Update hash and flags,
  invalidate all old sessions, audit safe metadata and create a fresh full session
  atomically. Lost/expired restricted sessions require admin reissue in 02.
- Auth hook verifies user enabled state on every request, not merely session
  expiry. Restricted sessions allow only session inspection, password replacement
  and logout. CSRF/Origin checks apply; do not grant trust based on browser UI.

## UI and state

Reuse `features/identity/auth`, move page composition into `pages/` where appropriate.
Routes: `/login`, `/change-password`, `/settings/profile`. Reusable components:
LoginForm, PasswordChangeForm, password visibility control and PreferencesForm.
Use shadcn fields/buttons with TanStack Form validation and accessible errors.

`SessionProvider` wraps the `['session']` Query result and derives status/purpose;
it is not a duplicate user database. Wouter's shared protected boundary redirects
unauthenticated users to login and restricted users to change-password. Preserve
only safe internal return paths. Remove the POC auth bypass. Logout clears all
private query caches; password change invalidates session and preferences.

## Acceptance

Test valid/invalid/disabled login, expiry, two simultaneous temporary logins,
restricted access to every protected route family, replacement rollback/session
rotation, CSRF rejection and logout. UI test direct protected navigation, refresh,
password change and theme persistence. No password appears in logs/cache/storage.
Exit: real authenticated navigation, not yet general staff management.
