# Subscription and billing implementation playbook

Status: S1 decision record reviewed; additive S2 catalog foundation implemented and regression-tested.
S3 owner-subscription overrides implemented by Opus (user instruction) and independently reviewed twice by Opus (Sol unavailable), findings fixed and re-verified; see progress.md.
Remaining commercial decisions stay explicit gates; no migration has been applied to development or production.
Superseded 2026-11-09: no real clients; one canonical fresh baseline regenerated for schema changes (no forward
migrations, frozen hashes or upgrade tests); never reset/remove existing databases — the user replaces the volume. Owner-only overrides and notified-renewal version transitions are approved.
User also confirmed 30 days' notice, preservation of already-paid renewals, freeze of trial/paid/grace clocks on
subscription suspension, launch cash/bank transfers and administrator-controlled TVA enable/rate configuration.
Coordinator: currently main Codex; provider availability and active assignments are tracked in
[coordination-state.md](coordination-state.md). Scope: this repository only.
Standing user preference: balance Codex/Claude assignments automatically without manual handoff; use Sol/Opus low
for complex work and Terra/Sonnet low for small work. Return appropriate lanes to Claude after its quota resets.
Project: https://github.com/users/bamoya/projects/2/views/1

## Usage-aware dispatch (user instruction, 2026-11-09)

Before every new assignment, check current agent state and each provider's available usage/reset information.
Use an available provider and balance bounded work between Codex and Claude as evenly as practical, considering
remaining usage, task complexity and recent assignments. Never treat an old availability note as current evidence.
If usage cannot be read, record it as unknown; do not invent percentages. Do not enable paid overage.
Let an active bounded task finish rather than duplicating or migrating it merely because another provider returns.
Use the newly available provider for the next suitable assignment. Keep all efforts low and launch through Herdr.
Wait for completion notifications after delegation; usage checks happen at dispatch boundaries, not in a polling loop.
Persist current availability, active task and next handoff so the user does not need to relay context.

## Agent lanes

All model and effort choices below follow the user's explicit instructions. The coordinator owns decomposition,
contracts, integration, verification, issue updates and final decisions. No agent silently changes models or raises effort.

| Work                                                                 | Primary agent            | Alternative                                      | Effort                                                         |
| -------------------------------------------------------------------- | ------------------------ | ------------------------------------------------ | -------------------------------------------------------------- |
| Complex schema, API, billing, quota and concurrency work             | Codex `gpt-6.1-sol`      | Claude `claude-opus-5-5`                         | Low                                                            |
| Small, bounded UI and localization work                              | Codex `gpt-6.1-terra`    | Claude `claude-sonnet-5-5`                       | Low                                                            |
| Small mechanical work with objective acceptance                      | Terra                    | OpenCode `opencode/glm-5.3-flash-free`           | Low for Terra; do not invent an unsupported GLM effort variant |
| Optional small UI alternative                                        | Terra                    | Antigravity `gemini-3.8-flash-low` through `agy` | Low                                                            |
| Independent primary review                                           | Claude `claude-opus-5-5` | Sol if Opus is unavailable                       | Low                                                            |
| Independent secondary review of billing/security/concurrency changes | Codex `gpt-6.1-sol`      | Opus if Sol implemented the change               | Low                                                            |

GLM Flash was selected as an optional small-task candidate because the installed catalog exposes a free endpoint
and it passed the connectivity test. This is a coordinator choice, not a coding-quality benchmark.
Sonnet and Antigravity are optional alternatives, not extra agents to launch on every task.
Do not give schema design, money arithmetic, authorization or quota algorithms to the small-task lane.

The following primary lane map is recorded here for the coordinator; it is not an installed `.delegate/config.json`
and cannot be passed to `--lane` until explicitly installed through the delegation setup tooling.
No global CLI configuration or model defaults were changed.

```json
{
  "version": "delegate-fleet.v1",
  "lanes": {
    "complex": {
      "implementer": "codex",
      "model": "gpt-6.1-sol",
      "effort": "low"
    },
    "ui": {
      "implementer": "codex",
      "model": "gpt-6.1-terra",
      "effort": "low"
    },
    "review": {
      "implementer": "claude",
      "model": "claude-opus-5-5",
      "effort": "low",
      "readOnly": true
    },
    "review-secondary": {
      "implementer": "codex",
      "model": "gpt-6.1-sol",
      "effort": "low",
      "readOnly": true
    }
  }
}
```

