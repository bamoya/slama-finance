# 11 — Visual reporting, scheduled reports and delivery

[Index](README.md) · Depends on 09/10/06 · Next: [Notification policies](12-notification-policies.md)

Status: reporting baseline and the Excel/section-table refinement implemented on
2026-10-04. Live routes use generated reporting queries. New captures use version 3
with supporting records; older frozen captures and CSV files remain readable.
This revision supersedes the table-first reporting UI and link-only scheduled-email
requirements in older plans. The [agent specification](remaining-features-spec.md)
continues to govern shared architecture, financial definitions and worker guarantees.

## 1. Approved decisions and current baseline

### Approved refinement: section tables, Excel and output selection (2026-10-04)

**Implemented.** This section supersedes older requirements below for
CSV report downloads, mandatory PDF-only attachments and charts without supporting
tables. Older verification notes describe the implementation at that time, not
completion of this refinement.

Implementation notes:

- Migration `0024_numerous_drax.sql` adds the PDF-default schedule output and XLSX
  artifact support; applied locally. Historical run configurations are not rewritten.
- A shared section-table model feeds PDF and Excel. Payment-method rows group by
  method/currency; product export rows break down product/variant package weights.
  Client collections/balances refer to the period's invoice cohort, at capture time.
- Estimate lifecycle records can repeat a document across events. Their amounts are
  not added into a misleading grand total; the section's event metrics remain authoritative.
- ExcelJS creates typed cells, tables, subtotal formulas and A4 print settings. A
  focused DrawingML adapter adds native cell-linked charts. No Python runtime is
  required in the deployed API. Spreadsheet/PDF tooling is used for visual QA only.
- New PDF exports keep the existing 2,000 supporting-row bound; Excel keeps the
  10,000-row spreadsheet bound. Both reject incomplete captures. Selected email
  attachments together must fit the existing 8 MiB limit.

#### Composition shared by PDF and Excel

Every selected analytical section contains its own key figures, charts, supporting
data table and totals, in that order. Do not separate the records into a disconnected
appendix or introduce an opt-in "include details" switch. The overview remains a
concise summary; it does not duplicate every section's records.

```text
PDF report
  Overview · identity / period / capture time / currency
  01 Sales
     Key figures → revenue chart → supporting invoices → totals
  02 Collections
     Key figures → collection / method charts → payments → totals
  03 Outstanding
     Key figures → balance breakdown → unpaid invoices → totals
  …remaining selected sections follow the same structure…

Excel workbook (.xlsx)
  [Overview] [Sales] [Collections] [Outstanding] […]
  Each selected section's worksheet:
     Title and scope
     Key figures
     Native Excel charts
     Filterable supporting table
     Totals
```

- The table must explain the section, not repeat a generic invoice table everywhere:

  | Section               | Supporting data                                                                                          |
  | --------------------- | -------------------------------------------------------------------------------------------------------- |
  | Revenue / sales       | Contributing invoices: number, date, client, net, VAT, total                                             |
  | Collections           | Collected payments: receipt, collection date, invoice, client, method, amount                            |
  | Payment methods       | Collected payments grouped by method, with matching subtotals                                            |
  | Outstanding / overdue | Invoices: client, due date, total, collected amount, remaining balance; overdue age where relevant       |
  | Pending cheques       | Pending cheque payments: reference, invoice/client, relevant dates, amount                               |
  | VAT                   | Contributing invoices: date, net amount, VAT and total, with explicit scope                              |
  | Sales by client       | Client-level sales, collected amounts and remaining balances with their time bases clearly distinguished |
  | Sales by product      | Product/variant-level quantities, weight where available and sales amounts                               |
  | Sales by category     | Category-level quantities and sales amounts                                                              |
  | Estimates             | Estimates contributing to the section, with client, dates, amount and status                             |
  | Deliveries            | Delivery notes with client, date, status and invoice linkage                                             |

- Use the UI section's financial definition and scope. A grouped section's main
  table uses that same grouping; do not mix invoice-level rows with product-level
  metrics or sum overlapping sections. Clearly distinguish period activity from
  balances measured at capture time.
- Export all matching supporting rows, not just the current UI page. Tables, charts
  and totals must reconcile for identical filters, scope, currency and capture.
  If a UI drill-down segment narrows the table only, label that narrower scope; do
  not imply its subtotal equals the entire section's chart total.
- Separate currencies; never calculate a mixed-currency grand total. Keep previous
  period comparisons labeled separately from current-period supporting records.
- PDF: compact readable rows, repeating section/column headers on continuation
  pages, page numbers and safe breaks. The next section follows the preceding
  section's completed table. Do not shrink text to force everything onto one page.
