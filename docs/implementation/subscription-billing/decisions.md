# S1 — Subscription and billing decisions

Decision record for parent #3 and children #25–30, prepared 2026-11-08.
Status: reviewed decision record; explicit user answers below are approved, while remaining proposals stay open.
Only explicit commercial decisions change the approved agreement. Recommendations are proposals throughout.

## User decisions — 2026-11-08

- **Superseded 2026-11-09:** the user confirmed there are no real clients and will replace the database volume.
  Keep one canonical fresh baseline (`rebuild-baseline.mjs --fresh`) and update it for table changes; no forward
  migrations, upgrade backfills, frozen hashes or legacy-to-periods rollout until real client data exists. Agents
  still never reset or remove existing databases/volumes. (Earlier: "already deployed, forward migrations only".)
- First-release entitlement exceptions apply to the **owner subscription only**. Every owned organization inherits
  the effective values; the staff limit is still enforced separately within each organization. No org override rows.
- Existing customers **move to new plan versions at a notified renewal**. Current purchased coverage stays unchanged.
  Give at least 30 days of notice; preserve the terms of any future renewal already paid under the old version.
- Platform-administrator subscription suspension freezes trial, paid and grace time; future coverage shifts on
  resume. An organization-only pause leaves the owner subscription clock running. Calendar-month email windows
  remain unchanged and resuming does not reset consumption.
- Launch payment methods: cash and bank transfers. TVA is configurable on the administrator board, can remain
  disabled at launch and be enabled later; an enabled rate must be explicitly configured. Preserve historical
  tax snapshots when configuration changes; this is not a determination of the operator's tax liability.

## Authority and evidence

### Continuation decisions — 2026-11-09

- Complimentary/free coverage expires without the seven-day paid-renewal grace, including existing free grants.
  The user explicitly confirmed this difference from legacy zero-value payment behavior. It clears the
  `complimentary_no_grace` policy gate; it does not itself authorize production deployment or the S5c read switch.
- **Superseded (latest user policy):** routine administrator actions use the session, reason and confirmation; a fresh
  second factor is reserved for security actions. Historical text: fresh TOTP is also required for payment confirmation/rejection and administrator actions restoring access:
  customer unblock, organization reactivation and cancellation of scheduled deletion. Existing required reason
  and audit controls remain. Owner-visible payment rejection text stays distinct from the internal audit reason.

### Source records

- [Approved agreement](../../saas/README.md), sections 7–10: commercial source of truth.
- [Independent platform/organization identities](../../saas/platform-organization-boundaries.md), approved 2026-10-30:
  initial administrator is an independent staff account; member limits are totals, not additional seats.
- [Approved usage](../../saas/subscription-usage.md): counting, charging, reset windows and reservation rules.
- [Organization boundaries](../../saas/platform-organization-boundaries.md) and [task 06](../../saas/tasks/06-plans-entitlements-and-usage.md): approved total-member counting supersedes ambiguous “additional staff” wording.
- [Billing implementation record](README.md): implementation defaults pending confirmation, not blanket approval of every default.
- `api/db/reference/plans.sql` and `api/db/schema/subscriptions.ts`: current catalog and persistence evidence.
- `api/src/modules/platform/subscriptions/services/{subscription.service,billing.service,coverage}.ts`:
  API admission, confirmation, lifecycle and arithmetic evidence.
- `api/src/modules/platform/subscriptions/repositories/{subscription.repository,billing.repository}.ts`:
  authoritative counts, owner lock, Casablanca windows, payment snapshots and coverage operations.
- `api/src/lib/tenant-workers.ts`: current worker eligibility and plan-feature lookup.
- `api/src/modules/platform/administration/shared/repositories/subscription-lifecycle.repository.ts`:
  separate lifecycle SQL, which must converge with the future resolver.

Paths above identify checked repository behavior; they do not prove production state or successful runtime verification.
Historical “undeployed baseline” prose is superseded by the operator's deployed confirmation above.
Inspect the current migration journal/schema before rollout; absent inventory never authorizes a baseline rewrite.

## Approved rules to preserve

