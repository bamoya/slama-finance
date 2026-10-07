# Authentication UI

The POC authentication bypass has been removed. The UI now requires a real API
session. No public registration screen or endpoint is provided.

## Routes

| URL                       | Behavior                                                                                                                                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                  | Email/password login; full sessions go to the dashboard, restricted sessions to password replacement.                                                                                         |
| `/forgot-password`        | Requests a recovery email and shows the same confirmation for eligible and unknown accounts.                                                                                                  |
| `/reset-password#token=…` | Reads the email token into component memory, removes it from the address bar, validates matching passwords and submits the reset. Refreshing after removal requires reopening the email link. |
| `/change-password`        | Full sessions supply their current password. Temporary-password sessions must choose their own password before accessing business pages.                                                      |
| Business routes           | Require a verified full session; session errors fail closed with a retry screen.                                                                                                              |

## Structure and contracts

Auth pages and reusable layout, form, session status and logout components live in
`ui/src/features/identity/auth`. Forms use TanStack Form with shared shadcn-style Input,
Label and Button components. Transport validation comes from generated OpenAPI
Zod schemas; password confirmation is UI-only and never sent to the server.

The shared TanStack Query session uses Orval's `getGetSessionQueryKey()`. Cookies remain
HTTP-only; credentials and tokens are not persisted in browser storage. Session
checks run on mount, window focus and every minute while the UI is active.
Business-request 401 responses invalidate local access. Login, successful logout,
password replacement and reset clear cached data to prevent account-to-account
cache reuse. Logout errors remain visible rather than claiming the session ended.

The generated Session contract now includes `permissionKeys`, loaded from role
assignments by the API. Restricted sessions always receive an empty list.
Navigation, staff/role routes and management actions use exact permission keys.
`Can` is the reusable action gate; `routePermission` centralizes route requirements.
UI checks improve usability; server authorization remains authoritative.

Only currently implemented permissions (`staff.read`, `staff.manage`,
`roles.read`, `roles.manage`) are wired. Other domain screens remain session-only
POC mockups. Staff and role pages are now API-integrated; see
[Staff and RBAC UI](staff-rbac-ui.md). No future domain permission slugs were added.

## Local setup

The local Finance database and initial administrator are now provisioned; see
[Local development setup](local-development.md) for connection details and commands.

- Run the API and UI, with an existing provisioned account and the intended database.
  This change does not seed users, apply migrations or create an administrator.
- Set `VITE_API_BASE_URL` for the UI and allow its exact origin in API `CORS_ORIGIN`.
  Use matching hostnames (for example localhost for both) for local cookie handling.
- Configure Resend and set `PASSWORD_RESET_URL` to the deployed UI's
  `/reset-password` URL, without a query or fragment. Local example:
  `http://localhost:5173/reset-password`. Production uses HTTPS.
- Email delivery is not verified by the UI tests; production credentials and a
  verified Resend sender are still required.

## Verification

UI regression tests cover route protection, unavailable/expired sessions, exact
permissions, generated form validation, loading and API errors, reset links,
onboarding, authenticated password changes and logout/cache behavior. API
integration tests verify real role-derived session permissions and restricted
sessions. No application database migration is required for this UI work.

The forms follow the installed TanStack Form API and its
[validation guidance](https://tanstack.com/form/latest/docs/framework/react/guides/validation).