- Excel replaces CSV for new financial report exports. Use native editable charts,
  typed numeric/date cells, localized headings, filterable tables, frozen table
  headers, sensible column widths and formula-injection protection for user text.
  Configure A4 print areas, repeated headings and fit-to-one-page width, allowing
  multiple pages vertically. A worksheet is not necessarily a single printed page.
- Preserve existing export bounds until deliberately revised. Never silently
  truncate or fabricate missing rows. Oversized or incomplete snapshots must
  produce an actionable error rather than a misleading report.

#### Schedule output choice

All daily, weekly and monthly schedules expose one compact shared Select:

```text
Language       [ Français            v ]
Output         [ PDF                 v ]
               PDF             ← default
               Excel (.xlsx)
               PDF + Excel
```

- Persist a single output choice: `pdf | excel | both`, default `pdf`. Use the
  existing schedule create/edit form, detail summary and validation conventions;
  do not add a separate settings page or new reporting permissions.
- This choice determines both the generated files and the scheduled email's
  attachments: PDF only, Excel only, or both. The email still contains a concise
  HTML/plain-text summary and an authenticated link to the saved run. It does
  not embed the full tables. This supersedes the earlier PDF-only email proposal.
- Materialization freezes the choice with the language, sections, recipients and
  period in the run configuration. Generate only the selected formats; an Excel-only
  run must not silently create a PDF. Both formats use the exact same frozen data.
- Manual test email uses the saved output choice and language, sends only to the
  requesting eligible staff member, and retains the existing confirmation/rate limits.
- For `both`, enqueue email only after both files are available. A failure must not
  silently downgrade the selection or send a partial set. Respect per-file and total
  email attachment size limits; show an actionable error if the selected set is too
  large. Do not omit a file or switch to link-only delivery without an explicit policy.
- Run details offer only the selected available downloads. Regeneration restores
  missing selected files from the saved snapshot/configuration, without recapturing
  business data or sending email. Schedule edits affect future runs, not old ones.
- New schedules and existing schedule configurations default to PDF when the choice
  is introduced. Preserve historical runs and existing CSV downloads as legacy output;
  do not rewrite their files, invent complete detail records or silently replace their
  frozen output policy. Implementation must explicitly handle legacy regeneration.
- Manual export remains a file download, never an email. Offer PDF and Excel using
  the same section composition; the schedule choice does not restrict manual exports.
- Cleanup, storage totals, shared-reference protection and cascading schedule deletion
  apply to XLSX as well as PDF and historical CSV. Retain the existing audit/locking
  guarantees and unified `reports.read` access.

#### Implementation acceptance

- Update OpenAPI first; generate API validators/types and UI query contracts. Extend
  persistence/artifact-format support and migrations as needed; do not handwrite
  duplicated HTTP schemas or implement a second reporting pipeline.
- Verify PDF-only default, Excel-only and both for create/edit, automatic runs, manual
  test emails, retries, downloads, regeneration and cleanup.
- Verify every selected section's chart/table reconciliation, complete pagination,
  multi-currency separation, empty states, long labels, multi-page PDF and Excel
  print layout, French/English, numeric/date typing and unsafe spreadsheet text.
- Verify snapshot immutability after business/schedule edits, legacy CSV preservation,
  incomplete/oversized data refusal and no email with a missing selected attachment.

### Implemented baseline and historical verification

The following sections record existing behavior. Where output requirements conflict,
the approved refinement above governs the next implementation.

### Manual run cleanup and cascading schedule deletion (2026-10-04)

- Run history includes search (run ID, saved name, period), production/type filters,
  an inclusive period-start date range, file sizes and a matching-run storage total.
  Shared table pagination, mobile filter drawer and selection/bulk confirmations apply.
- `POST /v1/report-runs/{id}/cleanup`, `{mode: files | run}`:
  files removes PDF/CSV and owned historical email attachment references while preserving
  the frozen snapshot and diagrams. Run permanently removes the snapshot, files and
  owned email history as well. This never changes business records or the schedule.
- `POST /v1/report-runs/{id}/regenerate-files` restores missing PDF/CSV for succeeded
  runs using only frozen data and saved language. It does not recapture data or send mail.
- `DELETE /v1/report-schedules/{id}` now cascades through all runs, snapshots, artifacts,
  recipients and owned email history. Expected version and explicit confirmation remain
  required. Archive is the reversible alternative for retaining history.
- Queued/running production and queued/sending email block destructive cleanup; schedule
  deletion is atomic across all its runs. Row locks serialize workers, cleanup and retries.
  The unified `reports.read` permission covers these actions, with normal session/CSRF checks.
- Cleanup releases references in a transaction, then deletes only unreferenced objects under
  keyed locks. Other owners/attachments are protected. Storage failures are reported as
  pending; existing orphan maintenance retries after its 24-hour grace period. Schedule
  deletion retains its 204 response; physical storage cleanup can therefore be deferred.
