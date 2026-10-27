# Slama Finance — UX audit and improvement plan

Reviewed: 26 October 2026  
Source baseline: `565b333` on `master`  
Scope: the current, routed application; French-first use by a small Moroccan business.

## 1. Executive summary

The application has a solid foundation for daily invoicing. Its strongest qualities
are consistent shared controls, permission-aware navigation, linked business records,
progressive client data collection, and explicit safeguards around destructive actions.
The dashboard has also moved in the right direction: financial visuals lead, with
underlying records available when needed rather than dominating the screen.

The next improvement should not be another broad visual redesign. It should make
frequent tasks **safer, easier to understand, and faster to complete**.

The five highest-value changes are:

1. Protect unsaved work consistently across client, product, document and payment forms.
2. Show calculated line amounts and a running total while preparing invoices/estimates.
3. Replace technical validation paths with localized, linked field errors.
4. Explain the consequences of issuing, revising, regenerating and deleting documents
   at the point of action.
5. Make invoice balances and payment states easier for non-accountants to interpret.

Keep the compact visual language, but distinguish **information density** from
**small text and small click targets**. The application should not require users to
change browser zoom to feel comfortable.

## 2. Method and limitations

This is an implementation-informed heuristic audit, not a behavioral analytics report.

- Reviewed active routes, shared layout/components, business forms, financial
  dashboards, client relationships, permissions and destructive-action flows.
- The local UI endpoint responded, but this review did not include an authenticated
  browser walkthrough, screenshot comparison or interaction recordings.
- No production funnel, session recording, customer interview or task-completion
  dataset was provided. No conversion rates, measured time savings or user-satisfaction
  scores are claimed here.
- The files under legacy-looking feature directories are not assumed to be live
  just because they exist. Route coverage follows the protected router.
- Accessibility guidance below is a verification plan, not a compliance certificate.
- No application behavior, database records or settings were changed for this audit.

Evidence labels used throughout:

| Label     | Meaning                                                                        |
| --------- | ------------------------------------------------------------------------------ |
| Confirmed | Directly supported by the reviewed implementation.                             |
| Risk      | A plausible usability consequence of that implementation; validate with users. |
| Verify    | Requires rendered-browser, keyboard, assistive-technology or user testing.     |

Priority and effort are planning estimates, not delivery commitments:

- **P1:** financial confidence, data-entry recovery or consequential-action safety.
- **P2:** repeated friction, discoverability, readability or consistency.
- **P3:** convenience after the important workflows are reliable.
- **S / M / L effort:** small shared change / coordinated feature work / cross-cutting work.

There is not enough evidence to label any finding a demonstrated production-critical P0.

## 3. Active application coverage

Source: [protected routes](../ui/src/app/router/protected-routes.tsx).

| Area           | Active destinations reviewed                              | Main user goal                                                         |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Authentication | Login, forgot/reset/set password, profile/password change | Obtain and maintain authorized access.                                 |
| Dashboard      | `/dashboard`                                              | Understand the financial position and identify work needing attention. |
| Clients        | `/clients`, create, details, edit                         | Find a customer and understand their documents/payments.               |
| Catalog        | `/products`, categories, create/edit/details              | Maintain products, weighted variants and prices per item.              |
| Estimates      | `/estimates`, create/edit/details, conversion             | Prepare an offer, issue it, revise it and create invoices.             |
| Invoices       | `/invoices`, create/edit/details                          | Issue invoices, collect payments and create BLs.                       |
| Delivery       | `/delivery-notes`, create/edit/details, conversion        | Record delivery and follow invoice relationships.                      |
| Payments       | `/payments`, create/details                               | Record installments and distinguish pending from collected funds.      |
| Reports        | `/reports`, schedules, schedule details, captured runs    | Explore financial data, export it and automate recurring reports.      |
| Administration | Staff and roles                                           | Assign access without exposing unnecessary technical details.          |
| Configuration  | Company, bank accounts, templates, notification rules     | Configure reliable document and communication defaults.                |

`/reports/live` is a compatibility redirect, not a separate reporting experience.
The invoice-template URL still uses `invoice-appearance`, although its visible
purpose now covers document templates more broadly. Treat a future URL cleanup as
low priority and preserve existing bookmarks with redirects.

## 4. What is working well — preserve these choices

### 4.1 A recognizable application shell

Domain-grouped navigation is much easier to scan than one flat list of features.
The sidebar, top navigation, account controls, language/theme controls and mobile
navigation have clear shared owners.

Keep the linked brand logo/name as the dashboard shortcut. Keep sidebar collapse
and permission-aware visibility; do not reimplement these differently per page.

Sources: [navigation](../ui/src/components/layout/navigation.ts),
[sidebar](../ui/src/components/layout/app-sidebar.tsx),
[application shell](../ui/src/components/layout/app-shell.tsx).

### 4.2 Shared interaction primitives

Buttons, field styling, headers, pagination, status badges, comboboxes and filter
toolbars are reusable. This makes future improvements feasible without another
round of page-by-page styling fixes.

The form action portal is particularly useful: save/cancel actions can remain in
the main page header while still submitting their associated forms.

Sources: [buttons](../ui/src/components/ui/button.tsx),
[page header](../ui/src/components/management/page-header.tsx),
[form actions](../ui/src/components/management/form-action-bar.tsx).

