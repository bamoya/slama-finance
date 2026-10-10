# Company language and starter catalog

## One language default

Company settings → **System language** is the global default: French (`fr-MA`)
or English (`en-GB`). French remains the installation default. Arabic is no
longer a selectable language. UI language remains a personal preference.

- Estimates, invoices and delivery notes offer **Company defaults / French / English**.
  Draft overrides are nullable. Issue/preparation resolves and freezes the effective
  language. Changing company settings cannot change an issued document's language.
- Receipts use the language of their related invoice, frozen in the receipt snapshot.
- Template previews use the current company language.
- Notification rules default to `company`. French and English content are edited
  separately; custom text is never automatically translated. English bodies are HTML
  and are sanitized before saving and sending. FR/EN preview controls show each version.
  Queued messages retain their already-rendered content.
- Schedules offer **Company defaults / French / English**. The effective language is
  captured when a run is created, for its email and PDF/Excel. Regenerating a run uses
  its saved language, never today's company setting. Legacy snapshots default to French.
- Manual report exports inherit company language unless explicitly overridden.
- Password recovery emails inherit company language.

The migration converts retired Arabic settings to French and previously default-French
rules/schedules to company inheritance. It preserves explicit English schedule overrides,
custom French email content, frozen report runs, stored PDFs and queued messages.

## Optional public starter data

In Dokploy set:

```dotenv
SEED_CATALOG=true
```

Deploy the updated **release**, **API**, **UI** images and Compose file. The existing
one-shot initializer applies migrations, provisions runtime access, bootstraps an
administrator if needed, then runs `api/scripts/seed-catalog.mjs` when enabled.
After successful initialization the flag can be removed or set back to `false`.

The seed imports a fixed, reviewed 2026-10-10 snapshot, not live website scraping:

- 8 products, 3 categories, 16 variants with gram weights and MAD prices.
- Public company trade name, address, phone, email and ICE, only where fields are missing.
- No clients, financial documents, payments, invented tax/registration data or emails.
- No media downloads or storage writes. VAT remains unset.

Sources: [company contact](https://slamaagricole.ma/contact/),
[catalog](https://slamaagricole.ma/). Individual product URLs are recorded in the seed
and product descriptions. Variant prices were read from the public product pages'
variation data; they are retail snapshot prices, not a promise of current wholesale prices.
Confirm prices and registered company identity before issuing documents.

The seed runs transactionally under a lock and records its version in `audit_events`.
Repeated deployments do not duplicate data or reset edited prices. Conflicting product
references are skipped completely. Deleted seeded products are not recreated on restart.
Existing administrator-entered company fields are preserved. A failed seed rolls back
its business changes and is retried on the next initialization.

## Optional full demo

For a demonstration installation only, set **`SEED_DEMO=true`** in Dokploy and use
the updated Compose file and release image. The flag must reach the **migrate**
service, not just the API. Recreate/run that one-shot service after changing it.
The initializer logs both seed flags on completion. Demo mode also ensures the
starter catalogue is available; `SEED_CATALOG=true` is not additionally required.

It adds:

- 20 fictional Moroccan clients (companies and individuals; two without activity).
- 40 estimates including four revisions, two superseded originals and two open revision drafts.
- 60 invoices: 50 issued, four cancelled and six drafts. Twenty-four derive from
  12 accepted estimates, and five derive from independent delivery notes.
- 75 payments: 30 fully paid invoices in two installments, ten partially paid,
  pending and cancelled cheques, cash and bank transfers. Other invoices remain unpaid.
- 30 delivery notes: ten independent and 20 invoice-linked, with draft, prepared,
  delivered and acknowledged examples and partial quantities.
- Four demo templates, including a compact theme, and two fictitious bank accounts.
- Rolling 12-month activity with varied quantities and optional VAT on a minority of lines.

All clients, document numbers, templates, accounts and issuer snapshots are marked
**DEMO**. Client email/phone and issuer tax details are deliberately empty. No
staff accounts, scheduled reports, outgoing messages, PDF jobs or stored PDFs are
created. Financial creation, revisions, conversions, delivery allocations and
payments use existing domain services; backdated timestamps and DEMO prefixes
are seed-only fixture metadata. Real company identity and defaults are not replaced.

The complete demo is committed in one transaction under an advisory lock, with a
separate `slama-demo-v1` marker and exact created IDs recorded in `audit_events`.
It requires an existing active administrator but does not change that account's
password, onboarding status or permissions. Reruns preserve user edits and do not
recreate removed demo records. Keep the seed disabled on real accounting databases:
demo records intentionally contribute to dashboard/report totals. Disable the flag
after initialization; disabling it does **not** delete existing demo records.
