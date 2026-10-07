# PostgreSQL to Oracle Database migration plan

Status: Proposed; implementation is not authorized by this document.

Date: 2026-10-04

## Objective and scope

Evaluate and, only after a successful feasibility checkpoint, migrate Slama Finance from PostgreSQL to Oracle Database on OCI. This is a database-engine migration, not merely a deployment change.

Preserve the existing API contracts, UI, modular monolith boundaries, permissions, and business behavior. Keep the controller/service/repository structure, with mappers where needed. Do not introduce permanent dual-database support or a generic repository framework solely for this migration.

Assumptions:

- The application is pre-production; zero-downtime migration is not required.
- Existing data is preserved unless its disposal is explicitly approved.
- The exact OCI Oracle service, database version, privileges, and limits must be confirmed before implementation.
- Object storage and email delivery remain separate integrations and do not change solely because the database changes.
- PostgreSQL migration history and the original database remain intact during migration and the agreed rollback period.

## Effort estimate

| Phase                                                | Estimated developer-days |
| ---------------------------------------------------- | -----------------------: |
| 1. Feasibility and compatibility prototype           |                      2–3 |
| 2. Persistence foundation, schema, and seeds         |                      3–5 |
| 3. Domain repository conversion                      |                     6–10 |
| 4. Background processing and concurrency             |                      3–6 |
| 5. Validation, data migration, and cutover rehearsal |                     6–11 |
| **Total**                                            |                **20–35** |

This is a planning estimate, not a fixed quotation or calendar commitment. Phase 4 accompanies the relevant domain conversions. Revise the estimate after phase 1, especially if the target service cannot support required integrity or concurrency mechanisms.

Approve the feasibility checkpoint first rather than committing immediately to the full rewrite. Migration effort may outweigh the hosting savings from using a free database tier.

## 1. Confirm feasibility

### Work

- Confirm the exact OCI Oracle Database service, version, connection requirements, resource limits, backup/recovery capabilities, and available database privileges.
- Evaluate Oracle's Node.js driver, including deployment-platform compatibility, TLS, connection pooling, timeouts, transactions, and readiness checks.
- Prototype monetary precision, timestamps, business dates, JSON snapshots, existing UUIDs, and Unicode text.
- Prove concurrent job claiming and notification deduplication.
- Identify replacements for PostgreSQL advisory locks.
- Prove enforcement of the rule that every product has at least one active variant. The current PostgreSQL implementation uses deferred constraint triggers; do not weaken this guarantee through a mechanical SQL translation.
- Inventory PostgreSQL-specific queries, types, indexes, constraints, triggers, conflict handling, and database-error mappings.

### Deliverables

- Compatibility matrix documenting each PostgreSQL dependency and its Oracle replacement.
- Isolated working prototype for the highest-risk behaviors.
- Recommended driver and migration tooling.
- Updated effort estimate and explicit go/no-go recommendation.

### Exit gate

Proceed only if critical integrity and concurrency guarantees can be preserved on the actual target service. Resolve unsupported features or revisit the database decision before broad repository changes.

## 2. Establish Oracle persistence

