# Company settings implementation

Current action registry, restoration, deletion and filtering: [Permission standard](permission-standard.md).

## Scope and routes

The `settings` API module owns company identity/defaults, bank accounts and document templates. Private uploads now belong to the [Media module](media-management.md); settings reference media UUIDs through foreign keys. Both modules follow controller → service → repository layers. Forms use TanStack Form; Orval-generated TanStack Query hooks use the shared Axios transport and generated response validation. All HTTP schemas and types are generated from the owning OpenAPI module.

| UI                             | API                                                                      | Permissions                                                                                |
| ------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `/settings/company`            | GET/PATCH `/v1/company-settings`                                         | `company_settings.read` / `company_settings.update`                                        |
| `/settings/bank-accounts`      | GET/POST `/v1/bank-accounts`, GET/PATCH `/:id`, POST `/:id/archive`      | `bank_accounts.read` / `bank_accounts.create/update/archive`                               |
| `/settings/invoice-appearance` | GET/POST `/v1/document-templates`, GET/PATCH `/:id`, POST `/:id/archive` | `templates.read` / `templates.create/update/archive`                                       |
| Template editor preview        | POST `/v1/document-templates/preview`                                    | `templates.read`                                                                           |
| Logo/signature fields          | POST `/v1/media/uploads`                                                 | Purpose-specific company/template write permission; see Media documentation                |
| Private image preview          | GET `/v1/media/:id/download`                                             | Owner resource read permission; signatures additionally require `templates.read_signature` |

Lists include active and archived records; the UI hides archived records by default. Bank accounts and templates use dedicated create, detail and edit pages. Dialogs are reserved for archive and discard confirmations. The old mock invoice-appearance screen has been replaced. Company settings are a real sidebar entry.

### Page layout and navigation

- Company: `/settings/company` is a readable details page; `/settings/company/edit` edits the singleton. There is no company creation route.
- Bank accounts: `/settings/bank-accounts`, `/settings/bank-accounts/new`, `/settings/bank-accounts/:recordId`, `/settings/bank-accounts/:recordId/edit`.
- Templates: `/settings/invoice-appearance`, `/settings/invoice-appearance/new`, `/settings/invoice-appearance/:recordId`, `/settings/invoice-appearance/:recordId/edit`.
- Company identity, tax, contact and address cards occupy the main column; logo and document defaults sit on the right. Bank identity and identifiers sit on the left, with account label/currency on the right. Templates use two equal desktop columns for controls and preview. All layouts stack on mobile and retain the common 1500px outer container.
- View and edit share field groups and ordering. Views use readable values and private image previews, not disabled inputs. Create/edit share `SettingsForm`; Save returns to details and Cancel returns to details or the list. Link navigation with a dirty draft opens a discard confirmation; refresh/closing the tab uses the browser's unsaved-change warning.
- Direct new/edit routes require both view and write permissions. Archived records remain readable and cannot be edited, including through a direct edit URL. Detail reads use the generated single-record API operations. Drafts retain their original version until saved or explicitly reloaded.

Bank filtering, restoration and deletion use the action-level permissions and
reference guards documented in [the permission standard](permission-standard.md).
The lifecycle additions are POST `/v1/bank-accounts/:id/restore` and DELETE
`/v1/bank-accounts/:id` or `/v1/document-templates/:id`; all require `expectedVersion`.

## Database and invariants

Migration `0001_company_settings.sql` creates `company_settings`, `bank_accounts`, `document_templates`, and persistent `audit_events`. It seeds the `id=1` company singleton with MAD, fr-MA, Africa/Casablanca and 15-day due/validity defaults. Legal identity, banking details and the default template remain empty; no fabricated company data is seeded. Existing users and roles are retained. The admin role receives the six new permissions.

Company settings store the agreed Moroccan fields: legal/trade name, legal form, nullable capital in MAD, billing address, ICE, IF, RC number/city, professional tax number, email, phone, logo and document defaults. ICE requires 15 digits; supplied IF/RC/Patente values accept 1–20 digits without inventing one shared fixed length. RC number and city must be supplied together. Moroccan postal codes use five digits. Identifiers remain strings to retain leading zeros. Phone numbers accept Moroccan national format or valid international numbers and are normalized to E.164. These checks are application format rules, not legal certification; required issuance fields belong to the sales module.

