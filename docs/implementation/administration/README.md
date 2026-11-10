# SaaS administration operator guide

Operator guide for SaaS administrator accounts served under `/admin`. Task record:
[12 — Build SaaS administrator operations](../../saas/tasks/12-platform-administration.md).

## Prerequisites

- `MIGRATION_DATABASE_URL` must be set; the administrator CLI uses it.
- `ADMIN_TOTP_KEY` must be set in the API environment: 32 random bytes, base64 (`openssl rand -base64 32`).
- Passkeys use the relying party `admin.<PLATFORM_DOMAIN>` and origin `<PLATFORM_SCHEME>://admin.<PLATFORM_DOMAIN>` by default. `ADMIN_WEBAUTHN_RP_ID` (bare host, the admin host or a parent domain) and `ADMIN_WEBAUTHN_ORIGIN` override them; production refuses non-HTTPS origins and `localhost` RP IDs. Changing the RP ID invalidates every registered passkey. The same `ADMIN_TOTP_KEY` keys recovery-code hashes (HKDF-derived), so rotating it invalidates recovery codes. See `../admin-security.md`.
  Admin sign-in returns 503 without it. It encrypts administrator TOTP secrets, so keep it stable and backed up.
  Secrets encrypted with one key cannot be read with another.

## Create the first administrator

Deployments create it automatically: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters;
optional `ADMIN_NAME`) for the `migrate` job of every supported deployment: Dokploy (automatic on each
deploy), and the production, Lightsail and Coolify release profile
(`docker compose --profile release run --rm migrate`, already the required release step). After migrations it creates that administrator if no
account has the email, audited once as actor `deployment`, and otherwise changes nothing (password,
name, disabled state, TOTP, passkeys, recovery codes and sessions are all preserved). Both unset skips
the step; only one set, an invalid email or a weak password fails the deployment. Credentials are never
logged. Details: [Dokploy startup](../../deployment/dokploy-startup.md) and
[release procedure](../../deployment/release-procedure.md). Locally:
`ADMIN_EMAIL=... ADMIN_PASSWORD=... pnpm --filter ./api admin:bootstrap`.

The CLI remains available for additional administrators and operator recovery:

```text
pnpm --filter ./api admin:create --email <email> --name "<name>"
```

The password is read from `ADMIN_PASSWORD` when set, from piped stdin when not on a terminal, or from a
prompt (entered twice, not echoed).

Bootstrap verification (2026-11-10): focused tests 8/8; `pnpm check` passed (269 API / 574 UI tests);
isolated integration 420 passed / 1 opt-in skip. Independent review and recheck found no remaining actionable
issues. Release commands for all four targets were executed against isolated databases. A fresh release-image
build was blocked by local Docker Hub certificate validation, so current-image container execution remains
unverified. Logs and review: `/tmp/slama-admin-bootstrap/`.

## Enroll two-factor authentication

Initial sign-in at `/admin/login` uses the email, password and TOTP enrollment. Password plus TOTP remains
the fallback. After registering a passkey on the Security page, a verified passkey signs in directly with
device user verification and no additional TOTP challenge. Multiple named passkeys are supported.

## Other commands

```text
pnpm --filter ./api admin:reset-2fa --email <email>
pnpm --filter ./api admin:disable --email <email>
```

- `admin:reset-2fa` clears TOTP enrollment; the next password sign-in enrolls again. Retained passkeys remain usable.
- `admin:disable` disables the administrator account.

## Sessions

Administrator sessions last 8 hours and expire after 30 minutes of inactivity.

## Routine actions and security changes

Routine subscription changes, payment decisions and customer/organization management require the authorized
admin session, an audit reason and UI confirmation, without fresh TOTP. Reasons are internal-only.
Credential changes, passkey addition/removal and recovery-code regeneration require reauthentication within
five minutes. Recovery uses the pending password sign-in plus a single-use recovery code. Codes are shown
once and securely hashed; regeneration invalidates the previous set. See [security flows](../admin-security.md).

## Not automated yet

- Permanent deletion (purge) of organization data is not automated. Scheduled deletion has a 30-day grace
  and can be cancelled, but the purge waits for the legal and backup policy.
- There is a single administrator capability; there are no multiple roles and no administrator management UI.
  Use the CLI.
