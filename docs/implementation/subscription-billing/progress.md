# Subscription redesign progress

Later repository cleanup: aggregate `pnpm check` now passes after excluding separate nested Git worktrees
from formatting. Current full integration remains 400 passed / 1 skipped. Earlier mentions of the 161-file
formatting blocker below are historical; see [cleanup audit](../cleanup-audit.md) for current verification.

> 2026-11-09 baseline-integration-final: COMPLETE. Full integration 400 passed / 1 skipped (401, 42 files) on a fresh, isolated, empty test DB provisioned from the single 0000 baseline; periods reads by default. Fixed the baseline generator's FORCE RLS on the six S5 tables, retaining enabled RLS and restricted runtime grants. Stale legacy-only setups in four integration files now use writer-based coverage fixtures. Independent Sol LOW review found no actionable issues in the RLS change, fixture semantics or test evidence. Report and review: /tmp/slama-subscription-resume/baseline-integration-final/.

## Baseline consolidation — 2026-11-09 (supersedes deployment/rollout notes below)

User confirmed no real clients; the database volume will be replaced. Migrations 0000–0005 are consolidated into
one generated `0000_initial_schema.sql` (`rebuild-baseline.mjs --fresh` now appends the subscription catalog,
overrides and periods SQL; the periods integrity file carries the 0004 single-clock close and 0005 paid-grace
freeze). Fresh installs use `SUBSCRIPTION_COVERAGE_READS=periods` by default with no backfill, preflight,
reconciliation or shadow rollout; `s5-preflight.sql`, the 0001–0005 upgrade test, the catalog re-import upgrade
tests and the frozen-hash gate were removed. Mentions of forward migrations 0004/0005, frozen hashes, preflight or
legacy-default reads below are historical. Reintroduce forward-only migrations before the first real client.

Independent Sol LOW review found no baseline SQL issues: latest function definitions match the prior migrations,
snapshot schema metadata matches the former final snapshot, and canonical SQL sources are embedded verbatim.
The deployment emergency-switch guidance finding was corrected. Current consolidated-tree checks: API units
266/266, UI units 542/542, lint, typecheck, build and changed-file formatting pass. Required `pnpm check` was run
and stops on the same 161 nested-worktree formatting files. The runtime blocker was resolved after the user
restarted Rancher. Fresh-baseline integration now passes: **400 passed, 1 skipped, 42 files**. Generator and
fixture corrections also pass formatting, lint, typecheck and 266 API units; UI/build were not repeated for
these changes. Independent review found no actionable findings. The earlier 403-test totals below are historical.
Consolidation logs/report and independent review: `/tmp/slama-subscription-resume/baseline-consolidation-1109/`.

## Historical S5c engineering completion — 2026-11-09 (before baseline consolidation)

Implementation, regression verification and independent review are complete locally. Sol's initial read-only
review identified the paid-grace suspension defect below; Sol fixed it with forward migration 0005, then a fresh
Opus 5.5 LOW session independently rechecked the fix and regression evidence with no blocking findings.
Final gates: 403 integration tests passed / 1 skipped; focused coverage/writers/upgrade 32/32; API units 267/267,
UI units 542/542; architecture/generator, lint, typecheck, build and changed-project formatting passed.
Aggregate `pnpm check` still stops on 161 unrelated nested-worktree formatting files.

Read authority remains default `legacy`; migration deployment, preflight/reconciliation, shadow evidence and
operator activation of periods reads are separate pending rollout work. No live database or rollout was changed.
Opus's recheck was read-only and did not rerun gates; the initial Sol review covered the wider S5c read paths.
Residual limits: production worker eligibility query cost is not benchmarked; imported sub-millisecond grace
boundaries can theoretically differ between the JavaScript legacy mirror and PostgreSQL period comparison.
Usage-aware routing is recorded in `.agents/subscription-billing.md` and `.agents/coordination-state.md`.
The coordinator updated repository coordination state after the worker's earlier permission failure.

## Historical review P2 paid-grace freeze fix — 2026-11-09

- Reproduced the review finding before correction: suspend two days after paid coverage ends, resume ten days later,
  and the remaining five grace days are lost (`grace-before-2.log` in `/tmp/slama-subscription-resume`).
- Added forward **0005_suspension_paid_grace.sql**: retain the single-clock suspension close, and shift the latest
  paid period's boundary when paid grace remained at suspension start. No grace is added to expired complimentary,
  cancelled or fully elapsed paid-grace coverage. Active/future coverage and trial freeze behavior are preserved.
