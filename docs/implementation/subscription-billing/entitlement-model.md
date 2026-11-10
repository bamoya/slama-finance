# S2 — Normalized entitlement catalog design

Design evidence for #31/#32, prepared 2026-11-08. Status: inactive foundation implemented in source; no deployed/development migration applied.
[Decisions](decisions.md) remains the commercial gate record. This design adds an inert catalog foundation;
publication does not assign customers, change checkout, override values or activate new billing semantics.
Superseded 2026-11-09: pre-client single fresh baseline, no forward migrations ([decisions](decisions.md)); activation design is in [S2/S4 activation](s2-s4-activation.md). Current source evidence is `api/db/schema/subscriptions.ts`,
`api/db/reference/plans.sql` and `api/openapi/modules/subscriptions/subscriptions.yaml`.

## Proposed tables and integrity

Tables below describe `api/db/schema/subscription-catalog.ts` and additive `0001_subscription_catalog.sql`.
Reuse existing `subscription_plans.code` as stable identity; no redundant plan table/kind field. Trial kind is
derived from immutable version `plan_code=trial`; FKs prevent identity deletion/renaming while referenced.
Existing JSON and consumers stay authoritative. Version 1 imports actual catalog rows, names/ranks and prices
in the migration transaction with a per-row JSON snapshot and PostgreSQL SHA256 provenance hash. Valid
customized values are preserved. Unknown/malformed keys, duplicate/unknown features and unsupported codes
abort the transaction; reference values below are fixtures, not replacements for deployed customer terms.
The bounded currency model is MAD-only: migration explicitly rejects a different billing currency before import.

| Table                     | Columns and identity                                                                                                                                                                                                                      | Constraints                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `entitlement_definitions` | `key` text PK; `value_type` boolean/integer; `unit` flag/count/byte/recipient; `kind` feature/capacity/consumption; `scope` owner/organization; `unlimited_allowed` boolean                                                               | Closed enums; boolean requires flag+feature and forbids unlimited; integer requires compatible unit/kind; key/type unique for composite FK      |
| `plan_versions`           | `id` UUID PK; `plan_code` FK; `version_number` positive integer; `status` draft/published; `display_name` text; `rank` nonnegative integer; `revision` positive integer; `source_snapshot/hash`; `created_at`; `published_at/by` nullable | Unique `(plan_code,version_number)` and `(id,plan_code)`; published requires publication attribution, draft forbids it; FK deletions restricted |
| `plan_entitlements`       | `plan_version_id` FK; `entitlement_key`; `value_type`; `boolean_value` nullable; `integer_value` bigint nullable; `is_unlimited` boolean                                                                                                  | PK `(plan_version_id,entitlement_key)`; composite FK `(entitlement_key,value_type)` to definition; exactly one valid representation below       |
| `plan_version_prices`     | `id` UUID PK; `plan_version_id` FK; `cycle` monthly/annual; `currency` text; `amount_ht_minor` bigint                                                                                                                                     | Unique `(plan_version_id,cycle,currency)`; initial currency MAD; amount nonnegative and safe for current DTO; FK deletion restricted            |

Definitions are global catalog metadata, not customer overrides. Owner scope describes the allowance pool;
organization scope describes where a limit/feature applies, not an independently priced organization tier.
Approved first-release exceptions are owner-subscription-only: one staff limit applies independently to each
organization. Do not create per-organization override records, mutation endpoints or precedence branches.
Definition semantics become immutable once referenced by a published version. A changed meaning needs a new key.
Descriptions/localized labels can be added separately; human text must never control entitlement evaluation.

Value representation is exclusive:

- Boolean: `boolean_value` is true/false, `integer_value` null and `is_unlimited=false`.
- Finite integer: boolean null, integer nonnegative, `is_unlimited=false`.
- Unlimited integer: boolean null, integer null, `is_unlimited=true`, only if definition permits it.
- SQL checks enforce row shape/nonnegative bounds; a database trigger enforces the referenced definition's
  unlimited allowance and semantic compatibility. The composite FK prevents cross-type assignment.
