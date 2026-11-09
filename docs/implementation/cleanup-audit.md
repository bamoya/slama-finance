# Cleanup audit — 2026-11-09

Bounded implementation of the existing all-package audit. No contract, schema,
permission, billing, money or date behavior changes.

Status: completed locally, uncommitted. Independent Opus 5.5 LOW review found no
actionable issues in the shared functions, caller substitutions, layering or
formatter exclusion. Review used source and recorded evidence; it did not rerun
tests or independently recompute the preservation hashes. Larger findings below
remain deferred rather than being treated as completed cleanup.

| Finding                                        | Result                                      | Reason                                                                                                                             |
| ---------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| HTML escaping in seven API callers             | Implemented: `api/src/lib/html.ts`          | Same five substitutions; report chain escapes ampersands first. No coercion or null fallback added.                                |
| Token SHA256-hex in six identity/admin callers | Implemented: `api/src/lib/token-hash.ts`    | Same string input, default UTF-8 encoding and lowercase hex output. Customer lifecycle changes only its import and local delegate. |
| Root formatter traverses separate checkouts    | Implemented: `.claude/worktrees/` exclusion | These directories contain their own Git worktree metadata. Project source and tests remain covered.                                |
| UI default sales dates                         | Deferred                                    | UTC versus Casablanca changes behavior; requires a product decision.                                                               |
| Admin `iso` / `notFound`                       | Deferred                                    | Small functions; error messages differ and billing work is ongoing.                                                                |
| Sales money formatting                         | Deferred                                    | Rounding paths differ; outside this batch.                                                                                         |
| Controller ID parsing                          | Kept                                        | Different generated schemas; sharing adds indirection.                                                                             |
| Compose targets                                | Deferred                                    | Requires an operations decision about supported deployments.                                                                       |
| Terraform local artifacts                      | Kept                                        | Already ignored; deletion belongs to the operator.                                                                                 |
| Marketing/video and root scripts               | No change                                   | No actionable duplication; generated assets remain generated.                                                                      |

Other content, ETag, storage and email idempotency hashes retain their existing
implementations. Notification HTML sanitization and its separate escaping contract
remain unchanged. No exceptions or assertions were weakened.

Validation results and patch evidence are recorded in
`/tmp/slama-subscription-resume/cleanup-final/`. Existing focused email, document,
reporting, notification and identity tests run before the required serial
`pnpm check` and full isolated integration suite. Final results are recorded below.

- Focused existing tests: 63 passed across 11 files.
- Standalone parity probe: 3,132 inputs per HTML caller, including existing
  null/undefined error classes; token UTF-8 and hex parity checked. No new test
  assertions or exceptions were added to the repository.
- `pnpm check`: passed, including API 266 / UI 542 tests, architecture and
  generator tests, formatting, lint, types and builds.
- Full isolated integration: final rerun 400 passed / 1 skipped, 42 files.
  First run: 399 passed / 1 skipped / 1 failed (client opt-in reminder count).
  That unchanged file then passed 21/21; cause of the initial failure is unproven.
  No test or application changes were made between integration runs.
- Commands ran serially under process-scoped `caffeinate -i`; integration used
  only `127.0.0.1:55439/slama_finance_test`. No development database or volume
  operations were performed.