- Legacy payment/paid-through mirrors shift consistently; matching uses PostgreSQL precision (microsecond regression
  caught and fixed). 0004 is recorded as pending in the local handoff, but current live status is unverified; it was
  conservatively preserved. All **8 frozen 0000–0003 hashes plus both 0004 hashes** remain unchanged.
- Coverage regressions **20/20**; focused coverage/writers/upgrade **32/32 PASS**. Exact five-day paid grace in both
  authority modes, expiry boundary, precision, no expired free/cancelled/grace resurrection, and trial/no-trial-grace
  are verified. Historical fixture setup alone is backdated; actual resume retains all production guards.
- Full integration on stable tree: **43 files PASS, 403 passed, 1 skipped (404), 245.30 seconds**, default two workers.
  `pnpm test` PASS as a complete command: **267 API + 542 UI**, architecture/generator PASS. Lint (0 errors, 6 warnings),
  typecheck/final test-project compilation and API/UI build PASS. Long-running gates use process-scoped sleep inhibition.
- Required `pnpm check` still stops at **161 nested-worktree formatting files**; **89 changed project files** pass
  formatting separately. Raw `grace-*` logs and the updated `codex-s5c-result.md` are under the same temp directory.
- **Fixed locally, awaiting reviewer recheck**. Default read flag remains `legacy`; 0005 is not deployed. No live/dev DB,
  staging, commit, push, deployment, email, unrelated refactor or nested agent. Coordinator owns coordination-state
  usage routing and has updated it; this report clarification does not modify that file.

## Historical pre-grace-fix Codex recovery — 2026-11-09 (superseded)

- Main executor: Sol LOW, no nested agents. Extended the existing S5c coverage integration file from 6 to 14
  tests; no product code, contracts, migrations or rollout configuration changed in this recovery pass.
- Periods-mode proof: non-superuser/non-BYPASSRLS runtime role reads administrator lifecycle joins across periods,
  suspensions and scheduled cancellations; owner/tenant isolation and anonymous denial; authenticated HTTP overview
  and filtering before fixed-size pagination (21 active owners, pages of 20/1/0, plus suspended exclusion).
- Race/atomicity proof: confirm/confirm, confirm/reject, concurrent complimentary extensions, duplicate suspend/resume,
  cancel/renew, resume/read across an uncommitted transaction barrier, resume/confirm, complimentary extension/payment,
  and confirmation rollback after an injected decision-hook failure. Exact periods, adjacency, mirrors and errors checked.
- Focused periods tests: **14/14 PASS**. Default-two-worker paired report/workspace reproduction: **28/28 PASS**.
  Full unchanged integration command: **43 files PASS; 397 passed, 1 skipped (398 total), 222.44 seconds**.
- Historical ~900-second failures now have power-log evidence: the paired reruns overlap maintenance sleep at
  01:30:11–01:45:12 UTC (901 seconds) and 01:45:57–02:00:57 UTC (900 seconds). Log mtimes minus recorded run
  durations independently locate both runs. This supports sleep interruption, not the earlier CPU-load attribution;
  no cross-file lock defect was reproduced and sampled blocking-PID arrays were empty. Test-mode app tenant-worker
  timers are disabled; the regression invokes reporting workers directly. Raw evidence and logs:
  `/tmp/slama-subscription-resume/codex-sleep-correlation.log`, `codex-historical-power-events.log`,
  `codex-pair.log`, `codex-full-activity.log`, `codex-integration.log`.
- Required `pnpm check` stops at the same **161 nested `.claude/worktrees` formatting failures**. All **88 changed
  project files** pass formatting. Separate final gates: lint (0 errors, 6 warnings), typecheck, build, API units
  **267/267**, UI units **542/542**, architecture and generator checks PASS. The original unit command hit a worker
  RPC timeout spanning documented idle sleep; the entire UI gate passed on retry with process-scoped `caffeinate -i`,
  unchanged timeouts/assertions. Full details: `/tmp/slama-subscription-resume/codex-s5c-result.md`.
- Repository coordination state is write-protected (EPERM); the replacement handoff is
  `/tmp/slama-subscription-resume/codex-coordination-state.md`. No permission escalation was needed or requested.
- Frozen 0000–0003 SQL/snapshots: **8/8 hashes unchanged**. Forward 0004 preserved. Read flag remains default
  `legacy`; no rollout, development/production DB access, commit, push, deployment or email. Independent review pending.

## Prior Opus continuation — 2026-11-09 (historical results)

