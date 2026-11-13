# Organization credit notes (avoirs)

Phase 2c of the billing-identity work. Pre-client policy: single fresh baseline, no forward migrations. Every legal
wording and numbering choice marked **PENDING ACCOUNTANT** is a working proposal, not accounting or legal advice.

## Purpose and decisions

- A **credit note** corrects ONE issued or sent invoice (legal or simple) without editing it. Cancellation remains
  for invoices that were wholly wrong and unpaid; an invoice with an issued credit note can no longer be cancelled
  (API `409 INVOICE_HAS_CREDIT_NOTES`, plus a database guard).
- **Numbering** reuses the gap-free counter (`document_number_counters`): series `AVO` (`AVO-YYYY-NNNNNN`) for a
  credit note of a legal invoice, `AVS` for a credit note of a simple invoice (the matching simple series, labelled
  simple on the PDF). Number and `issued_at` are taken at issue under the counter lock; drafts have none and may be
  deleted. PENDING ACCOUNTANT: one shared series versus the AVO/AVS split.
- **Lines** credit selected invoice lines either by quantity (returns, at the invoice unit price) or by an amount
  excluding VAT (discount, price correction), never both. A reason is required.
- **Arithmetic** is exact to the centime, like invoices: net = quantity x unit price (or the amount), clamped to remaining HT when returning all remaining units after an amount correction; free items may be returned by quantity at zero HT. VAT =
  net x line rate / 100 rounded half-up, TTC = net + VAT. The VAT rate is copied from the invoice line. The credit
  that exhausts a line's remaining HT takes the line's remaining VAT (remainder logic, as for platform credit
  notes), so crediting every part of a line equals the line exactly.
- **Cap**: the issued credit notes of an invoice never exceed it, in quantity, HT and VAT per line and in HT, VAT
  and TTC overall. Enforced by the service under a common invoice row lock and again by a database trigger on the
  draft -> issued transition (the same lock). Only issued notes count; drafts are re-checked at issue
  (`409 CREDIT_EXCEEDS_INVOICE`). A draft or cancelled invoice cannot be credited (`409 INVOICE_NOT_CREDITABLE`).
- **Immutability**: after issue the note, its lines, snapshots and amounts are frozen (triggers reusing the 2a
  pattern, pinned `search_path`); it cannot be deleted (numbered documents are protected, the
  `app.sales_teardown` flag is reserved for teardown) and cannot be cancelled. Only presentation fields
  (template/appearance, versions) follow PDF regeneration. Corrections are another invoice.
- **Snapshots** (issuer, client, appearance, bank) are copied from the credited invoice, never from live data,
  together with the invoice number and issue date. The PDF ("Avoir" / "Avoir simple") shows "Corrects invoice
  N° ... · date", the reason, the simple label and the VAT exemption mention exactly as on the invoice, and is
  rendered, and regenerated, from the stored snapshot only.

## Payments and balances

Confirmed payments are never changed by a credit note. Per invoice:

- `creditedAmount` = issued credit notes (TTC); `netAmount` = total - credited.
- `outstandingAmount` (net amount due) = max(net - confirmed payments, 0). `availableBalance` = max(net due -
  pending payments, 0), so a new payment cannot exceed the net due (`OVERPAYMENT`).
- `refundDueAmount` = max(confirmed payments - net, 0): reported only, no refund is automated. Payment creation and confirmation lock the same invoice row and re-check the net balance. A later credit may create a refund due on an already confirmed payment.
- `paymentStatus`: `unpaid` / `partial` / `paid` as before but against the net amount; new `credited` = fully
  credited with no confirmed payment (nothing due). `creditableAmount` = TTC still creditable (0 unless issued/sent).

## Reporting and queries netted by credit notes

SQL helpers `invoice_credited_total/_subtotal/_tax(invoice_id)` (issued notes only, `SECURITY INVOKER`, tenant RLS
applies) are the single definition. Netted:

- Invoice list: `paymentStatus` filters (`paid`, `partial`, `unpaid`, new `credited`), `overdue`, sort by
  `outstandingAmount` (invoice repository).
- Payment balances (`paymentBalancesForInvoices`) used by invoice detail and payment checks.
- Client list: invoiced and outstanding sort/filter, overdue filter; client finance summary
  (invoiced = net of credit, received, outstanding, overdue) (client repository).
- Reports: `revenue`, `vat`, `summary` (invoiced net/VAT/gross and outstanding), `sales_by_client`,
  `outstanding`, `overdue`, and their client drill-down rows; row details balance and client balance
  (reporting-read, reporting-details, reporting-visuals).
- Reminder candidates and the reminder outstanding amount (sales notification repository).
- Platform owner financial summary (revenue, outstanding, overdue, revenue series).

Credit notes reduce revenue and VAT in the **credit note’s own issue period**. Revenue, summary, sales by client and owner revenue series use dated negative movements; a later credit leaves earlier periods unchanged.

**Not netted (explicit):** `sales_by_product` / `sales_by_category`, the product variant visuals and catalog
insights stay gross invoiced lines (quantity and weight views; line-level return reporting is a follow-up); the
invoice `total`, the `amountMin/amountMax` filter keep the original invoice total. Impact amounts and balance row totals use net amounts. Collections and payment methods are cash movements and unchanged.

## Permissions (permission-standard.md)

`credit_notes.read` (list, detail, PDF download), `credit_notes.create` (create drafts; also needs
`invoices.read`), `credit_notes.update` (edit drafts, **issue**, regenerate PDF), `credit_notes.delete` (drafts
only; an issued note stays undeletable). Issue is an Edit action per the standard. The admin role receives all four.
Routes live under the sales module; `/invoices/{id}/credit-notes` needs `credit_notes.read` + `invoices.read`,
`/invoices/{id}/creditable-lines` needs `credit_notes.create` + `invoices.read`. Create, update, delete and issue
are audited (`entityTable = credit_notes`). Tables use tenant RLS with FORCE; the runtime role has the same
table grants as invoices, and the triggers refuse UPDATE/DELETE after issue.

## UI

Invoice detail: "Create credit note" (permission-gated, issued/sent invoices with a remaining creditable amount or returnable quantity),
balance block (total, credited, net, paid, net due, refund due) and the linked credit notes. Credit notes list,
editor (pick lines, quantity or amount, reason), detail with PDF download, issue and draft delete. The invoice list
shows the `credited` status.

## Recovery verification — 2026-11-13

The interrupted review corrections are complete: invoice-row serialization across credit/cancellation/payment
paths, zero-value quantity returns, remaining HT/VAT caps, own-issue-period revenue movements, net impact
amounts and PDF update permission. Invoice actions use the API's eligibility flag; read-only users retain
existing PDF download access. Independent final review found no remaining actionable issue in scope.

`pnpm check` passed, and full isolated integration passed with 548 tests and one existing skip (54 files).
Evidence and review: `/tmp/slama-s6/recovery-1113/`. No development database operation, commit or push was
performed during recovery. The existing development volume still needs operator replacement under the
pre-client baseline policy; no browser rerun of the recovery changes is claimed.

## Remaining product scope

- Accountant to confirm numbering split and wording.
- No e-mailing of credit notes, no automated refunds, no credit note of a credit note.
- Product/category reports are not netted (above).
