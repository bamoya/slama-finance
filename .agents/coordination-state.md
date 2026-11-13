# Credit-note recovery COMPLETE — 2026-11-13

All interrupted P2/P3 review corrections and two follow-up findings fixed; independent final recheck clear.
Final pnpm check exit0; full isolated integration548pass/1skip across54files. Raw logs/reports:
/tmp/slama-s6/recovery-1113/{check-final.log,integration.log,api-result.md,ui-result.md,review-result.md}.
Common invoice locks cover cancel/credit/payment; zero-value quantities, monetary eligibility, UI VAT caps,
own-credit-date reporting, net impact amounts and PDF update authorization corrected with regressions.
All exhausted Claude and finished Codex worker/reviewer panes closed; coordinator w1:pW remains.
No active runners. Base5cb09fc; entire credit-note delta still UNCOMMITTED. No push/deploy/devDB operation.
Existing dev volume replacement remains operator-owned; no recovery browser rerun claimed.
No further phase started. This completion checkpoint supersedes historical in-progress notes below.

# Credit-note recovery underway — 2026-11-13

User authorized Codex to finish interrupted Claude work and stop exhausted agents. Closed Claude panes
w1:pQ, w1:pS, w1:pT. Current coordinator w1:pW. Herdr credit-api (Sol LOW, w1:pX) owns API/schema/contracts/
reporting/permission fixes; credit-ui (Terra LOW, w1:pY) owns editor arithmetic/validation and UI tests.
Task files and reports: /tmp/slama-s6/recovery-1113/. Source review: /tmp/slama-s6/review6.md.
Base 5cb09fc; prior S2/S4 and S6 billing phases committed by Claude. Current organization-credit-note delta
uncommitted. Initial gates before review: pnpm check API291/UI660; integration539 pass/1skip.
Pending: P2 cancel/issue race + eight P3s, final gates and independent recheck. Never treat earlier gates as
validation of recovery changes. Root owns final pnpm check and isolated localhost:55439 integration after
both workers complete; no simultaneous full suites. Preserve all partial work, no development database ops.
No commit/push authorized for recovery. This checkpoint supersedes historical handoff/pending notes below.

# Primary coordination transferred to Claude — 2026-11-10

User explicitly requested Claude take over now so Codex can stop. Herdr pane w1:pQ is the primary
Claude coordinator (Sonnet 5.5 LOW); use Opus LOW for complex implementation/review, Fable LOW where
appropriate, Antigravity/OpenCode for small tasks. Check availability before dispatch; no new Codex work.
At transfer: Claude session 51% used, weekly all-models 32% used, Fable weekly 5% used. No paid overage.
S2/S4 is complete as recorded below. Preserve uncommitted work; do not repeat passed gates or investigate
the whole repo. Read checkpoint/reports, acknowledge ownership and prepare a concise next-step assessment.
No next roadmap phase, commit/push, deployment, issue mutation or development database action is authorized.

# Final S2/S4 checkpoint — 2026-11-10

Implementation and validation complete. This checkpoint supersedes pending phase notes below.
Final pnpm check PASS: API 277, UI 597, format/lint/types/build and structural checks.
Full isolated integration: 441 passed, 1 skipped, 0 failed; subsequent delta UI-only.
All three Sol P2s, authoritative-clock follow-up and final expired/withdrawn UI P3 corrected.
Independent Fable 5.1 LOW final recheck: no blocking findings; final P3 verified fixed.
Evidence: /tmp/slama-s2-s4/fixes-result.md and /tmp/slama-s2-s4/fable-review-result.md.
No test runners remain. Changes UNCOMMITTED; no push/deploy/issue mutation/development DB operation.
Known residuals: browser/server clock skew can cause 1-second successful deadline refreshes; admin list
lifecycle filters retain host clock; snapshot conversion relies on existing Drizzle timestamp configuration.
No manual browser or fresh-image E2E claimed. Do not start S6/S7/S8 or commit without user direction.
Last Codex status: 5% weekly / 5% session remaining. Verified Fable 5.1 LOW via `--model fable`;
separate Fable weekly allowance was 0% used before independent review. Policy below remains authoritative.