- S5b suspension-boundary failure fixed (Opus). Proven cause: the test database clock lags the host by ~31 ms;
  suspension start/shift use the application clock but 0003 `subscription_periods_shift` ended the suspension at
  database `now()`, so a prompt resume violated `subscription_suspension_end`. A real mixed-clock defect, fixed by
  forward migration `0004_suspension_single_clock.sql` (ended_at = start + applied shift); 0000–0003 unchanged.
- S5c implemented behind `SUBSCRIPTION_COVERAGE_READS=legacy|periods` (default legacy, not enabled anywhere):
  billing state/summary/admissions, worker eligibility (no SQL lifecycle prefilter; featureless jobs rechecked),
  administrator counts/filters (set-based SQL supplied by the subscriptions module) and confirm continuation
  (no backdating after lapsed free coverage) share one authority. Single-statement period snapshot, fail-closed
  missing trial period, periods+writes-off rejected, shadow counts failures. Results:
  `/tmp/slama-subscription-resume/opus-s5c-result.md`.
- Verified gates: lint/typecheck/unit (267 API, 542 UI)/build PASS; `pnpm check` blocked only by 161 nested-worktree
  files. Full integration 381 passed, 1 skipped, 8 failed (load timeouts); reruns pass all but one
  remaining-features-qa report-rendering test that hangs under load (unproven environmental). A quiet-host full
  rerun and independent review are still required. 0000–0003 hashes 8/8 OK.

- STEPUP independent LOW-effort gate/review complete: no actionable scoped product issue. Corrected only the
  billing-calendar extension test payload to provide required fresh TOTP; original HTTP 200 assertion retained.
- Latest gates: lint/typecheck/unit/architecture/generator/build PASS (267 API + 542 UI tests). Required `pnpm check`
  remains blocked by 161 nested-worktree formatting failures; changed project files are formatted.
- Full integration: 380 passed, 1 skipped, 2 failed. After the payload correction, focused billing-calendar passes
  7/7; subscription-periods-writers passes 9/10 and reproduces `subscription_suspension_end` in
  "leaves the reconciliation nothing to do for rows written by the new writers" (immediate suspend/resume).
  Raw logs/assertions preserved; no lifecycle/schema workaround. Opus owns remaining lifecycle fix and S5c;
  no further full rerun in this pass. Exact evidence: `/tmp/slama-subscription-resume/gate-result.md`.
- Frozen migration SQL/snapshots 0000–0003: all eight hashes verified unchanged. Existing dedicated test container
  remains running; this reviewer did not start it. Claude is available and is now main executor.

Codex resumed coordination while Claude is temporarily quota-limited. Routing/availability and the shared
handoff live in `.agents/coordination-state.md`; the user does not need to relay work between providers.

- Partial STEPUP completion: Sol verified the API transaction path and added rejection/replay/rollback tests;
  26 focused API integration tests passed. Terra completed the first four UI paths; 26 focused UI tests passed.
- User then approved extending fresh TOTP to payment confirm/reject, customer unblock, organization reactivation
  and scheduled-deletion cancellation. The API/UI split completed that additional scope; independent review is complete.
- User confirmed no paid-renewal grace for complimentary coverage, including existing free grants. S5c's
  `complimentary_no_grace` policy gate is resolved; the reader switch still needs implementation/review/rollout.
- Two previously reported integration failures were not reproduced: all 48 tests in the estimates and sales-deletion
  files passed, and both exact scenarios passed independently. No assertion, timeout or product code was changed.
  Their historical cause is unproven; the final broad suite still must pass on the completed tree.
- All current migrations 0000–0003 remain frozen during STEPUP. No live/development DB operation or deployment.

Historical sections and results below describe their respective earlier snapshots, not the latest unfinished tree.

Updated 2026-11-08. Coordinator: main Codex agent. Implementer: Sol 6.1, low effort.
Independent reviewer: Claude Opus 5.5, low effort, through Herdr with read-only tools.

## Delivery status

| Work                                        | Status                            | Evidence / next boundary                                                                                                                                                                                      |
| ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1 approved-policy inventory                | Reviewed                          | [Decision record](decisions.md); existing email charging/counting/windows preserved                                                                                                                           |
| S1 owner answers                            | Recorded                          | Deployed; forward migrations only; owner-only overrides; notified renewal with 30 days' notice and already-paid renewal protection; suspension clock freeze; cash/bank transfer; administrator-controlled TVA |
| S1 remaining decisions                      | Open                              | Paid-period month-end anchors, exact upgrade proration/quote expiry, downgrade invalid-selection fallback, invoice issuance/numbering and reminder cadence remain scoped to their dependent slices            |
| S2 additive catalog foundation              | Implemented and regression-tested | Four normalized tables, typed values, immutable publication, copied live catalog, provenance and drift diagnostics                                                                                            |
| S2 activation / customer version assignment | Not implemented                   | Existing JSON reads and all current customer assignments remain authoritative; do not treat this slice as a new active billing system                                                                         |
| S3 owner-subscription overrides             | Implemented, awaiting review      | See S3 section below; enforced in API admissions and worker feature selection                                                                                                                                 |
| S5 coverage and S6 invoices                 | Not implemented                   | Follow the playbook and remaining policy gates                                                                                                                                                                |

