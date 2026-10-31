# SaaS administration operator guide

Operator guide for SaaS administrator accounts served under `/admin`. Task record:
[12 — Build SaaS administrator operations](../../saas/tasks/12-platform-administration.md).

## Prerequisites

- `MIGRATION_DATABASE_URL` must be set; the administrator CLI uses it.
- `ADMIN_TOTP_KEY` must be set in the API environment: 32 random bytes, base64 (`openssl rand -base64 32`).
  Admin sign-in returns 503 without it. It encrypts administrator TOTP secrets, so keep it stable and backed up.
  Secrets encrypted with one key cannot be read with another.

## Create the first administrator

```text
pnpm --filter ./api admin:create --email <email> --name "<name>"
```

The password is read from `ADMIN_PASSWORD` when set, from piped stdin when not on a terminal, or from a
prompt (entered twice, not echoed).

## Enroll two-factor authentication

Sign in at `/admin/login` with the email and password. Two-factor authentication (TOTP) is mandatory, so
enrollment is completed at first sign-in.

## Other commands

```text
pnpm --filter ./api admin:reset-2fa --email <email>
pnpm --filter ./api admin:disable --email <email>
```

- `admin:reset-2fa` clears the administrator's 2FA enrollment so they enroll again at the next sign-in.
- `admin:disable` disables the administrator account.

## Sessions

Administrator sessions last 8 hours and expire after 30 minutes of inactivity.

## Sensitive actions

Payment confirmation and rejection, and customer lifecycle actions (block, suspend, deletion) require a fresh
2FA code and a reason. Reasons are internal-only: they are never shown to owners, staff or tenant pages.

## Not automated yet

- Permanent deletion (purge) of organization data is not automated. Scheduled deletion has a 30-day grace
  and can be cancelled, but the purge waits for the legal and backup policy.
- There is a single administrator capability; there are no multiple roles and no administrator management UI.
  Use the CLI.