### 4.3 Mobile keeps the business model recognizable

The mobile bottom navigation and filter sheet reduce navigation/filter overhead.
Tables remain tables and can scroll horizontally, which preserves financial
comparisons and avoids introducing a second representation for every list.

Keep this direction. Improve column priority and scrolling affordances instead of
replacing all mobile tables with cards.

Sources: [mobile navigation](../ui/src/components/layout/mobile-navigation.tsx),
[table toolbar](../ui/src/components/management/data-table-toolbar.tsx).

### 4.4 Client details are a useful work hub

Client financial summaries, contact information, related records and the tree view
connect what would otherwise be isolated screens. Related-document creation from
the client context reduces repeated selection and context switching.

Preserve both table and tree views: one is better for scanning/comparison, the
other for understanding provenance and relationships.

Sources: [client details](../ui/src/features/clients/pages/client-detail-page.tsx),
[related records](../ui/src/features/clients/components/client-related-records.tsx),
[activity tree](../ui/src/features/clients/components/client-activity-tree.tsx).

### 4.5 Financial and relationship safeguards exist

Installments, pending payments, remaining balances, estimate revisions and related
BLs are represented explicitly. Payment selection already includes client/invoice
context and available balance. These are strong foundations for preventing mistakes.

Keep financial calculations authoritative on the API. UX improvements should
explain the rules, not bypass them.

Sources: [invoice balance](../ui/src/features/sales/payments/components/invoice-balance.tsx),
[payment fields](../ui/src/features/sales/payments/components/payment-fields.tsx),
[invoice detail](../ui/src/features/sales/invoices/pages/invoice-detail-page.tsx).

### 4.6 Destructive operations expose their impact

Impact previews, explicit cascade opt-in, disabled confirmation while loading and
per-record bulk outcomes are substantially better than an unqualified “Are you sure?”.
The cascade option is now a shared, readable interaction rather than a tiny isolated checkbox.

Preserve default preservation where supported, server-validated impact previews,
and the distinction between changing a state and permanently deleting data.

Sources: [impact dialog](../ui/src/components/management/impact-confirmation-dialog.tsx),
[cascade option](../ui/src/components/management/deletion-cascade-option.tsx),
[bulk actions](../ui/src/components/management/bulk-actions.tsx).

### 4.7 The visual dashboard has a sensible foundation

The five headline dashboard metrics, attention panel, financial charts and
record-level drill-down support both overview and investigation. Currency grouping
and period-versus-capture distinctions are already represented in the implementation.

Preserve these distinctions. Do not combine currencies or restore large default
record tables to the dashboard.

Sources: [analytics page](../ui/src/features/reports/pages/analytics-page.tsx),
[summary](../ui/src/features/reports/components/report-summary.tsx),
[attention panel](../ui/src/features/reports/components/report-attention.tsx).

### 4.8 Recent simplifications improve real data entry

Name-only client records, optional phone text, French date placeholders, automatic
date separators and generated role keys all reduce unnecessary input constraints.

Keep supplied-value validation where it protects data quality, without turning an
optional field into an implied requirement. Missing client information must remain
omitted from generated documents rather than replaced with misleading placeholders.

Sources: [client form](../ui/src/features/clients/pages/client-form-page.tsx),
[date input](../ui/src/components/ui/date-input.tsx),
[role creation](../ui/src/features/identity/roles/pages/role-create-page.tsx).

## 5. Prioritized findings

### UX-01 — Unsaved-change protection is inconsistent

**P1 · L · Confirmed implementation gap; abandonment impact is a risk.**

Settings forms have an `UnsavedChanges` component. The reviewed client, product,
invoice and estimate forms do not use an equivalent shared protection. Temporary
credentials also have their own specialized unload warning.

**Why it matters:** navigating away from a long invoice can cost considerably more
work than leaving a small settings form. Inconsistent warnings also teach users
that the application cannot be trusted to protect edits uniformly.

**Change:** promote dirty-form protection to a shared management primitive, with
adapters for TanStack forms and other local form state. Handle internal navigation,
browser back/forward, tab close and successful-submit navigation. Do not assume
the existing anchor-click listener covers every navigation mechanism.

**Acceptance:** a dirty 20-line invoice prompts before leaving; “Keep editing”
preserves data; successful save never prompts; pristine forms never prompt. Test
keyboard shortcuts and mobile navigation as well as ordinary links.

Sources: [existing guard](../ui/src/features/settings/shared/components/unsaved-changes.tsx),
[invoice form](../ui/src/features/sales/invoices/pages/invoice-form-page.tsx),
[product form](../ui/src/features/products/pages/product-form-page.tsx).

### UX-02 — Financial documents need live amounts during preparation

**P1 · M · Confirmed.**

The shared line editor exposes product, quantity, unit price and VAT, but no
calculated line amount. The reviewed invoice form also lacks a running calculated
invoice total. The final details page provides totals only after saving.

**Why it matters:** users must mentally calculate amounts or save just to check
the financial result. Errors become more expensive when discovered after issuing.

**Change:** add a calculated, read-only line amount and a running summary:
subtotal, VAT when applicable, and total with currency. Preserve VAT-off defaults.
For long lists, keep the summary visible in the existing side column where space
allows; on mobile use an in-flow summary rather than another overlay.

