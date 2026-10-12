# Company language and fresh installations

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

## Fresh installations

Startup applies schema migrations, configures runtime database access and creates the
initial administrator when configured. No demonstration company, categories, products,
clients or financial documents are imported. Configure the company and enter real
business data through the application.