## Implemented scope

- `entitlement_definitions`, `plan_versions`, `plan_entitlements` and `plan_version_prices`; reuse the existing
  `subscription_plans` identity instead of a duplicate plan table.
- Additive forward migration `0001_subscription_catalog.sql`. Existing baseline SQL and `0000_snapshot.json`
  remain byte-for-byte unchanged; the journal appends the new migration.
- Import the actual configured catalog inside the migration transaction, including valid custom names, limits
  and prices. Validate supported shape/types and MAD currency; reject unsupported input atomically.
- Shared explicit-field snapshot projection and SHA256 provenance. Unrelated added columns do not create false
  drift; relevant catalog changes do. The diagnostic applies only to imported versions with provenance.
- Database-enforced typed values, completeness, finite/unlimited distinction, publication locking and immutability.
  The migration role is trusted; runtime roles cannot write, even after an accidental DML grant.
- Publication audits record the declared actor plus database identities, transaction ID and server time.
  The initializer grants catalog reads only; isolated startup tests exercise the real provisioning path.
- Comparison-only repository/service validates the reconstructed generated entitlement DTO and current-source hash.
  No owner API, worker, quota admission or checkout reader has switched to this catalog.

## Review and verification

Opus reviewed S1 and the model, then the concrete code and targeted corrections. Its concrete review found no
High/Critical issue. Material corrections were implemented: configured-source import, trusted-role boundaries,
actual drift comparison, server-authored audit identity/time, real initializer-grant tests and explicit snapshot
fields. The final explicit-field correction has a focused regression test and coordinator diff review.

| Check                                                                   | Result                                                                                                                       |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Focused catalog + startup integration                                   | 14 passed                                                                                                                    |
| API unit tests                                                          | 245 passed                                                                                                                   |
| UI tests                                                                | 530 passed                                                                                                                   |
| Full PostgreSQL integration                                             | 338 passed; one pre-existing optional storage test skipped; 37 files                                                         |
| API architecture/structure and generator checks; UI architecture checks | Passed through `pnpm test`                                                                                                   |
| Lint and French coverage                                                | Passed; existing console warnings remain                                                                                     |
| API/UI typechecks and production builds                                 | Passed; existing bundle-size advisory remains                                                                                |
| Changed-file formatting and `git diff --check`                          | Passed                                                                                                                       |
| Required `pnpm check`                                                   | Stops at 161 existing formatting failures under `.claude/worktrees`; remaining checks were run separately                    |
| Applied baseline preservation                                           | SHA256 verification passed for SQL and snapshot; a regression test now freezes both and validates ordered forward migrations |

An old unit test required a baseline-only journal; it was replaced with stronger deployed-policy checks:
immutable baseline hashes/entry, journal/file alignment, sequential indices/tags and increasing timestamps.
Contract generation ran serially; generated files were not hand-edited.

Only the dedicated `postgres-test` service was started, and it was stopped after verification. No development or
production database, hosted service, customer credential or external email was changed. No commit/push/deploy.
Temporary verification logs are under `/tmp/slama-subscription-s1/`; they are not runtime dependencies.

## Rollout and next work

This migration is prepared source, not authorization to apply it. Review the actual deployed migration journal,
schema and catalog configuration, backup/restore and rollback checkpoints before rollout. The import deliberately
rejects non-MAD configuration rather than relabeling amounts. Future selling/withdrawal controls, coverage pins,
notices and version activation must preserve all paid promises and pass the remaining acceptance gates.

Next code slice: owner-subscription overrides and their administration surface (S3), then coverage periods and the
shared effective-access resolver. Keep current purchased periods and already-paid renewals unchanged throughout.

## S3 owner-subscription overrides (implemented by Opus 5.5, low effort; awaiting independent review)

- Forward migration `0002_subscription_overrides.sql` (generated table + appended guard from
  `api/db/integrity/subscription-overrides.sql`); 0000/0001 SQL and snapshots unchanged (hashes verified).