Use decimal-safe calculation consistent with API rounding. Mark client calculations
as provisional until the server returns the saved result; handle discrepancies
explicitly rather than silently changing totals.

**Acceptance:** changing quantity/price/VAT updates amounts immediately; no VAT row
appears for untaxed lines; a 50-line document stays usable; saved totals match the API.

Sources: [line row](../ui/src/features/sales/estimates/components/estimate-line-row.tsx),
[line editor](../ui/src/features/sales/estimates/components/estimate-lines-editor.tsx),
[invoice form](../ui/src/features/sales/invoices/pages/invoice-form-page.tsx).

### UX-03 — Validation is present but not consistently actionable

**P1 · M · Confirmed.**

Several business forms build error summaries from raw schema paths such as
`issue.path.join('.')`. Shared API errors can also print field keys directly.
These summaries may appear after a long form. Auth forms already demonstrate a
better field-associated error pattern.

**Change:** build a shared error-to-field adapter. Translate paths into labels,
map nested array errors to visible line numbers, set `aria-invalid`, associate
messages with inputs and focus the first invalid field after submit. Keep a short
linked summary near the form start. Preserve the diagnostic request reference,
but move it into optional technical details.

Example: replace `lines.4.quantity: ...` with **“Product line 5 — enter a quantity
of at least 1”**, linked to that input.

**Acceptance:** an invalid line below the fold can be reached directly; French
users see French field names; all entered data survives validation failures.

Sources: [client form](../ui/src/features/clients/pages/client-form-page.tsx),
[invoice form](../ui/src/features/sales/invoices/pages/invoice-form-page.tsx),
[shared error](../ui/src/components/management/form-error.tsx),
[auth form](../ui/src/features/identity/auth/components/auth-form.tsx).

### UX-04 — Issuing deserves a clear review moment

**P1 · M · Confirmed direct action; misunderstanding risk requires user testing.**

Invoice detail exposes a direct issue action. Drafts and issued documents have
different editing rules, but the consequence is not necessarily obvious at the
moment a new staff member clicks.

**Change:** provide a concise issue-review dialog or review section showing client,
dates, line count, total/currency and relevant automatic-email behavior. Clearly
state that financial information is locked after issue. The review can link back
to the draft without introducing a new long wizard.

For estimates, explain “Create revision” and “Superseded” in task language. Do not
suggest that PDF regeneration can correct prices or quantities.

**Acceptance:** a user can explain the difference between saving, issuing and
regenerating before completing the task. The primary confirmation is specific:
**“Issue invoice”**, not “Confirm”. Do not add repetitive confirmations to ordinary saves.

Source: [invoice actions](../ui/src/features/sales/invoices/pages/invoice-detail-page.tsx).

### UX-05 — Regeneration changes more than appearance; make the contract visible

**P1 · M · Confirmed behavior; confidence risk.**

Regeneration now uses current company/client printable details and a chosen active
template. It persists the template choice, while financial information and stored
identity snapshots remain protected. This is useful but not self-evident.

**Change:** keep the current template selector and explicit confirmation. Add a
compact consequence summary: “Refreshes company/client contact details and the
selected layout; does not change products, quantities, prices or payment history.”
Show the resolved template name when “Company default” is chosen, where permission
allows. Show generation time/source context beside the download or preview.
Where template-settings copy says issued documents retain their appearance,
qualify that this remains true until an explicit regeneration. Avoid presenting
template editing and regenerating an existing document as the same operation.

Do not imply that changing a template selection alone saved anything. Save only
after successful publication, as the current implementation does.

**Acceptance:** after a company phone change, users understand why a regenerated
PDF differs from the old PDF. Details show the persisted template. A failed
regeneration leaves the old file and template in place.

Sources: [regeneration dialog](../ui/src/features/sales/components/regenerate-pdf-dialog.tsx),
[template summary](../ui/src/features/sales/components/document-template-summary.tsx),
[design publication](../api/src/modules/sales/shared/repositories/document-design.repository.ts).

### UX-06 — Surface one recommended action, not a wall of equally prominent actions

**P2 · M · Confirmed action density; visual severity requires browser review.**

An invoice can expose payment, BL creation, download, regeneration, email and more
actions. These are valuable, but long French labels and smaller desktop windows
can create multiple competing rows in a sticky header.

**Change:** define action priority by entity state. Keep one main action; retain a
small number of frequently used secondary actions; put infrequent operations in
“More”. Keep destructive items last, as already standardized. Do not hide every
financial task behind icon-only controls.

Suggested invoice hierarchy:

| State                       | Primary action                                  | Visible secondary actions | More                                            |
| --------------------------- | ----------------------------------------------- | ------------------------- | ----------------------------------------------- |
| Draft                       | Review and issue                                | Edit draft                | Delete draft                                    |
| Issued, collectible balance | Record payment                                  | Download, send            | Create BL, regenerate, cancel, delete           |
| Fully paid                  | Download receipt/document, depending on context | View payments             | Regenerate and permitted exceptional operations |

BL creation may stay visible for delivery-heavy users; validate frequency rather
than enforcing one hierarchy for every job role.

**Acceptance:** normal desktop widths do not require scanning several rows of
equally styled actions; primary actions remain reachable on mobile and at zoom.

Sources: [invoice detail](../ui/src/features/sales/invoices/pages/invoice-detail-page.tsx),
[shared header](../ui/src/components/management/page-header.tsx).

