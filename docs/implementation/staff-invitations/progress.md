# Progress

All invitation implementation tasks are complete and verified. Billing remains deferred in its existing stash; no billing or primary database changes were made.

| Task              | Status                                                                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------- |
| Planning          | Documented                                                                                               |
| 01 Contracts      | Complete: modular OpenAPI, generated API/UI schemas and query hooks                                      |
| 02 Persistence    | Complete: two tenant tables, FORCE RLS, scoped foreign keys, explicit runtime grants and fresh baseline  |
| 03 Management API | Complete: list/create/resend/revoke, permissions, role checks and duplicate protection                   |
| 04 Delivery       | Complete: French/English HTML/plaintext, SMTP/Resend, leased retries and generation fencing              |
| 05 Acceptance     | Complete: one-use tokens, ordinary staff creation, role/authority revalidation and atomic seat admission |
| 06 UI             | Complete: staff invitation list/create, revoke dialog and public acceptance                              |
| 07 Onboarding     | Complete: idempotent invitation queue through the organization public provisioning interface             |
| 08 Verification   | Complete: full quality/integration checks plus responsive browser review                                 |

## Delegation and implementation record

The user authorized bypassing the macOS-incompatible codex-background requirement and using the direct OpenCode relay. OpenCode Go GLM 5.3 implemented the first contract pass; its five-hour quota was exhausted during review corrections. The approved free GLM fallback also returned a usage-limit error immediately. The user then explicitly authorized Codex to implement and review the remaining tasks. No other provider or metered model was selected.

Codex completed contract corrections, implementation, review and validation as one cohesive feature. The temporary relay outputs are not required to understand or resume the feature; durable requirements and architecture are in README.md and tasks.md.

## Verification — 2026-10-31

- `pnpm check`: passed formatting, API/UI lint, API/UI typechecks, 210 API unit tests, 422 UI tests, architecture checks, generator tests and API/UI production builds.
- Dedicated PostgreSQL full integration suite: 288 passed, one existing optional local-storage test skipped, across 33 files. Fresh baseline is replayed in isolated schemas.
- New invitation integration tests cover delivery, hashes, token replay/expiry/rotation/revocation, duplicate accounts, removed roles, disabled inviters, cross-tenant access, owner-cookie rejection, delegated role escalation, concurrent same-token acceptance and final-seat competition.
- Onboarding integration verifies invitations queue once, do not create staff prematurely, wait for initial administrator password replacement, and map administrator versus unprivileged staff appropriately.
- Generated-schema payload tests validate nullable unsent expiry, defaults, token/password constraints and rejection of secret response fields.
- French/English email tests verify HTML escaping, plaintext alternatives and opaque idempotency keys. No real emails were sent.
- Playwright reviewed loaded acceptance/list/create pages at 1440px and 390px, light and dark: 12 previews, no runtime errors or page overflow. Requests used intercepted fictional data.
- Browser review exposed a shared response-generator precedence issue: static routes now precede parameter routes, so `/staff/invitations` cannot match `/staff/:userId`. Regression coverage validates the actual generated response validator.
- Browser review also fixed shared password reveal positioning; focused organization/platform auth UI tests passed afterward.
- Generated artifacts remain ignored. No primary/local business database was reset and no hosted resources were changed.

Existing non-blocking warnings remain: initializer console warnings, Orval's import.meta/esbuild warnings, chart dimensions in jsdom and the large UI bundle advisory.

## Operational notes

The fresh initial schema includes invitations; an existing development database created from the earlier baseline is not automatically upgraded by replaying an already-recorded migration. No primary database reset was performed. Use a fresh environment or explicitly plan a local upgrade before exercising the new endpoints against such a database.

Security delivery requires configured SMTP/Resend, a trusted portal origin and the existing notification-worker interval enabled. Pending invitations do not reserve seats. Onboarding staff without a selected permission role receive no operational privileges until an administrator assigns roles.