- Old cleaned-up emails cannot be retried, even after regenerating the report files.
  Attachments already delivered to recipients cannot be recalled. Minimal audit records
  retain identifiers/counts, not report snapshots. No automatic retention policy is added.
- OpenAPI remains authoritative; API Zod and UI TanStack Query operations are generated.
  No database migration is required: cascading is explicitly managed by the service so
  business guards and object-storage cleanup cannot be bypassed by a raw FK cascade.

### Schedule tests and output parity (2026-10-04)

### Manual test emails

- `POST /v1/report-schedules/{id}/test-email` accepts `expectedVersion`, requires
  `reports.read`, and returns `202` with a queued test run. The saved settings and
  language are used; the period is the latest complete day/week/month as of the
  request in the schedule timezone, not a future scheduled occurrence.
- Test delivery goes only to the signed-in eligible staff member, never to the
  schedule's full recipient list or an arbitrary supplied address. Confirmation
  appears before sending. Save edits before testing.
- Disabled schedules can be tested; archived or stale versions cannot. Testing
  leaves cadence, version, recipients and `nextRunAt` unchanged. The same workers,
  frozen snapshots, PDF/CSV artifacts and notification delivery pipeline are reused.
- `report_runs.trigger` distinguishes `scheduled` from `test`; tests retain the
  requesting staff ID and audit event. Scheduled occurrence uniqueness is preserved
  by a partial unique index. Migration `0023_damp_angel.sql` marks existing runs scheduled.
- Duplicate clicks within 60 seconds reuse the same run (also while production is
  pending). The endpoint is limited to three requests per minute. Tests appear in
  run history and have `[TEST]` email subjects. The status page polls production
  and queued email delivery; accepted/queued is not presented as inbox delivery.
- Permission/recipient eligibility is checked again before delivery. Archiving or
  explicitly disabling a schedule cancels pending work using the existing policy.
- Verified with reporting integration tests, generated-contract checks, UI confirmation
  and error tests, and a browser-to-local-Mailpit test with an actual PDF attachment.
  No external email was sent by these checks.

### Language and output

- Every schedule (daily, weekly or monthly) has `language: fr | en`, default `fr`.
  Migration `0022_sparkling_jetstream.sql` defaults existing schedules to French.
  Create/edit and detail screens expose the email/PDF language independently of
  the operator's UI language. OpenAPI remains the source for generated contracts.
- Materialization freezes the language in `configurationSnapshot`; production
  retries use that configuration, not the current schedule. Old snapshots without
  a language parse as French. Previously published files and emails are not rewritten.
- Emails have localized subjects, period/capture labels, a compact financial summary,
  inline-styled HTML, a secure application link, a confidentiality note and a plain-text
  alternative. Dynamic content is escaped. Attachments retain the same frozen PDF.
- Version-2 PDFs retain the UI's visual choices: trend curves; donut distributions
  for payment methods, buyer type, categories, estimate outcomes, delivered-note
  invoice linkage and net/VAT; ranking/aging/cohort bars; daily collection calendars.
  Donut legends print amounts and percentages. Calendars print each day's amount.
  Currencies remain separate, empty data is not fabricated, and overlapping estimate
  stages are never represented as additive pie slices. Print pagination is A4-specific;
  the schedule preview remains explicitly illustrative rather than a real run.
- Manual downloads remain downloads, not emails. Their PDF defaults to French;
  CSV keeps stable machine-readable keys and its existing data/export semantics.

### Export verification update (2026-10-04)

- Scheduled production captures up to the CSV limit plus one row, not the legacy
  PDF detail limit. Both formats are rendered from that same immutable capture
  before either is published. CSV refuses more than 10,000 detail rows or any
  snapshot whose section totals do not match its captured rows.
- Existing frozen reports are not rewritten. A legacy incomplete snapshot cannot
  be repaired by querying today's records; generate a new report instead.
- CSV keeps stable machine-readable keys and includes all criteria, capture time,
  units, section/segment scope, comparison dates and previous-period aggregates
  and series. `period` distinguishes current and previous values. Previous raw
  details and comparisons of capture-time balances are intentionally excluded.
  `change_percent` is unavailable for a missing/zero baseline. Do not sum rows of
  different record types, sections, periods or currencies together.
- Detail segments apply only to the selected section's supporting records, not
  its aggregate metrics/charts. Both formats disclose that distinction.
- Version-2 PDF uses French labels, A4 pagination, full aggregate figures,
  percentage comparisons, combined sales/collections trends, previous daily
  trends, attention counts and aggregate-derived average unit price. Weekly and
  monthly comparisons remain numerical rather than aligning unequal buckets.
