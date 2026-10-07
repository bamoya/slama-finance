# Media storage foundation

Use one S3 adapter (`api/src/integrations/storage/s3.ts`) for local MinIO and
production OCI Object Storage's S3 Compatibility API. The [Media module](media-management.md)
now owns company logo/signature uploads and private asset metadata. Business records
store media UUID references; the media table stores object keys, never local URLs.

## Local setup

```sh
docker compose -f infra/compose/docker-compose.yml up -d --build minio
pnpm --filter ./api storage:local:init
pnpm --filter ./api storage:local:check
```

The initial source build can take several minutes. API endpoint:
`http://localhost:9000`; console: `http://localhost:9001`.
Local-only credentials: `slama-local` / `slama-local-development-only`.
Bucket initialization is idempotent and does not enable public access. The check
creates one uniquely named test object and deletes only that object afterwards.

Copy the S3 values from `api/.env.example` into your existing API environment
without replacing database/email settings, then restart the API. Existing images
are intentionally not migrated: migration 0003 clears old references; re-upload
through the UI. Old files remain untouched.

The `minio-data` named volume survives container recreation. `docker compose down
-v` destroys it; a volume is not a backup. Both MinIO ports bind only to localhost.
Local root credentials are not production credentials.

MinIO's community repository is archived. This development-only image builds the
pinned upstream `RELEASE.2025-10-15T17-29-55Z` source rather than depending on an
old binary image. Do not expose this service publicly or use it in production.
Source and license: <https://github.com/minio/minio> (AGPLv3).

## OCI configuration and release gate

Provision a private bucket and a least-privilege OCI identity outside the app.
Set `S3_ENDPOINT` to its HTTPS S3-compatible endpoint, `S3_REGION` to the actual
region, `S3_BUCKET`, and the access/secret pair from OCI Customer Secret Keys.
Credentials remain server-side. Production rejects HTTP storage endpoints.
The app does not create cloud resources. No live OCI validation is claimed.

The adapter uses path-style addressing and required-only checksum behavior. Its
operations are PUT, GET, DELETE and short-lived signed GET URLs (1–900 seconds).
Calling domains must authorize access and check references/retention before
deleting. Signed URLs are bearer credentials: do not log or store them.

Before release, verify all operations against a disposable OCI object, including
duplicate-key rejection (`If-None-Match: *`), private access, expiry, checksums
and missing-object behavior. Compatibility is not parity. If conditional writes
are unsupported or ignored, do not weaken immutability silently; resolve the
publication strategy before enabling document artifacts.

OCI reference: <https://docs.oracle.com/en-us/iaas/Content/Object/Tasks/s3compatibleapi.htm>.

## Media module

Metadata, ownership, explicit attachment FKs, orphan cleanup and reusable upload UI
are now implemented; see [media management](media-management.md). The old company
upload endpoints were replaced by `/v1/media` routes. The private filesystem fallback
uses `MEDIA_ASSET_DIR` only when all S3 values are absent in development/tests.