### UX-07 — Explain pending funds before accepting another installment

**P1 · S/M · Confirmed terminology complexity; not a calculation defect.**

Invoice details already show total, collected, pending, outstanding and available
balance. The payment picker also includes available balance. The distinction
between these correct figures may still be difficult for a non-accountant.

**Change:** establish a clear hierarchy and contextual explanation next to amount entry.

```text
Invoice total                         1,000 MAD
Collected                               300 MAD
Pending transfer / cheque               200 MAD
Still owed                              700 MAD
Available for another payment           500 MAD
```

Explain that pending funds are not yet collected, while already reserving part of
the invoice for new-payment validation. Use wording appropriate to cash, transfer
and cheque. Keep the agreed payment method distinct from actual recorded payments.

**Acceptance:** users can answer “How much is still owed?” and “How much can I
record now?” without guessing. Recording a pending transfer never looks like
confirmation that funds have arrived.

Sources: [balance component](../ui/src/features/sales/payments/components/invoice-balance.tsx),
[payment fields](../ui/src/features/sales/payments/components/payment-fields.tsx).

### UX-08 — Make destructive summaries easier to scan without reducing safeguards

**P1 · S/M · Confirmed existing safeguards; refinement opportunity.**

The impact model is good. Improve its reading order rather than removing it.

**Change:** lead with affected counts, then optional record lists and technical
cleanup details. Visually separate **deleted**, **preserved/detached** and
**blocked** groups. For bulk operations, show selected parent count and unique
affected child count, avoiding double counting shared relationships.

```text
Delete 3 estimates?
Will delete:       3 estimates
Will preserve:    5 invoices and their related records

[ ] Also delete linked invoices and their related records

View affected records
                        [Keep records] [Delete 3 estimates]
```

If cascade is selected, update the summary before enabling confirmation. Keep
server-side impact revalidation and the irreversible nature of permanent deletion.
Never offer “Undo” unless a real recovery mechanism exists.

**Acceptance:** users can state what will remain before confirming; blockers have
a next step; the final button describes the operation, not just the word “Yes”.

Sources: [impact dialog](../ui/src/components/management/impact-confirmation-dialog.tsx),
[sales deletion](../ui/src/features/sales/components/sales-deletion-dialog.tsx).

### UX-09 — Reduce wide-table friction while keeping tables

**P2 · M · Confirmed sizing policy; practical impact requires viewport testing.**

The shared table uses a 600px minimum width and a 900px desktop minimum, and cells
are generally non-wrapping. This protects legibility but can create avoidable
horizontal travel for simple tables and long names.

**Change:** keep horizontal table scrolling, allow per-table column priorities and
minimum width, and permit controlled wrapping for name/description columns.
Consider a sticky identifying column on mobile and a subtle scroll cue. Keep row
actions discoverable; only pin both edges if enough readable center space remains.

Do not compress names into one character per line, reduce edge padding, or convert
all lists to mobile cards.

**Acceptance:** at narrow widths a user can identify a record, read its status and
find its actions; the whole page does not scroll sideways with the table.

Source: [shared data table](../ui/src/components/management/data-table.tsx).

### UX-10 — Search/filter feedback can be calmer and more explicit

**P2 · M · Confirmed immediate state updates; request/latency impact is a risk.**

Client search updates URL/query state on each change. Other filters also update
immediately, and compact layouts move them into a sheet. The sheet correctly
explains that changes apply immediately.

**Change:** preserve immediate visual input, but debounce remote free-text search
by a short, tested interval. Keep selects immediate. Show active filter chips,
result counts and a “Clear filters” recovery action for empty search results.
Differentiate “no records created yet” from “no matches for these filters”.

Keep sort direction/page size as view preferences rather than presenting them as
business filters. Review the reset logic: the client list currently considers
every URL key except `page` when deciding whether reset is available.

**Acceptance:** typing does not repeatedly blank the list; filters remain visible
as active state after the mobile sheet closes; a filtered empty result is recoverable.

Sources: [client list](../ui/src/features/clients/pages/clients-page.tsx),
[shared filter toolbar](../ui/src/components/management/data-table-toolbar.tsx).

### UX-11 — Clarify selection scope and unexpected selection resets

**P2 · M · Confirmed.**

Selection is page-scoped. The shared selection key also serializes complete row
data, so changes in row content can clear selection even when record IDs remain
the same. This is conservative for safety, but can surprise a user during refresh.

**Change:** say “Selected on this page”. Reconcile selected IDs against refreshed
rows, or explain when selection was cleared. Keep resetting on deliberate scope
changes, and always revalidate selected records/versions before destructive work.
Do not introduce select-all-across-results without a deliberate API/UX contract.

**Acceptance:** users know whether they selected 25 visible records or an entire
result set. Stale selection never silently authorizes a destructive action.

Sources: [selection hook](../ui/src/components/management/use-table-selection.ts),
[bulk controls](../ui/src/components/management/bulk-actions.tsx).

### UX-12 — Use comfortable typography without expanding every layout dimension

**P2 · S/M · Confirmed tokens; actual readability is unmeasured.**

Desktop uses a root scale of `0.8` and a font multiplier of `1.16`. With a 16px
browser default, the current base token computes to roughly 13px and the small
token to roughly 12.1px. These are calculations from CSS, not browser measurements.

