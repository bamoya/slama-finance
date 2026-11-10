# S2/S4 — Selling versions, coverage pins and one effective-access resolver

Design and contract record for parents #4 (S2) and #6 (S4), children #31–36 and #43–48. Prepared 2026-11-10 on
base `e336dba`. Phase 1 changes only OpenAPI sources (generated API/UI regenerated) and documentation; schema and
runtime are the next slices. [Catalog model](entitlement-model.md) and [decisions](decisions.md) stay the history.

## Policy in force (latest user decisions supersede older prose)

- Pre-client: one fresh baseline (`rebuild-baseline.mjs --fresh`); no forward migrations, backfills or
  reconciliation manifests. Older "deployed / forward-only" text in the catalog model is superseded.
- Administrators: existing session, reason and confirmation; fresh second factor only for security actions.
  Older "fresh TOTP for routine admin actions" text is superseded (OpenAPI already says "no fresh second factor").
- Publication never repins anyone. A platform version change reaches an existing customer only through a
  notified `version_transition` at a renewal starting ≥ 30 days after notice; already-paid periods never change.
  Explicit customer/admin plan changes keep today's rules and take the target plan's selling version.
- Overrides are owner-subscription only (S3, done). Restrictions, tenant isolation and RBAC stay separate gates.
- No silent JSON fallback, newer-version fallback or unlimited-on-error. Calendar math stays in
  `billing-calendar.service.ts` with IANA data; no fixed Casablanca offset.

Out of scope: S6 invoices/payment ledger, S7 quota reservations ledger, S8 journeys (notice sending, downgrade
retention selection, reminders), a catalog editor UI.

## Already done (not redone)

Normalized catalog tables, integrity triggers, immutable publication and audit, version 1 import
(`api/db/reference/subscription-catalog.sql`), comparison adapter; S3 overrides with typed values and expiry;
S5 periods with suspensions/scheduled changes, period reads default (`SUBSCRIPTION_COVERAGE_READS=periods`);
workers already call `workerEligible` per organization; admin security/bootstrap.

## Gap and acceptance matrix

| Child | Remaining gap (source evidence)                                                                                                 | Acceptance for this step                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #31   | Definitions exist; evaluator `effective-entitlements.ts` hardcodes key lists instead of reading definitions                     | Evaluator driven by version rows + definitions; unknown/missing key = catalog error, never ignored                                                                           |
| #32   | Versions immutable, but no selling authority; nothing selects a version                                                         | `plan_selling` pointer + withdrawal; writes migration-role/CLI only, audited; draft never sellable                                                                           |
| #33   | Values exist; runtime reads `subscription_plans.entitlements` JSON (`billing.repository.plan`, `subscription.repository.trial`) | All entitlement reads come from the pinned version; JSON no longer consulted at runtime                                                                                      |
| #34   | Prices exist; quote/upgrade use `subscription_plans.monthly_ht/annual_ht`                                                       | Quote/proration/admin activation price from `plan_version_prices` of the pinned/selected version; payment snapshot unchanged authority                                       |
| #35   | Import done; JSON columns still live and authoritative                                                                          | Baseline keeps `subscription_plans` as identity (code, rank for ordering only); drop runtime use of JSON/price columns; comparison diagnostic retained for imported versions |
| #36   | `subscription_periods.plan_version_id` nullable and never written; payments have no pin; trial row has no pin                   | NOT NULL pins with composite FKs; integration tests for immutability, pin preservation, RLS                                                                                  |
| #43   | `subscription.service.summary` mixes `clock()` and `repo.now(tx)`; plan from JSON; no next-transition instant                   | `resolveAccess(owner, tx)` = one instant, one snapshot; returns pin, values, sources, `accessValidUntil`; fail closed 503                                                    |
| #44   | Gates call `summary` (OK) but `hasFeature`/`workerEligible` swallow every `AppError`                                            | Gates use resolver; only access denials (402/403) map to "not allowed"; catalog/period errors propagate                                                                      |
| #45   | Workers share the API path already; README "Known gaps" line is stale                                                           | Parity test: same owner/instant → identical decision in API and worker; catalog error recorded as runner failure                                                             |
| #46   | Workspace exposes entitlements only; UI caches 30 s; admin detail breaks if summary throws                                      | `accessValidUntil` in workspace/owner DTO; UI refetch at that instant + invalidation on mutations; admin detail nullable subscription + `subscriptionError`                  |
| #47   | Restrictions checked in `current()`/`organizationRestricted` and runner discovery; order is implicit                            | Resolver result carries restriction outcome first; tests: restriction denies despite override/unlimited; RBAC unaffected by entitlements and vice versa                      |
| #48   | No tests of time-boundary transitions through the resolver or of cache expiry                                                   | Boundary tests (trial end, period end, grace, override start/end, transition at renewal, DST/month end) and UI refetch/invalidation tests                                    |