- Bound stored integers to `Number.MAX_SAFE_INTEGER` for this stage; decode bigint explicitly and reject overflow.
  Money remains integer minor units; do not use floating arithmetic or silently cast database bigint to number.
- Zero is a finite denial/empty allowance. Missing is invalid, never unlimited or an inherited plan value.
  No negative sentinel, JSON coercion, implicit false or database null with multiple meanings is allowed.

## Lossless initial catalog map

Keys intentionally retain current JSON/feature names. Reference fixture order is **trial / Essential / Business / Pro**.
All eleven definitions are required in every initial version; every feature gets an explicit boolean row.

| Definition key         | Source field or membership          | Type, kind, scope, unlimited               | Initial values                                                  |
| ---------------------- | ----------------------------------- | ------------------------------------------ | --------------------------------------------------------------- |
| `organizations`        | `entitlements.organizations`        | integer count, capacity, owner, yes        | 1 / 1 / 3 / unlimited                                           |
| `staffPerOrganization` | `entitlements.staffPerOrganization` | integer count, capacity, organization, yes | 2 / 1 / 5 / unlimited                                           |
| `storageBytes`         | `entitlements.storageBytes`         | integer byte, capacity, owner, no          | 1,000,000,000 / 1,000,000,000 / 10,000,000,000 / 50,000,000,000 |
| `businessEmails`       | `entitlements.businessEmails`       | integer recipient, consumption, owner, no  | 50 / 0 / 2,000 / 10,000                                         |
| `custom_templates`     | membership in `features`            | boolean flag, feature, organization, no    | true / false / true / true                                      |
| `business_emails`      | membership in `features`            | boolean flag, feature, organization, no    | true / false / true / true                                      |
| `scheduled_reports`    | membership in `features`            | boolean flag, feature, organization, no    | true / false / true / true                                      |
| `report_exports`       | membership in `features`            | boolean flag, feature, organization, no    | true / false / true / true                                      |
| `staff_roles`          | membership in `features`            | boolean flag, feature, organization, no    | true / false / true / true                                      |
| `advanced_analytics`   | membership in `features`            | boolean flag, feature, owner, no           | true / false / true / true                                      |
| `custom_domains`       | membership in `features`            | boolean flag, feature, organization, no    | true / false / true / true                                      |

`advanced_analytics` is granted by the owner subscription and currently serves both analytics experiences;
its owner definition must not introduce an organization-specific exception or narrow current eligibility.
`businessEmails` consumption is independent from the `business_emails` feature gate; both checks remain necessary.
Staff numbers are total members including the ordinary initial administrator, preserving approved counting.
Unlimited source `null` maps only to the two permitted unlimited rows; no other null is accepted.
Unknown keys/features, duplicate feature entries or malformed source values stop import for review; retain source
and diagnostic evidence instead of silently discarding values or assigning a permissive default.

| Plan      | Name / rank               | Monthly MAD centimes HT | Annual MAD centimes HT |
| --------- | ------------------------- | ----------------------- | ---------------------- |
| trial     | Essai gratuit 7 jours / 0 | No sellable price row   | No sellable price row  |
| essential | Essential / 1             | 9,900                   | 99,000                 |
| business  | Business / 2              | 29,900                  | 299,000                |
| pro       | Pro / 3                   | 79,900                  | 799,000                |

Trial's source zero price fields remain in the retained legacy row/import provenance; absence of a sellable trial
price is explicit plan-kind semantics, not a missing paid price. Publish paid versions only with both MAD cycles.
Do not infer tax applicability or approved payment methods from these price rows. Tax/settings stay separate.
Email window identity stays in existing trial/month accounting, not in a price or entitlement value.

## Draft publication and fail-closed evaluation

