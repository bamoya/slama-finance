# 13 — Integration, migration rehearsal and release gates

[Index](README.md) · Depends on every previous sequence

## Models, migrations and fixtures

No new business tables by default. Inventory all approved models against Drizzle,
the source schema document and migration SQL. Verify FK/index/check/audit coverage,
especially polymorphic artifact/dispatch validation that PostgreSQL cannot enforce
with ordinary FKs. Include all sequence-added permissions in idempotent seeds.
Fresh-install rehearsal must work from a clean test database; upgrade rehearsal
must preserve seeded real-like data once an applied baseline exists.

Use test-only fixtures for Moroccan individual/company clients, g/kg products,
VAT-off and explicit VAT, multiple invoice conversions, partial deliveries,
installments, pending cheques and immutable report snapshots. Production bootstrap
creates no demonstration financial records. Do not destructively reset user data.

## API and worker verification

- Contract coverage: every route has operationId, safe DTOs, documented errors,
  full-session and action permission guards. No stale OAuth/public registration.
- Security matrix: role combinations, direct ID access, attachment/job access,
  CSRF/Origin, upload/export limits, permission revocation, restricted sessions,
  redaction and protected admin invariants. Frontend visibility is not a guard.
- Concurrency suite uses real PostgreSQL connections for duplicate issue/convert,
  payment clearing, delivery allocation, queue claims and scheduler creation.
- Fault injection: kill workers before/after claim, file upload, enqueue and
  provider response; verify lease recovery, stable payloads and bounded retries.
- End-to-end flows: staff onboarding → company/catalog/client → estimate → invoice
  → delivery → installments; separately delivery-first invoicing; reporting/export
  and opt-in email. Include corrective cancellation/replacement flows.

## UI/state completion

Remove production mock persistence and auth bypasses; retain isolated fixtures only
for tests/stories. Verify all list/create/edit/detail routes and actionable empty,
loading, error, forbidden and stale-version states. Staff/role/settings pages are
as important as invoice pages. Keep stable shared shell/header/container, keyboard
navigation, small-screen forms and both light/dark modes. Validate French labels,
Moroccan currency/date formatting and supported Arabic document output/RTL where
configured. No localStorage credentials or duplicated server-state stores.

## Operations and deployment

Use root Compose and per-project Dockerfiles with the approved OCI target. Run
API and bounded workers with least-privilege DB/storage credentials. No mandatory
Redis. Graceful shutdown stops new claims and allows in-flight work to finish or
expire safely. Add queue age/failure, report failure, DB/storage capacity and worker
heartbeat monitoring without logging financial bodies or credentials.

Define configurable retention only after owner approval: issued documents/reports
are not automatically deleted, shorter email-body retention preserves needed
delivery identity, cleanup respects pending attachment references. Rehearse restoring
database plus private object storage together and verify usable old PDFs and login.
Document recovery steps and operator retries; backups are not verified until restored.

## Release checklist

- [ ] Accountant validates public invoice numbering and final document wording.
- [ ] VAT choices and exact rounding examples approved; VAT remains off by default.
- [ ] Retention durations, sensitive audit access and backups approved/tested.
- [ ] PostgreSQL migrations/seeds and UI contract generation reproducible.
- [ ] Generated UI contracts/builds/artifacts remain ignored; source definitions tracked.
- [x] Format, lint, typecheck, unit/integration/contract/UI tests and builds pass (local audit, 2026-10-05; see [evidence and limitations](remaining-features-progress.md#release-audit--october-2026)).
- [ ] API readiness, workers, private storage and email configuration verified.
- [ ] Every prior sequence meets its acceptance criteria; client POC walkthrough repeated.

Exit: an evidence-backed release candidate, not merely a successful compilation.