## Schema contract (baseline edit, `api/db/schema` + `api/db/integrity`)

1. `plan_selling` (new, `subscription-catalog.ts`): `plan_code` text PK FK `subscription_plans.code`;
   `plan_version_id` uuid NULL, composite FK `(plan_version_id, plan_code)` → `plan_versions(id, plan_code)`;
   `changed_at` timestamptz default now; `changed_by` text not blank. NULL version = withdrawn (no new sales).
   Trigger: target must be `published`; `trial` may not be withdrawn. Same FORCE RLS/migration-role write and
   reader SELECT policies as the catalog; every change writes `admin_audit` (`subscription_catalog.select` /
   `.withdraw`) in the same statement transaction, like publication. Reference SQL seeds version 1 for all four.
2. `owner_subscriptions.trial_plan_version_id` uuid NOT NULL, composite FK with constant `'trial'` plan code
   (`trial_plan_code` generated/check column = `'trial'`). Set from `plan_selling` at start; the trial-period
   mirror trigger copies it into the trial period.
3. `subscription_periods.plan_version_id` NOT NULL (composite FK already exists). Writers pass it explicitly.
4. `subscription_payments.plan_version_id` uuid NOT NULL, composite FK `(plan_version_id, plan_code)`.
   Includes dual-written `admin_adjustment` rows (same pin as their complimentary period). Immutable after insert
   (existing runtime UPDATE grants exclude it). A trigger rejects a paid period whose `plan_version_id` differs
   from its payment's.
5. `subscription_scheduled_changes` `version_transition`: require `target_plan_code`, composite FK
   `(target_plan_version_id, target_plan_code)`, target published; keep the existing ≥ 30-day notice check.
   No writer in this step (S8 sends notices); admin-context SQL in tests only.
6. `subscription_plans`: keep `code`, `name`, `rank` (identity and ordering); remove runtime reads of
   `entitlements`, `monthly_ht`, `annual_ht`. Columns stay as import provenance for the snapshot hash.

## Pin rules (every writer)

| Writer                                                  | Version written                                                                          |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Trial start (`repo.start`, owner onboarding)            | `plan_selling['trial']`; none → 503, organization creation fails closed                  |
| Quote/submit activation, upgrade, plan change           | `plan_selling[target]`; withdrawn → 409 `PLAN_NOT_SELLABLE`                              |
| Quote/submit same-plan renewal (incl. cycle)            | Pin of the latest coverage period; eligible scheduled transition → its target            |
| Renewal to a different plan (downgrade)                 | `plan_selling[target]` (explicit customer change)                                        |
| Payment confirmation (incl. delayed)                    | `payment.plan_version_id`; never re-resolved; transition marked `applied` in the same tx |
| Admin activation, grant, plan change                    | `plan_selling[target]`; withdrawn → 409 `PLAN_NOT_SELLABLE`                              |
| Admin extension                                         | Pin of the period it continues                                                           |
| Resume shift, supersession, cancellation                | Unchanged pins (only windows move)                                                       |
| Legacy read mode (`SUBSCRIPTION_COVERAGE_READS=legacy`) | Payments carry pins; legacy paid-through marker without a payment → 503 (no inference)   |

Eligible transition: status `scheduled`, `target_plan_code` = renewal plan, renewal `coverageStart ≥ effective_at`
and `≥ notice_sent_at + 30 days`, and no confirmed/submitted payment already covers that start. Upgrade proration
uses the running period's pinned price for its cycle and the target selling price. Payment money snapshots stay
authoritative; history is never recomputed.

## Resolver contract (`services/access-resolver.service.ts`, pure + one repository read)

`resolveAccess(ownerId, tx) → AccessResolution`, captured once:

- `at`: one instant per resolution. Production = DB transaction clock (`repo.now(tx)`); an injected test clock
  replaces it for every rule (coverage, grace, overrides, email window). No second clock read.
- Snapshot: one statement reads periods/suspensions/scheduled changes (exists), restrictions, overrides and the
  pinned version's values+definitions+prices. Published versions are immutable, so a process cache keyed by
  `plan_version_id` is allowed; `plan_selling`, coverage, overrides and restrictions are never cached.
- Order: restrictions (owner blocked/deleting, organization paused/suspended/deleting, subscription suspended)
  → coverage status → pinned version values (validated against definitions: all eleven keys, types, unlimited
  allowance; else `SUBSCRIPTION_CATALOG_UNAVAILABLE`) → active override replacement (existing S3 semantics) →
  `accessValidUntil` = earliest future instant among period/grace/trial end, override start/end, scheduled
  change effective and next paid email month boundary (an open suspension has no end instant).