# Provider continuity policy — user approved 2026-11-10

Check actual provider usage before delegation and at completion boundaries. At Codex weekly remaining <=1%,
stop new Codex work and hand primary orchestration to Claude through Herdr, with a durable checkpoint and
acknowledged transfer; do not require the user to relay context. Claude may delegate small tasks to Antigravity
and OpenCode. Prefer available allowances and balance usage; low effort only, no paid overage. Claude CLI
2.1.309 advertises the `fable` alias; verify its actual model and allowance before assigning substantive work.
Do not assume ordinary Opus uses the separate Fable allowance. Installed tools: claude, codex, agy, opencode.
Discovery evidence: /tmp/slama-s2-s4/delegation-discovery.json. Latest Codex status: 6% weekly / 13% session left.

Current executor: Herdr s2s4-fixes (w1:pP), Opus 5.5 LOW. Do not interrupt its running gates or duplicate them.
It owns three review corrections (consistent resolver snapshot, deadline-refresh retry, withdrawn-plan renewal)
and sequential pnpm check/full isolated integration. Await /tmp/slama-s2-s4/fixes-result.md and actual final
marker S2S4_FIXES_DONE_1110. Initial combined pnpm check passed (277 API, 590 UI); final corrected gates pending.
Independent initial review: /tmp/slama-s2-s4/review-result.md; reviewer s2s4-review (w1:pQ), Sol LOW, currently idle.
After executor finishes, obtain independent review of corrections; preserve uncommitted changes. No commit,
push, deployment, issue mutation, or development database operations authorized for this phase.

# Current task — S2/S4 activation and central access resolution

User explicitly chose roadmap step S2/S4 (not deployment setup). Start from clean e336dba.
See .agents/s2-s4.md and /tmp/slama-s2-s4/issues.json for acceptance. Existing catalog foundation is inactive;
finish version pins/activation and central API/worker/UI resolution without silently changing purchased terms.
Pre-client single-baseline policy and approved admin security changes remain authoritative.
Admin/bootstrap changes below were committed and pushed through e336dba; old uncommitted notes are historical.
Current phase: backend done (API integration 435/1, unit 274; diagnostics follow-up 40 focused/8 unit). UI phase 3 done
2026-11-10: typecheck clean, lint 0 errors, UI tests 97 files/590 passed (+14 node architecture/structure), build OK,
prettier clean. Pending: root `pnpm check`/integration and independent review. Report: /tmp/slama-s2-s4/phase3-result.md.
Coordinator resumes automatically from disk with fresh context; no user handoff required.

# Historical admin deployment bootstrap — 2026-11-10

All release seams (Dokploy startup; production/Lightsail/Coolify release-profile migrate) run bootstrap-admin.ts after
migration (&&): creates ADMIN_EMAIL/ADMIN_PASSWORD admin once (audited, actor deployment); existing admins never changed;
both unset = skip; partial/invalid = fail. ADMIN_* only on migrate, never API. Gates: pnpm check PASS (API 269, UI 574);
integration 420 pass / 1 skip (45 files). Fresh release-image build blocked (Docker Hub x509); cached-image smoke partial.
Report: /tmp/slama-admin-bootstrap/REPORT.md, logs in /tmp/slama-admin-bootstrap/logs/.

Independent Sol LOW final recheck passed: no actionable findings; the all-target deployment P2 is fixed.
Evidence: /tmp/slama-admin-bootstrap/final-review.md. Current-image container execution remains unverified:
fresh image build blocked by Docker Hub x509; old cached-image smoke lacked the newer WebAuthn dependency.
Do not claim image E2E success. Supported release commands were executed successfully against isolated DBs.
No commit/push/deploy or development/live DB operations for this task. Finished worker panes closed.
Usage before recheck: Codex30%5h/24%weekly remaining; Claude13%session/24%weekly used. Recheck at next dispatch.

## Historical Dokploy-only first pass (superseded by all-target wiring above)