- Compact PDF presentation uses three-column metric grids and short continuation
  headers. Trend charts show date ticks bounded by the selected period, numbered
  currency axes, point markers and dotted projections for highlighted values.
  Every bucket is plotted; dense periods label peaks/endpoints instead of stacking
  unreadable labels on every point. French numeric grouping uses font-safe spaces.
- Manual downloads intentionally capture fresh transactional data, with the
  capture timestamp embedded in the file. Two separate manual downloads can
  differ if financial data changes between requests; they are not downloads of
  the earlier dashboard snapshot. Saved run PDF/CSV share the same capture.
- Scheduler insertion and worker eligibility use the same injected clock.
  Regression coverage includes 2,502 scheduled detail records, snapshot
  immutability, email attachment identity, incomplete/oversized CSV refusal,
  comparison metadata, units and per-currency average unit prices.

- **Authorization update, 2026-10-03:** `reports.read` is the single reporting grant,
  including every section, export, schedule action, run, retry and recipient eligibility.
  This supersedes granular section/export/schedule/run permissions in older specs.
  Active account, email and notification preferences remain mandatory. Document
  drill-through links retain their resource permissions; financial report access
  does not grant permission to edit invoices or other records.

- Replace the old reporting page completely with the new visual reports experience.
  Do not retain a second "classic", "advanced" or "live reports" reporting screen.
- Connect the approved UI to real, authorized data **before** removing the temporary
  `/reports/live` fallback. Removal concerns the UI, not the reporting API or exports.
- Dashboard answers "How is the business doing and what needs attention?"
  Reports answers "What explains these figures?" Neither starts with a large table.
- Tables remain appropriate for contextual record drill-down, schedules and execution
  history. A chart-led overview does not mean removing access to exact records.
- A scheduler is configuration and history, not another financial dashboard.
  The report it generates is visual-first, with exact figures and concise explanations.
- Manual PDF/CSV export means download only: no email, schedule, run or outbox entry.
- Scheduled email contains a short snapshot-derived summary, the PDF attachment,
  and an authenticated link to the saved run. CSV remains an optional **download**;
  an email CSV attachment selector is not part of this revision.
- Notifications remain business delivery rules/preferences. Do not move schedule
  management into notification settings or create another notification service.

Current source baseline to preserve and extend:

| Area                                        | Current state / target delta                                                                                   |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dashboard and visual reports                | Live `pages/analytics-page.tsx` and shared `components/visual-*`; charts lazy-loaded, no demo imports          |
| Old reports                                 | Removed; `/reports/live` is a compatibility redirect to the single `/reports` destination                      |
| Reporting API, exports, schedules, runs     | Existing code/contracts; inspect and reuse rather than recreate                                                |
| Schedule occurrence preview                 | Existing `POST /v1/report-schedules/preview`; calendar timing only, not a financial report preview             |
| Scheduled email                             | Snapshot-derived summary, authenticated link and the exact immutable PDF; attachment key pinned during enqueue |
| Generic transport and notification policies | Preserve business-agnostic transport, permission/consent rules, dispatch history and retries                   |

Mock figures, fabricated trends and demo client names must never silently become
production data. During transition show "Design preview / Sample data"; after
integration show "Live data" or "Frozen report" with actual capture time.

The subsequent implementation go-ahead authorized the backend and UI work described here.

## 2. Navigation and route end state

```text
Overview
└── Dashboard                       /dashboard

Reporting
├── Reports                         /reports
│   └── Topic + contextual details  URL filters / drill-down state
└── Scheduled reports               /reports/schedules
    ├── Create                      /reports/schedules/new
    ├── Details                     /reports/schedules/:scheduleId
    ├── Edit                        /reports/schedules/:scheduleId/edit
    └── Execution history           /reports/schedules/:scheduleId/runs
        └── Frozen report           /reports/runs/:runId

Settings
└── Notifications                   /settings/notifications
```

Remove `/reports/live`, its route entry, legacy page, obsolete links and unused
table-first viewer components after replacement gates pass. An old bookmark may
redirect to `/reports`; preserve only supported, authorized criteria. Do not ship
two reporting implementations. Keep scheduled-run routes and stored artifacts.

## 3. Dashboard and interactive reports

### 3.1 Dashboard

```text
Business overview                         [Period] [Explore reports]
Live data · currency · captured at ...

[ Invoiced ] [ Collected ] [ Outstanding* ] [ Overdue* ]

+--------------------------------------+---------------------------+
| Sales / collections over time        | Needs attention           |
| Main trend + previous-period option  | Overdue invoices          |
| Exact values on hover/focus          | Estimates to follow up    |
|                                      | Delivered, not invoiced   |
+--------------------------------------+---------------------------+
| Receivables aging*                   | Estimate → invoice flow   |
| Not due / 1–30 / 31–60 / 61+ days     | Unique estimate cohort    |
+--------------------------------------+---------------------------+
* Balances as of the actual capture date, not historical period end.
```

