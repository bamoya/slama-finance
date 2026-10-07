# 06 — Files, background jobs and generic notification delivery

[Index](README.md) · Depends on 03 · Next: [Estimates](07-estimates.md)

## Modules and models

Create `document_artifacts`, `background_jobs`, `outbound_messages`,
`outbound_message_attachments`, and business-owned `notification_dispatches`.
Use approved fields, lease indexes and uniqueness constraints. Artifact ownership
is `(document_type, document_id)` with no polymorphic DB FK; dispatch source IDs
are likewise validated by their producer. Attachment FK is only to its message;
immutable private object keys identify files. Apply L3 audit/creator coverage.

Implement separate services: artifact access/publication, business job queue,
delivery queue, producer dispatch repository and storage/email adapters. Workers
may run as a separate process from the same API image against PostgreSQL. No new
repository, Redis or broker. Remove BullMQ/ioredis and Redis configuration only
after checking no active code still depends on them.

## Storage policy for the OCI Always Free deployment

### Implemented PDF regeneration (October 2026)

- Draft saves capture the current client identity/contact data. Issuing invoices or
  estimates, or preparing delivery notes, captures it again inside the finalization
  transaction, then freezes it. No client update rewrites finalized documents.
  New documents derived from an older invoice/estimate use current client identity;
  the source document stays unchanged. Delivery addresses explicitly entered on a
  note, product lines, prices and payment data are not refreshed by this capture.
  Draft PDF generation remains unavailable; issue/prepare the document first.
- Issued/finalized invoices, estimates and delivery notes remain immutable in their
  business information. The API rejects updates; direct UI edit routes return to details.
- Details offer **Regenerate PDF**, with confirmation and original/latest design choices.
  Requires both the resource's `read` and `update` permissions; downloading requires `read`.
- `POST /v1/documents/{documentType}/{id}/regenerate-pdf` accepts `{ "design": "saved" | "latest" }`.
  It renders synchronously and returns the active artifact ID and generation timestamp.
  The UI waits for completion, disables repeat submission, and refreshes artifact queries.
- Saved design uses the original appearance snapshot. Latest uses the document's current
  template (company default if none was selected), copying presentation fields only.
  An unavailable/archived template fails explicitly. Customer/issuer identities, dates,
  numbers, products, quantities, prices, tax and payment terms are never refreshed.
- Delivery notes currently have no appearance snapshot: saved retains the original
  delivery-note layout; latest applies the company's default template. This limitation
  is stated in the confirmation dialog. No database schema migration was introduced.
- Each replacement uploads a new immutable object before atomically switching the
  existing artifact metadata. The artifact ID and source version remain stable.
  Compare-and-swap prevents concurrent replacements; failure leaves the old download intact.
  Audit records retain actor, timestamp, original/new keys, hashes and selected design.
- Existing unreferenced-object cleanup handles superseded files and failed candidates.
  Its 24-hour age threshold is based on object creation, not replacement time; this is
  not a guaranteed 24-hour rollback window for old PDFs. Do not delete referenced files.
- Runtime grants now include `UPDATE` on `document_artifacts`; apply
  `pnpm --dir api db:grant-sales-runtime` when deploying this code to an existing database.

### Baseline lifecycle

- Drafts and previews are rendered on demand and are not persisted as files.
  Saving, downloading, or emailing an unchanged document must not create another
  object. On issue/finalization, publish one immutable PDF for that printable
  content version. Later downloads and emails reuse its object key.
- The `(document_type, document_id, source_version, format)` tuple is unique.
  Publication is idempotent across worker retries; never overwrite an issued PDF.
  Any genuine corrected document must follow its own explicit lifecycle/version.
- Keep PDF text vector-based, resize/compress embedded images, and enforce a
  measured maximum PDF size before upload. Record `byte_size` and SHA-256 so
  storage use can be monitored. Alert before the combined OCI Object/Archive
  allowance is exhausted; include media and backups in capacity planning.
- Do not automatically delete finalized financial PDFs to stay within a free
  quota. Deletion/retention needs an explicit business and legal policy. If the
  quota is approached, add paid or external archival capacity while preserving
  independent backups. Draft previews and unreferenced failed uploads may be
  cleaned up after the existing reference/grace-period checks.

## API and internal interfaces

| Interface                                   | Behavior                                                                                     |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `GET /v1/jobs/:id`                          | Safe status for authorized initiating user/admin; no raw payload                             |
| `POST /v1/jobs/:id/retry`                   | Audited bounded recovery, proposed `operations.manage`                                       |
| `GET /v1/artifacts/:id/download`            | Resolve owner with allowlisted type; verify owner permission; stream/private short-lived URL |
| `GET /v1/notification-messages`             | Redacted operational list, proposed `notifications.monitor`                                  |
| `POST /v1/notification-messages/:id/retry`  | Same logical message, audited attempt-budget extension; `notifications.manage_delivery`      |
| `POST /v1/notification-messages/:id/cancel` | Atomic queued-only cancellation; same permission                                             |
| Internal `enqueueReadyMessage(tx, payload)` | Fully composed message/attachments + idempotency key; no public arbitrary-send endpoint      |
| Internal `enqueueBusinessJob(tx, task)`     | Validated allowlisted task payload, same transaction as business change                      |

For current domains, artifact guards are registered as their modules ship; deny
unsupported/missing owners. Jobs must have an initiating actor or explicit
operations permission; knowing a UUID never grants access. Ordinary users get
only relevant job status through their permitted business action.

## Execution rules

Claim with row locks/SKIP LOCKED, attempt count, fresh lease token and expiry;
commit before provider/rendering I/O. Heartbeats/completion are token-fenced.
Recover expired claims; bounded exponential backoff/jitter and terminal failure.
Enforce process-wide/provider concurrency/rate limits. A lease cannot undo a
provider send; surface uncertain outcomes and use provider idempotency when
available. Retried keys cannot silently accept changed payloads.

Artifact publication validates/locks owner and content version, renders outside
the transaction from frozen input, and publishes idempotently. Cleanup of orphan
uploads checks references/grace period. File deletion checks both artifact and
attachment tables. Rendering, signed URLs and email credentials never become
business-table secrets. Files/PDF buffers are private, size-bounded and redacted.

Provide random public-number helper now: FAC/DEV/BL/PAY + assignment year + random
10-digit suffix, unique collision-safe retry in business transaction. It is not
a public security token or claim of legal compliance.

## UI and state

Add reusable JobStatus/DownloadAction/DeliveryStatus components. Minimal operations
view at `/settings/notifications/delivery` for authorized users; later policy
settings are sequence 12. Poll Query status only while work is active, stop on
terminal states/unmount, invalidate owner artifacts after completion. No queue
store in the browser and no business decisions in the notification worker.

## Acceptance

Use fake provider/storage adapters plus PostgreSQL integration tests: concurrent
claims, worker crash, lease takeover, stale completion, final-attempt crash,
duplicate enqueue, changed-payload rejection, cancellation race, ownership denial,
artifact collision and attachment retention. Verify downloads and error recovery
in UI. Exit: tested generic plumbing ready for domain-specific producers.