Migration-only writes use statement-level transaction locks before row locking, serializing publication, child edits
and definition changes. Row triggers increment draft revisions, freeze published rows/definitions, reject trial
prices and validate all eleven keys and both paid prices before the one-way draft-to-published update.
Publication and its migration-actor audit row commit together. Repeat SQL publication rejects an immutable row;
a future admin command must define expected-revision/idempotent request handling before exposure.
Unique version numbers provide race protection. No selling-version selector or customer assignment is installed.
Guards cover ordinary DML; a table owner/DBA can disable triggers with DDL and is a trusted migration boundary.
Before activating selling/pinning, add withdrawal controls that block new sales/assignments while existing pins
remain readable; corrections publish a new version and use the approved notified-renewal transition. No automatic
re-pin or destructive edit is permitted. Executable withdrawal controls are deferred in this inactive foundation.

The eventual normalized reader requires a complete supported definition set. Missing required rows, unsupported
keys/types, missing paid prices or corrupt values cause a catalog/configuration error and deny the new gated
operation. Do not synthesize unlimited or silently fall back to a newer version. Existing data is preserved;
billing/support diagnostics must remain available without fabricating a valid public entitlement response.
Adding a future definition requires an explicit compatibility/backfill design before making it required.

## Stable DTO adapters and authorization

First stage leaves all current API/worker reads authoritative on the existing JSON catalog. A comparison-only
adapter reconstructs generated `SubscriptionEntitlements`: finite count fields as integers, permitted unlimited
counts as null, storage/email as finite integers and true feature keys in existing enum order. False features
are omitted from the array. It returns existing plan codes/names/prices without adding transport fields.
Validate with generated schemas; use generated transport types, not a hand-authored parallel DTO interface.
Any later transport additions start in modular OpenAPI, followed by sequential API/UI generation.
The diagnostic applies only to imported versions with source provenance, not later native versions. Import and
diagnostic share pure SQL `subscription_catalog_snapshot`, projecting code/name/rank/monthly_ht/annual_ht/
entitlements/currency explicitly; unrelated schema columns do not affect the hash. It recomputes SHA256, checks
the imported hash and reconstructed DTO against current data, and reports version-specific drift without
mutating or blocking legacy reads. Passing it is a prerequisite for a future reader switch.
Do not switch tenant-workers independently; its known scheduled-plan divergence belongs to the shared resolver slice.

Catalog read data is global, not owner-owned: authorize existing owner/catalog read paths, and worker reads only
where necessary. Global does not mean an anonymous endpoint or visibility of drafts to owners/staff.
Only published selling data may feed owner catalog views; draft/history access requires platform administration.
This slice permits only migration-role mutations, with FORCE RLS plus explicit table-owner maintenance policies;
runtime receives SELECT only and statement guards reject DML even after accidental grants. Owners/staff/workers
see published rows, platform-admin context may read drafts. There is no publishing API or admin mutation service.
Initializer configuration rejects reused runtime/migration roles; before migration, `initializeDatabase` rejects
runtime elevated privileges, all role memberships and database ownership. These existing guards enforce role
separation; deployed verification still requires operational evidence. Publication audit records the declared actor,
current/session database identities, server-stamped publication time and transaction ID as text.
A future admin write path requires verified capability, existing step-up and same-transaction audit before exposure;
do not invent a tenant RBAC permission as a bypass. Catalog operations grant no access to tenant financial rows or other owners' assignments.

## Future pinning and transition design, not assignments

