# Staff lifecycle and email recovery

## Implemented API

| Method | Path                              | Behavior                                                       |
| ------ | --------------------------------- | -------------------------------------------------------------- |
| GET    | `/v1/staff`                       | Paginated safe profiles; excludes archived accounts by default |
| GET    | `/v1/staff/:userId`               | Profile, roles and inherited permission keys                   |
| POST   | `/v1/staff`                       | Create staff/settings and role assignments atomically          |
| PATCH  | `/v1/staff/:userId`               | Email, first name and family name only                         |
| PUT    | `/v1/staff/:userId/roles`         | Deduplicated role IDs; validates roles before replacement      |
| POST   | `/v1/staff/:userId/disable`       | Block login and revoke sessions/reset tokens                   |
| POST   | `/v1/staff/:userId/enable`        | Re-enable a non-archived account; old sessions stay revoked    |
| DELETE | `/v1/staff/:userId`               | Archive, disable and revoke access; never physically delete    |
| POST   | `/v1/auth/password-reset/request` | Email input; generic 202 for configured delivery               |
| POST   | `/v1/auth/password-reset/confirm` | Token/password input; 204 after reset                          |

Role definitions and their permission keys stay under `/v1/rbac/roles`.
Staff route checks now use `staff.read` and explicit action permissions; see
[the permission standard](permission-standard.md).
There are no direct per-user grants. The old `/v1/rbac/staff` and
`/v1/rbac/users/:userId/roles` endpoints no longer exist.

## Safeguards

- Staff mutations and role grant changes share a PostgreSQL transaction advisory
  lock (73619001). Concurrent disable/archive/admin-role removal cannot remove
  the last active administrator. Non-administrators cannot modify administrator
  accounts or assign roles with privileges they do not hold.
- Administrator role permissions are protected. Non-admin role grant changes
  cannot grant permissions the caller lacks.
- Archive preserves IDs, names, role assignments and historical references.
  Archived profiles remain retrievable but cannot be enabled or changed.
- Reset tokens are random 256-bit values, stored only as SHA-256 hashes, with
  15-minute expiry and a recipient-email snapshot. Changed emails invalidate
  the old link. Successful reset invalidates all outstanding tokens and sessions.
- Reset request/confirm endpoints have a five-per-minute IP limit; requests also
  have a one-minute per-account email cooldown. Superseded tokens are invalidated.
- Reset links put the secret in a URL fragment, not a query string. The future
  frontend must read it, remove it from browser history, and POST it to confirm.
- Unknown, disabled and archived accounts receive the same request response.
  Delivery failures invalidate the issued token and return the same public response.

## Email adapter and remaining work

Updated by [onboarding and Resend delivery](auth-onboarding-and-resend.md): Resend
is now the production adapter, and temporary-password onboarding is implemented.

`buildApp({ passwordReset: { adapter, resetUrl } })` accepts a delivery adapter.
The test implementation in `api/tests/helpers/test-reset-email.ts` captures
messages in memory only. With Resend environment configuration, `buildApp` wires
the real adapter automatically. Production fails startup without those settings;
local unconfigured requests return a uniform 503. No production queue or reset UI
was added. The configured URL must use HTTPS except local development.

Before launch, connect reset UI, monitoring/alerts for the safe delivery-failure
log, and anti-enumeration timing hardening. Durable queued delivery remains in its
own implementation sequence. The generic response
does not guarantee identical execution time for different account states.
Full audit-event wiring, fine-grained permissions
and optimistic profile-update versions remain in their implementation sequences.

The unapplied local baseline adds `users.archived_at` and
`password_reset_tokens`. No application DB migration was run; existing applied
databases require a forward migration rather than replaying this baseline.
