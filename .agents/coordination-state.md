# Current cleanup result — 2026-11-09

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