- Output: `{ at, status, restriction, planCode, planVersionId, planVersionNumber, entitlements, sources,
accessValidUntil, scheduledVersionTransition }`. `summary`, `assertAccess`, `feature`, `admit*`,
  `reserveEmail`, `reserveStorage`, `workerEligible` all consume it. Quota accounting (email ledger keys, storage
  reservations, live counts, owner lock) is unchanged.
- Errors: 503 `SUBSCRIPTION_CATALOG_UNAVAILABLE` / `SUBSCRIPTION_PERIODS_INCONSISTENT` deny gated operations
  and propagate in workers (runner failure, not silent skip). Owner `/billing` and `/payments` and admin detail
  (`subscription: null`, `subscriptionError`) stay available.

## API/DTO contract (done in phase 1, generated)

- `OwnerSubscription`: `planVersionNumber`, `accessValidUntil`, `scheduledVersionTransition`.
- `BillingCatalog.plans[].versionNumber` (selling version; withdrawn omitted). `SubscriptionQuote` and
  `SubscriptionPayment`/`AdminPayment`: `planVersionNumber`.
- `WorkspaceSession.subscription.accessValidUntil`. `AdminOwnerDetail.subscription` nullable + `subscriptionError`.
- Errors documented: 409 `PLAN_NOT_SELLABLE`, 503 `SUBSCRIPTION_CATALOG_UNAVAILABLE`. No new endpoints:
  selling selection/withdrawal is the operator CLI `pnpm --filter ./api subscription:catalog
list|select <plan> <version> --by <name>|withdraw <plan> --by <name>` (migration role, like `subscription:payment`).

## UI contract

- Workspace and owner portal queries: keep 30 s stale time, add a timer to invalidate at `accessValidUntil`
  (clamped ≥ 1 s, ≤ 24 h); invalidate subscription/workspace queries after payment submit, cancellation and admin
  override/plan actions (most exist). Owner subscription page shows the version number of the plan and of a
  scheduled transition (date + target); checkout shows the quoted version. Admin customer card handles
  `subscription: null` with the `subscriptionError` message, keeping payments/actions visible. All strings i18n FR/EN.

## Implementation sequence

1. **Schema + integrity + reference** (`api/db/schema/subscription-catalog.ts`, `subscriptions.ts`,
   `subscription-periods.ts`, `api/db/integrity/subscription-{catalog,periods}.sql`,
   `api/db/reference/subscription-catalog.sql`; rebuild baseline). Tests: catalog/periods integrity suites.
2. **Catalog reads** (`repositories/catalog.repository.ts`: `selling(planCode)`, `versionValues(id)` with
   definitions; pure `catalog-values.service.ts` validating and mapping to `SubscriptionEntitlements`).
3. **Writers pin** (`billing.service.ts`, `billing.repository.ts`, `subscription.repository.ts`, admin lifecycle
   /customers services; quote/proration from version prices). Depends on 1–2.
4. **Resolver** (`access-resolver.service.ts`; refactor `subscription.service.ts` and `effective-entitlements.ts`
   to definition-driven evaluation; error mapping in `hasFeature`/`workerEligible`). Depends on 2.
5. **Consumers/DTOs** (subscription/workspace/admin controllers and mappers; CLI script
   `api/scripts/subscription-catalog.ts`; `docs` README known gaps). Depends on 3–4.
6. **UI** (workspace context, owner portal layout, subscription status/checkout, admin customer card, i18n).
   Depends on 5.