Use compact KPI cards, distinct visualization types and a clear hierarchy. No
transaction table on the dashboard. Attention items open the relevant filtered
report/detail list, never sample IDs or unrelated unfiltered resource pages.

### 3.2 Reports

```text
Reports & insights                          [Period] [Export ▾]

[Sales] [Collections] [Clients] [Products] [Estimates] [Deliveries]
[Topic-relevant filters .....................................]

+---------------------------------------------------------------+
| Main visualization + exact totals / comparisons                |
+--------------------------------+------------------------------+
| Supporting visualization       | Concise factual insight      |
+--------------------------------+------------------------------+

Click a chart segment → contextual records with matching criteria
                         [Records / count / pagination] [Close]
```

The overview is the default. Open details in a shared drawer on suitable screens,
a full-height sheet on mobile, or a contextual detail view within the same reports
route for wider tables. Preserve filters, selected topic, segment, sort and page in
the URL; closing restores the overview. Never relabel the entire old page as a drawer.

Topic navigation is presentational; section slugs select content, not permissions.
Every section below is available with `reports.read`:

| Topic / visualization                | Data sections                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------- |
| Sales trend and issued totals        | `revenue`; add collection line only with `collections`                                |
| Net/VAT composition                  | `vat`; stored applied VAT, not an assumed rate                                        |
| Collections timeline/calendar        | `collections`; confirmed receipts by collection date                                  |
| Payment-method donut                 | `payment_methods`; confirmed amounts, not record counts                               |
| Receivables aging                    | `outstanding`; overdue-only content can use `overdue` without exposing other balances |
| Pending cheque indicator             | `pending_cheques`; never count pending amounts as collected                           |
| Client concentration / repeat buyers | `sales_by_client`; repeat-buyer history needs a defined server aggregate              |
| Category mix / variant rankings      | `sales_by_category` / `sales_by_product`                                              |
| Estimate progression / outcomes      | `estimates`; unique estimates and explicit cohort definitions                         |
| Delivery progress / invoice linkage  | `deliveries`; delivered vs planned and invoiced vs unlinked are distinct              |
| Summary tiles                        | `summary` authorizes only its documented aggregates, never other sections' records    |

For repeated buyers, "first-time" means the client's first eligible issued invoice
falls inside the period; "repeat" means eligible history before it. Never infer this
from the current response page. Rank whole-filter aggregates and show "Other" where
top-N truncation is used, with a defined denominator and complete total.

Every visualization has a text summary, units, legend/direct labels and keyboard/tap
access to exact values. Avoid decorative forecasts, unsupported growth claims,
profits/margins without cost data, or AI-written financial conclusions.

### 3.3 Financial meaning and filters

Keep the agent specification's metric dictionary and Decimal money rules authoritative:

- Revenue follows invoice issue date; collections follow confirmed payment collection
  date and include installments. Their difference is **not** outstanding debt.
- Outstanding/overdue are balances at capture, independently labeled from the activity
  period. The sample UI's "period end" wording must not carry into live reports unless
  a separately implemented historical balance capability actually supports it.
- Aging buckets are mutually exclusive: not due (including due today), 1–30,
  31–60 and 61+ days overdue, calculated in the company's reporting timezone.
  Reconcile their sum to outstanding; cancelled/draft invoices are excluded.
- Do not mix currencies, net/gross amounts, item quantities or weights. Convert known
  package weights to kg only in weight measures; unknown weight is not zero.
- Estimate cohort = distinct estimates first issued within the chosen period,
  tracked through actual capture. Accepted/invoiced steps count distinct qualifying
  estimates, not invoices. One estimate can produce multiple invoices.
  Milestone progression and current outcome breakdown are separate measures:
  superseded/rejected/expired outcomes must not be silently merged into "awaiting".
  No stage may imply every issued estimate must pass through invoice creation.
  Accepted/invoiced milestone counts must use recorded eligible transitions/links;
  do not substitute current status for unavailable historical evidence.
  Keep lifecycle-event metrics separate from this cohort; disclose missing history.
- Deliveries must distinguish delivery-date activity from created-note cohorts.
  The UI labels the selected basis; a delivered note linked to an invoice is not
  proof of payment. Use distinct notes so multiple links cannot multiply counts.
- Product/category filters do not implicitly allocate invoice-level payments to
  individual products. Registry capabilities drive visible/disabled controls.
  Unsupported combinations return explicit validation errors, never silent ignoring.
- Totals, graphs, insights, details and exports use the same normalized criteria,
  consistent snapshot and complete filtered population, not the current page.
- In the main report view select an explicit currency for money charts; multi-currency
  output renders separate labeled groups. Delivery counts remain currency-independent.