**Change:** stabilize one documented typography/density system. Consider a
“Compact / Comfortable” preference instead of repeated global size adjustments.
Keep layout dimensions and font scale independently tunable. Prioritize monetary
values, client/product names, input text and error messages over metadata.

Test French labels, dark mode, 1024px and 1440px windows, and enlarged browser text.
Avoid solving each overflow with smaller local text or unexplained truncation.

**Acceptance:** the default mode works at 100% browser zoom; both modes preserve
usable controls and do not alter PDF typography.

Sources: [global typography](../ui/src/styles/index.css),
[density tokens](../ui/src/styles/density.css).

### UX-13 — Add company setup readiness, not another mandatory wizard

**P2 · M · Confirmed editable incomplete settings; discovery risk.**

Company settings can be saved while incomplete, while business-document creation
has issuer requirements. A long description explains that setup is not a legal
compliance declaration, but does not provide a task-oriented readiness checklist.

**Change:** show “Ready to issue documents” or specific missing setup items, with
links to company identity, document template and bank configuration. Distinguish
required issuer data from optional customer fields and optional email setup.
For staff without setup permission, say who must complete the task.

**Acceptance:** a new administrator can find and resolve issuance prerequisites
without first triggering a failed document action. Do not label the company
“legally compliant” based only on field completeness.

Source: [company settings](../ui/src/features/settings/company/pages/company-settings-page.tsx).

### UX-14 — Preserve reporting visuals but explain the question behind each number

**P2 · M · Confirmed good foundations; comprehension requires user testing.**

The dashboard already distinguishes period and capture metrics, and its attention
panel links to underlying records. Preserve that work. “Outstanding” and “collected”
still need short, task-oriented definitions for occasional users.

**Change:** add contextual explanations to headline metrics, keep the selected
period/currency obvious, and make drill-down affordances explicit. Explain why a
capture-time balance may not behave like a period-sales metric. Keep reports for
deeper analysis and saved runs, not a duplicate dashboard.

**Acceptance:** users can explain what each headline amount includes, whether it
is tied to the selected period, and how to inspect the contributing records.

Sources: [summary](../ui/src/features/reports/components/report-summary.tsx),
[analytics page](../ui/src/features/reports/pages/analytics-page.tsx).

### UX-15 — Translate notification failures into a recovery decision

**P2 · M · Confirmed raw codes in history.**

The notification history shows `errorCode` directly. It is correctly collapsible
and includes retries, but codes such as provider rejection do not tell a staff
member whether they should retry or ask an administrator to change configuration.

**Change:** show a localized explanation and next step, keeping the raw code in
technical details. Clearly separate preparation, queueing and provider acceptance.
Do not represent provider acceptance as proof that the recipient read the email.
Keep the explicit override confirmation when automatic notifications are disabled.

**Acceptance:** a staff member can distinguish “missing recipient”, “provider
configuration issue” and “temporary delivery problem”. Only retryable failures
invite retry; technical diagnostics remain available for support.

Sources: [notification history](../ui/src/features/sales/notifications/components/document-notification-history.tsx),
[manual send dialog](../ui/src/features/sales/notifications/components/send-document-dialog.tsx).

### UX-16 — Show the effective schedule and preference in plain language

**P2 · S/M · Confirmed feature complexity.**

Schedulers combine cadence, local time, timezone, report period, language, format
and recipients. Client/profile preferences also combine company defaults with
overrides. The existing next-occurrence preview is useful and should remain.

**Change:** display a short derived sentence above advanced controls, for example:
“Every Monday at 08:00, Casablanca time; previous complete week; French PDF;
2 eligible recipients.” Update it as the form changes, but make clear that this
does not save or send anything. Show effective inherited values alongside override state.

**Acceptance:** users can predict the next run and included period without opening
every field. Saving, calendar preview and sending a test email remain distinct actions.

Source: [schedule preview](../ui/src/features/reports/components/schedule-preview.tsx).

### UX-17 — Finish the date-format audit in secondary copy

**P2 · S · Confirmed remaining paths.**

Main date inputs and most main lists use the shared format. However, schedule
preview period start/end and report-summary comparison dates are still passed
through as raw date strings in the reviewed components.

**Change:** use shared display formatting for interpolated secondary copy too,
without changing ISO query parameters, input contracts or chronological sorting.
Continue testing localized placeholders, separator insertion, paste, deletion and
cursor position in the custom date input.

**Acceptance:** French and English screens both display full dates as `DD-MM-YYYY`,
including preview sentences, comparison captions and tooltips.

Sources: [schedule preview](../ui/src/features/reports/components/schedule-preview.tsx),
[comparison text](../ui/src/features/reports/components/report-summary.tsx),
[date input](../ui/src/components/ui/date-input.tsx).

### UX-18 — Simplify optional data collection and technical administration

**P2 · S/M · Confirmed long forms; user burden is a risk.**

Client fields are now mostly optional, but many still occupy the initial form.
Role creation no longer requires a key, while the role page still displays that
technical identifier prominently below the description.

**Change:** prioritize client name/type and useful contact information; collapse
tax/business details and secondary addresses when empty. Preserve all entered
data when sections collapse. Put role keys in an advanced/details area, retaining
them for support. In the permission matrix, explain protected/disabled controls and
offer a concise description of what a role permits before saving assignments.