- `subscription_overrides`: one owner, one catalog key (composite FK to definition type), typed exclusive value,
  half-open `[starts_at, least(ends_at, revoked_at))`. Trigger: append-only (single revocation only), unlimited only
  where the definition allows, organizations >= 1, per owner+key advisory lock and overlap rejection (23P01).
  RLS: platform admin all; owner, its organizations and workers read only. Runtime grant: SELECT/INSERT plus
  column UPDATE of the three revocation fields.
- Admin API (`/api/v1/admin/owners/{ownerId}/entitlement-overrides`): list, create (amendment via `replacesId`
  revokes the previous record in the same transaction), revoke. Fresh TOTP step-up, reason and audit
  (`subscription_override.create|revoke`) commit atomically. Start older than 5 minutes is rejected; recent past is
  clamped to now, so enforced history is never rewritten.
- Active scope: the single evaluator `effective-entitlements.ts` is applied in the subscription summary, so every
  existing admission (organizations, staff per organization, storage, email quota/feature, feature gates,
  workspace/onboarding checks) and the owner/admin views use effective values. The tenant worker runner no longer
  reads plan JSON; feature eligibility is injected from the subscriptions public API (`hasFeature`), applying the
  same restrictions and evaluator. Coverage/lifecycle semantics are unchanged.
- Owner DTO adds optional `entitlementSources` (key, plan|override, effectiveUntil) without notes or identities.
  Admin UI: "Plan exceptions" card on the customer page (effective values with origin, history, add/amend/revoke
  dialogs with reason and code). Owner subscription page marks custom allowances.
- Deferred: normalized catalog as the plan source (still legacy JSON), plan-version pinning, coverage periods,
  per-organization overrides (not approved), notifications to owners about overrides.

| S3 check                                    | Result                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| API unit (incl. evaluator boundary tests)   | 249 passed                                                 |
| UI tests (incl. overrides card and owner)   | 535 passed                                                 |
| Full PostgreSQL integration (after fix 1)   | 346 passed, 1 pre-existing optional skip; new file 7 tests |
| Lint, French coverage, typechecks, builds   | Passed (existing warnings / bundle advisory only)          |
| Changed-file formatting, `git diff --check` | Passed                                                     |

### Review fix 1 (0002 was unapplied; regenerated, 0000/0001 unchanged)

- Notes moved to admin-only `subscription_override_notes` (reason, authors, revocation reason); tenant, owner and
  worker scopes read override values only (RLS, tested). Deferred constraint requires a note per override.
- Overlap guard: trigger rejects non-READ-COMMITTED writes (btree_gist not assumed available to the migration role).
- Database-authored times: service uses `now()` from the transaction; trigger requires `starts_at >= now()-1 min`,
  `created_at = now()`, and `revoked_at` within one minute of `now()` and not before creation.
- Amending an active override with a later start is rejected (`OVERRIDE_AMENDMENT_START`) instead of leaving a gap.
- Deterministic evaluation (latest start, then latest creation); `entitlementSources` is required in the DTO.
- Override dates: see "Override calendar days" below; empty or today starts immediately. Startup test asserts runtime column
  privileges, denied UPDATE/DELETE/TRUNCATE and RLS-rejected non-admin inserts.

### Review fix 2 (0002 still unapplied; 0000/0001 unchanged)

- Blank reasons: dedicated `AdminOverrideRevocation` schema; create/revoke reasons require a non-space character
  (`pattern: '\S'`), and the service trims and rejects blank reasons with 400 before any write. Trimmed text is stored.
- Trigger: `replaces_id` must name an already revoked override of the same owner and entitlement.
- Revocation order: the override is revoked first; its note may record the revocation only afterwards. A deferred
  constraint requires the revocation note before commit, so a note can never block a later revocation.
- Trigger functions pin `search_path = pg_catalog, pg_temp` and schema-qualify tables.
- Override windows are evaluated on the database clock (they are database-authored), avoiding host/database skew.
- Checks: API unit 249, UI 537, focused override + startup integration 10/10. Full integration: 344 passed, 1 skip,
  2 failures in unrelated estimates/sales-deletion worker tests caused by a ~50 ms Docker/host clock skew (jobs
  stamped by the database clock, claimed with the app clock); not verified against a pre-S3 checkout.

### S2 drift hash