- Previous-period comparisons use the same filters and metric definition with a
  labeled comparison range. Zero baseline or missing coverage is N/A, not infinity.

## 4. Scheduled-report management UI

### 4.1 Schedule list

Use the shared compact DataTable, not financial charts and not a second dashboard.
Columns: clickable name, cadence/local time/timezone, reporting period, selected
sections, recipient count, next occurrence, enabled/paused/archive state, last run
production and delivery summaries, icon-only actions.

Search + frequency + schedule state filters use the shared toolbar/mobile drawer.
Dates are interpreted/displayed in the schedule timezone. Do not use one green
"Success" badge to mean both PDF creation and successful email delivery.

```text
Scheduled reports                              [+ Create schedule]
[Search...] [Frequency ▾] [State ▾]

Name                 Cadence          Next run     Last execution
Weekly summary       Mon 08:00        12 Oct       Ready / Accepted*
Sales, collections   Casablanca                    [View] [Edit] [...]
* Use "Delivered" only when a provider delivery event confirms it.
```

### 4.2 Create and edit: configuration + preview

```text
Create / edit schedule                              [Cancel] [Save]

+--------------------------------+--------------------------------+
| Configuration                  | Report preview                 |
| Name                           | Sample data / Preview only     |
| Frequency                      | Title + resolved period        |
| Weekday OR month day           | Key figures                    |
| Local time + timezone          | Diagrams for selected sections |
| Period to cover                | Short explanations             |
| Sections to include            | Email summary + PDF indication |
| Searchable staff recipients    |                                |
| Enabled / paused switch        | Next run + exact date range    |
+--------------------------------+--------------------------------+
```

- Top-level shared PageHeader holds actions. Two columns on desktop, configuration
  first and collapsible preview below on mobile. No bottom action bar.
- Cadence and covered period are different fields. Daily/weekly/monthly is when
  to run; previous complete day/week/month is what activity to include.
- Use IANA timezone (company default), ISO weekday for weekly schedules, day 1–28
  for monthly; irrelevant fields are null. Show exact next occurrence and period.
- Use current eligible staff IDs via searchable selection; no free-text external
  emails. Explain missing grants/inactive recipients and block an invalid save.
- Sections are semantic report content choices, not arbitrary widgets or a canvas.
  Hide forbidden sections; expose unavailable data with a reason, not fake zeros.
- Changing selections updates the visual preview. The default preview is clearly
  labeled illustrative; it does not forecast future results or send test emails.
  If a real-data preview is offered, label its actual period/capture time and use
  existing authorized analysis operations. Never blend sample and live values.
- Reuse the existing occurrence-preview endpoint for timing. It has no financial
  data today: do not claim it supplies chart data or hand-author a replacement DTO.
- Preview creates no schedule/run/artifact/outbound message. Debounce eligible read
  requests, cancel stale responses, and do not save on ordinary field changes.
- TanStack Form owns drafts; generated Zod validates boundaries; Query owns reads.
  Preserve expectedVersion conflicts and an explicit reload/reapply path.

### 4.3 Schedule details and execution history

Show configuration, eligible recipients, next run and exact next period, followed
by paginated execution history. Actions: edit, enable/pause, archive/restore and
permanent cascade deletion, with the unified reports.read grant and confirmations.

Each history entry shows scheduled occurrence, covered period, actual capture,
production status, recipient delivery summary, and a link to the frozen run.
Expose failed/skipped reasons and relevant retry actions without technical payloads.

A run page shows frozen diagrams and exact values above its delivery/history area:

```text
Weekly summary · 5–11 Oct       [Download PDF] [Download CSV] [...]

Scheduled: 12 Oct 08:00         Captured: 12 Oct 08:02
Production: Ready              Delivery: 1 accepted / 1 failed

[ Frozen key figures and section diagrams                      ]

Recipient             Email status      Reason / permitted action
Staff member A        Accepted          Provider accepted message
Staff member B        Failed            [Retry email]
```

No editing captured data; no "regenerate from current data" on successful runs.
Retry production only for failed production; retry email only for the affected
eligible failed delivery. Retrying email reuses the same frozen attachment.

## 5. Report output, email and immutability

The generated PDF is A4, visual-first, fixed-layout report content:
company identity, title, activity period, timezone/capture time, currency-specific
figures, selected diagrams, legends and short deterministic highlights.
Use compact sections, page numbers and safe page breaks; do not force all content
onto one unreadable page or include pages of detailed tables by default.

Manual PDF and scheduled PDF share report composition and metric definitions.
Interactive and print renderers may differ technically; figures, section order,
colors/labels and meaning must agree. Render through existing server PDF/font
infrastructure; do not add a browser service solely for charts. Preserve selectable
text and readable vector graphics where supported. CSV remains exact tabular data
with formula-injection protection and existing technical export bounds.

