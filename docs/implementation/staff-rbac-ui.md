# Staff and RBAC UI integration

Staff and roles now use real API data. Other business domains remain mockups.
No database migration or additional permission slug was required.

## Pages

| Route                           | Integrated behavior                                                                              |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `/settings/roles`               | Lists roles and the actual permission catalog.                                                   |
| `/settings/roles/new`           | Creates a role without permissions, then opens its editor.                                       |
| `/settings/roles/:roleId`       | Displays metadata and replaces permissions by key, including clearing all grants.                |
| `/settings/staff`               | Server-side search, sorting, pagination, current/archived/all filters and real account statuses. |
| `/settings/staff/new`           | Creates a profile with role IDs and displays its generated temporary password once.              |
| `/settings/staff/:staffId`      | Details, inherited permissions, role assignments, disable/enable, archive and password reissue.  |
| `/settings/staff/:staffId/edit` | Updates first name, family name and email independently from roles.                              |

The API does not provide role renaming or account unarchiving; these are not
offered. Activity counts and last-login values are no longer fabricated.

## Permission matrix, deletion and role filtering

The permission editor is a matrix: modules are rows and actions are columns,
derived from the live permission catalog. Accessible switches send the original permission
keys, unavailable combinations show `—`, and protected/non-grantable permissions
remain disabled. No placeholder or fictional permissions are created.

`DELETE /v1/rbac/roles/{roleId}` deletes a custom role and cascades only its
`user_roles` and `role_permissions` assignments. Staff and settings remain intact.
Other roles continue to grant permissions; staff left without roles lose
role-based access but retain their accounts. The UI requires confirmation and
warns that this cannot be undone. System roles cannot be deleted. The API checks
`roles.delete`, the actor's active state and that they hold every target-role
permission inside the shared identity lock/transaction. This serializes deletion
with staff assignment changes. No new migration is needed: both foreign keys
already cascade on role deletion.

The staff Role selector defaults to All roles and loads options from the API
(requires `roles.read`). It sends optional UUID `roleId` to `GET /v1/staff`, resets
pagination to page 1 and preserves search/status/sort. The filter applies before
pagination and counting, without duplicating staff who have multiple roles. An
unknown/deleted role returns an empty page; malformed UUIDs are rejected. Other
staff controls remain available if loading the role catalog fails.

## Data and components

`ui/src/features/identity/shared/queries.ts` coordinates generated TanStack Query
hooks and mutation workflows. Request functions, query keys and response validators
are generated from OpenAPI. Successful access changes invalidate related identity
queries and the session so navigation reflects new permissions.

The Role contract now includes `permissionKeys`, loaded with a joined API query
rather than one query per role. New roles return an empty array. OpenAPI also owns
role key/name length bounds. Both applications regenerate their contracts.

Forms use TanStack Form, generated validation and shared UI primitives. Reusable
components cover text forms, request states, confirmation dialogs, role selection
and temporary credentials. Pages retain the common container width, rounded
surfaces and theme tokens. Sensitive actions require explicit confirmation.

## Authorization and safety

- Staff listing/details require `staff.read`. Creation/editing UI requires both
  `staff.read` plus `staff.create` or `staff.update`; each API mutation checks its
  own action permission, including assignment, status changes and password resets.
- The role catalog requires `roles.read`; role creation/permission editing also
  require `roles.create` / `roles.update`. Deletion independently requires
  `roles.delete`. Staff creators without `roles.read` and `staff.assign_roles` can create accounts
  without roles but cannot browse or assign roles through the UI.
- Administrator permissions are read-only. Users cannot select permissions they
  do not hold. Permissions are inherited from roles, never granted directly.
- The API remains authoritative for delegation, duplicate records, archived
  accounts and last-active-administrator protection. Errors remain visible and
  do not produce success messages.
- Disabling/archiving warn about session revocation. Own-account actions warn that
  the current session will end. Use Change password for your own credentials.
- Refetched assignment changes require reloading the selection before saving.
  The API has no assignment version/ETag, so this is not atomic optimistic
  concurrency control; a race after the read still uses replace semantics.

## One-time credentials

Create/reissue mutations reset after settlement and use zero cache retention;
their responses then stay in component memory, not persisted caches, browser storage
or logs. The disclosure dialog explains expiry and mandatory
first-login replacement. Explicit acknowledgement closes it and clears its state.
Copying is optional; the UI advises clearing the clipboard after secure sharing.
The browser warns before unloading an open disclosure.

No welcome email is sent. Reissuing revokes old credentials and sessions but does
not enable a disabled account. If the response is lost or the operator leaves the
page, issue a new password; the old value cannot be retrieved.

## Verification

Component tests cover real list values, filters/pagination, empty/forbidden states,
role creation, duplicate errors, protected permissions, permission-key payloads,
profile edits, role assignment, confirmation flows, lifecycle changes, missing
accounts and secret-cache exclusion. PostgreSQL tests verify returned role grants,
account lifecycle, delegation and last-admin protection.

No live staff or roles were created for testing. Tests use mock transports and
isolated PostgreSQL schemas. Visual browser review requires a browser connection,
which was unavailable during this implementation.

References: [TanStack Form](https://tanstack.com/form/latest/docs/framework/react/quick-start)
and [Query invalidation](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation).