- One owner subscription covers every owned organization; organizations do not have separate subscription tiers.
  Storage and business emails pool at owner level; staff capacity is per organization.
- Approved HT prices are Essential 99/990, Business 299/2,990 and Pro 799/7,990 MAD monthly/annual.
  Annual purchase buys twelve months for ten monthly prices. These prices need no new approval.
- Current approved catalog capacities: organizations 1/3/unlimited; total staff per organization 1/5/unlimited.
  Initial administrator counts, disabled staff count, archived/deleted staff do not; restore needs capacity.
  Suspended and pending-deletion organizations count until permanently deleted.
  The main agreement's section 7 “Additional staff” row is superseded by the independent-identity agreement
  and task 06 clarification: Business has five total staff, not five additional staff.
- Trial starts once at first organization creation: seven calendar days, Business features, one organization,
  two total staff, 50 emails across the trial and 1,000,000,000 storage bytes. No payment or trial grace.
  Task 07's “two additional staff” wording is stale; do not reopen the approved total-member counting rule.
- Paid storage is 1/10/50 decimal GB; business emails are 0/2,000/10,000 per paid calendar month.
  Pro unlimited organization/staff counts do not mean unlimited storage, emails or throughput.
- Paid email windows are calendar months in Africa/Casablanca, including offset changes.
  Trial email usage is a separate exact trial-window pool; paying does not carry trial consumption into paid usage.
- Charge one email per distinct recipient of a newly queued message. Retries and idempotency replay are free.
  Queue cancellation, delivery failure and history deletion never refund that charge.
  Account verification/password recovery are excluded; no new delivery-based charge/refund policy is proposed.
- Count pending storage reservations, originals/copies, media and persisted generated documents/reports.
  Downloads do not consume more storage. Replacement temporarily needs both objects' capacity.
  Release only on confirmed deletion or conservative confirmed-missing reservation cleanup.
- At capacity reject the affected new action, preserve existing records/files and access otherwise allowed.
  A quota block is not a subscription suspension; independent access restrictions still apply.
- Manual receipt verification activates payment coverage; a submitted reference alone grants nothing.
  Paid unpaid-renewal grace is seven calendar days; cancellation at paid-through has no grace.
- Upgrades follow confirmed payment; show prorated charge before acceptance. Downgrades start at next renewal.
  Owner chooses organizations/staff to retain; preserve data and disable unavailable automation.
- Suspension blocks organization sessions and business jobs; billing/export resolution stays in owner portal.
  Payment/reactivation never lifts independent owner/organization restrictions or replays every missed job.
- Expired-data retention is 90 days after access is blocked, with warning/export; deletion remains separately gated.
  Explicit organization deletion has its separate 30-calendar-day policy.
- Prices are HT. Configurable 20% TVA applies only when applicable to the operator; accountant confirmation is required.
  Preserve currency, HT, rate, tax and TTC on issued billing records. This record determines no tax liability.

## Current implementation versus decisions still open

| Area                 | Observed behavior                                                                                      | Decision status                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| Catalog              | Mutable plan JSON; `null` means unlimited org/staff, feature membership is boolean                     | Representation to redesign; commercial capacities above remain approved                                       |
| Methods              | Configurable `bank_transfer`, `cash`; blank instructions                                               | Launch cash/bank transfer confirmed; instructions remain operator-configurable                                |
| Tax                  | Nullable basis points, default null; centime snapshots, per-document `Math.round`                      | Administrator-controlled enable/rate confirmed; applicability is not inferred; verify rounding examples       |
| Coverage             | Confirmed payment rows also represent coverage; fallback from legacy paid-through marker               | Existing implementation, not target separation                                                                |
| Paid periods         | Casablanca calendar month/year addition; renewal during grace starts at prior paid-through             | Implemented boundary defaults awaiting explicit confirmation                                                  |
| Upgrade              | Same-cycle higher rank: price difference × remaining milliseconds / period milliseconds; round centime | Algorithm not commercially approved                                                                           |
| Delayed confirmation | Submission amount retained; confirmation sets coverage dates; expired upgrade rejected                 | Stale quote/confirmation treatment unanswered                                                                 |
| Suspension           | Subscription suspension freezes lifecycle; resume shifts running/future coverage and trial ends        | Freeze policy now confirmed; S5 must cover grace and future-period shifts consistently                        |
| Admin grants         | Zero-value confirmed `admin_adjustment` payments grant/change/extend coverage                          | Technical debt; grants must be distinguishable from received money                                            |
| Entitlement lookup   | API resolves coverage; worker reads cached `owner_subscriptions.plan_code`                             | Known divergence for scheduled transitions; not a policy choice                                               |
| Grace/retention      | Resolver uses fixed 7/90 × 24h; SQL uses intervals                                                     | Reconcile exact boundaries across offset changes; calendar-day grace is approved, not a new commercial choice |