Scheduled email behavior deliberately replaces the old link-only design:

1. Capture configuration, authorized recipients and financial results once.
2. Render/publish the frozen PDF (and retain existing run CSV availability).
3. Recheck schedule and current recipient eligibility in the enqueue transaction.
4. Producer composes a concise summary from that same snapshot and attaches the
   immutable private PDF key, with a safe filename and an authenticated run link.
5. Generic delivery receives only a ready message and attachments; it must not
   inspect invoices, report sections, schedules or recipient business permissions.

Recipients require current `reports.read`, an active staff account, a valid email
and enabled notification preferences. Each recipient receives a
separate message with no other recipients exposed. No automatic broadening to clients.

**Security consequence:** an emailed summary/PDF can be retained or forwarded.
Revoking permissions blocks future sends and authenticated downloads, but cannot
revoke a delivered copy. Show this disclosure in schedule configuration/help.
Cancel unclaimed queued messages on disable/revocation using existing producer-side
mechanisms; do not claim guaranteed recall after a worker/provider has claimed mail.

Provider acceptance is not delivery, opening or reading. Preserve the transport's
actual status vocabulary and label accepted/delivered accurately. A ready PDF with
failed email is still a successful production run with failed delivery.

Never attach expiring signed URLs or render from live data during retries.
Private attachment retention must pin queued/retryable keys and follow bounded
existing cleanup policies; avoid duplicate files per recipient. Enforce artifact
and total provider-payload limits. Oversized output produces an actionable failure,
not silently dropped sections or an unannounced link-only fallback.

Capture time is real: delayed/catch-up runs do not reconstruct an earlier database
state. Their activity period stays fixed; balances and state are labeled at actual
capture. January's saved run never changes after later payments or February edits.
Do not rewrite old snapshots, PDFs or already prepared email payloads to adopt the
new layout. Maintain read compatibility for older snapshot versions.

## 6. Contracts, modules and persistence

Apply the API-first workflow during implementation, not during this documentation
change: reuse existing operations first; amend API-owned OpenAPI for missing typed
aggregates/criteria; regenerate both API Zod and UI Orval/Query artifacts; then
implement consumers. No handwritten duplicate request/response schemas.

Reuse existing endpoints and permissions:

- Dashboard, analysis, section registry and manual exports.
- Schedule list/create/detail/update, enable/disable, archive/restore, cascade delete.
- Eligible staff, occurrence preview, schedule execution history and run detail.
- Run artifacts/downloads and separate production/dispatch recovery operations.

The next contract review must inventory data gaps per approved visualization:
time buckets/comparisons, aging buckets and matching invoice drill-down, unique
estimate cohorts/outcomes, client concentration/new-repeat counts, product/category
aggregates, daily collections and delivery/invoice linkage. Return typed aggregate
structures with coverage/time basis, currency, units and complete-set totals.
Use existing server pagination for detail records. Never download all financial
rows to manufacture aggregates in React; missing capabilities are explicit.

Keep module ownership:

```text
sales repositories → sales public read services → reporting services
                                                   ├── live analysis / exports
                                                   └── schedules → frozen runs
                                                                 → report composition
                                                                 → ready email + PDF key
                                                                       ↓
                                                          generic notification support
```

- Reuse report_schedules, report_schedule_recipients, report_runs, artifacts and
  dispatch/transport models. No persisted chart tables or dashboard-specific jobs.
- Preserve unique schedule occurrence, atomic next-run advancement, leases,
  bounded catch-up, DST rules, expectedVersion and permission rechecks from the
  agent specification. Do not duplicate runs in background_jobs.
- Version snapshot/metric schemas if adding persisted aggregates. Review compatibility
  before forward migrations; never rewrite applied migrations or financial records.
- Preserve domain/layer folders, public boundaries, generated contracts, the shared
  Axios client/QueryClient and global Can/authorization helpers.
- Promote reusable approved preview components into existing reports components/lib;
  leave feature entry pages thin. Dashboard consumes reports through its public index.
  Do not import another feature's internals or introduce shared packages.
- Share UI primitives, page container/header, responsive navigation, table toolbar,
  buttons and semantic chart/theme tokens. Reuse official shadcn components.
- Live queries invalidate after relevant mutations; frozen runs do not. Permission
  changes/logout clear sensitive data. No financial state duplicated into a store.

## 7. Notifications: deliberately separate

