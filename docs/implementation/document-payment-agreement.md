# Document bank details and payment agreement

Invoices and estimates can print the selected company bank account and an optional
agreed payment method. These are payment instructions, not payment transactions or
proof of collection. Delivery notes and payment receipts are unchanged.

## Company setting and permissions

`company_settings.default_bank_account_id` is a nullable restricted bank-account FK.
Company settings expose an optional `defaultBankAccountId`, editable with the existing
`company_settings.update` permission. The bank must exist and be active. A default
account cannot be archived until the default is changed; referenced accounts cannot
be permanently deleted. The bank selector uses `bank_accounts.read`.

## Drafts and finalization

Invoice/estimate create and update contracts accept:

- `bankAccountId`: omitted selects the company default; explicit null hides bank details;
  a UUID selects another active bank.
- `agreedPaymentMethod`: nullable `cash`, `bank_transfer`, or `cheque`; omitted means
  unspecified. No payment reference is required here.

The resolved bank ID and printable bank snapshot are saved with the draft. Saving
or issuing refreshes the selected bank details. Issuance freezes the bank name,
account holder, RIB and IBAN. Later bank/company changes do not alter issued
documents, including when their PDFs are regenerated with a newer template.
The template's existing `showBankDetails` option is also respected.

Estimate-to-invoice conversion and estimate revision creation copy the selected
bank and agreed method into the new draft. Its staff can edit those choices before
issuing. Actual payments and balances are never created or changed by the agreement.

French output uses “Mode de règlement prévu”; English uses “Agreed payment method”.
Both PDF output and template previews use the canonical renderer.

## Migration

The fields, restricted FKs and method checks are defined directly in
`0000_fresh_baseline.sql`, with matching Drizzle snapshots. No separate corrective
migration or data update is needed before production. Use an empty database/new
volume: editing this pre-production baseline does not upgrade existing databases.
No existing database is reset automatically.