**Acceptance:** a name-only client can be created without scanning a tax form.
Administrators do not need to understand slugs to create or assign a role.

Sources: [client form](../ui/src/features/clients/pages/client-form-page.tsx),
[roles](../ui/src/features/identity/roles/pages/roles-page.tsx).

### UX-19 — Speed up repetitive product entry without sacrificing variant identity

**P2 · M · Confirmed editor behavior; frequency is unmeasured.**

The editor supports existing/manual lines, per-item quantity, price and optional
VAT. Each row has a mode switch, and switching back to catalog mode resets product
selection and price. Remote option changes can also make the selected-label fallback
less descriptive than the full product/weight option.

**Change:** always retain a readable selected variant name plus weight. Make mode
changes predictable and avoid losing completed row data without a clear indication.
Add “add line and focus search”, sensible keyboard progression and an easy way to
duplicate a line. Distinguish a one-off manual invoice line from creating a catalog product.

**Acceptance:** users can enter ten weighted variants without repeatedly using the
mouse, and can identify the selected 100g versus 500g variant after search results change.

Sources: [line row](../ui/src/features/sales/estimates/components/estimate-line-row.tsx),
[combobox fallback](../ui/src/components/ui/combobox.tsx).

### UX-20 — Make success and recovery feedback consistent

**P2 · M · Confirmed mixed patterns.**

Some operations navigate after success, some show a dialog success state, and
report actions use toasts. Generic query errors can render a detailed `FormError`
and an additional generic error state together. Conflict handling exists, but is
not a universal feature-form pattern.

**Change:** define shared feedback rules: save → concise success notice and visible
saved state; queued work → persistent status; failure → one primary explanation,
retry where safe and preserved input. Use structured conflict recovery instead
of a generic retry that submits the same stale version again.

**Acceptance:** users can tell whether work was saved, queued, sent or failed.
Retrying does not accidentally duplicate an operation, and reload warnings state
when local edits will be discarded.

Sources: [request state](../ui/src/components/management/request-state.tsx),
[conflict dialog](../ui/src/components/management/conflict-dialog.tsx),
[report feedback](../ui/src/features/reports/components/run-actions.tsx).

## 6. Recommended interaction models

### Feature-by-feature follow-through

Use this checklist alongside the prioritized findings rather than treating the
audit as an invoice-only improvement project.

| Feature                     | Keep                                                                             | Next UX improvement                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Login and password recovery | Administrator-created access, recovery flow and browser autocomplete attributes. | Verify password-manager behavior and recovery confirmation; consider an accessible password-reveal control without weakening authentication. |
| Profile                     | Dedicated self-service profile and password change.                              | Make effective report/email preferences clear and protect unsaved customization.                                                             |
| Clients                     | Progressive data collection, client work hub, table/tree views.                  | Collapse empty optional sections, improve field errors and keep related-record actions contextual.                                           |
| Products and categories     | Weighted variants, per-item pricing and contextual insights.                     | Explain weight versus sale quantity, improve variant error navigation and protect edits.                                                     |
| Estimates                   | Draft/issue/revision distinctions and links to invoices.                         | Explain current versus superseded offers and add preparation totals/review.                                                                  |
| Invoices                    | Related payments/BLs and explicit issue lifecycle.                               | Prioritize actions, show running amounts and explain issuing consequences.                                                                   |
| Payments                    | Installments and pending/collected distinction.                                  | Make outstanding versus available amounts understandable at entry time.                                                                      |
| Delivery notes              | Invoice relationship, editable draft and optional recipient/address information. | Explain that creating a BL draft is not marking a physical delivery complete.                                                                |
| PDF templates               | Fixed layouts, compact density and explicit regeneration selection.              | Make the effective template/default and scope of regeneration unmistakable; verify long tables and brand images in real previews.            |
| Company settings            | Ability to save incomplete setup.                                                | Add a readiness checklist with permission-aware links, not a compliance promise.                                                             |
| Bank accounts               | Search/filtering, archiving/restoration and historical context.                  | Explain default account versus document-specific destination, and archive versus permanent deletion.                                         |
| Staff                       | Separate creation/details/edit and role assignment.                              | Make enabled/disabled/archived effects explicit and retain clear handling of one-use credentials.                                            |
| Roles                       | Resource/action matrix and automatically generated keys.                         | Reduce technical-key prominence; explain protected or unavailable permission controls.                                                       |
| Notifications               | Rule details, custom content, explicit manual override and collapsible history.  | Show effective inheritance and explain failures with a recovery action rather than only a code.                                              |
| Dashboard and reports       | Visual overview, metric scope and record drill-down.                             | Improve metric explanations and period/currency context; verify secondary date copy.                                                         |
| Scheduled reports           | Next-run preview, language/output selection and managed history.                 | Add a readable effective-schedule sentence and keep preview/save/test-email actions distinct.                                                |

Additional references:
[template list](../ui/src/features/settings/document-templates/pages/document-templates-page.tsx),
[template/bank details](../ui/src/features/settings/shared/pages/settings-record-page.tsx),
[bank list](../ui/src/features/settings/bank-accounts/pages/bank-accounts-page.tsx),
[staff details](../ui/src/features/identity/staff/pages/staff-detail-page.tsx).

These are proposals, not screenshots of the implemented application.

### 6.1 Invoice preparation

