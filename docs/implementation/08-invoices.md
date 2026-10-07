# 08 — Invoices and estimate conversion

[Index](README.md) · Depends on 07 · Next: [Delivery notes](09-delivery-notes.md)

`invoices.client_id` references `clients.id` with `ON DELETE RESTRICT`, so
attached clients cannot be permanently deleted.

## Models

Create `invoices` and `invoice_lines` with their own checks/indexes and L3 audit.
`source_estimate_id` is an indexed, nullable, non-unique FK: one estimate may
produce many invoices, including replacements after cancellation. Store snapshots,
due date, totals, locale/currency, lifecycle timestamps and both versions. Issued
PDF content does not change with later payment/status changes.

## API contract

| Route                                      | Behavior / permission                                                        |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| `GET /v1/invoices`, `GET /v1/invoices/:id` | Filter client/lifecycle/date; balance filters enabled in 10; `invoices.view` |
| `POST /v1/invoices`                        | Direct draft with header/lines; `invoices.create`                            |
| `PATCH /v1/invoices/:id`                   | Draft-only atomic update, expectedVersion; `invoices.update`                 |
| `DELETE /v1/invoices/:id`                  | Draft only and resolve reservations; `invoices.delete`                       |
| `POST /v1/invoices/:id/issue`              | Completeness/total checks, number and freeze; `invoices.issue`               |
| `POST /v1/invoices/:id/cancel`             | Reason + dependency checks; `invoices.cancel`                                |
| `POST /v1/invoices/:id/pdf`                | Idempotent artifact generation/job, `invoices.view`                          |
| `GET /v1/invoices/:id/artifacts`           | Owner-authorized downloads, `invoices.view`                                  |
| `POST /v1/estimates/:id/invoices`          | Accepted estimate → new invoice draft; `estimates.view` + `invoices.create`  |
| `GET /v1/estimates/:id/invoices`           | All linked conversions, `estimates.view` + `invoices.view`                   |

Conversion request supplies a stable operation/invoice UUID. Within a transaction,
retries resolve the same invoice and reject mismatched provenance/payload; distinct
intentional operations create distinct drafts. Server selects source fields and
copies lines; reject incompatible client/currency. Preserve estimate and all past
invoices. No unique source FK, cumulative estimate cap or automatic deletion.

## Services and guards

Reuse numeric and snapshot helpers, not estimate repositories or lifecycle rules.
Require full session/action permission. Issue locks the header and validates
expectedVersion; enforce draft/issued/sent/cancelled transitions explicitly.
Keep balance badges separate from lifecycle. Payment-aware cancellation rules are
added in 10; fulfillment/allocation rules in 09. Do not release to production
until these dependent checks exist. Downloads resolve immutable content version.
Shared number helper assigns FAC references; accountant numbering approval is a
release gate, not something random generation tests establish.

## UI/state

Reuse `/invoices`, `/new`, `/:documentId`, `/:documentId/edit` and existing
`/estimates/:documentId/convert`. Display previous conversions and confirm intent
before another invoice; keep operation ID stable across network retries. Separate
invoice and estimate queries/mutations even if editor widgets are shared.
Components: InvoiceForm, DueDateFields, ConversionSummary, LinkedInvoicesTable,
IssueConfirmation, CancelDialog, read-only DocumentPreview. Do not expose editing
on issued invoices. Invalidate converted estimate detail and invoice lists after
conversion; payments/deliveries panels are connected in their sequences.

## Acceptance

Test independent invoices, accepted-only conversion, same operation retries,
multiple deliberate conversions, retained cancelled invoice, decimal validation,
number uniqueness, optimistic conflicts and snapshot immutability. UI tests
list/create/edit/view/issue/cancel/download and conversion navigation. Exit:
sales document core ready for delivery and payment constraints.