Checked 2026-11-08: no code change needed. `0001_subscription_catalog.sql` (identical to the saved pre-S3 hash) already
defines `subscription_catalog_snapshot(subscription_plans,text)` with an explicit field list (code, name, rank,
monthly_ht, annual_ht, entitlements, currency). The import, `db/reference`/`db/integrity` copies and
`catalog.repository.ts` all call that one function; none hashes `to_jsonb(subscription_plans)`. The existing test
"ignores unrelated legacy columns" adds a column and passes without drift (catalog integration 12/12). No 0003 was
added because it would redefine the function identically.

### Override calendar days (supersedes the UI-side UTC/Casablanca mapping)

- The admin API takes `startsOn`/`endsOn` calendar days (optional; `endsOn` exclusive) and converts them on the
  server in the customer timezone; storage and responses stay UTC instants, and responses include `timezone`.
- Owner subscriptions have no timezone setting of their own, so the platform default `defaultTimezone`
  (`Africa/Casablanca`, `api/src/lib/validation.ts`, also the `companyDate` and organization-settings default) applies.
- Conversion is `zonedDayStart` next to `companyDate`, both using Intl zone data, so "today" and day boundaries
  agree. PostgreSQL `AT TIME ZONE` was not used: the test image's zone data places Casablanca at UTC+0 in November
  2026 while Intl reports UTC+1, so mixing the two would disagree.
- The UI sends plain days and formats instants with the returned timezone via `displayDateTime`.

### S5 slice 0 — single timezone source and startup check

- `api/src/modules/platform/subscriptions/services/billing-calendar.service.ts` is the only source for subscription
  period/boundary math (Node Intl): `billingTimezone` (= `defaultTimezone`, Africa/Casablanca), `zonedDayStart`,
  `addCycle` (current semantics: local calendar months, month-end clipping, local time kept; C2 still gated),
  `billingMonth`, `billingDay`. PostgreSQL `AT TIME ZONE` period math in `billing.repository.addCycle` and
  `subscription.repository.month` was removed; instants are computed in TS and stored as timestamptz.
- Characterization against the previous SQL: identical results on every sampled instant in Europe/Paris and
  America/Sao_Paulo; in Africa/Casablanca, identical wherever both zone sources agree (dates where the test image's
  tzdata differs from Node are skipped and counted). Ambiguous local times take the later instant, as PostgreSQL did.
- Startup check compares Node and database offsets for Africa/Casablanca at noon UTC on every day of 2026–2027 (no
  hard-coded expected offset). On mismatch: error log, `/ready` stays 200 with `timezoneData.status=mismatch`, and
  payment submission/confirmation, admin extension/plan change/grant/resume and override create/revoke return 503
  `TIMEZONE_DATA_MISMATCH`; reads stay available. Tests inject agreeing or mismatching reports (`timezoneCheck`).

### S5 slice 0 — review fix 1

- Guard states: `unchecked` (no successful check yet) blocks calendar-boundary writes with 503
  `TIMEZONE_DATA_UNCHECKED`; `mismatch` with `TIMEZONE_DATA_MISMATCH`. Failed checks retry with bounded backoff
  (1 s → 10 min); after success the check repeats about hourly (unref'd timer, stopped on app close; tests without
  an injected check run the fixture once). `/ready` stays 200 with `timezoneData` detail, because readiness 503
  means "database unavailable" here and would take instances out of rotation, stopping reads.
- Guard only where a calendar boundary is computed: owner payment submit, payment confirm, admin grant (addCycle)
  and override create with `startsOn`/`endsOn`. Not guarded: override revoke, resume, plan change, extension.
- Monthly email allowances are keyed by local calendar month (`month:YYYY-MM`). Rows written with the previous
  `month:<month start instant>` key are still counted for their month (instant + 12 h, UTC date); each row has one
  key, so nothing is double counted and no row is rewritten.
- Startup check range follows the clock: from 1 January of the previous year to two years ahead.
- Operations: monitoring must alert when `/ready` `timezoneData.status` is not `consistent`. Production boundaries
  follow the images' zone data; update the API (Node) and PostgreSQL images together — updating only one makes the
  sources disagree and blocks boundary writes until both match.
- Follow-up (reviewer item 7): `api/src/modules/platform/analytics/repositories/owner-financial-summary.repository.ts:37`
  (and its REPEATABLE READ use at ~46) does calendar math in SQL depending on the session/company timezone, outside
  the subscription paths; the single timezone source covers period/override boundaries only, so analytics needs a
  later review.

### S5a — coverage periods foundation (inactive, shadow mode)