```text
Create invoice                              [Cancel] [Save draft]
----------------------------------------------------------------
Client [Search/select]       Issue date [DD-MM-YYYY]

Products                                      Running summary
Product / variant   Qty   Unit price  Amount    Subtotal   ... MAD
Wheat · 500 g        10        25.00  250.00    VAT        optional
...                                           Total      ... MAD
[+ Add product]

Optional terms and appearance [collapsed when appropriate]
```

Keep create/edit/view page widths aligned. Do not add a second floating bottom
action bar or make PDF appearance more important than invoice amounts.

### 6.2 Issue review

```text
Issue invoice?
Client: Atlas SARL                 Total: 1,250.00 MAD
5 product lines                    Due: 26-11-2026

After issue, financial details cannot be edited directly.
Automatic client email: Off        [Explain]

                         [Back to draft] [Issue invoice]
```

The email statement must use effective policy, not only the company default.

### 6.3 Client work hub

```text
Client name                              [Edit] [More]
Financial summary
Identity / billing                 Contact / email preferences

Related records       [+ Estimate] [+ Invoice] [+ Payment] [+ BL]
[Table | Tree]   Search   Status filters   Date range
Records with clear origin links and outstanding/pending context

Activity / technical email history [collapsed]
```

Preserve the currently agreed hierarchy: contact/billing near the summary and
creation actions alongside related records, not scattered around the page.

## 7. Accessibility and responsive verification

The implementation already includes accessible labels, status text, keyboard-aware
library components and live regions in several shared controls. Keep these strengths.
Their presence does not establish full-screen accessibility.

| Check           | What to verify                                                                                    | Main areas                                                                |
| --------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Keyboard        | Reach, open, select and close controls without a pointer; restore focus after dialogs.            | Date input, combobox, filters, action menus, deletion and email dialogs.  |
| Error recovery  | Associate each message with the field and make summaries navigable.                               | Long client/product/document forms.                                       |
| Contrast        | Measure text/background and important states in light/dark mode.                                  | Accent buttons, error text, muted labels, selected templates, charts.     |
| Pointer targets | Measure actual rendered targets and spacing, not only Tailwind class names.                       | Compact action icons, calendar trigger, pagination and mobile navigation. |
| Reflow          | Keep ordinary page content usable when narrowed/enlarged; confine necessary horizontal scrolling. | Sticky headers, action groups, dialogs and tables.                        |
| Charts          | Provide clear labels plus accessible access to underlying figures.                                | Dashboard, reports, drill-down and export comparisons.                    |
| Announcements   | Announce save errors, selection scope and queued/finished work without excessive repeated alerts. | Forms, background work and bulk operations.                               |

Reference targets:

- Ordinary text generally needs at least **4.5:1** contrast; qualifying large text
  has a **3:1** threshold. Measure actual combinations rather than assuming a color
  token passes. [W3C contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).
