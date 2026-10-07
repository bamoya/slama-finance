# Identity structure migration

Subsequent functionality is documented in [staff lifecycle and email recovery](staff-and-password-recovery.md):
staff URLs now use `/v1/staff`, account archival and last-admin protection are
implemented. [Onboarding and Resend](auth-onboarding-and-resend.md) adds generated
temporary passwords, restricted sessions, authenticated changes and a production
email adapter. Compatibility
and pending-work notes below describe the original structural migration.

This is a structural migration of the existing foundation, not completion of
authentication/onboarding sequence 01 or RBAC sequence 02.

```text
src/modules/identity/
├── index.ts                  # Wires internal features and registers routes
├── identity.public.ts        # Safe session lookup and permission-check contract
├── auth/
│   ├── controllers/
│   ├── routes/
│   ├── services/             # Authentication, passwords, session lifecycle
│   ├── repositories/         # Credentials and sessions
│   ├── schemas/
│   ├── mappers/
│   └── types/
├── staff/
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   ├── repositories/
│   ├── schemas/
│   ├── mappers/
│   └── types/
└── rbac/
    ├── controllers/
    ├── routes/
    ├── services/
    ├── repositories/
    └── schemas/
```

- Routes bind controllers and shared permission middleware. Controllers validate
  HTTP input, select safe responses, and set/clear cookies.
- Services contain workflows, without Fastify dependencies. Internal staff,
  password, session and RBAC services collaborate directly within identity.
- Repositories contain all queries. Staff creation plus settings/role assignment,
  and role/permission replacements preserve transaction atomicity.
- `src/middlewares/require-permission.ts` receives the public identity API from
  `app.ts`, performs the HTTP authorization check and attaches the actor.
- Public session results exclude password hashes and internal account metadata.
- Database access remains lazy: starting the server or requesting liveness does
  not require a database connection.

## Compatibility and scope

Existing `/v1/auth/*` and `/v1/rbac/*` URLs, permission keys, status codes and
response shapes were preserved by the structural migration. A subsequent contract
update replaces `permissionIds` with `permissionKeys` in role permission assignment
requests; permission UUIDs remain internal join-table references. Staff creation stays at `/v1/rbac/staff` for
contract compatibility even though implementation belongs to the staff feature.
Anonymous RBAC requests retain their previous 403 response. Password hashing and
cookie settings remain compatible; malformed stored hashes now fail verification
safely rather than causing a length-mismatch exception.

No database definitions/migrations changed or were applied to an application DB.
The UI bypass remains unchanged. One-use temporary passwords, password recovery,
last-administrator protection and expanded RBAC rules remain planned work.

The old auth/RBAC implementation files were removed after moving their logic;
the only remaining legacy ESLint architecture exception is the audit writer.

## Verification

- Unit tests: password hashing/verification, login eligibility, token hashing,
  session lookup and safe response mapping.
- Isolated PostgreSQL HTTP tests: cookies, session/logout, permissions, role
  creation/assignment, staff mapping, atomic rollback, expiry and disabled users.
- Existing contract, foundation and architecture checks remain active.

Run `pnpm --filter @slama/api test`, `pnpm lint`, `pnpm typecheck` and
`TEST_DATABASE_URL=... pnpm --filter @slama/api test:integration` using the
dedicated test database described in [the runbook](foundation-runbook.md).