Dokploy migrate step now runs scripts/bootstrap-admin.ts after initialize-database: creates ADMIN_EMAIL/ADMIN_PASSWORD
admin once (audited, actor deployment); existing admins never changed; both unset = skip; partial/invalid = fail.
Gates: pnpm check PASS (API 269, UI 574); integration 416 pass / 1 skip (44 files). Report:
/tmp/slama-admin-bootstrap/REPORT.md, logs in /tmp/slama-admin-bootstrap/logs/.

# Current approved work — 2026-11-10

Implement approved SaaS admin trial activation and authentication changes from .agents/admin-security.md.
Routine per-action TOTP requirements are superseded: retain sessions/authorization/audit/reasons/confirmations.
Passkey login requires UV and no extra TOTP; password+TOTP fallback, multiple passkeys, recovery codes and
security-only reauthentication. Session30minidle/8hmax unchanged. Contract first, single pre-client baseline,
French UI, meaningful tests/full gates and independent review. Previous cleanup/CI fixes committed and pushed
through9be78ee; repository was clean when this task started. Historical pending/uncommitted notes below are stale.

Status 2026-11-10: backend + UI implemented; independent review found 4 P2s, all fixed (Opus LOW,
/tmp/slama-admin-security/fixes-result.md). Gates on the combined tree: pnpm check PASS (API 269, UI 574), full
isolated integration PASS 412 / 1 skipped (S3 opt-in), 43 files. Independent final Sol LOW review/recheck complete:
all four findings resolved, no remaining actionable findings in the approved scope. Physical-authenticator browser
ceremony unrun (API tests real ES256; UI browser library mocked). User now authorized commit/push and related
GitHub issue resolution: #123 tracks admin security/privacy; broader parent #17 retains unfinished scope.
Final reports: /tmp/slama-admin-security/fixes-result.md and final-review.md; preserved gates in final-gates/.
Usage before final recheck: Codex81%5h/32%weekly remaining; Claude23%weekly used, session percent not visible.
Recheck usage before new work. Finished executor/reviewer panes closed; coordinator remains. No later task started.

# Historical cleanup result — 2026-11-09

Bounded cleanup implemented locally (Sol LOW), uncommitted; independent Opus review pending.
Seven HTML escaping callers import `lib/html.ts`; six identity/admin token hash callers import
`lib/token-hash.ts`. Customer lifecycle changes only its crypto/shared imports and local hash removal.
Starting billing/baseline work is preserved. Root Prettier excludes only separate `.claude/worktrees/`
checkouts. No contract/schema/permission/assertion/architecture exceptions changed.

Validation: focused 63/63; `pnpm check` PASS (API266/UI542, architecture/generator, lint/types/build/format).
Final full isolated integration PASS: 400 passed / 1 skipped, 42 files. First full run had one client-opt-in
reminder count failure (399 pass / 1 skip); unchanged focused file passed 21/21, then unchanged full rerun
passed 400/1 skip. Initial failure cause unproven; all logs retained. Commands serial, process-scoped
`caffeinate -i`, test DB only 127.0.0.1:55439/slama_finance_test. No database/volume deletion, installs,
commits, push/deploy/email or nested agents. Coordinator waits for independent Opus review.

Evidence: /tmp/slama-subscription-resume/cleanup-final/REPORT.md, cleanup-only.patch, before/after
patches and file hashes, actual-filelist.txt, preservation.json and logs. Durable audit:
docs/implementation/cleanup-audit.md. Prior billing/baseline history follows unchanged.

# Live coordination handoff

Latest CI fix: subscription-overrides calendar assertions now use settled November2025 instants instead of
assuming UTC+1 in November2026. Original failure reproduced with CI Node22.23.4/tzdata2026e; patched focused9/9
under both Node22.22.3/2026a and22.23.4/2026e, with UTC and Casablanca host TZ. Product timezone unchanged.
Full isolated integration400 passed/1 skipped and pnpm check pass. Coordinator reviewed the narrow diff.
User explicitly requested commit/push of this fix. Evidence: /tmp/slama-subscription-resume/ci-timezone-fix/REPORT.md.