- WCAG 2.2 target-size guidance uses **24×24 CSS pixels**, with defined exceptions,
  including spacing. For comfortable touch use, prefer roughly 44px targets as a
  product-design goal rather than treating the minimum as ideal.
  [W3C target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Verify reflow at the equivalent of **320 CSS pixels**. Tables that genuinely
  require two-dimensional layout have an exception, but surrounding controls and
  individual cell content still need consideration.
  [W3C reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Error messages should identify the affected item and explain the problem in text.
  [W3C error-identification guidance](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html).

Suggested test matrix: French/English × light/dark × keyboard/pointer, with at least
mobile 390px, tablet 768px, desktop 1024px and wide desktop 1440px. Include long
French names, 50 invoice lines, missing optional client data and empty/no-match lists.

## 8. UX measurement plan — proposed, not implemented analytics

No dedicated product-analytics tracker was found in the reviewed UI source/package
paths. Business audit logs are useful for traceability but do not reveal hesitation,
abandoned forms or failed attempts before API submission.

Start with a small privacy-conscious measurement plan, not session recording across
financial screens. A new paid analytics service is not necessary just to begin.

### Suggested events

| Event                       | Allowed useful properties                                          | Question answered                             |
| --------------------------- | ------------------------------------------------------------------ | --------------------------------------------- |
| `form_started`              | Entity type, create/edit, entry point                              | Which tasks are initiated?                    |
| `form_validation_failed`    | Entity type, normalized field category, line-count bucket          | Where does entry fail?                        |
| `form_saved`                | Entity type, duration bucket, line-count bucket                    | Are users completing work efficiently?        |
| `dirty_navigation_prompted` | Entity type, stay/leave outcome                                    | Are users frequently at risk of losing edits? |
| `document_issue_reviewed`   | Document type, confirmed/back-to-edit                              | Does review catch corrections?                |
| `payment_recorded`          | Method category, pending/confirmed, context source                 | Do users understand payment state?            |
| `pdf_regenerated`           | Document type, default/explicit template, success/failure category | Is PDF recovery successful?                   |
| `filter_changed`            | List type, filter category, result-count bucket                    | Which filters help or confuse users?          |
| `bulk_action_completed`     | Resource/action category, selected-count bucket, outcome totals    | Are bulk tasks reliable?                      |
| `report_drilldown_opened`   | Topic/metric category, device class                                | Are charts helping investigation?             |

Do not collect client/staff names, emails, passwords, bank references, invoice line
text, HTML email bodies, financial amounts or full URLs/query strings. Avoid raw
record IDs; use only the minimum approved pseudonymous session context if needed.
Use an allowlisted event schema and prevent accidental capture through error payloads.

Agree on purpose, access and a short retention period before enabling collection.
For this small deployment, aggregate counts may be sufficient. This document does
not constitute privacy/legal approval to deploy telemetry.

### Measures to establish after collecting a baseline

1. Successful create/save rate by task, excluding explicit user cancellations.
2. Time to create a three-line invoice and a ten-line invoice, measured separately.
3. Validation failures per completed form, by field category.
4. Percentage of issue reviews returning to edit, and the reason observed in testing.
5. Successful regeneration and retry rates, separating user mistakes from service failures.
6. Pending-payment confirmation task success.
7. Filtered empty-result recovery and table/tree use on client details.

There are no current measured values for these metrics. Set targets after an
initial baseline and user walkthrough rather than inventing improvement percentages.

## 9. Practical validation with the client

Run a short moderated session with the actual administrator and at least one
staff member. Add an accounting/delivery user if those responsibilities are separate.
This is qualitative discovery, not a statistically representative study.

Use disposable test data; do not experiment with real irreversible deletions or
send test messages to real customers without explicit approval.

| Task                                              | Observe                                                   | Successful outcome                                                      |
| ------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------- |
| Create a company client with only its name        | Perceived required fields and hesitation                  | Saved without invented ICE/address/contact data.                        |
| Enter ten weighted product variants on an invoice | Variant recognition, keyboard travel, totals              | Correct variant, quantity and per-item price.                           |
| Correct one invalid product line                  | Error discoverability and recovery                        | User reaches and fixes the right line without losing entries.           |
| Navigate away from an unsaved document            | Expectation of save/warning behavior                      | No unexpected data loss.                                                |
| Issue an invoice                                  | Understanding of financial immutability and notifications | User can explain consequences before confirming.                        |
| Record cash plus a pending transfer installment   | Understanding of collected/pending/remaining              | Correct amounts and state; no false assumption of cleared funds.        |
| Change the PDF template and regenerate            | Model of current data versus frozen finances              | Correct persisted template; financial data unchanged.                   |
| Delete estimates with and without cascade         | Interpretation of the impact preview                      | User predicts preserved/deleted relationships correctly.                |
| Explain dashboard outstanding versus period sales | Metric comprehension                                      | User identifies scope and drills down to records.                       |
| Schedule a French PDF report                      | Cadence, timezone, recipients, included period            | User predicts the next run and knows preview is not a save/send action. |

Record errors, confusion, assistance required and task completion. Ask “What do you
expect this action to do?” before explaining the interface. Avoid leading questions
such as “Is this button clear?”.

## 10. Delivery sequence

### Wave 1 — Trust, recovery and financial confidence

- UX-01 shared dirty-form protection.
- UX-02 live line/document amounts.
- UX-03 localized field errors and first-error navigation.
- UX-04 issue review and UX-07 payment explanations.
- Preserve the existing cascade, permissions, idempotency and regeneration guarantees.

Exit: users can enter, correct, review and issue a document without losing work or
misunderstanding its financial state.

### Wave 2 — Faster routine work and clearer navigation

- UX-06 action hierarchy; UX-09 table column priorities.
- UX-10 filter state and UX-11 selection scope.
- UX-12 typography/density stabilization.
- UX-17 residual date copy; UX-18 progressive optional forms.
- UX-19 repeated line-entry improvements.

Exit: users can complete their common tasks at normal zoom on desktop and mobile,
without repeated navigation or unnecessary field scanning.

### Wave 3 — Operational visibility and measurement

- UX-05 enhanced regeneration/source messaging.
- UX-13 readiness and UX-14 metric comprehension.
- UX-15 actionable email failures and UX-16 schedule summaries.
- UX-20 consistent feedback/conflict recovery.
- Introduce only approved, minimal telemetry and repeat the client walkthrough.

Move any item earlier if the observed client session shows it is the main blocker.

## 11. Implementation guardrails

- Fix shared components globally before adding feature-specific overrides.
- Keep the current domain feature structure, Wouter navigation, TanStack Query,
  generated API contracts and shared permission utilities.
- Put UI-only state in forms/URL state as appropriate; do not duplicate server
  records into new context stores merely to implement these recommendations.
- Financial calculations, permissions, document state rules and destructive impact
  remain API-authoritative. UX previews never bypass server checks.
- If an API change is needed, update OpenAPI first and regenerate contracts/hooks.
  Do not hand-write parallel transport schemas.
- Keep new changes to deployed database structure in forward migrations.
- Do not change frozen financial information during PDF regeneration.
- Keep the fixed template families; this audit does not recommend a drag-and-drop
  document builder or a replacement design system.
- Keep French default/English support, optional VAT and progressive client data.
- Do not enable automatic customer email as a side effect of a UX change.
- Keep important destructive operations explicit. Do not add fake undo behavior.
- Verify long French labels, keyboard use, dark mode and mobile layouts before
  declaring a shared component improvement complete.

## 12. Suggested next decision

Approve Wave 1 first, starting with **shared unsaved-change protection and linked
field errors**, then **live document totals and a concise issue-review step**.
These changes address the greatest daily risk without discarding the interface
the client has already approved.

The remaining recommendations should be validated through a short client task
walkthrough before scheduling another broad layout redesign.
