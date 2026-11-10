# S6 — Quotes, invoices, receipts and allocations

Design and contract record for parent #8 (children #56–63). Prepared 2026-11-10 on base `c7b3c87`.
Pre-client policy applies: single fresh baseline, no forward migrations. Out of scope: S7 quota ledger,
S8 journeys (reminders, downgrade retention, notices).

## Model

| Record                                              | Meaning                                                                      | Mutability                                                                        |
| --------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `billing_quotes`                                    | Offer at submission: plan, pinned version, cycle, kind, currency, HT/tax/TTC | Immutable; valid 15 days (`expires_at`)                                           |
| `subscription_payments` (submission)                | Owner declaration against one quote (`quote_id`, unique), method, reference  | Snapshot columns immutable; only the decision columns change (existing)           |
| `billing_receipts` (verified payment)               | Funds an administrator actually observed: amount, reference, `received_at`   | Immutable; unique `(payment_id, reference)` = idempotency key                     |
| `billing_invoices` + `billing_invoice_lines`        | Issued document, gap-free number per series/Casablanca year                  | Immutable (no UPDATE/DELETE); totals = sum of lines (deferred check)              |
| `billing_allocations`                               | Receipt amount applied to an invoice                                         | Immutable; per receipt ≤ receipt, per invoice ≤ invoice TTC − credited (deferred) |
| Credit note (`billing_invoices` kind `credit_note`) | Explicit correction linked to an invoice, with a reason                      | Immutable; credited total ≤ invoice TTC                                           |

Administrator adjustments (complimentary coverage) keep their zero-value legacy row without quote, receipt or
invoice: no synthetic money event. Coverage stays in `subscription_periods` (S5) and is granted only by the
confirmation path.

## Rules (defaults taken for open gates C6/C9; recorded, not blockers)

