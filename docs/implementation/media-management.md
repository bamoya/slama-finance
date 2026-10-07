# Media management

Implemented before Catalog. The Media module owns validated uploads, metadata,
private retrieval and cleanup. Storage remains an infrastructure adapter:
[MinIO locally, OCI in production](media-storage.md). There is no media-library
sidebar page or anonymous download endpoint.

## Structure

```text
api/
  db/schema/media.ts
  db/migrations/0003_media_management.sql
  openapi/modules/media/media.yaml
  src/modules/media/
    index.ts                         public API + composition
    controllers/media.controller.ts
    routes/media.routes.ts
    services/media.service.ts
    services/image-policy.ts
    services/media-cleanup.service.ts
    repositories/media.repository.ts
    mappers/media.mapper.ts
  src/integrations/storage/
    s3.ts                            MinIO / OCI
    local.ts                         private development/test fallback
ui/src/features/media/
  index.ts
  components/media-upload-field.tsx
  components/media-preview.tsx
  hooks/use-media-upload.ts
```

HTTP schemas/types and UI Query operations are generated from OpenAPI; generated
files are ignored. UI requests use the shared Axios client and QueryClient.
Cross-module use goes through public module entry points, enforced by ESLint.

## Database

`media_assets`: UUID `id`, unique `object_key`, sanitized `original_filename`,
validated stored `content_type`, `byte_size`, SHA-256, `purpose`, `status`,
nullable uploader FK, nullable `expires_at`, optimistic `version`, creation/update
timestamps and nullable deletion timestamp. Status is pending/ready/deleting/deleted.
Keys and hashes are internal; API metadata does not expose storage credentials or URLs.

Company settings reference `logo_asset_id`; templates reference `logo_asset_id`
and `signature_asset_id`. These are UUID foreign keys with ON DELETE RESTRICT.
No polymorphic attachment table or untrusted business-owner ID is accepted.

Migration 0003 intentionally removes old key columns WITHOUT copying existing
files. New references start null and signature display is disabled until configured
again. Re-upload images through the UI. Old files are left untouched and are not
tracked by the new cleanup process. No legacy migration/backfill is provided.

## Routes and authorization

| Route                        | Behavior                                                       |
| ---------------------------- | -------------------------------------------------------------- |
| POST `/v1/media/uploads`     | Validate/normalize image, publish metadata; 201                |
| GET `/v1/media/:id`          | Authorized metadata                                            |
| GET `/v1/media/:id/download` | Authorized PNG stream; no-store, nosniff                       |
| DELETE `/v1/media/:id`       | Uploader deletes unreferenced media using expectedVersion; 204 |

All endpoints require a full session, never password-change-only sessions.
Mutations require the trusted browser Origin. Upload limit: 10 requests/minute.
Request is `{ purpose, originalFilename, contentType, data }`; data is canonical
base64. Input is limited to 2 MiB, 16 megapixels and non-animated PNG/JPEG/WebP.
Sharp verifies the actual format, strips metadata and normalizes to a PNG no larger
than 2048×2048 / 8 MiB. No SVG, arbitrary document or executable uploads.

Company-logo uploads require company update OR template create/update. Signatures
require template create/update. Unattached media
is only accessible to its uploader, with current upload rights, during its grace
period. Attached media requires a referencing domain's read permission; signatures
require `templates.read` (no separate signature permission). No administrator ownership bypass
is implied. All grants/account status are rechecked against the database.

`product_image` is available to catalog editors and is retained while a product references it. `template_asset` remains reserved for future template integration.
Enable them only when their owning fields, FK/reference checks and permissions are
implemented. Catalog must register its references before exposing product uploads.
Existing company-logo/signature slots are fully integrated now.

## Lifecycle and concurrency

```text
pending ── successful storage write ──> ready ── eligible delete ──> deleting ──> deleted
   └────────── expired upload ────────────────────────────────────┘
```

Pending records are committed before storage writes, so failed or ambiguous writes
can be recovered. Unattached uploads expire after 24 hours; attachment clears expiry.
Detaching the last reference starts a new 24-hour grace period. Archived templates
still count as references. Replacement never overwrites bytes.

Settings saves, media attachment, deletion and permission changes share the existing
transaction advisory lock. Attachment checks ready state, ownership/access and
purpose within the same transaction as the parent save. Deletion checks every
reference and commits deleting state before contacting storage. No new attachment
can target deleting/deleted/pending/expired media. A failed storage delete remains
retryable. Foreign keys also prevent hard-deleting referenced metadata.

An hourly API timer handles batches of up to 100 expired/pending/deleting records.
It avoids overlapping runs per process, logs counts rather than private data, and
waits for in-flight cleanup before closing the database. Multiple instances serialize
state changes; storage deletion is idempotent. No public cleanup endpoint exists.
Deleted metadata and append-only audit events remain; bytes are permanently removed.
Future immutable invoice/estimate snapshots must register retained asset references
before cleanup can safely operate on their source images. Generated PDFs remain in
the separate document-artifacts design.

## UI

Company/template forms use shared upload and preview components. They support
file validation, upload progress, cancellation, errors, preview, replacement and
removal. Parent save is disabled while uploading. Removal changes the form selection;
the attachment is changed only on save. Cancelled/completed-but-abandoned uploads
are reclaimed by cleanup. Blob preview URLs are revoked on change/unmount.

## Setup and verification

```sh
docker compose -f infra/compose/docker-compose.yml up -d minio
pnpm --filter ./api storage:local:init
pnpm --filter ./api db:migrate
pnpm --filter ./ui api:generate
```

Configure API S3 values per `.env.example`, then restart the API. Without S3 values,
development/tests use `MEDIA_ASSET_DIR` (default `.local/media`). Production never
falls back to filesystem storage. Runtime role needs SELECT, INSERT, UPDATE on
`media_assets`, not DELETE. Locally:

```sql
GRANT SELECT, INSERT, UPDATE ON media_assets TO slama_app;
```

Use the migration owner only for migrations/grants. Both database metadata and
object bytes need backup; volume persistence is not a backup.

Unit/UI tests cover contracts, image validation and forms. PostgreSQL integration
tests cover ownership, signatures, references, stale versions, races, expiry and
storage-failure recovery. Run the optional real MinIO API lifecycle test with:

```sh
TEST_MEDIA_S3=1 TEST_DATABASE_URL=postgres://slama_test:slama_test@127.0.0.1:55439/slama_finance_test pnpm --filter ./api test:integration
```

This flag targets localhost MinIO only, using isolated test database schemas and
unique test object keys. Live OCI verification remains a release prerequisite.