## Proposed redesign rules

These are implementation proposals subject to the dependent commercial gates below.

### Scope, precedence and windows

- Define each entitlement's stable key, type, unit, capacity/consumption kind, scope and allowed unlimited value.
  All first-release overrides belong to the owner subscription. The definition's scope determines where its
  inherited value is enforced, not ownership of a second exception or a separate subscription tier.
- Resolve at one captured instant: independent restrictions first, eligible coverage and pinned plan version,
  then the active owner-subscription override. Restriction denial always wins over entitlement grants.
  Check the effective staff limit within each organization; RBAC remains a separate necessary gate.
- Overrides replace a value, never ambiguously add/multiply it; absence inherits and explicit false/zero denies.
  Represent removal separately from unlimited. Record actor, reason, before/after, effective dates and revocation.
- Use half-open `[start,end)` UTC instants; absent end means indefinite only if explicitly selected.
  Reject empty/reversed windows and overlaps for the same scope/entitlement, including concurrent writes.
  Exact end immediately returns to the pinned plan value; no organization-level override precedence is introduced.
  Serialize amendments and preserve history rather than silently choosing “last updated wins.”
- Expose effective value, source/version, window and next transition to authorized callers.
  API and workers use one resolver; invalidate caches on writes and expire them at the next time boundary.

### Typed limits, quota admission and money

- Use explicit boolean, nonnegative integer count, integer bytes and consumable-count types.
  Unlimited is an explicit tagged alternative allowed only by the definition; do not use negative sentinels.
  Keep `0`, unlimited, inherited and unknown distinct; reject fractional counts and unsafe numeric conversion.
- Keep stock capacity separate from consumption windows. Storage has no monthly reset; org/staff use live counts.
  Email uses approved trial/month pools; upgrade, downgrade or override never clears an existing paid-month ledger.
  An increased limit admits only remaining capacity; a decreased limit blocks new operations without negative refunds.
- Preserve atomic queue+email-ledger commit, owner-scoped admission lock and durable idempotency across cleanup.
  Two organizations competing for the last recipient/byte must not both succeed. Retry must validate original ownership.
  Failed enqueue transaction consumes nothing; failure after committed enqueue consumes the approved charge.
- Preserve conservative storage reservations before provider writes and version-checked missing-object cleanup.
  Unknown provider outcomes stay charged; cleanup/list failure cannot release bytes or cross tenant prefixes.
- Separate quote, issued invoice/lines, payment submission, verified receipt/allocation and coverage grant.
  Snapshot integer minor-unit amounts, currency, tax rule/version and pricing version; never rewrite issued totals.
  Corrections are explicit linked records. Duplicate confirmation allocates/grants at most once in one transaction.

### Coverage and plan evolution

- Model trial, paid and complimentary coverage separately with provenance; no synthetic received-money event for gifts.
  Scheduled changes pin a version and take effect at their recorded boundary; reject unintended overlapping periods.
  An explicit upgrade replaces entitlement selection for the remaining period without extending its end.
- Preserve approved next-renewal downgrade timing and existing usage; owner retention choices must be validated
  atomically against total-member and organization capacity. Keep excess data; disable unavailable automation.
  Specify the unselected-resources fallback with the owner before implementing automatic enforcement.
