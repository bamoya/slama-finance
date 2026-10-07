# Remaining features — execution record

Implementation is in progress. Acceptance is tracked separately from code delivery.
Scope and acceptance criteria: [agent specification](remaining-features-spec.md).

## Release audit — October 2026

This is a local release audit, not production approval. Existing business data and
running development services are left intact; tests use disposable database schemas
and recording email transports.

### Fixed during the audit

- Production browser requests default to the same origin instead of the visitor's
  `localhost:3000`. Explicit origins and local development remain supported.
- The UI container serves SPA deep links, returns real 404s for missing hashed
  assets, and proxies `/v1/` to the private API service.
- The API container preserves its ESM package metadata and runs as an unprivileged user.
- Docker build contexts exclude `.env.*` secrets while retaining example files.
- Production configuration fails early without private storage credentials.
- Reverse-proxy client IP trust is opt-in through exact `TRUST_PROXY_IPS`; tests
  verify client isolation and rejection of spoofed headers from untrusted peers.
- Cross-feature QA now requests both PDF/XLSX explicitly, tests Excel contents,
  and aligns HTTP, worker and disposable database queue clocks. All 22 tests pass,
  retaining permission revocation, failure injection, immutable captures and fencing.
- Formatting drift and outdated notification/deployment descriptions were corrected.
  Applied migration email literals remain byte-stable rather than being reformatted.

### Recovery rehearsal

Database-only recovery was rehearsed on a disposable, fully migrated schema using
PostgreSQL `pg_dump`/`pg_restore`. Login succeeded after restoration and all five
notification rules were present. This does not verify private-object recovery,
off-site encryption, backup scheduling or production RPO/RTO.

### Verification evidence

- Final `pnpm check` completed successfully on 2026-10-05: formatting, lint,
  translation coverage, type checks, tests and both production builds.
- API unit tests: **149 passed**; API architecture and contract-generator checks pass.
- UI tests: **324 passed**, with two bounded jsdom workers; UI architecture checks pass.
- Full database integration suite: **163 passed, no skips**, including the opt-in
  local MinIO lifecycle test. Command: `TEST_MEDIA_S3=1 TEST_DATABASE_URL=<dedicated-test-db> pnpm test:integration`.
- Format, lint, French translation coverage and API/UI type checks pass.
- Both Docker images build. Isolated runtime smoke checks confirm SPA deep links,
  JSON API proxying, missing-asset 404s, immutable hashed assets, non-root API UID,
  health response and functioning image/PDF libraries. Temporary containers/network
  were removed afterward; existing services were not restarted.
- Initial high-load runs had fixture/UI timeouts while container builds were
  compiling concurrently. Full suites were rerun successfully after serializing
  container builds and bounding UI workers; no timeouts or assertions were relaxed.

### Outstanding acceptance

- Commit/review the intended source: only 46 files are currently tracked; much of
  the implementation is untracked. No commit or staging was performed by this audit.
- Rehearse restoration of the database **and private objects**, including login and
  an existing document download. Backup automation and recovery objectives are not
  demonstrated by passing migration tests.
- Verify OCI networking, HTTPS, production database privileges, private bucket
  policy, Resend sender verification and a consented external email smoke test.
- Repeat the client walkthrough and obtain accountant/client approval of numbering,
  wording, VAT/rounding and retention. These are external acceptance gates.
- A fresh browser sweep of every page and production infrastructure verification
  remain separate from automated component and integration coverage.
- Performance follow-up: the production UI emits a large initial JavaScript chunk
  (about 2.37 MB minified / 660 KB gzip in this audit). Review route-level lazy
  loading and heavy dependencies before slow-network acceptance testing; do not
  suppress the bundle warning as a substitute for optimization.

## Implemented: report output refinement (2026-10-04)

- Each report section pairs its charts with its own supporting table and totals.
- Excel (.xlsx) replaces CSV for new financial report exports; historical CSV remains available.
- Schedules choose PDF, Excel or both; default PDF. The frozen choice controls generation
  and email attachments, including manual test sends and regeneration.
- Full requirements and acceptance checks: [Reporting refinement](11-reporting.md#approved-refinement-section-tables-excel-and-output-selection-2026-10-04).
- API and UI contracts regenerated; local migration 0024 applied. Historical run
  configurations and files are preserved. New capture version: 3.
- Verification covers native chart XML/cell types, currency separation, incomplete
  snapshots, PDF pagination, all output/attachment choices, frozen selections,
  file cleanup/restoration and legacy CSV compatibility. Desktop/mobile and dark
  mode selector checks use an isolated database, with no external email delivery.
- Targeted verification: 30 API renderer/contract tests, 16 reporting integration
  tests, 19 architecture checks and 34 reporting UI tests passed (the UI suites
  were rerun after updating the changed labels). API/UI TypeScript checks pass.

## Ownership

- Integrator: shared contracts/generation, migrations, app configuration, integration gates.
- Reporting developer: reporting queries/exports, schedules/runs, public reporting projections.
- Delivery developer: generic transport, policy/preferences, sales producers, reminders/expiry.
- UI developer: API integration across dashboard/reports, sending and notification settings.
- Independent testing/review roles rotate into the three worker slots after implementation handoff.

## Baseline

- API unit tests: 104 passed.
- API architecture checks: 19 passed.
- UI tests: 232 passed.
- Database integration baseline: 104 passed, 1 skipped, 1 failed.
- Baseline failure resolved: Node and PostgreSQL timezone data disagreed for
  `Africa/Casablanca` near midnight, so the SQL overdue filter disagreed with the
  application date. Invoice/client queries now bind the application-computed
  company-local date. All five sales-query integration tests pass after the fix.

## Gates

- [x] Inspect existing modules and establish exclusive ownership.
- [x] Register initial source contracts and generate API/UI artifacts.
- [ ] Live reporting and dashboard: developer delivery.
- [ ] Manual report exports: developer delivery.
- [ ] Generic delivery and document sends: developer delivery.
- [ ] Scheduled reports and client notifications: developer delivery.
- [ ] Independent API/concurrency/permission tests.
- [ ] Independent UI/browser/PDF verification.
- [ ] Independent architecture/security review and fixes.
- [ ] Full regression checks, migration verification and final handoff.

No production email delivery, production deployment or database reset is authorized
by this implementation run. Test transports must record messages without sending them.