- **Snapshot (#61):** the quote snapshots currency, tax rate (basis points, null = no tax), HT, tax and TTC in
  integer centimes from `billing_settings` and the pinned version price. Tax is half-up on the invoice total
  (one line per invoice, so line tax = invoice tax). A trigger requires the submission's snapshot to equal its
  quote; invoice lines copy the quote. Changing settings or publishing a version never changes issued amounts.
- **Issue timing and numbering (C9 default, #56):** an invoice is issued at the first verified receipt (never
  for an unpaid declaration). Numbers `F-YYYY-NNNNNN` (invoice) and `A-YYYY-NNNNNN` (credit note), year of
  the Casablanca issue day, from a locked counter row in the same transaction (rollback leaves no gap).
  Issuer identity on the printed document and accountant sign-off remain a rollout gate.
- **Delayed confirmation (C6 default, #58):** the administrator records `receivedAt` (default now; not in the
  future, not before submission). If `receivedAt ≤ quote.expires_at` the quoted version and amount are honoured
  even if prices, tax or the selling version changed meanwhile; coverage dates are fixed at full settlement as
  before (renewal continues within grace). Otherwise 409 `QUOTE_EXPIRED` with no write: the administrator
  rejects and the owner submits at current terms. Holding unallocated funds is deferred (not needed while
  receipts cannot exceed the balance).
- **Partial payments (#59):** a receipt may be smaller than the balance (default = full balance; larger is 400
  `AMOUNT_EXCEEDS_BALANCE`). The payment stays `submitted` until allocations reach the invoice TTC; the final
  receipt grants coverage in the same transaction. Each receipt is audited.
- **Idempotency (#63):** under the owner lock, a confirmed payment returns unchanged; a receipt reference
  already recorded for the payment returns unchanged; the period is unique per payment; allocation sums are
  checked at commit. Concurrent duplicate confirmations serialize on the owner lock and the unique keys.
- **Corrections (#60):** credit notes only when the payment is decided (confirmed or rejected), amount HT at the
  invoice's tax rate, reason shown to the owner, audit reason internal. Coverage is never changed by a credit
  note (lifecycle actions stay explicit); `balance < 0` means a refund is due outside the platform.
- **Visibility (#62):** owners read their quotes' expiry, received amount and invoice number on payments and
  list their invoices/credit notes. Administrators list invoices (optionally per owner), issue credit notes,
  and confirm with amount and received date. RLS: owner select on own rows; writes administrator only
  (quotes inserted by the owner at submission).

## Contract (done, generated)

- `SubscriptionPayment`/`AdminPayment`: `quoteExpiresAt`, `receivedTtc`, `invoiceNumber`.
- `GET /api/v1/owner/subscription/invoices` → `{ data: BillingInvoice[] }`.
- `AdminPaymentConfirmation`: `receivedAmountTtc`, `receivedAt`; errors `QUOTE_EXPIRED`,
  `AMOUNT_EXCEEDS_BALANCE`, `RECEIVED_AT_INVALID`.
- `GET /api/v1/admin/invoices?ownerId&page` → `AdminInvoicePage`;
  `POST /api/v1/admin/invoices/{invoiceId}/credit-notes` (`AdminCreditNoteRequest`) → `AdminInvoice`.

## Sequence

1. Schema + integrity SQL + baseline rebuild. 2. Repositories/services (submit writes quote; confirm writes
   receipt/invoice/allocation then coverage; admin activation with payment writes the full chain). 3. Owner/admin
   controllers and routes. 4. UI: owner invoices list and payment details; admin confirm fields, invoices with
   credit notes on the owner detail. 5. Integration tests: snapshot immutability, numbering, partial then final
   receipt grants once, duplicate confirmation/receipt, expired quote, credit note bounds, RLS.

## Status — 2026-11-10

Implemented (uncommitted): schema `api/db/schema/billing-documents.ts`, integrity
`api/db/integrity/billing-documents.sql`, rebuilt baseline, runtime grants; repository/service
(`billing-documents.repository.ts`, `billing-documents.service.ts`) wired into submit, confirm, admin
activation and credit notes; owner `GET /owner/subscription/invoices`; admin invoices list and credit notes;
UI owner invoice history and payment receipt details, admin confirm amount/date, customer invoices card with
credit-note dialog (FR/EN). Zero-amount payments (fully prorated upgrade) record no receipt or invoice.

Verification: `pnpm check` PASS (API 277, UI 600); isolated `pnpm test:integration` 449 passed, 1 skipped.
New evidence: `api/tests/billing-documents.integration.test.ts` (snapshot/immutability, quote equality, partial
and concurrent receipts granting once, delayed confirmation within/after validity, credit-note bounds,
numbering, RLS) and an admin HTTP test (partial receipt audit, invoice listing, audited credit note).

Open gates: accountant sign-off on numbering/issuer identity on printed documents (C9), whether holding
over-/late funds unallocated is needed (C6), invoice PDF rendering. No independent review has run yet.

## Review fixes — 2026-11-10

- Credit notes no longer row-lock issued invoices (`FOR UPDATE` needs UPDATE, which the runtime role must not
  have); the owner lock serializes them. Runtime grants are exported (`runtimeGrantStatements`) and an
  integration test runs confirmation and credit notes as the restricted role.
- A defaulted receipt reference that is already recorded is 409 `RECEIPT_REFERENCE_REQUIRED` (never a silent
  no-op); explicit equal retries stay idempotent.
- Invoice number, year and `issued_at` come from one statement after the counter lock (`clock_timestamp()`),
  so numbers follow issue instants.
- Lifecycle checks run before any receipt; upgrades are received in full only (`UPGRADE_REQUIRES_FULL_AMOUNT`).
  Quote expiry gates the first receipt only; later instalments complete an accepted quote.
- Rejection with received funds (superseded the earlier 409): see the C6 case below.
- Credited HT and tax are each bounded (service and trigger); the note crediting the remaining HT takes the
  remaining tax. `received_reference` still records only the final receipt (P3-3, not changed).

## C6 case — partially paid payment that is never completed (2026-11-10)

An administrator may reject a submitted payment that already has receipts. In the same transaction (owner
lock held) a credit note for the whole remaining invoice is issued with the rejection reason, so the invoice
ends `refund_due` by exactly the received amount; the refund happens outside the platform. Coverage is
unchanged, the rejection audit row records the credit note, and the owner can submit a new payment. Holding
received funds to apply them to a later payment remains a C6 product decision (not built).

## Accepted residuals (recheck R-2 to R-4)

- R-2: `issued_at` uses `clock_timestamp()` after the counter lock while receipts/allocations use the
  transaction clock, so a first receipt is stamped milliseconds before its invoice (and, under an injected
  test clock, invoices keep wall-clock time). No money effect.
- R-3: the counter year is evaluated before the lock wait; a transaction waiting across Casablanca midnight on
  31 December could number in the old year with a new-year `issued_at`. Negligible frequency.
- R-4: the remainder credit note takes all remaining tax, so a final small note can show tax that does not
  match its own rate (it reconciles with the invoice split).