- Suspension/restriction is an access layer independent from payment allocation. Apply the confirmed freeze to
  trial/paid/grace clocks and future coverage; do not reset calendar-month email windows on resume.
- Published plan versions are immutable; draft versions may change. Existing coverage pins the agreement it used.
  Publication does not change a purchased current period. New versions apply at a notified renewal;
  record the target version, notice evidence and effective renewal boundary before activation.
  Versioned prices support monthly/annual MAD initially without inventing additional sale currencies.

## Minimum commercial answers

Owner: product owner, with accountant input for tax applicability. Recommendations below are proposals.
Existing counting, queued-email charging and Casablanca paid-email windows are settled and are not blockers.

| Gate                              | Concise options and proposed recommendation                                                                                                                                                                               | Blocks                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| C1 Exceptions — answered          | User selected owner-subscription-only for the first release; no organization exceptions or separate tiers. Replacement/expiry/audit rules remain the proposed technical design.                                           | Owner-only scope settled; S3 contract design may proceed                      |
| C2 Periods                        | Keep Casablanca calendar month/year, renewal anchored through grace; or specify alternative anchors? Recommend keep implemented anchors and define month-end clipping explicitly                                          | S5 coverage dates, S6 allocation                                              |
| C3 Suspension — answered          | User confirmed freeze of trial, paid and grace clocks, with future coverage shifted on resume; organization-only pauses do not extend subscription coverage.                                                              | Implement consistently in S5/S8, including grace and scheduled changes        |
| C4 Upgrade                        | Keep same-cycle elapsed-time difference rounded once to centime, or specify another formula? Recommend keep formula; cycle changes remain next-renewal unless explicitly approved otherwise                               | S6/S8 quotes and charges                                                      |
| C5 Payment setup — answered       | User selected cash and bank transfers; TVA is administrator-configurable, disabled at launch unless enabled later with an explicit rate. Preserve issued tax snapshots.                                                   | S6 admin configuration and checkout; rounding examples remain acceptance work |
| C6 Late quotes                    | Honor submitted amount within a stated validity window, or re-quote and require owner acceptance before allocation? Recommend re-accept changed terms; keep received funds unallocated pending resolution                 | S6 delayed confirmation                                                       |
| C7 Customer transition — answered | User selected notified-renewal migration with at least 30 days of notice; preserve current purchased coverage and any future renewal already paid under the old version.                                                  | S8 must record notice/version/boundary and preserve already-paid periods      |
| C8 Downgrade fallback             | Require retention selection before accepting downgrade, or choose a disclosed deterministic fallback? Recommend require selection; separately decide remedial flow if choices later become invalid                        | S8 downgrade execution                                                        |
| C9 Invoice issuance               | Choose issue timing, numbering, required operator identity and correction/credit-document rules with accountant input. Recommend separate accepted quotes from issued invoices; no publication with missing configuration | S6 issued billing documents                                                   |
| C10 Owner reminders               | Choose reminder schedule and delivery channel. Recommend platform transactional mail outside business quotas; confirm exact cadence and duplicate/catch-up rules before enabling automatic sends                          | S8 billing notifications                                                      |

C2 covers paid-period anchoring and month-end clipping only. Trial/grace calendar-day durations are already
approved. The implementation must specify one local-time boundary algorithm and reconcile existing fixed-duration
JavaScript and SQL behavior, including offset changes, without treating that discrepancy as a new paid-period policy.
C5 rounding proposal: integer centimes, half-up per invoice tax total; confirm independently of tax applicability.
No automatic deletion is enabled here; legal billing retention and deletion authorization remain separate gates.

## Child acceptance and dependency gates

Each child needs alternatives, chosen rules or explicit deferral, concrete evidence and dependent slices identified.
Approved rules are accepted evidence, not questions requiring fresh commercial approval.

