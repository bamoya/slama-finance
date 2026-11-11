# Billing identity — customer and issuer on platform invoices

Decisions record (user-approved, 2026-11-11) for the phase after S6 (`s6-billing-documents.md`). Base `27179dd`.
Pre-client policy: single fresh baseline, no forward migrations.

## C. Customer identity at checkout (platform invoices to owners)

- Checkout asks "Individual or company?". **Individual is the default and asks nothing more.** Company asks
  legal name, ICE and address (required) and RC and IF (optional). ICE is checked for format only (15 digits),
  never against a registry. Anyone unwilling to give company details chooses individual, so subscribing is
  never blocked.
- The choice is stored on the owner's **billing profile** (`billing_customer_profiles`, one row per owner,
  absent = individual), prefilled at the next checkout and editable in billing settings. It is read with the
  existing `GET /owner/subscription/billing` (field `customer`) and changed with `PUT` on the same path; the
  payment submission may carry `customer`, which also updates the profile.
- At submission the details are **snapshotted onto the quote** (`billing_quotes.customer`) and copied to the
  invoice at issue (`billing_invoices.customer`); a credit note copies the snapshot of the invoice it corrects.
  The quote snapshot also stores the owner's e-mail at quote time (`email`, not exposed by the API), printed
  for individuals, so PDFs never read live account data. ICE may be typed in the printed format with spaces
  (`001 122 334 455 667`); spaces are removed in the UI and the API before the 15-digit check.
  Later profile edits never change quoted or issued documents (rows are immutable). Correction of a wrong
  identity = credit note + new submission (S6 path).
- Administrators see the customer type and details on payment and invoice screens.

## A. Platform invoice issuer

- One administrator-editable **issuer profile** in platform billing settings (`billing_settings.issuer_*`):
  legal name, address, ICE, RC, IF, tax mention, payment terms / footer. It is **snapshotted on each invoice
  and credit note at issue** (`billing_invoices.issuer`).
- Incomplete profile: billing settings show a loud warning listing the missing fields, repeated on the payment
  confirmation screen. **Only an empty legal name blocks issuing.**
- **Chosen behaviour when the legal name is empty (safest consistent option):** the confirmation fails loudly,
  before any write, with 409 `ISSUER_PROFILE_INCOMPLETE` ("complete the issuer legal name in billing settings,
  then confirm again"). The S6 invariant "an invoice is issued at the first verified receipt, in the same
  transaction as the receipt and allocation" is kept, so no receipt exists without its invoice and no
  allocation is ever pending. Owners can always submit payments (submission never needs the issuer), nothing
  is lost (the submission stays `submitted` and the quote validity is judged on `receivedAt`, which the
  administrator enters as the real receipt date when retrying), and coverage follows as soon as the
  administrator completes one field. Rejection with receipts and credit notes use the same rule.
- Numbering is unchanged: `F-YYYY-NNNNNN` / `A-YYYY-NNNNNN` (accountant to confirm).
- **Invoice PDF**: `GET /owner/subscription/invoices/{id}/pdf` and `GET /admin/invoices/{id}/pdf`, invoice and
  credit-note variants, French first (default) and English (`language=en`). Built only from the immutable
  snapshot (amounts, lines, customer, issuer, number, dates), rendered synchronously with the shared document
  renderer (`api/src/lib/documents`) used by sales PDFs and receipts; the same snapshot always yields the same
  content, so nothing is stored. Legal footer (tax mention, payment terms, identifiers) comes from the issuer
  snapshot.
- Owner invoice list is paged (`page`, 20 per page, `{ items, page, pageSize, total }`), replacing the
  500-row cap, in API and UI.

## B. Organization legal types in the finance product (record only — not implemented)

- Legal type optional at sign-up; "individual / not registered" always available and asks nothing.
- A configuration table maps type → fields, required only when issuing a legal invoice.
- Per-organization gap-free series.
- Unregistered individuals may issue clearly labelled "simple invoices / receipts" without legal identifiers;
  full numbered invoices unlock once legal details are completed.
- Starting type list (accountant to confirm): individual, auto-entrepreneur, sole trader, SARL / SARL AU / SA /
  other companies, association / cooperative.
- First task of that phase: read how finance invoices are numbered and identified today.
