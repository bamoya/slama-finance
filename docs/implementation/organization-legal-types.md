# Organization legal types, simple invoices and VAT exemption

Phase 2b of the billing-identity work (`subscription-billing/billing-identity.md` section B). Pre-client policy:
single fresh baseline, no forward migrations. **Every legal field set and every legal wording below is a working
proposal PENDING ACCOUNTANT CONFIRMATION**; nothing here is accounting or legal advice.

## Decisions

- **Legal type** (`company_settings.legal_type`, never null, default `individual`): `individual`,
  `auto_entrepreneur`, `sole_trader`, `sarl`, `sarl_au`, `sa`, `other_company`, `association`, `cooperative`.
  Optional in onboarding step 2 and editable in company settings. `individual` is always available, asks for
  nothing and creating an organization is never blocked; onboarding without a type activates as `individual`.
- **`legal_form` free text is kept** as an optional display override: it is printed instead of the type name when
  set, otherwise the PDF prints the type label (SARL, SARL AU, SA, Auto-entrepreneur, Sole trader, Association,
  Cooperative; nothing for individual and other_company).
- **Requirements reference table** `legal_type_requirements(legal_type, field, required_for_legal_invoice)`
  (`api/db/reference/legal-types.sql`). Read-only for the runtime role (SELECT only). Served by
  `GET /api/v1/company-settings/legal-requirements` (permission `company_settings.read`) and, for owners who have
  no organization yet, `GET /api/v1/owner/legal-type-requirements`. The UI shows fields from it and never
  duplicates the rules. A row means the type shows the field; `required_for_legal_invoice` says whether a legal
  invoice needs it. `registrationNumber` stands for RC and its city (stored as a pair).

  | Type                             | Required for a legal invoice                                     | Shown, optional |
  | -------------------------------- | ---------------------------------------------------------------- | --------------- |
  | individual                       | none                                                             | -               |
  | auto_entrepreneur                | legal name, ICE, address, city                                   | IF, TP          |
  | sole_trader                      | legal name, ICE, IF, RC + city, TP, address, city                | -               |
  | sarl, sarl_au, sa, other_company | legal name, ICE, IF, RC + city, TP, share capital, address, city | -               |
  | association, cooperative         | legal name, ICE, address, city                                   | IF              |

  The basics a document always needs (legal name, address, city) are still required to create any document
  (`409 COMPANY_INCOMPLETE`, unchanged); for an individual they are the only requirement.

- **Issue-time gate for invoices** (`invoice.service.ts issue`, `sales/shared/services/legal-identity.ts`), read
  from the company settings at issue time (not from the draft):
  - `individual` -> **simple invoice**: series `FS` (`FS-YYYY-NNNNNN`), `kind = 'simple'`, titled "Facture
    simple" / "Simple invoice" with the label "not a legal tax invoice".
  - registered type, every required field present -> **legal invoice**: series `FAC`, `kind = 'legal'`.
  - registered type with a missing required field -> **409 `MISSING_LEGAL_IDENTITY`**, `fieldErrors` keyed by the
    missing company field names (no number consumed, nothing written). The message points to company settings.
    Estimates, delivery notes and receipts are not gated.
- **Numbering**: `FS` is a new series of the 2a counter (`document_number_counters`, CHECK extended), gap-free and
  independent of `FAC`; both can coexist when an organization registers later.
- **`invoices.kind`** (`simple` | `legal`, null for drafts) is set at issue, frozen by the 2a immutability trigger
  (`guard_issued_invoice`), and a CHECK ties it to its series prefix.
- **VAT regime** (`vat_regime`: `subject` | `exempt`, default `subject`, which keeps the pre-2b behaviour). An
  `exempt` company charges no VAT: positive line rates are refused on create/update and again at issue
  (`400 VAT_EXEMPT_REGIME`), a positive default VAT rate cannot coexist with `exempt` (service and CHECK), the VAT
  column and totals are hidden and the **exemption mention** is printed. Onboarding sets `exempt` for an
  auto-entrepreneur who did not enable VAT, otherwise `subject`.
- **Exemption mention** (`vat_exemption_mention`, optional, 1-300 chars): custom text replaces the default
  wording ("TVA non applicable" / "VAT not applicable", the same for every type for now). The exact legal wording
  per type is PENDING ACCOUNTANT; no article number is quoted.
- **Snapshots**: `issuer_snapshot` gains `legalType`, `vatRegime`, `vatExemptionMention` (resolved text, only when
  exempt) and, for invoices, `documentKind`; `shareCapital` and `professionalTaxNumber` are kept only when the
  type shows them. Estimates/delivery notes take it at creation; an invoice rebuilds it from the current company
  settings at issue (the gate needs the current identity), after which it is frozen. PDFs (including regeneration)
  render only from the snapshot, so later profile edits never change an issued document. No backfill (pre-client).
- **PDF**: issuer block prints the legal form (override or type label) with capital, then `RC ... - IF ... - TP ...`
  when present; invoices print the simple-invoice label section and the "TVA" exemption section.

## Review 5 decisions

- **VAT exemption covers estimates** (P2-1): an exempt company cannot create, update or issue an estimate with a
  positive VAT rate (`400 VAT_EXEMPT_REGIME`), and converting a taxed accepted estimate into an invoice is refused
  with the same code (no zeroing: the quote's agreed prices are not silently changed). The PDF hides the VAT
  presentation only when the company is exempt **and** the document's tax total is zero, so a historical document
  with tax keeps its breakdown.
- **Issue lock** (P3-1): invoice issue reads `company_settings` with `SELECT ... FOR UPDATE`, so a concurrent
  settings edit cannot change the type or regime between the gate and the number.
- **`invoices_kind_issued`** (P3-2): `(status = 'draft') = (kind is null)`.
- **Identifiers follow the type** (P3-3): `ice`, `taxIdentifier`, RC + city, `professionalTaxNumber` and
  `shareCapital` are copied into a snapshot (and the template preview) only when the type shows them. Hidden values
  stay stored, nothing is cleared on save, so switching back restores them. An individual therefore prints none of
  them on a simple invoice. PENDING ACCOUNTANT: whether an individual may still print an optional ICE.
- **Share capital** (P3-4) is printed with the document number format and the issuer currency (snapshot field
  `currency`); zero is skipped.
- **Delivery notes** (P3-5) copying an invoice issuer snapshot drop `documentKind`.
- **Registry city** (P3-6): onboarding asks for it (optional) and never infers it from the company city. An RC
  without its city is not stored (the pair stays empty until company settings).
- **Individual banner** (P3-7): the invoice list and new-invoice page explain simple invoices while the type is
  `individual`; the link to company settings appears only with `company_settings.update`. No confirmation step.
- **Missing-field link** (P3-8) points to `/settings/company` (needs `company_settings.read`), otherwise plain text.
- **Rate limit** (P3-9): `GET /owner/legal-type-requirements` is limited like its siblings.

## UI

- Onboarding step 2 and company settings: legal type first, then only the fields of the type, those required
  for legal invoices marked, a non-blocking hint and, for individuals, an explanation of simple invoices. VAT
  regime and mention in company settings.
- Invoice list and detail show a "Simple invoice" badge; the issue action shows the missing company fields from a
  `MISSING_LEGAL_IDENTITY` refusal with a link to company settings.

## Residuals

- Accountant to confirm field sets, wording, and whether TP/capital must print.
- The invoice line editor still offers VAT rates for exempt companies; the API refuses them with a clear error.
- Credit notes are specified in [organization credit notes](organization-credit-notes.md) (2c).