| Child | Required acceptance evidence                                                                                                                            | Dependency gate                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| #25   | Scope, precedence, replacement/unlimited distinction, effective windows, overlap rejection and audit examples                                           | C1 before S3; scope-neutral S2 definitions may proceed                     |
| #26   | Preserve queued-recipient/no-refund rules; demonstrate duplicate/retry, failed transaction versus committed queue and cleanup behavior                  | Approved charging is settled; S7 integration follows resolver              |
| #27   | Preserve trial pool and Casablanca paid calendar-month windows; storage/live counts do not reset; demonstrate trial-to-paid and offset/month boundaries | Approved windows are settled; no new commercial blocker                    |
| #28   | Record upgrade/downgrade timing, period anchoring, suspension clock, restrictions and retention-selection fallback                                      | C2/C3/C8 before affected S5/S8 execution; C4 charge formula feeds #29      |
| #29   | Approved prices versus defaults; methods, tax applicability/rounding, proration, delayed-confirmation and issued-document terms                         | C4/C5/C6/C9 before affected S6 checkout/allocation/documents               |
| #30   | Immutable version/pinning, grants/payments/future periods and customer transition choices; mapping/reconciliation evidence                              | C7 before customer transition where existing customers require migration   |
| #3    | All six child topics have concrete answers or explicitly bounded deferrals; invoice/reminder rollout gates remain visible                               | Close only after required product answers; C10 remains an S8 delivery gate |

## Safe S2 preparation and verification boundaries

- Begin contract-first design of typed definitions, immutable version identities, draft/publication lifecycle,
  preserved current catalog snapshots and price snapshots. Do not activate proposed precedence/transition rules.
- Concrete safe S2 slice: additive entitlement definitions, draft/published plan versions, typed value rows and
  version-price rows seeded from the approved current catalog. Keep existing JSON reads, resolver, billing, usage
  and customer references authoritative; do not migrate customers or activate new behavior. Publication makes
  a version immutable, not automatically effective. Preserve nullable unlimited counts through an explicit mapping.
  C1–C10 do not block this inert foundation; activation, customer assignment and altered checkout remain gated.
  Seed tax/method defaults as observed configuration, not newly approved commercial terms. Applying any schema
  still needs the verified rollout/data-preservation procedure below and contract-first review.
- Inventory JSON keys/types, references, grants, legacy paid-through fallback, pending payments, future coverage,
  usage keys and restrictions; design lossless mapping and review fixtures. Preserve unknown values for review.
- Propose schema constraints, RLS and owner/organization isolation without applying database changes.
  Contract generators remain serialized and generated files are never edited manually.
- Schema design is distinct from data transition. Deployed status is confirmed: all changes are append-only
  forward migrations. Preserve owners/setup/files/payments/ledgers; plan backup/restore and reconciliation.
- Deployment inventory owner: the coordinator obtains the current schema/migration journal before rollout.
  Old “undeployed” prose and absent GitHub deployment records cannot override the operator's confirmation.
  Do not apply a migration to development or production as part of preparing/reviewing its source.
- For any deployed database, use forward migrations with backfill/validation/rollback planning; never rewrite applied
  history or apply a fresh baseline. Verify operational deployment facts instead of trusting historical prose.
- Boundary evidence must include exact start/end, adjacent/overlapping overrides, Casablanca offset/month-end/leap-year
  dates, trial-to-paid pool separation, upgrade within a paid email month, grace cancellation and restriction recovery.
- Race evidence must include duplicate payment confirmation, simultaneous override amendments, two-tenant owner-pool
  admission, restriction during worker execution, cleanup versus storage retry and quote expiry during confirmation.
- Future code verification uses isolated test databases, `pnpm check` and `pnpm test:integration`.
  This documentation-only slice runs formatting on this file; it performs no database operation or external delivery.

Timezone data (S5 slice 0, user decisions B and C): all subscription period and boundary math uses one source (Node
Intl via `billing-calendar.service.ts`); the database stores UTC instants only. A startup comparison with the
database's zone data blocks period/override writes with 503 TIMEZONE_DATA_MISMATCH when they disagree. Production
tzdata for Africa/Casablanca is known to be outdated until the images are updated (risk R1 in the S5 plan). Monitoring must alert when `/ready`
`timezoneData.status` is not `consistent`; update the API and PostgreSQL images together.