Supported document currencies are MAD/EUR/USD, locales fr-MA/ar-MA/en-GB, and timezone Africa/Casablanca. Due/validity defaults are integers from 0 to 3650. Capital is a nullable decimal string (18,2), never a floating-point amount. Bank accounts require RIB (24 digits) or IBAN (format plus mod-97 checksum); a supplied Moroccan IBAN/RIB pair must match.

Mutable records include version, creation/update timestamps and actor FKs. Update bodies carry all editable fields plus `expectedVersion`; these PATCH operations replace the editable configuration, not arbitrary partial fields. Archive bodies also require the expected version. Stale writes return `409 STALE_VERSION`. The UI keeps the draft and offers explicit discard/reload; background refetches do not replace unsaved edits. Records and their audit entries commit in the same transaction. Write permission and enabled account state are rechecked under the identity transaction lock.

Archiving a template clears the company default in the same transaction, increments the company version, and audits both changes. Archived records cannot be edited or selected as new defaults, but can still be read for historical references. Archived template images stay referenced. Replacing/removing the final reference schedules the old media for cleanup after 24 hours; there is no immediate file deletion. No financial documents are modified.

VAT remains optional/off by default: no company toggle silently enables it. Number issuance (FAC/DEV/BL/PAY + year + random suffix) remains owned by the upcoming sales/payment modules, not a mutable sequential company counter.

## Private images and preview

Media uploads accept `{ purpose, originalFilename, contentType, data }`, where data is canonical base64. Limits: 2 MiB original image, 3 MiB HTTP body, 16 million decoded pixels, static PNG/JPEG/WebP only. Sharp validates the decoded format against the declared type, rejects malformed/animated content, strips metadata and re-encodes PNG with dimensions at most 2048×2048. Generated immutable keys contain no original filenames. Files are never served as public static content; authenticated retrieval uses `no-store` and `nosniff`.

Development uses MinIO through the shared S3 adapter; see [media storage](media-storage.md). With all S3 values absent, `MEDIA_ASSET_DIR` is the private fallback (default `.local/media`, relative to the API working directory and ignored by Git). Production uses a private S3-compatible bucket, including OCI's compatible endpoint:

```dotenv
S3_ENDPOINT=https://your-private-s3-compatible-endpoint
S3_REGION=your-region
S3_BUCKET=your-private-bucket
S3_ACCESS_KEY_ID=configure-outside-git
S3_SECRET_ACCESS_KEY=configure-outside-git
```

Configure all four endpoint/bucket/credential settings together. Production refuses a non-HTTPS storage endpoint. If storage is not configured in production, image operations fail closed with 503; there is no fallback to ephemeral local files. Provision the private bucket and least-privilege access outside the app. This implementation does not create cloud resources or claim live OCI connectivity has been tested.

Template preview is bounded sample HTML, not a final PDF or a persisted invoice. It escapes text, allowlists layouts/colors, uses a small embedded logo thumbnail, and renders in a sandboxed iframe with scripts disabled. Product-name columns and the no-default-VAT rule are reflected in the sample. Private signatures are previewed separately to authorized editors; the generic sample shows a signature placeholder. Final PDF/snapshot parity remains sequence 06, as planned.

## Local setup and verification

```sh
pnpm --filter ./api db:migrate
pnpm --filter ./ui api:generate
```

Drizzle commands run through `tsx` so `.js` ESM imports resolve correctly from source schemas. The forward migration was applied locally without resetting the persistent volume. For the existing non-owner local runtime role, grant only the new required privileges:

```sql
GRANT SELECT, INSERT, UPDATE ON company_settings, bank_accounts, document_templates TO slama_app;
GRANT DELETE ON bank_accounts, document_templates TO slama_app;
GRANT SELECT, INSERT ON audit_events TO slama_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM slama_app;
```

Use the corresponding runtime role in other environments; never use the migration owner for the API. Include the private asset store in backup/restore planning. Audit mutation/truncation permissions must remain denied to the runtime role.

Tests cover singleton/identifier/default validation, authorization, temporary-password session restrictions inherited from identity, optimistic concurrency, audit transaction behavior, default-template archival, spoofed/oversized images, private signatures, historical asset retention, safe previews, company save/reload/conflicts, bank creation/archive and logo/signature previews. Integration fixtures now apply all migrations rather than creating a test-only audit table. Browser-control was unavailable in the implementation environment; UI behavior is verified with component tests and build/type checks rather than a manual browser review.
