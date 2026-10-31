# Feature structure and naming rules

Applies to every contributor and tool. Derived from the reference implementations
`ui/src/features/organization/identity/*` and `api/src/modules/organization/identity/*`.
Enforced by `ui/eslint/structure.test.js`, `api/eslint/structure.test.mjs` (both run in `pnpm test`)
and the `no-restricted-imports` rule in `ui/eslint.config.js`. Import boundaries are separate; see
[API architecture rules](api-architecture-rules.md).

## Layout

Features (UI) and modules (API) live under an area (`organization` or `platform`) and are split by
**domain subfolder**. A domain owns its layers and its tests (tests sit beside the code they cover).
A feature's public entry is its `index.ts`; other features import only that.

```text
ui/src/features/organization/identity/          api/src/modules/organization/identity/
├── index.ts                                    ├── index.ts, identity.public.ts
├── auth/                                       ├── auth/
│   ├── pages/  components/  hooks/  api/       │   ├── controllers/  routes/  services/
│   └── permissions.ts, auth.test.tsx           │   └── repositories/  mappers/  types/
├── staff/   (pages/ components/)               ├── staff/  rbac/  invitations/  provisioning/
├── roles/   workspace/   shared/               └── (each domain owns its own layers)
```

Allowed layer folder names (exact):

- UI: `pages`, `components`, `hooks`, `api`, `styles` (`styles` holds feature CSS; used by `platform/*`).
- API: `controllers`, `routes`, `services`, `repositories`, `mappers`, `types`.

Structure rules:

- A feature with several domains has **no layer folders at its root**: put them inside each domain
  (`sales/invoices/pages`, not `sales/pages`). A feature with a single domain may hold layers directly (`dashboard/pages`).
- Inside a domain, only allowed layer folders (small leaf domains such as `workspace/` may keep flat files).
- Nested folders inside a layer are fine (`components/onboarding/`, `pages/rule-detail/`).
- Not layers, do not create: UI `data`, `lib`, `services`, `types`, `store`; API `pages`, `components`, `hooks`, `lib`.
- API files follow `<name>.<layer-singular>.ts` (`staff.service.ts`, `staff.repository.ts`).

## Naming

- Banned file and folder names (any dash-separated token): `utils`, `helpers`, `misc`, `common`, `stuff`,
  `manager` (plural/singular variants too). Also banned: `*-portal.service.*` and generic
  `<prefix>-<noun>` names such as `admin-table`, `admin-layout`, `owner-form`, `app-card`.
- Name files after what they do or own: `customers-table.tsx`, `invoice-balance.tsx`,
  `password-recovery.service.ts`. Use the domain term of the user (for example "customers" in operator UI).
- Shared code goes in `ui/src/components/*`, `ui/src/lib`, `api/src/lib` or `api/src/support` **only when used
  by more than one feature**. Until then keep it in the owning domain (or its `shared/` domain).
- Icons must describe the content. Generic settings/sliders icons (`Settings`, `Settings2`, `Cog`, `Sliders`,
  `SlidersHorizontal`) are banned by lint: use e.g. `Landmark` for billing, `ListFilter` for filters. Numbered
  lucide names such as `Trash2` or `Building2` are fine; they are lucide's current versions.

## Exceptions

Existing violations are listed explicitly (path plus reason "legacy, pending refactor") in
`STRUCTURE_EXCEPTIONS` (`ui/eslint/structure.js`, `api/eslint/structure.js`). New violations fail the build. Lists may only shrink; a stale entry fails its test.
Include `platform/administration` (UI and API) until it is restructured.
