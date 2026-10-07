# 03 — Company settings, bank accounts and document appearance

[Index](README.md) · Depends on 02 · Next: [Clients](04-clients.md)

Implementation and operational details: [Company settings module](company-settings.md).

Current action registry, restoration, deletion and filtering: [Permission standard](permission-standard.md).

## Models and migrations

Create `company_settings` singleton (`id=1`), `bank_accounts` and
`document_templates`. Create templates before the nullable company default-template
FK or add that FK after both tables exist. Use approved Moroccan identity/address
fields, MAD/fr-MA/Africa/Casablanca defaults, document due/validity defaults and
template options. Templates and bank accounts have `archived_at`; apply L3 audit
fields. Do not add tenant/company membership tables or persist SMTP credentials.
Seed editable defaults, not fabricated legal identity or bank details.

## API contract

| Route                                                             | Behavior / permission                                                       |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `GET /v1/company-settings`                                        | Safe company/defaults DTO, `company_settings.read`                          |
| `PATCH /v1/company-settings`                                      | Validate singleton and defaults, `company_settings.update`                  |
| `GET /v1/bank-accounts`, `GET /v1/bank-accounts/:id`              | Active/archived list/detail, `bank_accounts.read`                           |
| `POST /v1/bank-accounts`, `PATCH /v1/bank-accounts/:id`           | Bank identity/currency, `bank_accounts.create` / `bank_accounts.update`     |
| `POST /v1/bank-accounts/:id/archive`                              | Preserve existing references, `bank_accounts.archive`                       |
| `GET /v1/document-templates`, `GET /v1/document-templates/:id`    | Template selection/detail, `templates.read`                                 |
| `POST /v1/document-templates`, `PATCH /v1/document-templates/:id` | Validated appearance configuration, `templates.create` / `templates.update` |
| `POST /v1/document-templates/:id/archive`                         | Clear/replace default atomically, `templates.archive`                       |
| `POST /v1/document-templates/preview`                             | Bounded sample rendering without financial persistence, `templates.read`    |
| `POST /v1/company-assets`                                         | Logo/signature upload and private object key, `company_settings.update`     |

Additional lifecycle routes: `POST /v1/bank-accounts/:id/restore` requires
`bank_accounts.restore`; `DELETE /v1/bank-accounts/:id` requires
`bank_accounts.delete`; `DELETE /v1/document-templates/:id` requires
`templates.delete`. All require `expectedVersion`; deletion refuses referenced records.
Signature uploads additionally require `templates.upload_signature`.

Preview may initially use safe sample HTML; finalized PDF parity is verified in 06. Return only permitted configuration to document editors; authoring documents
does not imply permission to change company settings. Do not expose raw arbitrary
HTML/CSS execution through template fields.

## Services and middleware

Validate fields by type, not broad coercion: Moroccan identifiers as strings,
nonnegative due-day defaults, allowlisted locales/layouts, safe colors and currency.
Incomplete setup can be saved but issuing documents later checks completeness.
Normalize separate delivery/address conventions consistently with clients.

Storage adapter handles private logo/signature objects: authenticated upload,
size limit, validated image type/content, generated safe key, no public arbitrary
path. Restrict signature access. Store no signed URL in DB. Retain assets referenced
by frozen document snapshots; cleanup must not break old PDFs. No new asset table
is required for this bounded MVP; document-artifact storage is introduced in 06.

## UI and state

Pages: `/settings/company`, `/settings/bank-accounts`, existing
`/settings/invoice-appearance`. Reusable CompanyIdentityForm, AddressFields,
BankAccountForm, TemplatePicker, AppearanceControls and PreviewPane. Use dedicated
create/detail/edit pages for bank accounts/templates and view/edit pages for the
company singleton. Keep confirmations in dialogs. Group long forms into a main
column and a right-hand summary/branding column; templates use a wider preview
column. View pages display readable values, not disabled inputs. All layouts stack
on mobile; list/select/archive actions stay explicit.
TanStack Query owns settings/accounts/templates, TanStack Form owns draft values.
An editor-scoped appearance context is optional for controls/preview, never a
global financial store. Save invalidates defaults and template queries. Show
upload progress/errors; keep the common container and dark-mode tokens.

## Acceptance and exit

Test singleton constraint, invalid identifier formats/defaults, unauthorized
uploads, oversized/spoofed content, archive-default transaction and historical
asset preservation. UI test save/reload, logo/signature preview and archive flow.
Exit: authorized admin can configure the company and usable document defaults.
