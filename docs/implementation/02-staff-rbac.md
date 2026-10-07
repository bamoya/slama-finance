# 02 — Staff administration and dynamic RBAC

[Index](README.md) · Depends on 01 · Next: [Settings](03-company-settings.md)

## Models and seed strategy

Current implementation now owns staff endpoints at `/v1/staff` (legacy RBAC
staff URLs removed). Listing/detail use `staff.read`; mutations use explicit action
permissions. See [the permission standard](permission-standard.md). Profiles can
be patched; roles replaced; accounts disabled/enabled or archived with DELETE.
Permissions remain inherited from roles, with no individual overrides. Archive
preserves the account and references, invalidates sessions/reset tokens, and
excludes the account from default lists. `status=archived|all` supports review.
Archived accounts cannot be enabled or edited. Concurrent last-active-admin
removal is prevented with a shared transaction lock; admin grants are protected.
Default list pagination is 25 rows, maximum 100.

User identity stores separate `first_name` and `last_name` (family name), each
up to 100 characters. Staff creation requires both, trimmed and nonblank; API
fields are `firstName` and `lastName`. Forms edit them separately; display names
are derived, not stored in an additional full-name column.

Complete `roles`, `permissions`, `user_roles`, `role_permissions` plus user/audit
integration. Seed an idempotent protected administrator role and fixed application
permission registry. Administrators compose roles from registered capabilities;
they do not invent arbitrary executable permission keys. Normalize existing
legacy grants with the explicit mapping in migration `0002_action_permissions.sql`.
Each later sequence adds its keys without resetting customized role assignments.

## API and permissions

Role permission replacement accepts stable permission slugs using the existing
registry `key`: `PUT /v1/rbac/roles/:roleId/permissions` with
`{ "permissionKeys": ["roles.read", "staff.create"] }`. UUID permission IDs are
internal persistence details, not assignment inputs. Keys are case-sensitive;
duplicates are deduplicated, an empty array clears assignments, and unknown keys
reject the complete update with field errors. A missing role returns 404. The
role row is locked and keys resolved before transactional replacement. Role/user
identifiers and join-table foreign keys remain UUIDs.

| Route                                             | Rule / permission                                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /v1/rbac/permissions`                        | Grouped registry, `roles.read`                                                               |
| `GET /v1/rbac/roles`, `GET /v1/rbac/roles/:id`    | Role details/grants, `roles.read`                                                            |
| `POST /v1/rbac/roles`, `PATCH /v1/rbac/roles/:id` | Validate unique stable key/name, `roles.create/update`                                       |
| `PUT /v1/rbac/roles/:id/permissions`              | Replace deduplicated grants atomically, `roles.update`                                       |
| `DELETE /v1/rbac/roles/:id`                       | Non-system roles; assignments are removed, not staff accounts; `roles.delete`; otherwise 409 |
| `GET /v1/staff`, `GET /v1/staff/:id`              | Paginated safe profiles and roles, `staff.read`                                              |
| `POST /v1/staff`                                  | Create user/settings/roles and generated temporary password, `staff.create`                  |
| `PATCH /v1/staff/:id`                             | Profile edits, `staff.update`                                                                |
| `PUT /v1/staff/:id/roles`                         | Replace assignments, `staff.assign_roles`                                                    |
| `POST /v1/staff/:id/disable`, `/enable`           | Disable/re-enable safely, `staff.disable` / `staff.enable`                                   |
| `POST /v1/staff/:id/temporary-password`           | Reissue and revoke sessions, `staff.reset_password`                                          |

Move the existing `/v1/rbac/staff` and `/v1/rbac/users/:id/roles` handlers into
users/staff ownership and update callers/contracts together; do not leave two
unguarded implementations. No public account creation. Temporary secrets are
shown only in the successful no-store response, never persisted as plaintext.
If the response is lost, explicitly reissue; do not recover the old secret.

## Services and middleware

`requireSession`, `requireFullSession`, `requirePermission` compose on routes.
Resolve effective grants from current roles; permission revocation takes effect
on the next request. Assign-role and grant editing are privileged delegation
capabilities: prevent non-administrators from granting permissions they lack.
Protect system role identity and essential admin grants. Serialize all mutations
that could remove the last active onboarded admin with a common transaction lock.
Audit assignments/grants, disable actions and password reissue without secrets.

## UI and stores

Routes: `/settings/staff`, `/new`, `/:staffId/edit`; `/settings/roles`, `/new`,
`/:roleId/edit`. Reuse POC pages but split StaffTable, StaffForm, RoleSelector,
PermissionMatrix, TemporaryPasswordDialog and DisableConfirmation components.
Session-derived `can(permission)`/`PermissionGate` controls navigation/actions;
server authorization remains final. Do not maintain a second permissions store.
Query keys: staff list/detail, roles list/detail, permission registry and session.
Mutations invalidate affected lists/details and session; clear transient secrets
on dialog close/unmount, disable retries for secret-issuing actions.

## Acceptance

Test zero-role user, multiple-role union, unauthorized direct requests, invalid
permission IDs, normalized duplicate emails/role keys, protected role deletion,
simultaneous last-admin removal, permission revocation and password reissue.
Verify hidden UI actions cannot be executed through direct URLs. Exit: admin can
onboard staff and tailor permissions end-to-end.