- Forward migration `0003_subscription_periods.sql` (0000–0002 unchanged): `subscription_periods`,
  admin-only `subscription_period_notes`, `subscription_suspensions`, `subscription_scheduled_changes`; integrity in
  `api/db/integrity/subscription-periods.sql` (append-only, pinned search_path, DB creation time, READ COMMITTED +
  per-owner advisory lock, deferred overlap/supersession/note checks). Runtime: SELECT only until S5b.
- Deterministic reconciliation `subscription_periods_reconcile()` runs inside 0003 (legacy rows untouched; EXECUTE
  revoked from PUBLIC). Trial → trial period; paid confirmed payments → paid; `admin_adjustment` →
  complimentary + note; legacy paid-through marker → complimentary + note; later-starting overlap supersedes the
  earlier rest; open suspension → open suspension; cancel flag with coverage → scheduled cancel. Aborts with the
  owner id on zero-amount non-adjustment payments, equal-start or shorter overlaps, future suspension, marker before
  trial, confirmed payment without subscription.
- `period-resolver.service.ts` (pure): decisions Q1–Q6/Q8 (complimentary and scheduled cancel: no grace; suspension
  freezes all clocks). Exposed as `publicApi.resolvePeriods` (DB clock) but not used for decisions. Shadow mode in
  `summary()` compares with the legacy resolver (savepoint, never fails a request), logs `coverage_shadow_diff` and
  exposes `publicApi.coverageShadow()`; complimentary grace differences are tagged as expected.
- Operator preflight (read-only, not run): `s5-preflight.sql`.

### S5a — review fix 1

- FORCE RLS: legacy subscription tables force row-level security, so the reconciliation reads them as platform
  administrator and recounts with FORCE lifted inside its own transaction (table owner); any difference raises
  instead of committing empty periods. Tested as a non-superuser, non-BYPASSRLS role owning the tables.
- Staleness until S5b: `subscription_periods_reconcile()` is forward-only and idempotent. Missing owners get a full
  build; existing owners get new confirmed payments, suspensions and cancellation changes appended. It refuses
  (owner id) changed trial windows, shifted payment coverage (legacy resume), a resume, or a changed marker.
  S5b must run it (operator, migration role) before switching writers, or block legacy writes; S5c requires zero
  unexpected shadow differences (`coverageShadow().unexpected = 0`) after that run.
- Shadow logging: each distinct difference is logged once per owner (bounded LRU of 1000); counters keep counting.
- Resolver: periods without a trial period are an invariant violation and resolve fail-closed (expired).
- `subscription_scheduled_changes.created_by` is free text (`owner|admin|migration`); S5b writers must use a typed
  actor (owner id / admin id) when they add owner and administrator writes.

### S5a — review round 2 and rollout entry conditions

- Reconciliation reads legacy tables only through the unconditional `subscription_admin` /
  `subscription_payment_admin` policies (actor set transaction-locally; FORCE RLS stays on; no DDL or table locks).
  It refuses to run if those policies are missing, changed, or joined by a restrictive policy, and at the end checks
  that every processed subscription has a trial period and every confirmed payment has exactly one period.
- It takes the legacy writers' per-owner advisory lock (`hashtextextended(owner_id, 44032)`) and re-reads the owner
  after it, so a concurrent resume/payment is either fully before or fully after the reconciliation of that owner.
- Operational trap: periods are append-only, so these legacy administrator actions between 0003 and S5b make
  reconciliation refuse the owner permanently: trial extension (`setTrialEnd`), resume (`shiftCoverage`), and
  renewing or extending while a cancellation is scheduled (changes the cancellation boundary). Entry condition for
  applying 0003 in production: freeze those actions (or ship S5b handling for exactly these cases) first.
- Operator order (production): 1) run `s5-preflight.sql` (read-only) and resolve every section-4 row; 2) freeze the
  actions above; 3) apply 0001, 0002, 0003 in order (0003 reconciles in the same transaction and aborts with the
  owner id on any refused shape); 4) verify shadow differences (`coverageShadow()` / `coverage_shadow_diff` logs):
  zero unexpected; only `complimentary_no_grace` is acceptable and needs the user's confirmation before S5c.
  S5b must keep the freeze until its writers replace the legacy ones; S5c requires zero unexpected differences.

### S5b — coverage writers (dual write; decisions unchanged)

- Payment confirmation writes the paid period in the same transaction (idempotent on `payment_id`; an upgrade
  supersedes the running period at its start; renewals are adjacent) and clears a scheduled cancellation, as the
  legacy confirmation clears the flag. Time math stays in `billing-calendar.service` with the timezone guard.