Keep notification settings for fixed business rules and client preferences:
invoice/estimate sends, confirmed-payment notices and date-based reminders.
Schedule content/recipients/frequency belong in Scheduled reports, not these rules.
Client opt-outs do not control staff financial-report subscriptions, and an enabled
report schedule does not enable client reminders. Both producers reuse the same
generic transport. Preserve [task 4B](remaining-features-spec.md#9-task-4b--optional-client-notifications-and-expiry).

## 8. Implementation sequence and release gates

1. **Inventory and contract gap review:** map each visual to actual aggregates,
   permissions and definitions. Record API/renderer gaps without implementing a
   second metric engine. Freeze public DTOs before parallel work.
2. **Live dashboard and visual reports:** extend contracts/services where necessary,
   consume generated queries, replace fixtures, wire contextual drill-down and
   preserve loading/empty/error/forbidden states.
3. **Exports and legacy removal:** connect manual PDF/CSV to active criteria, deliver
   the visual PDF renderer, verify parity, then remove the old reporting page/links.
   No legacy removal while it is the only working live report/export path.
4. **Scheduler UI refinement:** preserve working persistence, actions and history;
   add the configuration/visual-preview arrangement and accurate next-run preview.
5. **Frozen visual output and email:** version snapshots as needed, share composition,
   attach the frozen PDF and summary safely, and retain separate delivery recovery.
6. **Review and tests:** regression checklist below; the dated verification record specifies
   what was exercised rather than implying that every scenario was manually inspected.

- [x] No demo imports/fixtures or fictitious values in live routes or exported output.
- [x] All six report topics and dashboard use authoritative, permission-scoped data.
- [ ] Chart, drill-down, PDF and CSV agree for identical criteria/capture.
- [ ] Installments, pending cheques, cancellations, revisions, missing weights, optional
      VAT, zero baselines, mixed currencies and empty results are tested.
- [x] Cohort counts are distinct and revisions/supersession do not multiply conversion.
- [x] Capture-time balances cannot be mistaken for historical period-end balances.
- [x] Old reporting page and unused legacy components are gone; useful APIs remain.
- [x] Manual export and all previews produce zero schedules/runs/emails.
- [ ] Scheduler forms preserve drafts/version conflicts and show correct Casablanca
      date boundaries, DST behavior, pause/resume and catch-up semantics.
- [x] Frozen run viewer/email/PDF agree; retries and schedule edits do not recapture.
- [ ] Attachment pinning, duplicate prevention, recipient revocation, oversize output,
      provider acceptance vs delivery and partial-recipient failures are tested.
- [ ] Visual QA covers desktop/tablet/mobile, light/dark, long labels, many sections,
      keyboard/reduced motion and one-/multi-page A4 output.
- [ ] Existing architecture, contract, lint, typecheck, unit/integration and build gates
      pass without weakening tests; handoff distinguishes design from implemented work.

Not included: arbitrary report builders, predictive analytics, external scheduled
recipients, new transport providers, a standalone scheduler service, replacing
shared layout/authentication, historical ledger replay or unrelated page redesign.

## 10. Implementation and verification — 2026-10-03

Implemented the live dashboard and six report topics, contextual record sheets,
previous-period comparison, manual PDF/CSV downloads, scheduler configuration with
an explicitly labeled illustrative preview, and frozen visual run viewing. The old
sample reporting implementation is removed. Version-1 saved runs remain readable;
new runs use version-2 snapshots. No database migration is required for this change.

Full aggregates are calculated independently of paginated supporting records.
Currency groups remain separate; capture-time balances are labeled. Cohort and
ranking selections return matching underlying records. PDF/CSV and scheduled
email read the same frozen snapshot for a run; manual downloads capture fresh
authorized data and do not create runs or send email. Email carries a concise
summary and the exact pinned PDF object, through the existing generic dispatcher.

Verification completed:

- API unit suite: 121 tests; UI suite: 277 tests.
- Reporting and worker integration suites: 29 tests against isolated test schemas,
  including one-to-many invoice cohorts, installments, cancellation, permissions,
  retries, immutable attachments and revoked recipients.
- Architecture checks: 19 API and 7 UI checks; API/UI typechecks and touched-file
  lint passed. Production UI build passed with the existing large-main-bundle warning;
  report charts remain lazy-loaded.
- Real-API browser QA: 45 checks across desktop light/dark, tablet and mobile
  light/dark. Exercised all six topics, dashboard, schedule editing, saved runs,
  chart drill-down, comparison and actual PDF/CSV downloads; no JavaScript errors,
  failed API requests or horizontal page overflow in those checks.
- A4 PDF: all 13 sections rendered, checked for out-of-page text and visually
  inspected representative financial, product-weight and estimate-cohort pages.
  Browser-exported two-page PDF and CSV downloads were also verified.

No real provider email was sent during QA. Delivery hand-off and attachment
identity were verified with test adapters; production Resend credentials and a
verified sender remain deployment requirements. The checklist above remains a
broader regression checklist, including keyboard/reduced-motion and exhaustive
provider-failure combinations, not a claim that every item was manually tested.
