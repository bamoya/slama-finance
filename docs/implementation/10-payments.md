# 10 — Installments and payment tracking

[Index](README.md) · Depends on 08/03 · Next: [Reporting](11-reporting.md)

## Models

Create `payments` with invoice/bank-account FKs, unique public number and
idempotency key, positive amount, currency, method/status, transfer/cheque details,
`payment_date`, `collected_on`, system `confirmed_at`, cancellation fields, version
and L3 audit. Add invoice/status and received-collection-date indexes and method/
status field checks. Payments are entries, not gateways or future installment plans.

## API routes and rules

| Route                                                   | Behavior / permission                                                         |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /v1/payments`, `GET /v1/payments/:id`              | Search/filter invoice/client/method/status/date, `payments.read`              |
| `POST /v1/payments`                                     | Cash confirmed, transfer pending/confirmed, cheque pending; `payments.create` |
| `POST /v1/payments/:id/confirm`                         | Pending transfer/cheque → confirmed with collected_on; `payments.confirm`     |
| `POST /v1/payments/:id/cancel`                          | Reasoned correction, not refund; `payments.cancel`                            |
| `POST /v1/payments/:id/restore`                         | Cancelled → prior pending/confirmed state; `payments.restore`                 |
| `DELETE /v1/payments/:id`                               | Delete any status only before receipt issuance; `payments.delete`             |
| `POST /v1/payments/:id/receipt`                         | Prepare/reuse receipt PDF on demand; `payments.read`                          |
| `POST /v1/documents/payment_receipt/:id/regenerate-pdf` | Saved/latest design; `payments.read` + `payments.create`                      |
| `GET /v1/payments?invoiceId=:id`                        | Invoice payment history, `payments.read`                                      |

Creating an already-confirmed bank transfer also requires `payments.confirm`.
Cash is collected immediately and only requires `payments.create`. There is no
separate deposit/reject endpoint: cancel an unsuccessful pending payment with its
reason. Statuses are `pending`, `confirmed`, and `cancelled`.

There is no generic PATCH for amounts or dates. Cancel and restore retain the
original amount and collection date; delete removes the payment record and
releases its balance effect. Every transition and deletion requires
`expectedVersion` and writes an audit event. Repeated create requests with an
identical operation ID resolve to one payment; mismatched payloads return 409.
An operation ID for a deleted payment remains reserved through its audit record
and cannot silently recreate it. Generate a PAY number only once.

## Services and transaction guards

Lock invoice when recording, confirming, cancelling, restoring or deleting;
calculate confirmed and pending totals inside the transaction. New and restored
payments require an issued/sent invoice, currency match and enough available
balance. Deletion is permitted for pending, confirmed and cancelled payments only
until a receipt has been successfully published. Thereafter use cancellation.
Pending payments reserve available balance but do not reduce outstanding balance.
Available = invoice total − confirmed − pending; outstanding = total − confirmed.
Cancellation and deletion release the corresponding amount. Restoration reserves
or collects it again according to the payment's state before cancellation.
Require cheque
number/bank or transfer reference as appropriate; prohibit cheque fields on cash.
`collected_on` is actual cash receipt, bank credit or clearance date, not data-entry
time. Allow audited backdating, reject future actual collection dates; preserve
system timestamps. Pending entries have no collection timestamp; cancelled
confirmed entries retain theirs but no longer contribute to live totals.

Derive paid/balance/unpaid/partial/paid/overdue, do not maintain conflicting invoice
paid flags. Invoice cancellation cannot proceed with pending or confirmed payments.
Use expectedVersion for payment transitions and deletion; protect against
duplicate confirmation and restoration. Financial date corrections can use
deletion and replacement before receipt issuance; otherwise cancel and replace.

## Payment receipts (implemented)

Migration `0014_payment_receipts.sql` adds nullable `receipt_snapshot` and
`receipt_issued_at` to payments and `payment_receipt` to artifact owner types.
New payments freeze invoice/customer/company/design data and confirmed totals
inside the recording transaction. Balance is **at recording**, not backdated to
the payment date, and excludes pending funds. Legacy records explicitly show
historical balance unavailable, never a fabricated current balance.

The receipt number is `REC-<year>-<random suffix>`, using the payment's unique
suffix. Download prepares the PDF only when necessary; regeneration supports
the saved appearance or latest linked/default template. Logo and optional
signature resolve through media management. Payment details use generated Orval
hooks and the shared Button/RegeneratePdfDialog components.
The document-template live preview includes a **Payment receipt** selector with
illustrative cheque details and recorded balances for all three fixed layouts.
Its API query accepts `documentType=payment_receipt`; signature permission rules
remain unchanged.

Pending cheques say “Cheque received - awaiting collection.” Confirmed cheques
say “Cheque collected.” Cancelled receipts prominently state that they are invalid
as proof of payment. Confirmation, cancellation and restoration invalidate the
previous PDF. Regeneration never changes the recorded financial snapshot.

One active artifact row per receipt is replaced atomically, including its payment
version. Old storage objects become eligible for the existing 24-hour unreferenced
cleanup. Generation/storage failures preserve the previous file and do not mark
an initial receipt issued. Issuance and regeneration are audited. Already downloaded
copies cannot be revoked; staff must communicate cancellations to recipients.

## UI/state

Reuse `/payments`, `/payments/new`; add `/payments/:paymentId` detail with
confirm, cancel, restore and delete actions. Do not add an edit page implying
amounts or dates can be patched. Components:
InvoiceSearchPicker, InstallmentAmountForm, PaymentMethodFields, ChequeActions,
CollectionDateField, PaymentTimeline and CorrectionDialog. Invoice detail gains
balance summary and RecordPayment action. Show pending versus collected distinctly.
Query invalidation covers payment lists/details, invoice balances and live reporting
keys (once available), not saved report artifacts. Forms own in-progress method
fields and clear incompatible fields on method change. No payments global store.

## Acceptance

Test installments to exact total, parallel overpayment, pending reservation followed
by cancellation and cash settlement, double confirmation, idempotency, currency mismatch, backdating,
date validation, cancellation/restoration and deletion of every status. UI shows Jan collection entered in
Feb in live Jan analysis later, while frozen reports remain untouched. Exit:
trustworthy installment ledger and invoice balance views.

## Client and document integration

Document lists support server-side search, filters, stable sorting, and pagination.
Detail views link source estimates, invoices, delivery notes, and payment records
using their public numbers. Client detail includes permission-sensitive financial
totals, recent activity, and paginated related records. Totals are grouped by currency;
client balance filters and financial sorting use the company currency exposed by
the client-list response. Client financial summaries/filters require both
`invoices.read` and `payments.read`; activity filtering requires all four document/
payment read permissions. Individual activity categories respect their read grants.

Migration `0011_furry_paladin.sql` creates payments and grants the original four
payment permissions to the existing admin role. Migration `0012_payment_management.sql`
adds restore/delete permissions. After migrating, run
`pnpm --dir api db:grant-sales-runtime` when using a distinct runtime database role.
