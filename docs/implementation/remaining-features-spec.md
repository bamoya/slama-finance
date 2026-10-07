# Remaining features — agent implementation specification

Status: ready for implementation; this document does not claim the work is complete.

Approved output refinement, 2026-10-04: the opening refinement in
[Reporting](11-reporting.md#approved-refinement-section-tables-excel-and-output-selection-2026-10-04)
is authoritative for section-local supporting tables, Excel replacing new CSV report
exports, and schedule outputs PDF / Excel / both (default PDF). It is documentation-only
and pending implementation. Preserve historical runs and legacy CSV files; older
PDF-only attachment and summary-only export requirements below are superseded.

Design refinement approved 2026-10-03: [Visual reporting and scheduler specification](11-reporting.md)
is authoritative for the replacement reporting UI, contextual drill-down, scheduler
preview, visual PDF and snapshot-summary/PDF scheduled email. Preserve this document's
shared architecture, permissions, financial definitions and worker guarantees.
The new dashboard/reports currently use labeled UI fixtures; the temporary
`/reports/live` fallback must be removed only after live integration and export parity.
This update is documentation-only, not authorization to change backend code now.

This specification covers the four priorities from the progress review, **not**
implementation sequences 01–04:

1. Live dashboard and reporting API.
2. Manual report downloads.
3. Generic email delivery and invoice/estimate sending.
4. Scheduled reports and optional client notifications.

Implement these as incremental vertical slices in the existing application. Do
not bootstrap another application, redesign the shell, replace authentication,
or rebuild the already integrated business modules.

## 1. Read first and preserve

Required references:

- [Architecture enforcement](api-architecture-rules.md).
- [Permission standard](permission-standard.md).
- [Database design](../database-schema-design.md), especially reporting,
  notifications, artifacts, audit and concurrency.
- [Document/worker foundation](06-document-delivery-foundation.md).
- [Reporting plan](11-reporting.md) and [notification policies](12-notification-policies.md).
- [Estimate lifecycle and revisions](07-estimates.md).
- Current source contracts, schema, migrations, module public interfaces and tests.

This specification refines those plans for the current implementation. Some older
documents describe obsolete scaffolding. Do not restore OAuth, an authentication
bypass, `.view`/`.manage` permissions, tiny top-level business modules, or Redis
queues because an older plan mentions them. Current code uses payment status
`confirmed`, not the old design's `received`. The API architecture allowlist also
includes `media`, although the older architecture prose lists six modules.

If a business-rule conflict remains, record it and obtain a decision before
changing behavior. An implementation convenience is not permission to change an
approved financial rule.

### 1.1 Original baseline and current refinement

The table below records the initial four-task handoff, not a fresh inventory.
Reporting/exports/scheduling/notification code now exists and must be inspected and
reused. See section 1 of the [refined reporting spec](11-reporting.md) for the current
UI-preview/live-fallback distinction. Do not recreate working modules from this table.

| Capability                                                       | Current state                                                       | Required change                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Identity, staff, roles, settings, media, clients, catalog, sales | API-backed                                                          | Extend narrow public capabilities only where needed                            |
| Dashboard                                                        | Static data in `ui/src/features/dashboard/pages/dashboard-page.tsx` | Replace mock statistics and unsupported claims with live authorized data       |
| Analysis and schedules                                           | POC in `ui/src/features/reports/pages/`                             | Integrate real queries, forms, persistence and history                         |
| Notification settings                                            | Local-state POC in `ui/src/features/notifications/`                 | Persist rules and expose delivery state                                        |
| Password-reset email                                             | Resend adapter in `api/src/integrations/email/resend.ts`            | Preserve behavior; introduce reusable transport without coupling auth to sales |
| PDF work                                                         | `support/jobs`, currently `prepare_pdf` only                        | Add typed business-message preparation; preserve PDF worker behavior           |
| Artifacts                                                        | Private storage, owner authorization, cleanup                       | Add report output and attachment-aware retention                               |
| Estimate revisions                                               | Implemented; issued revision supersedes predecessor                 | Respect this lifecycle in reporting, sends and reminders                       |

### 1.2 Non-negotiable repository rules

- Keep `api/` and `ui/` directly at the root. No `apps/`, `packages/`, `infra/`,
  shared contract package, new router or second HTTP client.
- API owns OpenAPI fragments, Drizzle models and migrations. UI consumes the
  existing spec link/generation pipeline. Never hand-author duplicate endpoint
  DTOs, network schemas or generated files.
- Preserve the modular monolith: routes → controllers → services → repositories;
  mappers are optional. Table imports/SQL stay in repositories.
- Internal features of one module may call each other's services. Cross-module
  collaboration goes through root `index.ts` or `<module>.public.ts`; do not
  import another module's repository or call its HTTP endpoints internally.
- Public interfaces expose capabilities and DTOs, not repositories or tables.
  Propagate the existing transaction type when an atomic cross-module action
  needs it. Do not construct a second transaction inside that operation.
- Keep provider/storage infrastructure business-agnostic. Compose dependencies
  in module roots and `api/src/app.ts`, not through global service lookups.
- Keep architecture ESLint rules enabled and extend their tests for new paths.
  Do not add exceptions to make cross-domain imports pass.
- Source OpenAPI, Drizzle definitions and authored migrations are versioned.
  Generated schemas/clients, builds, rendered PDFs and caches remain ignored.
- Preserve existing changes. Inspect the migration journal and use forward
  migrations for the current applied baseline; never reset data or rewrite
  applied migrations based on old “nothing has been applied” instructions.

## 2. Ownership and folder layout

The following are additions within existing roots, not a replacement tree.
Use the existing `*.routes.ts`, `*.controller.ts`, `*.service.ts` and
`*.repository.ts` naming conventions.

```text
api/
├── openapi/
│   ├── openapi.yaml                    # registers referenced paths
│   ├── modules/reporting/              # analysis, exports, schedules, runs
│   ├── modules/sales/                  # send/history endpoints
│   ├── modules/settings/               # notification rules
│   └── modules/clients/                # preference overrides
├── db/
│   ├── schema/reporting.ts             # schedules, recipients, runs
│   ├── schema/notifications.ts         # rules, overrides, messages, dispatches
│   ├── schema/jobs.ts                  # extend existing job allowlist
│   ├── schema/artifacts.ts             # reuse; do not duplicate
│   └── migrations/                     # forward, reviewed schema + permission changes
└── src/
    ├── modules/
    │   ├── reporting/
    │   │   ├── index.ts
    │   │   ├── reporting.public.ts
    │   │   ├── analysis/{routes,controllers,services,mappers}/
    │   │   ├── exports/{routes,controllers,services}/
    │   │   ├── schedules/{routes,controllers,services,repositories,mappers}/
    │   │   ├── runs/{routes,controllers,services,repositories,mappers}/
    │   │   └── shared/{services,types}/ # metric definitions, snapshot renderer
    │   ├── sales/
    │   │   ├── shared/{services,repositories}/ # public reporting read models
    │   │   ├── notifications/{routes,controllers,services,repositories}/
    │   │   └── estimates/services/     # expiry + existing revision rules
    │   ├── settings/notifications/{routes,controllers,services,repositories}/
    │   ├── clients/                    # preferences follow existing layer layout
    │   └── identity/                   # narrow eligible-recipient public API
    ├── support/
    │   ├── notifications/             # generic transport queue only
    │   │   ├── index.ts
    │   │   ├── notifications.public.ts
    │   │   ├── services/
    │   │   ├── repositories/
    │   │   └── types/
    │   ├── jobs/                      # existing durable preparation support
    │   └── artifacts/                 # existing publication + cleanup support
    └── integrations/email/            # Resend + injectable test transport

ui/src/
├── api/generated/                     # ignored generated contracts/hooks
├── api/http.ts                        # existing shared Axios mutator
├── lib/query-client.ts                # existing shared QueryClient
├── components/{ui,management,layout}/  # shared primitives; no feature copies
└── features/
    ├── dashboard/                     # existing route/page retained
    ├── reports/
    │   ├── index.ts                   # public reporting UI/hooks
    │   ├── pages/                     # existing entry naming retained
    │   ├── components/                # filters, sections, schedule/run components
    │   ├── api/                       # generated-hook composition/invalidation
    │   └── lib/                       # i18n, display helpers, form adapters
    ├── notifications/                 # existing settings page retained
    ├── settings/                      # public notification-policy API adapters
    ├── clients/                       # client preference panel
    └── sales/                         # send dialog and delivery history
```

Do not create empty directories just to match this diagram. Follow the current
page entry filenames; keep pages thin and extract cohesive page-local components.
Do not reorganize unrelated working features to impose a different naming scheme.

### 2.1 Public boundaries that need implementation

- Sales exposes transaction-aware, read-only reporting projections. SQL over
  invoices, lines, payments, estimates and deliveries stays in sales repositories.
  Return bounded aggregates/pages, not all historical rows to sum in JavaScript.
- Catalog exposes current product/category classification if sales projections
  cannot already supply it through existing public services. Clients exposes
  authorized display/recipient data and effective preferences.
- Reporting owns metric orchestration, schedules, snapshots and report output.
  It must not write sales records or import sales repository internals.
- Settings owns global notification policy. Clients owns per-client overrides.
  Sales owns business-event eligibility, composition and document send status.
- Identity exposes active staff lookup and permission checks for schedule
  recipients. Never return temporary passwords, reset tokens or session secrets.
- Generic notification support exposes enqueue, status, retry and cancel by
  message ID, with an optional transaction. It knows no invoice/client IDs.
- Dispatch rows are producer-owned associations in a shared table: sales writes
  sales-source rows; reporting writes report-run rows. The sender does not own
  or inspect these business associations.
- Use injected policy-change/identity-change callbacks, composed at the app
  root, when revocations need producer-side cancellation. Avoid circular imports
  from identity or settings back into sales/reporting.
  Required invalidation must be transactional or durably queued with the change,
  never a fire-and-forget callback that disappears on restart. Producers perform
  the business lookup and cancel ready message IDs through notification support.
- UI `reports` is the existing name for the reporting domain. Add an explicit
  `reports → reporting` generated-tag mapping to UI boundary rules and tests.
  Dashboard consumes its hooks through `features/reports/index.ts`.
- Keep the existing notifications page, but consume settings-owned generated
  operations through `features/settings/index.ts`. Do not exempt it from feature
  boundaries or import generated settings internals directly.

## 3. Shared delivery contract

For every slice:

1. Define source OpenAPI paths, stable operation IDs, domain tags, schemas,
   examples, security, permissions, pagination and errors.
2. Generate API contracts and UI schemas/Orval TanStack Query hooks.
3. Implement DB changes, repository, service, controller and route adapters.
4. Integrate the actual page with generated operations and shared components.
5. Add integration/UI/permission tests and update implementation status.

Use `reporting`, `sales`, `settings`, `clients` tags to preserve generated module
ownership. Backend validation uses generated Zod contracts. Form adapters may
derive UI-only transformations from these contracts, but may not redefine request
shapes. Internal job/snapshot schemas are explicitly versioned implementation
types, not competing HTTP contracts.

All endpoints require a normal authenticated session unless they are a separately
approved provider callback. Restricted password-change sessions cannot use them.
Reuse existing error envelopes with `code`, `message`, `requestId`, and current
optimistic-concurrency/error conventions. Document 400, 401, 403, 404, 409, 429
and 503 where applicable. Never return provider credentials or raw SQL errors.

Lists use the existing `{ items, total, limit, offset }` convention with bounded
limits and allowlisted sorting. Mutations of existing mutable resources use
`expectedVersion`. Retried asynchronous requests use a client-generated request
UUID and canonical payload comparison: same identity/same input returns existing
work; same identity/different input returns 409. Do not generate a fresh key on
each retry or button double-click.

## 4. Permissions and shared authorization

Permission keys are explicit slugs, never numeric permission IDs. Add grants to
the existing catalog/seed migrations and permission matrix. Grant new capabilities
to the protected administrator role through the existing migration pattern;
preserve other roles, then let administrators assign new grants deliberately.
Do not add a role-name bypass or wildcard administrator check.

| Resource                          | Supported actions in this scope                                                 |
| --------------------------------- | ------------------------------------------------------------------------------- |
| `reports`                         | `read`, `export`                                                                |
| `reports.sections`                | One explicit key per section below                                              |
| `report_schedules`                | `read`, `create`, `update`, `enable`, `disable`, `archive`, `restore`, `delete` |
| `report_runs`                     | `read`, `retry`                                                                 |
| `notification_rules`              | `read`, `update`, `test`                                                        |
| `client_notification_preferences` | `read`, `update`, `delete` (reset override to inherit)                          |
| `invoices`, `estimates`           | Add `send`; reuse existing read permissions                                     |
| `notification_dispatches`         | `read`, `retry`, `cancel`, always combined with owner access                    |

Unsupported operations must not appear as working matrix switches: no create/delete
for a fixed rule registry, no edit/delete of captured runs, no generic public
message creation API. Archive is not delete. Schedules may be deleted only before
any run exists; otherwise archive/restore preserves history.

Report section keys, exactly:

```text
summary                 revenue              collections
outstanding             overdue              payment_methods
pending_cheques         vat                  sales_by_client
sales_by_product        sales_by_category    estimates
deliveries
```

The full key is, for example, `reports.sections.collections`. These are deliberate
data-access grants, not synonyms for source-resource permissions.

- Analysis requires `reports.read` plus every requested section grant. An
  explicitly forbidden section returns 403, not a misleading zero-valued result.
- Default dashboard sections are the intersection of supported sections and the
  user's grants. No permitted sections produces an authorized empty state.
- `summary` exposes its defined financial aggregates only. It does not authorize
  detailed collection rows or imply all other section grants.
- Report access does not implicitly grant invoice/client/payment detail access.
  Hide/disable drill-through links unless the corresponding resource is readable.
- Export requires `reports.read`, `reports.export` and all selected section grants.
- Schedule management also requires the applicable schedule action, schedule
  read, reports read, and grants for all selected sections. Eligible recipients
  must be active staff with reports read and all selected section grants.
- Run viewing requires `report_runs.read`, reports read and all captured section
  grants. Run PDF/CSV download additionally requires reports export. Schedule
  creation must flag recipients missing run read/export; exclude them until the
  required grants are present. The approved summary/PDF email requires these
  grants too, not just recipients who intend to open the authenticated link.
- Dispatch history requires dispatch read plus owner read. Retry additionally
  requires dispatch retry, the original send/production authority and current
  eligibility. Cancel requires dispatch cancel plus owner read.
- Client preferences require clients read plus their own action grant. These
  permissions do not grant access to all company notification settings.

API guards are authoritative; services recheck current actors and permissions
within relevant mutation transactions. All UI rendering uses shared `Can`;
non-render decisions use the existing authorization hook/helper. No scattered
`permissionKeys.includes(...)` checks. Update route guards, sidebar/mobile
navigation, role-matrix labels and tests together. Clear sensitive Query cache
on logout/session changes using existing identity behavior.

## 5. Task 1 — Live dashboard and analysis

### 5.1 Contracts

| Method and path            | Behavior                                                                   |
| -------------------------- | -------------------------------------------------------------------------- |
| `GET /v1/dashboard`        | Authorized live overview; same metric service as analysis                  |
| `GET /v1/reports/analysis` | Selected sections with totals, chart series and bounded detail rows        |
| `GET /v1/reports/sections` | Registry metadata and current user's available sections; no financial data |

Analysis input: `from`, `to` (inclusive calendar-date UI range), IANA `timezone`,
optional currency/client/product/category filters, ordered unique section keys,
bucket (`day`, `week`, `month`), detail section, `limit`, `offset` and allowlisted
sort. The service converts the calendar range to `[start, endExclusive)` once.
Date-only business fields remain date comparisons; do not shift them by converting
midnight to another timezone. Timestamp events use the normalized UTC boundaries.

Return normalized filters, metric-definition version, `capturedAt`, timezone,
period boundaries, currency groups, section payloads and pagination metadata.
Never report totals for the current page as totals for the whole filtered set.
Declare all response variants in OpenAPI; do not return untyped arbitrary JSON.

Implementation defaults: current company-local month, `Africa/Casablanca` fallback,
default page size 25/max 100, maximum requested period 366 days. Configure and
document these technical limits centrally. A too-wide range produces a clear
validation error; never silently truncate financial results.

### 5.2 Metric dictionary — one source of truth

| Section             | Definition and exclusions                                                                                                                           |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `summary`           | Invoiced net/VAT/gross during period, confirmed collections during period, outstanding at capture; label time bases separately                      |
| `revenue`           | Invoice `issue_date` in period, currently issued/sent and not cancelled; drafts/estimates/delivery notes are not revenue                            |
| `collections`       | Currently confirmed payments whose `collected_on` is in period; includes installments; excludes pending/cancelled payments                          |
| `outstanding`       | Valid issued invoices' gross less confirmed allocations at capture; do not subtract pending cheques; use existing balance rules                     |
| `overdue`           | Outstanding > 0 and due date before capture-local date; due today is not overdue                                                                    |
| `payment_methods`   | Same collection basis, grouped by supported payment method                                                                                          |
| `pending_cheques`   | Pending cheque records at capture, separately from collected cash                                                                                   |
| `vat`               | Stored invoice VAT totals only where VAT was applied; no default/recomputed tax                                                                     |
| `sales_by_client`   | Invoice sales grouped by client, using stored financial totals                                                                                      |
| `sales_by_product`  | Invoice line sales, item quantities and normalized package weight; manual lines a distinct group                                                    |
| `sales_by_category` | Same line basis, classified by the product's current category; explicit uncategorized/manual groups                                                 |
| `estimates`         | Issued/accepted/rejected events in period from lifecycle timestamps; expiry from recorded expiry transition; conversion from linked issued invoices |
| `deliveries`        | Delivery-date activity and status at capture; prepared planned weight separate from delivered/acknowledged weight                                   |

Additional rules:

- Use stored Decimal/decimal-string money conventions, not binary floating-point
  financial arithmetic. Group by currency; never combine currencies into one sum.
- Weight sold = item quantity × stored variant/package weight, normalized to kg.
  A manual line lacking weight reports unknown weight, not an invented zero.
- Pending payment reservations may affect available-to-record amounts, but do not
  count as collection or reduce accounting outstanding. Reuse existing balance
  definitions rather than inventing a second payment calculation.
- Avoid line × payment join fan-out. Aggregate each relation before combining.
- Current cancellation/correction state affects live historical analysis. A late
  January payment entered in February can change live January collections.
- Balance sections are at capture, not an assertion about a past month-end state.
  Apply entity/currency filters, but do not accidentally restrict all outstanding
  invoices to invoices issued inside the activity period.
- Estimate lifecycle counts may overlap. Report converted estimate count and
  resulting invoice count separately; one estimate can produce many invoices.
  Superseded documents remain historical events, not current actionable offers.
- There is currently no `expired_at` column. Add a nullable transition timestamp
  with task 4 expiry. Until then, do not fabricate historical expiry events from
  `updated_at` or `valid_until`; disclose unavailable historical coverage.
- Expose filter applicability per section. A product filter must not silently
  claim to apportion invoice-level payments to individual products. Reject
  unsupported section/filter combinations; UI disables them with an explanation.
- Dashboard and analysis share definitions, normalized filters and read service.
  Gather a response in one consistent database read snapshot. Never infer values
  from existing UI hardcoded arrays or perform N+1 fetches per row.

### 5.3 UI and state

- Preserve `/dashboard` and `/reports`; use the approved visual design in
  [11-reporting.md](11-reporting.md), not the old table-first analysis page.
  Replace sample values/trends with actual authorized data; never silently use
  preview fixtures as a fallback for missing API data.
- Dashboard: compact KPIs, dominant sales/collections trend, actionable attention
  panel, receivables aging and distinct-estimate progression. No transaction table.
- Reports: Sales, Collections, Clients, Products, Estimates and Deliveries topics,
  relevant filters and distinct meaningful visualizations. Display “Live data”,
  activity period, currency and actual capture time. Balance widgets describe
  capture-time balances, not a fictional historical month-end snapshot.
- Contextual drill-down exposes bounded, paginated exact records matching the
  selected chart segment and criteria. Reuse shared tables/drawers; do not retain
  the old full reporting screen under a renamed tab or button.
- After chart/detail/export parity is verified, remove `/reports/live`, its page,
  obsolete links and unused legacy components. Keep reporting APIs, exports and
  frozen-run access. Old bookmarks may redirect to the new reports route.
- Currency must be explicit. Multi-currency responses render separate totals,
  never a decorative summed total.
- Filters, selected topic/section, drill-down segment, sorting and pagination belong in URL search params.
  Generated Query keys include all normalized filters; no mirrored server-data
  context or localStorage financial cache.
- Add feature-level invalidation helpers. Issue/cancel/revise/convert documents,
  confirm/cancel/restore/delete payments, delivery transitions and relevant catalog
  classification changes invalidate live reporting queries. Do not mutate frozen
  report snapshots through cache invalidation.

### 5.4 Task 1 acceptance gate

- Apply the visual/metric/drill-down gates in section 8 of the refined reporting
  spec, including no remaining mock imports and no second classic reporting page.
- A deterministic fixture proves dashboard/analysis parity for the same criteria.
- Tests include installments, pending cheques, cancelled records, late collection
  dates, VAT off/on, gram/kg variants, manual lines, estimate revisions and mixed
  currencies. Exercise query plans on a meaningful synthetic dataset.
- Section permissions, drill-through restrictions and unsupported filter pairs
  are tested at API and UI boundaries. No hidden totals leak via summary/exports.
- Loading, empty, error, unauthorized and retry states are real, not fake success.

## 6. Task 2 — Manual downloads

### 6.1 Endpoint and behavior

`POST /v1/reports/exports` accepts the same normalized analysis criteria plus
`format: pdf | csv`. Require read/export and all selected section grants.

Return file bytes with the correct content type and a safe `Content-Disposition`
filename. Extend source contracts and generated response handling for binary
downloads; use shared Axios through generated operations, not a handwritten
fetch client. Revoke browser object URLs after download.

This operation **does not** create a schedule, report run, outbound message or
notification dispatch. It sends no email. Capture one consistent dataset and
render from that in-memory snapshot; subsequent requests may produce newer data.
Audit actor, normalized criteria, sections, format, capture time and outcome,
without recording all report rows or signed URLs in logs.

### 6.2 Format requirements

- PDF: A4 visual summary with company identity, title, period/timezone/capture time,
  currency/metric basis, exact figures, selected diagrams and concise factual
  highlights. No pages of raw tables by default. Use page numbers, reliable wrapping
  and page breaks; repeat table headings only if an explicit detail appendix is
  supported. Do not apply sales-invoice numbering/layout assumptions to reports.
- CSV: UTF-8, documented header/section structure, escaped quotes/newlines and
  deterministic decimal/date formatting. Include section/currency/time-basis
  identifiers so combined sections are unambiguous. Protect spreadsheet formula
  injection for untrusted text beginning with formula/control prefixes.
- Use the current PDF/font infrastructure; do not add a browser-rendering service
  solely for report export. Share composition/metric definitions with frozen runs
  and interactive charts; verify numeric and semantic parity across renderers.
- Technical defaults: PDF max 2,000 detail rows, CSV max 10,000; validate before
  rendering and return `EXPORT_TOO_LARGE` with instructions to narrow filters.
  Totals remain whole-filter totals. Never silently cut rows or create a background
  run as a fallback. Add time/memory bounds and per-user export rate limiting.
- Manual files are not persisted in object storage. Scheduled artifacts keep
  the existing 8 MiB artifact limit unless separately reviewed; do not enlarge
  all upload limits to make a report fit.

### 6.3 Task 2 acceptance gate

- Export totals match analysis fixtures at the same snapshot; all selected
  sections, ordering, filters and currencies are preserved.
- Inspect rendered one-page, multi-page, empty and long-name PDFs. Test CSV
  Unicode, formula injection and malformed filenames.
- Verify no rows are inserted into schedules/runs/outbox/dispatch tables.
- Permission denial, too-large output and network failure produce useful UI errors.

## 7. Task 3 — Generic delivery and document sending

### 7.1 Data models

Use the approved model names and fields. Required additions/refinements below
must be reflected in Drizzle, migration, source contracts where exposed, and the
database design document during implementation.

| Model                          | Required fields and constraints                                                                                                                                                                                                                                                               |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outbound_messages`            | UUID PK; to, CC, allowed from/name; immutable subject/html/text; unique namespaced idempotency key; payload hash; status queued/sending/sent/failed/cancelled; attempts/maxAttempts; availableAt; leaseToken/lockedUntil; sentAt; providerMessageId; sanitized lastErrorCode; createdAt/actor |
| `outbound_message_attachments` | UUID PK; message FK; immutable private object key, safe filename, content type, positive size, position; unique(message, position); createdAt; no business artifact FK                                                                                                                        |
| `notification_dispatches`      | UUID PK; allowlisted sourceType/sourceId; eventKey; stable occurrenceKey including recipient identity; unique message FK; unique(sourceType, sourceId, eventKey, occurrenceKey); createdAt/actor                                                                                              |
| Existing `background_jobs`     | Add versioned `prepare_notification` job type; retain existing PDF type; payload contains stable owner/version/request inputs, not secrets                                                                                                                                                    |

Indexes: eligible-message status/availableAt, stale sending leases, provider ID,
dispatch source/history and job claims. Checks enforce nonnegative attempts,
positive budgets, valid sending leases and completion timestamps. Ready payloads
and attachments are immutable; only delivery metadata changes.

No invoice/client/report columns belong in `outbound_messages`. A producer-owned
dispatch maps a business record to its generic message. A transport test message
may have no dispatch. Generic sender code must remain runnable against a test
database containing only message/attachment tables and storage/transport fakes.

### 7.2 Worker and transaction flow

```text
Authorized business command
  → lock/check owner + policy + expectedVersion
  → commit durable preparation job with stable request identity
  → worker prepares exact PDF and escaped email outside a DB transaction
  → lock/check current eligibility + worker lease
  → atomically enqueue message + attachments + dispatch and complete job
  → generic worker claims ready message, commits claim, calls Resend
  → persist transport result under lease fence
  → business reconciler updates eligible document send metadata
```

- Extend job claim APIs to select supported types. The existing PDF worker must
  not claim notification jobs and fail them as `UNSUPPORTED_JOB`.
- Claims use row locks/`SKIP LOCKED`, attempt budgets, leases and fresh fencing
  tokens. Heartbeats/completion match the token. Recover expired leases, including
  a crash on the final attempt. Exponential backoff/jitter and concurrency are bounded.
- No open DB transaction while generating PDFs, uploading, downloading attachments
  or contacting Resend. Enqueue + dispatch + preparation completion is atomic.
- Same idempotency key and different canonical payload is an error, never an
  overwrite. A retry uses the exact same recipients, body and file keys.
- Use provider idempotency where supported. Before implementation verify current
  Resend official limits, idempotency validity and retry responses; keep the retry
  horizon compatible. Lease fencing cannot undo a provider send. Ambiguous
  timeouts beyond the safe retry window must be visible for operator review,
  not blindly resent. Do not promise exactly-once email delivery.
- `sent` means provider accepted, not delivered/read by the recipient. UI labels
  this accurately. Delivery/open tracking and provider webhooks are outside this
  scope; no unverified public callback endpoint is needed.
- Automatic retry stops for permanent failures. An authorized explicit retry
  increases the attempt budget without erasing history or changing content.
- Cancellation atomically changes queued work to cancelled, racing the claim.
  Already-sending/accepted mail cannot be guaranteed retractable.
- Configure and redact Resend credentials centrally. Sender address must be a
  configured permitted identity, not arbitrary input. Add an injectable recording
  transport for tests/local development; never send live customer mail in tests.
- Existing reset delivery stays supported and tested. Password reset tokens/body
  must not appear in business dispatch history or general notification logs.

### 7.3 Storage integration — mandatory before enabling sends

Current artifact cleanup only checks artifact references and `.pdf` keys.
Before adding attachments, extend `referencedKeys` and safe cleanup to consider
attachment references and future report CSV files.

- Pin immutable object keys for attachments. Replacing the current document PDF
  through regeneration must not change an already prepared email attachment.
- Coordinate pin creation and deletion with the same storage-reference locking
  protocol. A “check then delete” race must not allow a newly pinned key to be
  removed. Add a concurrency test, not just a second reference query.
- Never persist expiring signed URLs as attachments. Read approved private keys
  through the storage interface, enforce size/content-type limits and safe names.
- Preserve all objects referenced by retained artifacts or message attachments.
  Do not delete issued/saved reports to fit a free storage quota.
- Use the existing unreferenced-object grace period. Failed uploads/publications
  leave reclaimable orphans, not exposed or overwritten objects.
- Bodies/addresses are personal data. Define configurable payload retention and
  document the default before enabling cleanup. Preserve minimal message identity
  while referenced by dispatches; do not cascade-delete business history.

### 7.4 Business endpoints

| Method and path                                                                   | Contract and authorization                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `POST /v1/invoices/{id}/send`                                                     | Invoice read + send; expectedVersion, requestId; returns 202 preparation ID/state      |
| `POST /v1/estimates/{id}/send`                                                    | Estimate read + send; same semantics                                                   |
| `GET /v1/documents/{documentType}/{id}/notifications`                             | Owner read + dispatch read; allowlisted types; paginated preparation/delivery timeline |
| `POST /v1/documents/{documentType}/{id}/notifications/{dispatchId}/retry`         | Owner/send + dispatch retry; validate dispatch ownership and eligibility               |
| `POST /v1/documents/{documentType}/{id}/notifications/{dispatchId}/cancel`        | Owner read + dispatch cancel; queued only; 409 if already claimed                      |
| `POST /v1/documents/{documentType}/{id}/notification-preparations/{jobId}/retry`  | Same send authority; retry failed preparation before a dispatch exists                 |
| `POST /v1/documents/{documentType}/{id}/notification-preparations/{jobId}/cancel` | Same owner/cancel authority; cancel unstarted preparation                              |

The history contract must represent preparing/failed preparation separately from
queued/provider-accepted/failed/cancelled delivery. Do not invent a fake message
row merely to display unfinished PDF work. Job IDs and dispatch IDs are distinct.

Initial manual send rules:

- Allow issued/sent invoices and issued/sent/accepted estimates. Block drafts,
  cancelled, rejected, expired and superseded estimates. Preserve current invoice
  payment state; sending is not a payment transition.
- Resolve current client email/preferences through the clients public API. Show
  the recipient before confirmation. Frozen PDF identity remains frozen even if
  the current contact email changed; disclose this distinction.
- Missing/invalid email, explicit opt-out or disabled applicable send rule blocks
  delivery with a specific error. No arbitrary recipient bypass in this scope.
- Add the minimum global rule/preference models and eligibility resolver from
  task 4 in this slice so manual send cannot temporarily bypass consent. Rules
  remain disabled until deliberately configured/enabled; no auto-enable migration.
  Include the minimal authorized rule configuration and client preference UI in
  this slice as well; normal users must not need SQL edits to enable manual sends.
- The send action enqueues work, not immediately `sent`. A durable producer-side
  reconciler handles accepted outcomes after crashes and sets `sentAt` once.
  Transition issued → sent only when still eligible. An accepted estimate remains
  accepted; a later cancellation/supersession must never be reversed by a delayed
  delivery outcome. State/version changes do not rewrite printable content.
- A retry does not mean a new send. An explicit resend is a new confirmed request
  with a new identity and an auditable timeline entry.

### 7.5 UI and acceptance gate

- Add Send to the existing document main action bar with shared button variants,
  a recipient/attachment confirmation dialog and preparation/delivery timeline.
  Do not introduce a second action bar or standalone reason inputs in the page.
- Use generated mutations and poll only outstanding work with bounded intervals.
  Explain missing email, disabled policy, revoked access and permanent failure.
- Test two workers, duplicate HTTP requests, stale leases, crash after provider
  acceptance, retry budget exhaustion and partial attachment failure.
- Test owner access, dispatch-ID substitution, revoked staff permissions, client
  opt-out and document cancellation/supersession during preparation.
- Verify regeneration/cleanup cannot alter or delete queued attachments. Run
  existing password-reset, PDF, receipt and artifact regression tests.

## 8. Task 4A — Scheduled reports

### 8.1 Models

| Model                        | Fields and constraints                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report_schedules`           | UUID PK, name, daily/weekly/monthly frequency, nullable ISO weekday/monthDay, localTime, IANA timezone, previous_day/previous_week/previous_month period, ordered unique includedSections, enabled, nextRunAt, version, archivedAt, standard audit fields                                                                   |
| `report_schedule_recipients` | Composite PK(scheduleId, userId), real user FK, createdAt/actor; no free-text recipient emails                                                                                                                                                                                                                              |
| `report_runs`                | UUID PK, required schedule FK, scheduledFor, periodStart/end, immutable configurationSnapshot, nullable dataSnapshot/dataCapturedAt set together, status queued/running/succeeded/failed/cancelled, attempts/maxAttempts, nextAttemptAt, leaseToken/lockedUntil, startedAt/finishedAt, sanitized errorCode, createdAt/actor |

Unique `(schedule_id, scheduled_for)`. Index active schedules by nextRunAt and runs
by status/retry/lease expiry. Required schedule FK restricts deletion once history
exists. Add `cancelled` to the older planned run states so paused unstarted work
is represented honestly; document it in source schema and contracts.

Snapshot schema has its own version and records metric-definition version,
ordered sections, normalized criteria, timezone/boundaries, company identity for
rendering and data totals/rows. Snapshot size obeys export bounds. Never store
credentials, live signed links, or an unbounded query result in JSON.

### 8.2 Endpoints

| Method and path                                      | Behavior                                                                                            |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `GET/POST /v1/report-schedules`                      | Filtered list / create; create returns 201                                                          |
| `GET/PATCH /v1/report-schedules/{id}`                | Detail / expectedVersion update                                                                     |
| `POST /v1/report-schedules/{id}/enable`, `/disable`  | Explicit versioned actions                                                                          |
| `POST /v1/report-schedules/{id}/archive`, `/restore` | Archive disables; restore remains disabled                                                          |
| `DELETE /v1/report-schedules/{id}`                   | Only unused schedules; expectedVersion required                                                     |
| `GET /v1/report-schedules/eligible-recipients`       | Search active eligible staff for selected sections; narrow DTO; register before `/{id}`             |
| `POST /v1/report-schedules/preview`                  | Existing read-only occurrence/period preview; does not provide financial chart data or persist work |
| `GET /v1/report-schedules/{id}/runs`                 | Bounded history with production and delivery separately                                             |
| `GET /v1/report-runs/{id}`                           | Captured configuration/data and artifacts, or honest pending state                                  |
| `POST /v1/report-runs/{id}/retry`                    | Retry failed production, preserving any captured snapshot                                           |
| `GET /v1/report-runs/{id}/artifacts`                 | Current authorized report file metadata                                                             |

Reuse `GET /v1/artifacts/{id}/download` with a reporting owner adapter. This route
currently resides in sales composition; register it exactly once and compose
owner dispatch at the app/support boundary. Do not register a competing route,
make reporting import sales internals, or make report files publicly accessible.

Separate production retry from message retry. Expose report-run notification
history/retry/cancel through the same dispatch service with report-owner
authorization, extending its document-type allowlist explicitly. A delivery
failure does not mark a successfully produced report failed.

### 8.3 Scheduling and immutable capture

- Frequency selects cadence; period selects the previous complete day/week/month
  relative to the occurrence's local date. Weekly periods are ISO Monday–Sunday.
  Require weekday only for weekly, monthDay 1–28 only for monthly; irrelevant
  fields null. Validate real IANA timezones, default to company timezone.
- Store due instants as UTC and compute each next run from local calendar rules,
  not by adding 24 hours. Test Casablanca timezone changes. For nonexistent local
  times use the next valid instant; for repeated times run once at the earlier
  instant. Document this deterministic DST policy.
- Claim/update due schedules transactionally. Create one run per occurrence and
  advance nextRunAt atomically. Default bounded catch-up: at most 7 missed
  occurrences per schedule per sweep; continue later sweeps rather than silently
  discard older work. Prevent an unbounded startup burst.
- Editing changes future unmaterialized occurrences, not existing run config.
  Disable/archive cancels queued, uncaptured runs and queued report emails.
  A running capture may complete for history, but must not enqueue new mail once
  the schedule is disabled. Re-enabling computes the next future occurrence;
  intentionally paused time is not backfilled.
- Before changing cadence/timezone, materialize already-due occurrences using the
  old configuration under the same schedule lock, subject to the catch-up bound.
  If more remain, reject the edit with an actionable catch-up-in-progress conflict;
  do not silently recalculate missed occurrences with the new configuration.
- Runs are the durable work records. **Do not duplicate report work in
  `background_jobs`.** Reuse worker patterns, not a second competing job identity.
- Capture all sections in one consistent DB read transaction; persist results
  and actual capture timestamp once, under lease fencing. Render PDF/CSV from
  saved results outside the transaction. A crashed renderer never recaptures
  newer financial data for that run.
- Publication is idempotent per `(report_run, runId, 1, format)`. Publish required
  PDF and CSV before production success. If rendering exceeds limits, mark a
  clear failure; no silent truncated “complete” report.
- Completion transaction rechecks active schedule/recipient permissions, enqueues
  eligible per-recipient messages/dispatches once and marks production succeeded.
  An ineligible recipient is visibly skipped with a reason, not silently sent.
- Revised approved email format: a concise summary derived from the frozen run,
  the frozen PDF attachment and an authenticated app link. This intentionally
  replaces the original link-only policy; implemented by the reporting producer in sequence 11.
  CSV stays available as a download, not an automatic email attachment.
  Recheck active staff, reports read/export, run read and all captured section
  grants before enqueue. Pin immutable private attachment keys and enforce sizes;
  do not generate a fresh PDF from live data during delivery retries.
- App/download access always rechecks present permissions. Email copies cannot
  be recalled after delivery or guaranteed recalled after claim/provider acceptance.
  Disclose that limitation in schedule configuration; apply durable producer-side
  cancellation to unclaimed queued work on revocation/disable. No new business
  lookup is introduced into the generic delivery worker.
- Later schedule edits, payments, client/catalog changes or permissions do not
  rewrite snapshots or stored outputs. Revoked access prevents opening/downloading
  them. Do not claim to reconstruct historical database state or regenerate a
  successful run using live data.

### 8.4 Pages and acceptance gate

Preserve `/reports/schedules`, `/reports/schedules/new` and
`/reports/schedules/:scheduleId/edit`. Add a details route
`/reports/schedules/:scheduleId`, its `/runs` view, and `/reports/runs/:runId`.

- List: search, frequency, enabled/archive status, next run; main name links to
  details. Use shared table filters and icon-only row actions.
- Form: configuration on the left and visual report/email preview on the right;
  stack on mobile with a collapsible preview. Name, cadence/local time/timezone,
  covered period, selected sections, searchable eligible staff IDs and enabled
  state use TanStack Form and generated contracts. Actions stay in the main header.
  Default preview uses labeled sample data; real preview, if offered, uses authorized
  analysis data with its own period/capture label. Neither saves, sends or queues work.
  Reuse the occurrence-preview API for exact next-run/period labels, not chart values.
- Detail: configuration, recipients, next occurrence and run history; normal-sized
  labeled actions at top. Display upcoming occurrence/period preview.
- Run detail: frozen visual section results and exact figures, period/capture labels,
  PDF/CSV downloads, production status and independent per-recipient delivery status.
  No edit or live-regeneration button. “Accepted” is not “Delivered” without provider
  evidence. Failed email does not change successful production to failed.
- Test DST, month/year boundaries, downtime catch-up, duplicate schedulers,
  disable/re-enable, lease recovery, failed render after capture, recipient grant
  revocation and immutable January output after February corrections.

## 9. Task 4B — Optional client notifications and expiry

### 9.1 Models and fixed event registry

`notification_rules`: UUID PK, unique allowlisted eventKey, enabled default false,
offsetDays, nullable positive repeatEveryDays, permitted sender name/address,
locale, subjectTemplate/bodyTemplate, version and standard audit fields.

`client_notification_preferences`: composite PK(clientId, ruleId), both FKs,
enabled, validated unique CC list, version and standard audit fields. Absence
means inherit; DELETE removes the override, not the rule. For concurrent first
creation, use expectedVersion 0 and reject a conflicting existing override.

Initial registry:

| Event                      | Trigger and safeguards                                                        |
| -------------------------- | ----------------------------------------------------------------------------- |
| `invoice_sent`             | Explicit invoice send command; never trigger again because status became sent |
| `estimate_sent`            | Explicit estimate send command; same no-recursion rule                        |
| `payment_received`         | First confirmed collection; pending/cancelled payments do not notify          |
| `invoice_due_reminder`     | Due-date offset/repeat while issued invoice has outstanding balance           |
| `estimate_expiry_reminder` | Valid-until offset/repeat while current estimate is issued/sent               |

These event names identify producer intent, not proof of successful delivery.
Add no SMS, WhatsApp, arbitrary event builder or marketing campaigns. Delivery
note/customer account creation emails are not part of this initial registry.
Timing fields apply only to reminder rules; irrelevant values must be rejected.

### 9.2 API and policy

| Method and path                                             | Behavior                                                                                     |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /v1/notification-rules`                                | Registry configuration/capabilities                                                          |
| `PATCH /v1/notification-rules/{id}`                         | Versioned configure/enable/disable; fixed event identity                                     |
| `POST /v1/notification-rules/{id}/test`                     | Current authorized operator only, synthetic data, rate limited; no caller-selected recipient |
| `GET /v1/clients/{id}/notification-preferences`             | Defaults, overrides, effective eligibility and reasons                                       |
| `PUT /v1/clients/{id}/notification-preferences/{ruleId}`    | Versioned upsert explicit override/CC                                                        |
| `DELETE /v1/clients/{id}/notification-preferences/{ruleId}` | Versioned reset to inherit                                                                   |

- Effective eligibility = global rule enabled AND (override enabled if present,
  otherwise inherited enabled) AND valid current client email AND eligible source.
  Client opt-in cannot bypass a globally disabled rule. This applies to manual
  sends too; API returns actionable disabled/opt-out/missing-email reasons.
- Restrict template variables to an event-specific allowlist. Escape interpolated
  data; sanitize supported markup or render plain text into a safe email wrapper.
  No executable templates, arbitrary URLs/files, or provider secrets in rule data.
- Each new trigger captures its rule/body/recipient values. Retry preserves that
  payload; changing a rule never mutates an existing ready email.
- Reminder occurrence identity includes event/rule version, source, due-date basis,
  recipient identity and logical reminder date. Prevent duplicate runs on repeated
  sweeps; a policy edit must not automatically resend the same day's reminder.
  Keep a stable logical-occurrence dedupe check independent of template version.
- Payment confirmation sends once per payment's first notification occurrence;
  cancellation/restoration must not automatically replay it. A future explicit
  resend is a separate authorized request. Do not automatically issue/freeze a
  payment receipt merely to send a notification; attach only an already issued
  valid receipt, otherwise use a composed payment confirmation.
- On opt-out, rule disable, email change, relevant source cancellation, estimate
  supersession or payment settlement, producers cancel applicable queued work
  and stop future reminders. Email change cancels stale-recipient ready work;
  it does not rewrite queued payloads. The next eligible occurrence uses new data.
- Staff disable/archive and permission removal must similarly trigger durable
  producer-side cancellation of now-forbidden queued staff-report messages and
  outstanding actor-initiated preparation. Do not rely only on a UI refresh.
- Recheck policy immediately before enqueue. Race-safe cancellation after enqueue
  uses dispatch/message IDs. The delivery worker still must not query business
  data. Already claimed messages may be impossible to recall; disclose this.

### 9.3 Estimate expiry

Add an idempotent sales-owned sweep: when company-local date is later than
`valid_until`, transition only issued/sent estimates to expired. Record
`expired_at`, audit and increment concurrency version, not printable content
version. Accepted, rejected, cancelled, superseded and draft records are excluded.

Use row locks/conditional updates so expiry competes safely with acceptance,
revision issue, sending and conversion. An existing editable revision can still
follow the approved revision rules; expiry must not supersede it or modify any
invoice/payment. Delayed scans record their actual transition time; do not backfill
fictional historical events. Keep validity-end date visible separately in reports.

### 9.4 UI and acceptance gate

- Replace `/settings/notifications` POC switches with persistent rules, generated
  mutations, expectedVersion conflict recovery and explicit test delivery feedback.
- Client details gains an authorized preferences panel: inherit/on/off state,
  effective recipient, CC and ineligibility reason. No automatic subscription on
  edit and no hiding a missing-email problem behind an enabled switch.
- Document timelines show preparation, accepted, failed, cancelled or skipped
  reasons without displaying private staff-report data.
- Test default-disabled rules, inheritance/override reset, malformed email/CC,
  unsafe template data, repeated sweeps, concurrent disable, payment settlement,
  estimate revision/expiry and no unexpected receipt generation.

## 10. Shared UI requirements for every task

Use the existing components, not look-alike local copies:

- `components/layout/app-shell.tsx`, sidebar and mobile navigation remain global.
- `components/management/page-header.tsx` owns sticky header, icon, smaller mobile
  breadcrumbs/back navigation and subtitle visibility. Use the same page container
  width as existing list/detail/form pages.
- `FormActionBar`/page-action context place submit/cancel in the top main bar.
  No separate bottom bar, custom shadow or feature-specific sticky positioning.
- `DataTable`, `DataTableToolbar`, `StatsGrid`, `StatusBadge`, request/page states,
  conflict/confirmation dialogs, `ActionLink`, `MoreActions` and bulk-action order
  helpers are shared resources.
- Keep real tables on mobile with horizontal scrolling and sensible minimum cell
  widths. Do not squeeze words into single-character columns or replace tables
  with cards. Keep first/last-cell padding.
  This applies to schedules/history and contextual record tables, not a requirement
  to put tables in the dashboard or reports overview.
- Filters are inline on desktop and in the existing mobile panel. Keep date range
  last; use official installed Calendar/DateRangePicker and shared searchable
  Combobox for staff/client/entity choices. No native selects or handmade calendars.
- Table row actions are small icon buttons with tooltips; detail actions retain
  labels. Destructive/cancel actions are at the right per shared ordering. Edit
  uses the pencil icon. “More options” is last in the main bar.
- Reuse `Button`/`buttonVariants` sizes, typography and semantic color tokens.
  Respect existing light/dark outlined behavior, success badges and error tokens.
  Do not add hardcoded colors or button-specific font-weight overrides.
- Use TanStack Form for form state, generated Zod contracts for boundary validation,
  TanStack Query/Orval for server state, and URL params for list filters.
  No new global store or duplicate QueryClient/Axios instance.
- All new visible strings use existing i18n conventions. Keep components focused,
  labels/accessibility names available, dialogs titled, and keyboard focus usable.
- Test mobile/tablet/desktop and light/dark mode with long names, large monetary
  amounts, empty lists and permission-restricted users. Shared fixes happen once
  in the shared component with regression coverage.

## 11. Agent work packages and integration gates

This is a handoff plan, not an instruction to run unlimited concurrent agents.
Use at most four active workers if parallel execution is requested. Assign one
integrator ownership of shared contracts, migration ordering and composition.

| Package | Owned work                                                                      | Prerequisite / gate                               |
| ------- | ------------------------------------------------------------------------------- | ------------------------------------------------- |
| A1      | Reporting contracts, permission matrix, metric fixtures, public read interfaces | Resolve definitions before parallel UI/API work   |
| A2      | Reporting API queries and dashboard/analysis UI                                 | A1; parity and authorization tests                |
| B       | Binary exports and shared report renderer                                       | A2; no-email/no-persistence tests                 |
| C1      | Queue models/transport, attachment retention, type-aware job workers            | Contract/model review; crash/concurrency gate     |
| C2      | Minimal rules/preferences, document producers, send UI/history                  | C1; consent and lifecycle tests                   |
| D1      | Schedule/run models, scheduler/capture/render, schedule UI                      | A2 + B + C1; immutable-run gate                   |
| D2      | Full rule/preferences UI, reminders, estimate expiry, revocation integration    | C2 + D1; race/security tests                      |
| E       | Cross-feature regression, documentation and final status                        | All packages; no remaining mock behavior in scope |

For the approved reporting redesign, follow the staged replacement sequence in
[11-reporting.md, section 8](11-reporting.md#8-implementation-sequence-and-release-gates):
aggregate contracts → live visual UI/drill-down → export parity/legacy removal →
scheduler UI → frozen visual output/summary + PDF email → release verification.
Do not repeat already-delivered queue/auth/business-module work to follow this table.

Do not have independent agents edit `api/src/app.ts`, the OpenAPI root, the same
schema/migration journal, generated outputs or shared UI primitives concurrently.
Freeze operation IDs, permission keys and DTOs before UI integration. Every API
change regenerates both consumers; do not hand-patch clients to resolve conflicts.

Each package handoff must state changed files, new contracts/permissions,
migration effects, public API changes, tests run, remaining failures and how to
exercise the feature. “Compiles” alone is not an acceptance gate.

## 12. Validation and operational requirements

Use existing commands and the isolated test-database safeguards:

```sh
pnpm --dir api contracts:generate
pnpm --dir ui api:generate
pnpm --dir api test:architecture
pnpm contract:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
pnpm format:check
```

Run targeted tests while developing, then the full gates. Integration tests must
target the existing isolated local test database, never a production/shared data
store. Report pre-existing failures separately; do not silently weaken tests.

- Add metrics/logs for queue depth, oldest eligible job, retries, terminal failure,
  schedule lag, run capture duration, artifact bytes and provider response class.
  Log IDs/error codes, not email bodies, credentials or raw financial datasets.
- Wire bounded pollers and shutdown cleanup through existing app lifecycle hooks.
  No duplicate timers on hot reload/tests and no concurrent interval re-entry.
- Tests inject clocks, storage and transport; no live Resend calls, real waiting
  for tomorrow's schedule, or destructive bucket cleanup.
- Config includes worker enablement/concurrency, retry/lease limits, export bounds,
  sender identity, UI origin for authenticated links and payload retention.
  Validate environment values and update `.env.example` without real secrets.
- Review new migrations against populated data, including constraints/indexes and
  admin grants. Update schema-design diagrams for changed run/queue states.
- Update reporting/notification sequence docs and README status with evidence;
  remove stale mock entries only for the implemented scope.

## 13. Definition of done and exclusions

- [ ] Dashboard and analysis use live API data and the same tested metric engine.
- [ ] Approved visual reports replace the old page completely; contextual details
      remain accessible and `/reports/live` is no longer a separate screen.
- [ ] Manual PDF/CSV downloads work and never schedule or send an email.
- [ ] Generic delivery has no business-data dependency and survives retries/crashes.
- [ ] Invoice/estimate sending is authorized, consent-aware, durable and visible.
- [ ] Existing PDF regeneration, receipts, frozen data and revisions still work.
- [ ] Attachment publication and cleanup are race-safe and preserve private files.
- [ ] Scheduled reports freeze configuration/results/output; retries never recapture.
- [ ] Scheduler configuration has a safe visual preview and execution history;
      generated reports are visual-first and emails use the frozen summary/PDF.
- [ ] Attachment revocation limits are disclosed; accepted/delivered and
      production/delivery statuses are not conflated.
- [ ] Recipients and authenticated downloads enforce current section permissions.
- [ ] Notification policies/preferences persist; reminders and expiry are idempotent.
- [ ] UI follows shared layout, table, action, theme and permission conventions.
- [ ] Contracts regenerate cleanly; tests/build/lint and visual checks pass.
- [ ] Handoff distinguishes tested behavior from deployment configuration still needed.

Not included: production OCI provisioning, billing/hosting changes, a separate
notification microservice, Redis/BullMQ migration, public customer portals, online
payment gateways, SMS/WhatsApp, AI forecasting, accounting ledgers, stock control,
new tax/legal assumptions, arbitrary report builders, historical database replay,
email open tracking, or a broad redesign/localization of unrelated pages.

Provider credentials/verified sender setup and final production backup/security
checks remain launch prerequisites, not reasons to send real mail during development.