Latest task: all-package cleanup audit and bounded implementation COMPLETE locally, uncommitted.
Opus LOW audited API/UI/marketing/infra/root; Sol LOW consolidated seven HTML escaping callers and six
token-hash callers into two semantic lib modules. Only .claude/worktrees/ was added to .prettierignore,
so aggregate pnpm check now PASSES (API266/UI542, architecture/generator, lint/types/build/format).
Final full isolated integration400 passed/1 skipped. First integration had one unchanged notification-count
failure, then focused21/21 and full400/1 passed without code changes; initial cause remains unproven.
Independent fresh Opus LOW review: no actionable findings. Full audit/deferred decisions and evidence:
docs/implementation/cleanup-audit.md and /tmp/slama-subscription-resume/cleanup-final/REPORT.md.
Current usage observations before review: Codex63%5h/45%weekly remaining; Claude18%weekly used,
session percentage not visible. Recheck live usage at next delegation; no later feature work started.

Update 2026-11-09 (baseline-integration-final): GREEN. Full integration 400 passed / 1 skipped / 0 failed (42 files) on a fresh, empty, isolated test DB.
Single migration 0000, periods reads by default. Changes: the baseline generator no longer FORCEs RLS on the six S5 tables (schema identical to the old
0000–0005 chain, evidence retained; independent Sol LOW review passed). Test setup: writer-based `seedPaidCoverage` plus `isolatedDatabase({owner})` for 4 files.
Uncommitted. See /tmp/slama-subscription-resume/baseline-integration-final/REPORT.md.

Current task result: baseline consolidation implemented by Opus LOW and independently reviewed by Sol LOW.
One canonical 0000 now includes all subscription SQL and suspension fixes; obsolete upgrade tests/preflight removed;
periods reads default on fresh installs. API266/UI542, lint/types/build/changed-file format pass. Required pnpm check
stops at161 nested-worktree format files. Integration on the consolidated baseline is now verified:400 passed,
1 skipped,42 files, from an empty isolated database after the user restarted Rancher. Independent review found
no actionable RLS/fixture/evidence issues. See progress.md and /tmp/slama-subscription-resume/baseline-integration-final/.
Availability at final review: Codex87%5h/49%weekly remaining; Claude18%weekly used (session value not visible).
These are historical observations, not permission to skip the next dispatch usage check. No next task started.

## Latest migration policy — user instruction, 2026-11-09

The user confirmed there are no real clients and will replace the database volume. This supersedes earlier
deployed/forward-only/frozen-hash and live-rollout requirements for the current pre-client schema.
Consolidate current migrations into the fresh baseline; update existing baseline definitions for the same tables
until real client data must be preserved. Remove obsolete historical-upgrade tests/scripts and frozen-hash gates,
but retain current behavior, isolation, concurrency and fresh-schema tests. Do not reset any existing user database
or remove volumes: the user will provision the replacement. Reintroduce forward-only migrations before real clients.

Result 2026-11-09 (Opus 5.5 LOW, uncommitted): 0000–0005 consolidated into one generated 0000 baseline
(generator appends subscription catalog/overrides/periods SQL; shift fn carries 0004+0005 fixes; no backfill call).
`SUBSCRIPTION_COVERAGE_READS` defaults to `periods`. Removed upgrade test, catalog re-import upgrade tests, frozen
hashes and s5-preflight.sql (copies in /tmp/slama-subscription-resume/baseline-consolidation-1109). Lint, typecheck,
API 266/UI 542 units, build, changed-file formatting pass. **Integration NOT run**: host Docker socket stale
(Rancher VM running, `docker` unreachable from host); fixing needs a Rancher restart by the user. Pending review.

Updated: 2026-11-09 00:07 UTC. This file is the resume point across coordinators/context resets.
Read alongside `subscription-billing.md` and `docs/implementation/subscription-billing/progress.md`.

## Current S5c result — 2026-11-09 (supersedes older pending results)

