# Repository guide for contributors and coding tools

B-Finance is a multi-tenant SaaS for invoicing and finance. pnpm monorepo: `api/` (Fastify, Drizzle,
PostgreSQL) and `ui/` (React, Vite). French is the default language; English is also supported.

## Where things live

- `docs/saas/README.md`: approved architecture and commercial agreement (source of product decisions).
- `docs/saas/tasks/`: ordered tasks, dependencies and acceptance criteria.
- `docs/implementation/`: engineering rules and specs. Start with `api-architecture-rules.md`,
  `permission-standard.md`, `local-development.md`, `generated-contracts.md`, `feature-structure.md`.

## Working rules

- Contract first: change `api/openapi/` before code, then run `pnpm contracts:generate` (api) and
  `pnpm api:generate` (ui). Never hand-write or edit generated files (`api/src/contracts/generated`,
  `ui/src/api/generated`); use generated validators, types and clients.
- Database: edit `api/db/schema` (and `api/db/integrity`/`reference` SQL) and rebuild the single fresh baseline
  with `node api/scripts/rebuild-baseline.mjs --fresh` (read `api/db/migrations/README.md` first). Pre-client
  phase: no forward migrations; the operator replaces the database volume. Switch to forward-only migrations
  before the first real client.
- Tests use the isolated test database. Never point tests at, or reset, the development database.
- API layering: routes -> controllers -> services -> repositories. Controllers never touch repositories; only
  repositories touch tables or Drizzle. Other modules are used through their root `index.ts` / `*.public.ts`.
- Permissions follow `docs/implementation/permission-standard.md`; the API is authoritative.
- UI: reuse shared components (`ui/src/components`), the theme tokens and the localization catalog. Every
  user-visible string goes through i18n with a French entry (`pnpm lint` checks catalog coverage).
- Folder structure and naming: follow `docs/implementation/feature-structure.md` (domain subfolders, allowed
  layer folders, no `utils`/`helpers`/`common`/`manager`, no generic settings/sliders icons). It is enforced by tests.
- Keep changes scoped; do not refactor unrelated code or expand the exceptions lists.

## Before finishing

- Run `pnpm check` (format, lint, typecheck, tests, build). Integration tests: `pnpm test:integration`.
- Do not commit or push unless explicitly asked.
