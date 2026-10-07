# UI modules and generated TanStack Query integration

Implemented migration (September 2026). Existing route URLs are unchanged.

## Module boundaries

```text
ui/src/
  api/
    http.ts                        shared Axios transport and response validation
    generated/                     generated, ignored by Git
      identity/identity.ts         requests, hooks, options and keys
      settings/settings.ts
      shared/shared.ts             health/readiness
      models/                      Orval transport types
      schemas/                     generated Zod schemas and response validators
  features/
    identity/
      auth/                        login, session, profile, password workflows
      staff/                       account and role-assignment pages
      roles/                       permission matrix and role management
      shared/                      cache coordination and mutation adapters
      index.ts                     public API
    settings/
      company/
      bank-accounts/
      document-templates/
      assets/
      shared/                      shared forms, record pages and workflows
      index.ts                     public API
  lib/query-client.ts              one app-wide QueryClient
```

Names match the implemented API modules: `identity` and `settings`. `audit` has
no UI yet. Mock-only products, clients, documents, delivery notes, payments,
reports and notifications remain separate until their API domains are implemented.

Within a module, subfeatures may import each other directly. External consumers
must use the module's `index.ts`. ESLint enforces this for imports, dynamic imports
and re-exports, and prevents features from consuming another module's generated
endpoint client. Public entry points expose only consumed functionality.

## Generation and runtime

Run `pnpm --filter ./ui api:generate`. Dev, build, typecheck and test also generate.
OpenAPI remains the source of truth. The contract compiler derives Orval tags
from the source contract module, generates Zod validation and success-response
validators, and emits the resolved spec. Orval v7 generates TanStack Query v5
queries/mutations with Axios through the existing `apiRequest` mutator.

Request URLs are generated. JSON success responses are validated before they
reach the query cache; invalid responses produce `INVALID_RESPONSE`. Binary
downloads use the OpenAPI `binary` response format and bypass JSON validation.
Form inputs continue to use generated Zod schemas. Generated files are not edited
or committed. The former single `generated/client.ts` is removed.

## Application-owned behavior

Permission rendering uses the globally exported `Can` from `features/identity`.
`permission` accepts a slug or an array requiring all listed permissions; `fallback`
is optional. Non-rendering decisions (query enablement, disabled/read-only state)
use `useAuthorization()`. Both fail closed for missing, errored or password-change
sessions. Route guards and navigation use the same gate and centralized route
requirements. Record-state rules (archived, self-account, system role) remain
separate. Role-delegation checks use the central `hasPermission` helper; selection
membership checks are ordinary UI state, not authorization. Server-side RBAC is
still the security boundary.

- Permission-based query enablement, navigation and form workflows stay handwritten.
- Query keys come from generated factories. Mutation completion explicitly refreshes
  related lists/details/session permissions; generation does not infer these relationships.
- Session is a deliberate custom query using the generated session key and request:
  a 401 means `null` (signed out), while other failures remain errors. Session polling,
  focus refresh and password-change-only sessions retain their existing behavior.
- Authentication transitions cancel outstanding requests and clear cached user data.
- Sensitive generated mutations use zero retention and reset after settlement, so
  passwords, reset tokens and temporary-password results are not retained in the
  mutation cache. One-time staff credentials remain in the disclosure UI until closed.
- Upload progress and Blob object-URL cleanup remain UI responsibilities.
- Bank/template edits preserve expected-version conflict checks and explicit reloads.

Tests mock the HTTP boundary rather than generated hooks, exercise generated query
keys/request functions, and separately verify runtime validation and ESLint boundaries.
