# API architecture enforcement

The target is a modular monolith with six business modules:
`identity`, `settings`, `clients`, `catalog`, `sales`, and `reporting`.
Features inside a module collaborate directly through services. Different
modules communicate through root `index.ts` / `<module>.public.ts` entry points.
Supporting document, notification and audit capabilities live in `src/support/`.

## Enforced by ESLint

`api/eslint.config.js` enables the local `architecture/boundaries` rule defined
in `api/eslint/architecture.js`. Violations are errors in the editor and in
`pnpm lint` / CI. Paths resolve relative to the importing file, independently
of the editor's working directory. NodeNext `.js` imports map to `.ts` sources.

- New business modules must use one of the six approved names.
- Cross-module imports, including type imports, re-exports and literal dynamic
  imports, must target the receiving module's root entry or public contract.
- Internal features within a module can call other internal services directly.
- Routes depend on controllers, validation/types and middleware.
- Controllers depend on services, mappers, validation and types, not repositories.
- Services can depend on services and repositories, not controllers/routes.
- Repositories cannot depend on services or HTTP layers.
- Table imports and direct Drizzle/Postgres dependencies belong in repositories.
- Fastify dependencies belong in HTTP layers or module assembly entry points.
- Shared infrastructure cannot import business modules/support services.
- Modules cannot import the application/server composition root.
- Computed dynamic imports and unconfigured internal aliases are rejected.

Public contracts should expose DTOs and narrow capabilities, not repositories.
Services may import the shared database transaction type/helper to coordinate
atomic workflows. This import rule does not inspect SQL, enforce table ownership,
prove transactional correctness, or detect dependency cycles. Those remain code
review/integration-test responsibilities; add graph analysis if cycles become a
practical risk. Directory existence and business correctness are not lint checks.

## Existing foundation transition

Authentication, staff creation and RBAC now live inside `src/modules/identity/`
with separate routes, controllers, services, repositories, validation and mappers.
Their former exceptions and direct cross-module imports have been removed.

Only `src/modules/audit/writer.ts` retains its legacy location/layering temporarily.
Remove this final exception when moving audit to `support/audit`; do not expand
it to accommodate new implementation. New files in old module directories are
rejected.

Tests may inspect internals and fixtures directly. Production code remains subject
to the boundaries. There are no new runtime dependencies or database changes.

## Regression checks

```sh
pnpm --filter @slama/api test:architecture
pnpm lint
```

Architecture tests invoke the actual ESLint config against representative virtual
file paths, asserting allowed and forbidden imports. They run as part of the API
test command and therefore the existing CI pipeline.

Rule implementation follows the [ESLint custom-rule API](https://eslint.org/docs/latest/extend/custom-rules).