7. **Verification** (#36/#48): integration — pin per writer, delayed confirmation keeps pin, publication repins
   nobody, transition only at eligible renewal (29 vs 30 days, already-paid renewal untouched), withdrawn plan
   blocks new sales but renewal continues, corrupt/missing version → 503 for API and worker failure, override
   expiry exact boundary, restriction beats override, API/worker parity, RLS (owner cannot read drafts or
   another owner's pins), Casablanca DST and month-end boundaries via the calendar service; UI refetch timer.
   Then `pnpm check` and `pnpm test:integration` on `localhost:55439/slama_finance_test`.

## Policy defaults taken (not blockers)

- Withdrawal blocks new activation/upgrade/plan change/grant/trial selection; same-plan renewal on an existing pin
  continues. A plan-wide end of renewals would be a new commercial decision (not requested).
- Confirmation honours the version pinned at submission even if withdrawn or superseded meanwhile.
- Same-plan cycle change at renewal keeps the pin (both cycles exist on every paid version).

## Final validation status — 2026-11-10

This status supersedes pending phase notes below. API, workers and French UI are integrated.
All three Sol P2s, the authoritative database clock correction and the final expired/withdrawn-plan UI
guard are fixed. Independent Fable 5.1 LOW final review found no blocking issue and verified the last P3.
Regressions were demonstrated failing against old behavior before passing with corrections.

- `pnpm check` PASS: API 277, UI 597; format, lint, types, architecture, generator and build checks.
- Full isolated integration: 441 passed, 1 skipped, 0 failed. Subsequent delta was UI-only.
- Evidence: `/tmp/slama-s2-s4/fixes-result.md`, `/tmp/slama-s2-s4/fable-review-result.md` and raw logs.

Residual limitations: browser/server clock skew can cause successful deadline refreshes each second until
the server boundary; admin list lifecycle filters retain the host clock; snapshot mapping relies on the
existing Drizzle postgres-js timestamp configuration. No manual browser or fresh-image E2E is claimed.
Changes remain uncommitted; no deployment or development database operation was performed.

## Phase 2A status — schema and catalog reads (2026-11-10)

Implemented in source and the rebuilt single baseline (no database/volume operation outside isolated test schemas):

- `plan_selling` (one row per plan, NULL = withdrawn, trial never withdrawn): migration role only (statement
  lock + row guard, FORCE RLS, runtime SELECT), published same-plan versions only, no deletion, no no-op change,
  DB-stamped `changed_at`, audit `subscription_catalog.select|withdraw` in the same transaction. Seeded to v1.
- Pins: `owner_subscriptions.trial_plan_version_id` set by a BEFORE INSERT trigger from the selling trial
  (fails closed), immutable; trial mirror copies it into the trial period. `subscription_payments.plan_version_id`
  required, published paid version, composite FK, immutable. `subscription_periods.plan_version_id` required,
  published version of its plan, equal to its payment's pin (inherited when omitted), immutable via the period guard.
  `version_transition` requires `target_plan_code`, composite target FK and a published target.
- Reconciliation copies payment/trial pins and refuses a legacy paid-through marker (no version inference).
- `catalog-values.service.ts`: definition-checked `versionTerms` (all eleven keys, unlimited only where allowed,
  exactly monthly+annual MAD or none for trial), `createCatalogReader` (`pinned`, `selling`, `sellingPaid`,
  immutable-version cache, 503 `SUBSCRIPTION_CATALOG_UNAVAILABLE`, 409 `PLAN_NOT_SELLABLE`). The provenance
  comparison now reuses it and stays diagnostic only. Not yet wired into runtime reads (phase 2B).

## Phase 2B status — writers, resolver and backend DTOs (2026-11-10)

- Every writer pins explicitly (table above): quote/submit store the quoted version; confirmation keeps it and marks
  an eligible notified `version_transition` `applied` in the same transaction; same-plan renewals keep the latest
  pin (withdrawal does not block them); new sales, admin activation/grant/plan change take the selling version
  (withdrawn → 409); admin extension continues its period's pin. Prices and upgrade proration come from version
  terms; plan JSON and price columns are no longer read at runtime.
- `access-resolver.service.ts` is the single authority for summary, workspace, API admissions and worker
  eligibility: one instant (database transaction clock; an injected test clock replaces it), one snapshot
  statement (periods with pins, suspensions, scheduled changes, overrides), restriction reported first, fail closed 503. `hasFeature`/`workerEligible` treat only 402/403 as "not allowed"; the worker runner records 503s as failures
  and continues with other organizations.
- Consistency and caching: API responses are not cached; each resolution reads coverage, overrides, the selling
  pointer and restrictions inside the caller's transaction. Only validated terms of immutable published versions
  are cached per process. `accessValidUntil` is the earliest future boundary (coverage, trial, grace, scheduled
  change, override start/effective end, next Casablanca email month for paid plans; frozen coverage while
  suspended), so clients refetch then and after their own mutations.
- Admin detail returns `subscription: null` + `subscriptionError` for the two resolver 503s; payments carry
  `planVersionNumber` everywhere. Operator CLI: `pnpm --filter ./api subscription:catalog`.
- Verification: API integration 435 passed (1 skipped), unit 274, types/lint clean. Pending: UI phase (34 UI type
  errors on the new DTO fields), then root `pnpm check`.
- Admin owner list: `AdminOwnerSummary.subscriptionStatus`/`planCode` nullable plus required `subscriptionError`; a
  row whose access cannot be resolved (only the two resolver 503 codes) reports the error without inferred values,
  while filtering, search and pagination use the catalog-independent lifecycle SQL and other rows stay normal.