- Administrator grant, extension and plan change write complimentary periods with a note (reason, administrator id)
  in the existing step-up/audit transaction, instead of zero-value `admin_adjustment` payments. The legacy resolver
  reads those grant periods as coverage rows, so legacy output is unchanged (dual read for grants only).
- Suspend inserts an open `subscription_suspensions` row; resume keeps the legacy payment shift (the legacy resolver
  still reads payment coverage) and calls the controlled `subscription_periods_shift` (SECURITY DEFINER,
  administrator context): it closes the suspension with the shift and moves non-trial periods still running at the
  suspension start (end moves; start moves only if not started), supersessions at/after it, and pending scheduled
  changes after it — the legacy rule. The legacy suspension start is authoritative while both are written.
- Trial periods mirror `owner_subscriptions` trial windows through a SECURITY DEFINER trigger (creation by any path,
  administrator trial extension, resume shift).
- Owner cancellation/undo writes `kind=cancel` scheduled changes with a typed actor (`actor_owner_id`/
  `actor_admin_id`, checked against `created_by`) and keeps `cancel_at_period_end` in sync; coverage changes move a
  scheduled cancellation to the new paid-through by superseding it.
- Runtime grants: INSERT on the four tables, UPDATE only of `superseded_at/superseded_by` and scheduled-change
  `status`, EXECUTE on the shift function; window moves only through the SECURITY DEFINER functions.
- Reconciliation treats writer rows as already processed (grants are not legacy markers); integration tests show
  zero unexpected shadow differences for renewal, upgrade, grant, plan change, extension, suspend/resume,
  cancel/undo and trial extension, and a reconciliation run that adds nothing for those owners.

### S5b — review round 1

- Real dual write until S5c: administrator grant, extension and plan change again insert the legacy zero-value
  `admin_adjustment` payment (same fields as before), and the complimentary period links to it by `payment_id`
  (`source=admin_grant`, administrator note). Legacy output, admin overview counts and customer status filters
  (SQL mirrors reading payments) are unchanged; reconciliation treats the pair as processed. Removing the adjustment
  payments is an S5c task, together with switching the SQL mirrors to periods.
- Reconciliation marker lookups only match `source='migration'` periods; tested after grant + extension + plan
  change and after the dual-write pairs (nothing appended, no refusal).
- `SUBSCRIPTION_PERIOD_WRITES=on|off` (default `on`: dual write is additive, legacy rows still decide, and `off`
  is an emergency switch to exactly the pre-S5b writes; reconciliation appends missed periods later). Trial periods
  are mirrored by a database trigger in both modes. Documented in `docs/deployment.md`, local development and
  `api/.env.example` (no deployment configuration changed).
- `subscription_periods_shift` refuses unless the legacy suspension start equals the open suspension row's start
  (raises with the owner id; the legacy start stays authoritative and must match).
- Owner cancellation insert policy also requires `actor_owner_id = owner_id`.
- Open security item for the user: administrator plan change, extension and resume do not require a fresh TOTP
  step-up today (pre-existing; needs an OpenAPI change). Decide whether to require it.

## Final grace-fix handoff — authoritative latest result

The historical 397-pass/no-product-changes recovery above predates the P2 correction. The actual grace fix changes
forward migration **0005**, its snapshot/journal, the legacy billing mirror repository, coverage/upgrade regression
tests and this progress record. Exact file map and absolute raw log paths are in the final section of
`/tmp/slama-subscription-resume/codex-s5c-result.md`.

- Final full integration: **43 files PASS, 403 passed, 1 skipped (404), 245.30 seconds**;
  `/tmp/slama-subscription-resume/grace-integration-stable.log`.
- Final focused coverage/writers/upgrade: **32/32 PASS**, including **20 coverage cases**;
  `/tmp/slama-subscription-resume/grace-focused-stable-fixtures.log`.
- API **267/267**, UI **542/542**, architecture/generator, lint, typechecks and build PASS; final logs are
  `/tmp/slama-subscription-resume/grace-test.log`, `grace-lint-final.log`, `grace-typecheck.log`,
  `grace-test-typecheck.log` and `grace-build.log` in that directory.
- Required aggregate check remains blocked by **161 nested-worktree formatting files** (`grace-check.log`);
  separate **89-file formatting PASS** (`grace-changed-format-final.log`).
- **0000–0004 unchanged**, read default **legacy**, 0005 not deployed. Paid/trial/grace freezing is corrected locally;
  free/cancelled/exhausted coverage is not revived. Independent Opus recheck is in progress.

This clarification only saves documentation: no tests rerun, product code edited, review duplicated or coordination
routing changed. Earlier records remain historical and do not replace these final grace-fix results.