- S5c engineering complete locally: Sol LOW completed verification, then independent Sol review found paid-grace
  suspension P2. Sol reproduced and fixed it with forward 0005 plus legacy mirror parity. Fresh Opus 5.5 LOW
  rechecked fix/tests/raw evidence with no blocking findings. Final integration 403 passed, 1 skipped; focused 32/32;
  API 267/UI 542, architecture/generator, lint/types/build and changed-project formatting pass.
- Aggregate pnpm check stops only on 161 nested-worktree formatting files. Frozen 0000–0004 SQL/snapshots unchanged.
- Read flag stays legacy. No dev/live DB, rollout, commit/push/deploy. Rollout/preflight/reconcile/shadow activation
  and later milestones are not complete or authorized by this result. See progress.md for evidence and review limits.
- Sol executor w1:pB is finished; Opus w1:pA finished independent recheck. Initial Sol reviewer w1:pC closed.
  Before the next task, check current usage and route suitable work to Claude to balance the recent Codex execution.
  Do not automatically dispatch S6 from a stale pane prompt; follow current user scope and durable task dependencies.

## Standing user instruction

- Latest instruction (2026-11-09): check live agent state and provider usage/reset information before every new
  delegation; choose an available provider and split work as evenly as practical between Codex and Claude.
  Unknown usage stays unknown. Do not poll while delegated work runs or interrupt an active task solely to switch
  providers. Claude is available again per user; let Sol finish the S5c grace-freeze fix, then route its independent
  re-review to Opus 5.5 low after checking usage. This supersedes stale exclusive-provider instructions below.

- Latest availability override: user confirmed Claude is available again and Codex has about 35% of its 5-hour
  allowance remaining. **Claude is the main executor now**: Opus 5.5 low for complex work, Sonnet 5.5 low for small
  work. No new Codex implementation assignments while Claude is available. The existing Sol gate agent may finish
  its already-running tests/build/integration and report; hand subsequent bounded work to Claude through Herdr.
- Wait for Herdr completion notifications. Do not repeatedly query agent state, read progress files or inspect
  source while a task is delegated. Inspect its concise final report only after notification or a specific blocker.
- Latest coordination correction: **launch delegated agents through Herdr**. Do not use native collaboration
  sub-agents for subsequent work. After handing off a bounded task, wait for its response; do not duplicate its
  investigation, repeatedly poll/read files, or accumulate large context while it works. Inspect only the concise
  result and the specific evidence needed for a blocker or review. This overrides the earlier native assignments
  documented below, which are historical/completed. Do not launch new work merely to fill waiting time.
- Keep the coordinator lightweight. Use one implementer at a time by default, then a bounded independent review.
  Do not resume dispatch automatically from the old quota-check timestamp; check current user intent first.
- Balance work across Codex and Claude as availability allows; do not require the user to relay handoffs.
- Coordinator decomposes work, persists state, serializes shared writes/generation and checks results.
- Complex work: Sol low or Opus 5.5 low. Small work/UI: Terra low or Sonnet 5.5 low.
- Reviews are independent sessions; route complex review to available Opus or Sol low, small UI review to Sonnet.
- Do not silently raise effort, switch to paid overage or claim exact equal quota consumption. Balance bounded
  assignments and observed availability; actual provider quotas are not interchangeable.
- When Claude becomes available again, use it for the next suitable implementation/review assignment rather
  than leaving every lane on Codex. Persist this rule on every subsequent handoff.

## Availability and processes

- Live check 2026-11-09 14:47 UTC: Claude `/usage` shows session 2% used, week 16% used; credits off.
  Codex `/status` shows 5h 56% remaining, week 54% remaining. Reset times shown by each CLI are local display
  values; recheck at the next dispatch. Sol `s5c-codex` in `w1:pB` owns the active S5c paid-grace freeze fix.
  Idle `s5c-review` in `w1:pC` found the P2, report `/tmp/slama-subscription-resume/codex-s5c-review.md`.
  Next bounded independent review goes to fresh Opus LOW through Herdr once Sol reports completion.