## Delivery sequence

Read `AGENTS.md`, the approved SaaS agreement and each linked issue before starting a slice.
The design discussed in chat is a proposal until its commercial policy gates are resolved.
Implement one coherent vertical slice at a time; the table is not permission to start every agent at once.

| Step | GitHub parent                                                 | Implementation steps                                                                                                                                                                                                                                                 | Agent and review                                                                          | Exit condition                                                                                                       |
| ---- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 0    | Setup (this file)                                             | Discover CLIs/model identifiers; verify low effort; send no-tool connectivity prompts; record results.                                                                                                                                                               | Coordinator                                                                               | Requested primary and optional lanes have explicit working/failed status.                                            |
| 1    | [S1 / #3](https://github.com/bamoya/slama-finance/issues/3)   | Record owner/subscription versus organization override scope; override precedence/expiry; email charging/refunds; reset windows; upgrade/downgrade/suspension; prices/tax/proration; existing-customer transition. Separate approved decisions from recommendations. | Coordinator + Sol; Opus reviews ambiguities                                               | Unresolved commercial choices are answered by the user; dependent behavior is not guessed.                           |
| 2    | [S2 / #4](https://github.com/bamoya/slama-finance/issues/4)   | Define contracts; model entitlement definitions, immutable published plan versions, typed plan values and prices; map existing plan JSON; preserve constraints/RLS; generate API/UI contracts.                                                                       | Sol; Opus review                                                                          | Plan values have explicit types, scope and unlimited semantics; existing agreements cannot change silently.          |
| 3    | [S3 / #5](https://github.com/bamoya/slama-finance/issues/5)   | Add effective-dated subscription overrides and audit records; implement precedence, expiry and overlap rules; expose effective values/sources; build bounded administrator forms.                                                                                    | Sol backend; Terra UI; Opus review                                                        | One customer's exception cannot affect another; administrator step-up and audit cover mutations.                     |
| 4    | [S5 / #7](https://github.com/bamoya/slama-finance/issues/7)   | Separate trial/paid/complimentary coverage from payments; enforce valid periods; model scheduled changes; implement cancellation/grace/suspension; replace zero-value payment grants; reconcile existing state.                                                      | Sol or Opus; independent other-model review                                               | Deterministic coverage at boundaries, preserved data and explicit handling of future changes.                        |
| 5    | [S4 / #6](https://github.com/bamoya/slama-finance/issues/6)   | Resolve period and plan version, active overrides, restrictions and effective access centrally; replace divergent API/worker decisions; expose stable generated DTOs to UI; specify cache invalidation.                                                              | Sol; Opus review                                                                          | API, workers and UI agree before/after time, plan, override and restriction transitions.                             |
| 6    | [S6 / #8](https://github.com/bamoya/slama-finance/issues/8)   | Separate quotes, invoices/lines, payment submissions, verified payments and allocations; snapshot prices/taxes; implement explicit corrections; define acceptance of delayed confirmations; integrate owner/admin views.                                             | Sol or Opus backend; Terra small UI slices; both independent reviewers on financial logic | Idempotent confirmation, exact money arithmetic, immutable issued amounts and no accidental duplicate coverage.      |
| 7    | [S7 / #9](https://github.com/bamoya/slama-finance/issues/9)   | Define capacity versus consumption; add allowance windows, reservations and usage events; enforce atomic admission/idempotency; integrate storage/email; preserve authoritative staff/org counts; reconcile uncertain outcomes.                                      | Sol; Opus plus independent Sol review when applicable                                     | Concurrent requests cannot exceed effective limits; failed/uncertain operations follow the approved charging policy. |
| 8    | [S8 / #10](https://github.com/bamoya/slama-finance/issues/10) | Complete upgrade previews, scheduled downgrades and retention choices; preserve usage on plan change; block new over-limit operations without deleting data; implement billing reminders and clear owner explanations.                                               | Sol business rules; Terra UI; Opus review                                                 | Complete localized owner/admin journeys with effective dates, amounts, limits and pending states.                    |
| 9    | [S9 / #11](https://github.com/bamoya/slama-finance/issues/11) | Verify plan/override matrix, timezone and period boundaries, API/worker agreement, races, restrictions, fresh schema/data transition and responsive French/English journeys; run required full gates.                                                                | Coordinator; Opus and Sol independent reviews                                             | All acceptance evidence recorded, findings resolved, checks green and no unexplained data/usage discrepancies.       |

Step 4 precedes step 5 because access resolution needs the coverage model. Quota/backend design may be prepared
after step 3, but integration follows the effective-access contract. Only independent files may be edited in parallel.
Read the child tickets for the exact acceptance scope; do not recreate completed finance features.

## Dispatch and review protocol

1. Coordinator assigns one child issue with objective, approved decisions, allowed files, dependencies,
   relevant contracts and focused acceptance checks. Supply a short handoff, not the full conversation.
2. Use at most one implementation agent and one reviewer by default. Add a UI agent only for disjoint files
   after contracts stabilize. No nested delegation without coordinator direction.
3. One writer owns each file. Schema, OpenAPI, generated artifacts and app composition are serialized.
   Use isolated worktrees for actual concurrent code changes when needed; do not create them for no-op tests.
4. Implementer returns changed files, rationale, checks/results, risks and remaining policy questions.
5. Reviewer gets the exact diff and acceptance criteria. It returns actionable findings with severity,
   file/line, failure scenario and recommended fix. It must not edit implementation files during review.
6. A reviewer must be a separate session from the implementer. If Sol implemented, Opus is the primary reviewer;
   if Opus implemented, Sol reviews. Important money, isolation and race changes also receive a fresh second pass.
7. Coordinator resolves findings, runs necessary checks and updates GitHub evidence/status. No commit,
   push, deployment, development-database reset or external email without the applicable user authorization.

## Herdr operating procedure

Use the installed CLI and its skill as the syntax authority. Verified here: Herdr 0.9.5, Claude Code 2.1.309,
Codex CLI 0.162.1, and an existing Herdr-managed coordinator pane.

```sh
test "${HERDR_ENV:-}" = 1
herdr --skill
herdr pane current --current
herdr pane layout --pane "$HERDR_PANE_ID"
```

Only control Herdr when `HERDR_ENV=1`. Discover current IDs; never reuse the smoke-test IDs from a past run.
Create a sibling pane with `--no-focus`, preserve cwd, and capture `.result.pane.pane_id` from its JSON response:

```sh
herdr pane split --current --direction right --cwd "$PWD" --no-focus
```

Wait for its interactive shell to be ready before starting an agent. A newly created pane can temporarily return
`agent_pane_busy`; inspect it before retrying. Do not send work to a pane owned by another process.
With the returned pane ID, launch one of the following (replace `<pane-id>`):

```sh
# Primary complex implementer; low is set explicitly.
herdr agent start billing-sol --kind codex --pane <pane-id> -- \
  -m gpt-6.1-sol -c 'model_reasoning_effort="low"' -s workspace-write

# Small UI implementer.
herdr agent start billing-ui --kind codex --pane <pane-id> -- \
  -m gpt-6.1-terra -c 'model_reasoning_effort="low"' -s workspace-write

# Reviewer: read tools only, pinned Opus, low effort.
# Read-only here restricts available tools; it is not an OS filesystem sandbox.
herdr agent start billing-review --kind claude --pane <pane-id> -- \
  --model claude-opus-5-5 --effort low --permission-mode plan \
  --tools Read,Grep,Glob --strict-mcp-config --mcp-config '{"mcpServers":{}}'

herdr agent prompt billing-review "Review the assigned diff; report actionable findings only." \
  --wait --timeout 60000
herdr agent get billing-review
herdr agent read billing-review --source recent-unwrapped --lines 80
```

Codex model/effort flags and Claude model/effort flags were verified against installed CLI help.
Ensure `CLAUDE_CODE_EFFORT_LEVEL`, when inherited, is `low`: it takes precedence over `--effort`.
Do not use Claude `--bare` with this account: bare mode skips OAuth/keychain authentication.
Never switch to unrestricted permissions to make a smoke test pass.
For `agent_blocked`, `agent_prompt_stalled` or timeout: inspect state/output; never blindly resend a prompt
or answer a new approval/setup dialog. Keep user focus unchanged. Close only panes created for the task
and only after confirming no user-owned work is running there.

## Smoke-test evidence

Date: 2026-11-08. These are one-turn connectivity tests, not coding-quality or reviewer-quality benchmarks.
Prompts requested a single short marker, prohibited tools/file edits, and did not ask agents to analyze the repo.
CLI runs used temporary context; the Herdr test used a sibling pane with no tools.

| Agent                    | Exact model                   | Effort                     | Observed result                                                                                                                         |
| ------------------------ | ----------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Codex                    | `gpt-6.1-sol`                 | low                        | `SOL_OK`, exit 0; 6.1 seconds; 6 output tokens, zero reasoning tokens                                                                   |
| Codex                    | `gpt-6.1-terra`               | low                        | `TERRA_OK`, exit 0; 4.2 seconds; 7 output tokens, zero reasoning tokens                                                                 |
| Claude                   | `claude-opus-5-5`             | low                        | `OPUS_OK`; provider reported exact pinned model; 9 output tokens, zero thinking tokens; reported cost USD 0.004716                      |
| Claude                   | `claude-sonnet-5-5`           | low                        | `SONNET_OK`; provider reported exact pinned model; 9 output tokens, zero thinking tokens; reported cost USD 0.002466                    |
| OpenCode                 | `opencode/glm-5.3-flash-free` | No unsupported variant set | `GLM_OK`, exit 0; 2.6 seconds; reported cost 0                                                                                          |
| Antigravity CLI          | `gemini-3.8-flash-low`        | low                        | `AGY_OK`, SUCCESS; 4 output tokens, zero thinking tokens                                                                                |
| Herdr interactive Claude | `claude-opus-5-5`             | low                        | Native `agent start` returned `interactive_ready=true`; banner showed Opus 5.5 with low effort; `agent prompt` produced `HERDR_OPUS_OK` |

Initial Claude attempts failed locally because of an invalid empty MCP shape and then bare-mode OAuth exclusion;
both were corrected before successful requests. No alternative model was substituted.
Minimal prompts still incur CLI system/tool-context overhead: Codex reported approximately 11.3k input tokens
per test (8.1k cached), GLM 10.1k, and Antigravity 8.4k. Claude successful print tests used approximately 600
input/cache-creation tokens each. Avoid repeating tests that already passed.
Raw temporary logs: `/tmp/slama-agent-smoke/` (local, not durable project dependencies).

After its successful reply, the Herdr Claude session opened an auto-mode setup dialog and reported `blocked`.
No response was sent to that dialog and no history/project scan was approved. The named smoke pane is left
open for the user's inspection; it has tools disabled. Resolve the dialog before reusing it, or launch a fresh
reviewer with the read-only tool list above. The successful reply proves launch and prompt transport, not an
unattended review workflow through future permission/setup prompts.

## Validation and stopping point

The lane JSON validates against `delegate-fleet.v1`; Markdown formatting and `git diff --check` pass.
The repository-required `pnpm check` stopped at formatting: 161 existing files under nested
`.claude/worktrees` fail the style check. See `/tmp/slama-agent-smoke/repo-check.log` for the run result.
That was the initial setup run. Application/schema work has since started; current results are recorded in
[subscription redesign progress](../docs/implementation/subscription-billing/progress.md), including 245 API tests,
530 UI tests and 338 database integration tests passed. The global formatting blocker remains unchanged.
Run contract generation sequentially: overlapping generators write the same files.

Current work: [S1 decision record](../docs/implementation/subscription-billing/decisions.md), drafted by Sol low
and reviewed by Opus 5.5 low. The coordinator resolves findings and obtains the remaining product answers.
The additive S2 catalog is implemented without runtime activation. Next: S3 owner overrides and administration,
then coverage periods and shared resolution. Production/local rollout requires a reviewed transition against
the actual migration journal; remaining commercial gates stay scoped to the dependent slices.

## Sources

- [Herdr agent automation](https://herdr.dev/tui/docs/agent-automation/)
- [Claude model and effort configuration](https://code.claude.com/docs/en/model-config)
- [Official OpenAI developer commands](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [OpenCode model selection](https://opencode.ai/docs/models/)
- Local authority: installed `herdr --skill`, CLI help, Codex model cache and provider smoke-test responses.