A later coverage model should FK each trial/paid/complimentary period to `plan_version_id`; include `plan_code`
through a composite FK if both are stored. Current purchased coverage remains pinned and unchanged.
Approved transition policy: existing customers move to a new version at a notified renewal, rather than remain
on an old version indefinitely awaiting acceptance. Publication alone never performs that transition.
Represent a scheduled transition with owner, source/target versions, renewal boundary, notice timestamp and
notice-policy reference; activate only at the eligible notified renewal, atomically with coverage creation.
User confirmed at least 30 days of notice and preservation of already-paid future renewals under their old terms.
Record delivery evidence and preserve distinct pins/boundaries and existing promises for those periods;
never silently replace their version or recompute their amounts. A later publication must not retarget an
already-notified transition automatically; amend/re-notify according to the specified notice policy.
Payment submissions reference the quoted version/price independently from eventual allocated coverage; existing
amount/currency/tax snapshots stay authoritative even when catalog prices differ. Do not recalculate history.
Owner summary resolves the eligible period's pin; an owner-level “latest version” pointer cannot replace period pins.
Trial and complimentary grants retain their provenance; `admin_adjustment` remains distinguishable from cash receipts.

Prepare a reconciliation manifest, not customer updates: source owner/payment IDs, legacy plan JSON snapshot/hash,
amount snapshots, current/future period dates, suggested version and ambiguity reason. Include legacy paid-through
fallback, overlapping upgrade rows, suspended coverage, pending references and zero-amount grants.
A catalog snapshot cannot prove historical contractual values; ambiguous records remain unresolved, never guessed.
No owner/payment/period FK or scheduled customer transition is assigned in this foundation. The renewal-transition
choice, 30-day minimum notice and already-paid-period protection are answered; their executable rollout still
needs review. Remaining paid-period, quote and downgrade decisions control affected
coverage, quote and downgrade behavior. Existing exceptions require provenance review before any conversion.

## Narrow implementation stages and acceptance

1. Review contracts and domain definitions; keep public DTO unchanged. Add schema sources, inert reference catalog
   and integrity enforcement in one serialized change; no automatic owner assignment or runtime reader switch.
2. Add repositories and comparison adapter through subscription module boundaries. Test adapter equivalence using
   actual source snapshots and fixtures; Drizzle migration journal supplies once-only application, not an import upsert.
3. Review a separate rollout proposal implementing the approved notified-renewal transition after notice and
   already-paid-future-period details are specified. Only then consider reads, coverage pins,
   overrides, selling-version selection and UI changes; none is implied by completing #31/#32 design.

Focused integration checks, exclusively against the isolated test database (activation checks remain future work):

- Seed four versions, 44 values and six paid prices; compare every reconstructed DTO/price to current fixtures.
- Reject wrong type/unit, fractional/negative/overflow input, illegal unlimited, missing keys and duplicate rows.
- Reject incomplete publication, published parent/child/price mutation and deletion; retain all FK references.
- Race draft edit against publish and two publish requests using independent transactions; assert one immutable
  complete outcome, rejected duplicate SQL publication and no partially published version.
- Verify runtime cannot mutate even in admin context, owner/staff/worker cannot read drafts, and migration-role
  publication/audit succeeds without superuser privileges; failed publication leaves no partial data/audit.
- Future activation tests must prove notice eligibility, exact renewal-boundary switching, idempotent transition,
  unchanged current purchased periods and preservation of already-paid future periods under the specified policy.
- Confirm original subscriptions, payment snapshots, future coverage, email ledgers and storage usage are unchanged;
  API/worker behavior is unchanged because normalized reads remain inactive. No test sends external email.

Schema source changes belong in `api/db/schema`; add new forward migrations for tables and SQL-managed integrity.
The deployed baseline and all applied migration history remain immutable: do not regenerate or apply a fresh baseline.
Inspect actual deployment inventory and migration journal before rollout; import preflight validates catalog contents.
Preserve deployed customer data and local owner/setup/files with a reviewed additive transition, backup/restore
and reconciliation plan; never reset development data. Only isolated fixture schemas have executed the new migration.
The additive model is ready for review; customer pinning, reader activation and scheduled migration await the
reviewed rollout specification. Deployed status, owner-only override scope and migration at a notified renewal
are settled user decisions, including 30-day minimum notice and preservation of already-paid future renewals.
Later implementation must run contract checks, focused integration checks, `pnpm check` and `pnpm test:integration`.