- User reported Claude usage reset in approximately 25–30 minutes at 2026-11-09 00:07:26 UTC.
- Next check window: **2026-11-09 00:32–00:37 UTC**. This is an estimate, not confirmed availability.
  Check once near that window with a small pinned low-effort request or the CLI's status; no repeated probes.
- Closed the two existing Claude Herdr panes `w1:p5` and `w1:p7` at the user's explicit request, preserving last
  output in `/tmp/slama-subscription-resume/claude-*-last.txt`. Never touch coordinator pane `w1:p1`.
- No automatic background quota monitor is installed. The active coordinator owns the check above.

## Latest result — Opus S5b fix + S5c (2026-11-09)

Complete; result `/tmp/slama-subscription-resume/opus-s5c-result.md`. S5b fixed via forward migration 0004
(mixed app/DB clock in shift fn). S5c implemented behind `SUBSCRIPTION_COVERAGE_READS` (default legacy, not
enabled). Unit/lint/type/build PASS; check blocked only by 161 nested-worktree files. Full integration had
load-induced timeouts; reruns pass except one report-rendering timeout (unrelated path) — needs a quiet-host full
rerun, then independent review. Test container left running.

## Current bounded work — finish partial STEPUP

### Latest handoff to Claude main executor

Recovery update: prior Opus was interrupted by computer sleep after finding a cross-file integration hang
(test passes alone). Its large context was replaced with fresh Opus LOW: `billing-recovery-opus`, pane `w1:pA`.
Current checkpoint: `/tmp/slama-subscription-resume/recovery-handoff.md`; prior terminal tail is preserved there.
S5c code exists; remaining role/HTTP/race proof and full green integration run are not yet complete.
Do not assume environmental load or claim success without evidence. Coordinator waits for completion/blocker.

Unused Sol gate pane `w1:p8` was closed at the user's request after its final report. Prior Claude pane `w1:p9`
was closed for sleep recovery; current sole implementer is `billing-recovery-opus` in `w1:pA`.
Coordinator remains `w1:p1`.
STEPUP pass is complete. Concise result: `/tmp/slama-subscription-resume/gate-result.md`.
The existing Sol agent is finished; no new Codex implementation is authorized while Claude is available.
Broad integration recorded 380 passed, one skipped and two failures; one stale billing-calendar payload was
fixed (required code added; original 200 assertion preserved), then its focused file passed 7/7.
Remaining reproducible S5b failure: writers reconciliation test violates `subscription_suspension_end`.
Exact evidence: `gate-integration.log` and `gate-integration-focused.log` under the same temp directory.
Opus owns diagnosis/fix of that remaining lifecycle failure followed by the S5c read-switch slice, using
`/tmp/slama-subscription-resume/s5c-handoff.md`. Preserve all 0000–0003 SQL/snapshot hashes; needed DDL is a new
forward migration, never a rewrite. Test container was already running and remains available.
Coordinator waits for completion notifications; no parallel source investigation or additional implementer.

Claude's last handoff: `/tmp/slama-subscription-s5/result-stepup.md`.
API already requires fresh TOTP on plan change, coverage extension, subscription resume and paid new-owner grant.
UI generation/forms and tests were incomplete. Do not leave transport/UI/API out of sync.

| Agent              | Model / effort      | Exclusive writes                                          | Output                                         |
| ------------------ | ------------------- | --------------------------------------------------------- | ---------------------------------------------- |
| `/root/stepup_api` | gpt-6.1-sol / low   | API lifecycle service/controller and related API tests    | `/tmp/slama-subscription-resume/api-result.md` |
| `/root/stepup_ui`  | gpt-6.1-terra / low | Administration customer UI/tests and French catalog       | `/tmp/slama-subscription-resume/ui-result.md`  |
| Coordinator        | Main Codex          | Orchestration/docs/state; integration and review handoffs | This file                                      |