The current persistence implementation uses Drizzle with PostgreSQL. Oracle is not listed among Drizzle's supported integrations; plan to replace this implementation rather than change only the connection string. See [Drizzle's supported integrations](https://orm.drizzle.team/docs/get-started).

### Work

- Introduce shared connection, transaction, query-binding, and database-error handling using the tooling selected in phase 1.
- Use parameterized queries behind existing repositories.
- Replace Drizzle-derived transaction types used by services as well as repositories.
- Preserve existing domain boundaries and public module interfaces.
- Create a separate Oracle schema baseline and versioned migrations without rewriting PostgreSQL migration history.
- Provide repeatable permission, role, settings, and other required seed operations.
- Preserve readiness checks, bounded connection behavior, graceful shutdown, and safe logging without secrets.

### Required type and behavior mappings

| PostgreSQL concern              | Oracle requirement                                                     |
| ------------------------------- | ---------------------------------------------------------------------- |
| UUIDs                           | Preserve existing IDs and their external API representation            |
| Decimal amounts                 | Preserve exact precision and rounding; avoid floating-point conversion |
| JSONB                           | Preserve snapshots and required query operations                       |
| Dates and timestamps            | Preserve UTC instants and business-date semantics                      |
| Empty strings and nulls         | Explicitly handle Oracle's different string semantics                  |
| Case-insensitive search         | Preserve user-visible search and sorting behavior                      |
| Unique constraints and indexes  | Reproduce business rules, including archived-record behavior           |
| Returning and conflict handling | Preserve returned values, atomicity, and deduplication semantics       |
| Database errors                 | Preserve existing API error codes and validation behavior              |

### Deliverables

- Oracle database adapter and shared transaction abstraction.
- Repeatable schema setup and seeds.
- Foundation integration tests running against Oracle.

## 3. Convert domains in dependency order

```text
Database foundation + audit
             |
             v
Identity: authentication, staff, roles, permissions
             |
             v
Company settings + clients + catalog + media
             |
             v
Estimates -> invoices -> delivery notes -> payments
             |
             v
Reporting + schedules
```

### Repeat for each domain

1. Replace PostgreSQL-specific repository operations.
2. Preserve service behavior, transaction boundaries, and supported inter-module interfaces.
3. Map database results into existing response contracts.
4. Run integration tests against Oracle.
5. Compare results with PostgreSQL using identical fixtures.

### Critical behaviors

- Identity: permission enforcement, role changes, session revocation, onboarding, and password recovery.
- Settings and media: company defaults, template configuration, media references, and ownership checks.
- Clients and catalog: search, filters, archive/delete restrictions, category integrity, and active product variants.
- Estimates: revisions, superseded records, acceptance rules, and multiple invoices from one eligible estimate.
- Invoices and delivery notes: document relationships, numbering, snapshots, issuance, and cancellation rules.
- Payments: partial payments, allocations, cancellation/restoration rules, and exact financial totals.
- Reporting: aggregate equivalence, period boundaries, immutable run snapshots, and export data.

### Contract rule

Keep OpenAPI and the UI unchanged unless a genuine functional change is necessary. Any required contract change starts in source specifications, followed by regeneration of API/UI schemas and clients. Never hand-edit generated artifacts or introduce parallel handwritten request/response types.

## 4. Port background processing and concurrency

Perform this work alongside the affected domain conversions, not only after repository migration is complete.

### Work

- Replace advisory locks with proven Oracle-supported mechanisms available on the selected OCI service.
- Preserve job claiming, leases, retries, and crash recovery.
- Preserve schedule-occurrence deduplication and transactional notification enqueueing.
- Protect artifact generation, publication, and deletion against races.
- Preserve optimistic concurrency checks and concurrent-edit behavior.
- Preserve authorization consistency during concurrent role and staff changes.
- Verify that business writes and their queued work commit or roll back together where currently required.

### Acceptance

- Multiple workers cannot independently process the same valid claim.
- Crashed or expired work can be recovered without losing jobs.
- Retries preserve existing idempotency protections.
- Concurrent operations cannot silently violate financial or document invariants.

Database locks alone do not guarantee exactly-once email delivery. Retain provider idempotency where available and define reconciliation for ambiguous delivery outcomes.

## 5. Validate, migrate data, and rehearse deployment

### Functional verification

Run equivalent scenarios against PostgreSQL and Oracle. Compare:

- API response shapes, validation, and errors.
- Search, filters, sorting, and pagination.
- Invoice balances, payment allocations, tax, and rounding.
- Dashboard totals against report totals.
- PDF and Excel content and relevant layout behavior.
- Scheduled periods, timezones, and immutable report history.
- Roles, permissions, sessions, recovery, and mandatory password replacement.
- Constraints, rollback behavior, concurrency, and worker recovery.

Use representative data volumes and review query plans for important list, search, and reporting queries. Validate against the actual OCI target before cutover; a local Oracle environment alone is insufficient.

### Data migration

Preserve data unless discarding it is explicitly approved. Migrate in dependency order while retaining:

- IDs and relationships.
- Password hashes and account state.
- Document numbers and historical snapshots.
- Audit records and timestamps.
- Media and artifact references.
- Schedule and notification history.

Validate row counts, referential integrity, financial totals, and representative records. Define an explicit session/token retention or invalidation policy before cutover. Preserve the validity and expiry semantics of retained credentials and tokens.

Object-storage files do not need moving simply because the database engine changes. Verify that migrated references still resolve and that immutable historical files remain unchanged.

### Cutover

```text
Back up PostgreSQL and verify recovery
                 |
                 v
Pause writes, producers, and workers
                 |
                 v
Reconcile in-flight work
                 |
                 v
Final data migration and reconciliation
                 |
                 v
Validate Oracle
                 |
                 v
Switch API database connection
                 |
                 v
Run smoke tests
                 |
                 v
Resume writes and workers
```

Avoid replaying already delivered notifications or regenerating historical artifacts unintentionally when workers resume.

### Rollback

- Keep PostgreSQL intact for an agreed retention period.
- Define go/no-go checks before allowing writes on Oracle.
- Before new Oracle writes, rollback can restore the previous application/database connection after verification.
- After new Oracle writes, rollback requires preserving and reconciling those writes. Do not simply reconnect to the old PostgreSQL database and lose new activity.
- Rehearse recovery and document who can authorize cutover, rollback, and eventual retirement of the old database.

## Completion criteria

- Existing UI works without a database-driven redesign.
- Public API contracts remain compatible.
- Business constraints remain enforced.
- Financial calculations, dashboard totals, and reports reconcile.
- Concurrency, retry, and worker-recovery tests pass.
- Backup restoration and deployment have been rehearsed.
- PostgreSQL runtime dependencies are removed from the Oracle release.
- The migration validation report, operating instructions, and rollback runbook are complete.

## Required final deliverables

1. Compatibility inventory and feasibility decision.
2. Oracle persistence implementation, schema migrations, and seeds.
3. Updated repository implementations with unchanged domain boundaries.
4. Regression, integrity, and concurrency tests.
5. Repeatable data-migration procedure and reconciliation report.
6. Deployment, backup/recovery, and rollback runbooks.

This document records a proposed plan only. Saving it does not start the migration or change the current PostgreSQL deployment.
