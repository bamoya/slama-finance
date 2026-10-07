# Generated HTTP contracts

OpenAPI is the source of truth for HTTP request validation and transport types.
Do not maintain matching handwritten Zod schemas or DTO interfaces in features.

## Source layout

```text
api/openapi/
├── openapi.yaml                 # Entry point, references and security
├── modules/identity/
│   ├── auth.yaml                # Login, sessions, passwords
│   ├── staff.yaml               # Staff lifecycle and onboarding
│   └── rbac.yaml                # Roles and permission keys
└── shared/
    ├── common.yaml              # Health, dates, decimal strings, identifiers
    ├── errors.yaml
    └── pagination.yaml

api/src/contracts/generated/    # Generated API validators and inferred types
ui/openapi -> ../api/openapi
ui/src/api/generated/           # Generated Axios client, types and Zod schemas
```

The contract files separate concerns without creating new runtime modules or a
shared package. Generated files, including resolved OpenAPI JSON, are ignored by Git.

## Generation

```sh
pnpm --filter ./api contracts:generate
pnpm --filter ./ui api:generate
pnpm contract:check
```

API and UI dev, build, typecheck and test commands generate contracts first.
After editing OpenAPI during a running dev session, rerun generation or restart
the dev command; the specification itself is not watched.

`api/scripts/generate-contracts.mjs` validates and resolves the modular source,
then generates Zod schemas and types inferred from those schemas in each app.
Orval generates the UI Axios client from the resolved specification, using the
shared HTTP transport. The UI build uses API-owned build tooling, not API runtime
code. Its Docker build installs the required generator dependencies.

The Zod compiler deliberately supports a bounded subset of OpenAPI schemas.
Unsupported validation keywords or formats fail generation. Extend the compiler
with tests before adopting new schema constructs; do not bypass it with a local
handwritten contract. Current support includes strict objects, nullable values,
defaults, enums, string formats/patterns, numeric bounds and collection bounds.

## Runtime responsibilities

- Controllers parse requests with generated schemas. Mappers and composed
  responses use generated transport types.
- HTTP query integers accept digit strings and become numbers. Request body
  numbers are not coerced. Query defaults are reflected in parsed output types.
- Services own normalization and business rules: email case, trimmed names,
  password verification, permissions, account state and concurrency. When
  normalization can change validity, validate the normalized value again.
- Repositories retain database row types; timestamps can remain `Date` internally
  and become ISO strings in response mappers.
- Internal dependency types, environment configuration, audit events and UI-only
  state are not HTTP contracts and may still have authored types/validation.
- Generated client types describe transport inputs; generated Zod inferred types
  describe parsed values, including applied defaults.

API lint blocks direct Zod imports inside business modules, with an explicit
exception for the existing internal audit writer. It cannot prove that an
arbitrary handwritten TypeScript interface duplicates a DTO; review still needs
to enforce transport ownership.

## Adding or changing an endpoint

1. Edit the appropriate module contract and expose its references at the root.
2. Generate both apps and import the generated schemas/types.
3. Implement controller, service, repository and response mapping as needed.
4. Add contract and HTTP regression tests, including invalid input cases.
5. Run lint, typecheck, tests, build and database integration tests when relevant.

Generator tests check deterministic output, the UI symlink and unsupported
keywords. Contract tests compare validation against OpenAPI and verify response
shapes. Database-backed tests exercise authentication, onboarding and staff flows.