Coordinator regenerates API then UI contracts sequentially; agents must not run concurrent generators.
Generation log: `/tmp/slama-subscription-resume/generation.log`.
Before extending scope, finish this slice: denied/missing/replayed TOTP, atomicity/rollback, paid vs trial creation,
appropriate dialogs/payload/reset semantics, focused tests, then required regression checks.

### Additional explicit decisions and scope — 2026-11-09

- User confirmed: complimentary/free coverage has no seven-day paid-renewal grace, including existing free grants.
  Record this before S5c; do not apply a production read switch as part of STEPUP.
- User confirmed: fresh TOTP also covers payment confirmation/rejection and access-restoring operations:
  customer unblock, organization reactivation, and scheduled-deletion cancellation.
- Extend the same API/UI split to those endpoints. Keep owner-facing payment rejection wording distinct from
  internal audit reasons; never expose TOTP or internal notes in owner DTOs/audits.
- The initial partial-slice checks passed (26 API integration and 26 UI tests; types/lint/format). A broad pipeline
  was stopped before completion because the newly authorized contract scope requires fresh generation and checks.
- Sol reproduced both previously reported regression files: 48/48 passed, plus 2/2 exact failing scenarios passed.
  No code/assertion changes; prior failures' cause remains unproven. Full suite must still pass on the final tree.

## Preserve and verify

- Product already deployed: forward migrations only. Preserve all current 0000–0003 SQL/snapshots; hashes are
  `/tmp/slama-subscription-resume/migrations.sha256`. Do not reset or migrate development/production databases.
- All existing working-tree changes are intentional S2/S3/S5 work. No staging/commit/push/deploy/email.
- Only use isolated `postgres-test` at localhost:55439, database `slama_finance_test`; stop it when finished if started.
- Latest broad S5b report: 267 API unit passed; integration 371 passed, one skipped and two failed. These figures
  predate partial STEPUP and are not proof current tree passes. Investigate estimates independent delivery-note
  and sales-deletion PDF fencing failures; do not call them pre-existing without evidence.
- Full `pnpm check` historically stops on 161 nested `.claude/worktrees` formatting failures. Check current result;
  keep changed files formatted and run remaining gates separately if the unrelated blocker persists.
- S5c authoritative read switch remains pending; `complimentary_no_grace` and rollout conditions require their
  recorded decision gates. Do not activate reads merely because STEPUP is finished.

## Handoff checklist

After each bounded pass, record agents/results, changed files, actual test status, remaining findings and the next
Claude availability check here. Never substitute old passing results for a later changed tree. Update durable
progress docs and GitHub task evidence only to match verified scope. Preserve this routing instruction when
context compacts or the provider coordinator changes.

- 2026-11-10 S2/S4 phase 2A done (schema/catalog prep); see /tmp/slama-s2-s4/phase2a-result.md. Next: 2B writers + resolver.
- 2026-11-10 S2/S4 phase 2B done (writers, resolver, backend DTOs, CLI); see /tmp/slama-s2-s4/phase2b-result.md.
  API integration 435 pass/1 skip, unit 274, tsc/eslint clean. Next: UI phase (34 known UI tsc errors), then pnpm check.
- 2026-11-10 S2/S4 review fixes: 3 P2s fixed (/tmp/slama-s2-s4/fixes-result.md). check exit 0 (API 277, UI 596);
  integration 437 pass/1 skip/2 fail (admin-security activation, customer-lifecycle change plan) from mixed writer JS
  clock vs resolver DB clock (~80 ms DB lag); these 2 fail without the fixes too. Needs a clock decision, then recheck.
- 2026-11-10 S2/S4 clock fix: writers and resolver share the DB transaction clock; drift regression added. check exit 0;
  integration 441 pass/1 skip/0 fail (/tmp/slama-s2-s4/fixes/integration3.log). Next: independent review.
- 2026-11-10 S2/S4 P3 (UI-only) fixed: withdrawn renewal option only when coverage continues; check exit 0 (UI 597).
  Integration3 stands for the unchanged API. Residual risks listed in /tmp/slama-s2-s4/fixes-result.md. Final review of the UI delta is pending.
