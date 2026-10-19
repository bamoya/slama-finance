# Flexible deletion and cancellation agreement

Status: approved design; implementation is staged. Do not treat this document as
evidence that every action below is already available.

## Non-negotiable behaviour

- Cancellation keeps records; permanent deletion removes them.
- Every single/bulk permanent delete uses a server-calculated impact dialog.
- No automatic cascade beyond the explicitly approved rules below.
- Delete means the existing resource `.delete` permission; cancellation/state
  changes mean `.update`. Check every affected resource, not only selected roots.
- No public registration or new permission vocabulary is introduced.
- Cancelling/deleting a payment changes accounting records, never a real bank
  transfer. Cancelling a BL does not physically undo delivery.
- Database changes are atomic. Files are cleaned asynchronously after commit.
- Sent emails cannot be recalled. Retain a minimal audit record of the operation.

## Document relationships

```text
Estimate (one)
  └─ Invoice (zero or many)
       ├─ BL (zero or many)
       └─ Payment (zero or many)
            └─ Receipt / generated artifacts

An independent BL has no invoice yet.
Each BL can belong to at most ONE invoice.
```

An invoice is an independent financial document, not a disposable part of an estimate.
The single `delivery_notes.invoice_id` is the authoritative BL ownership link.
Line allocations may trace billed lines/quantities inside that same invoice;
they must never allow a second invoice to claim the BL.
One invoice can consolidate several independent BLs for the same client.

## Resource rules

| Resource          | Default permanent deletion                                                                                                                                        | Optional explicit cascade                                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Estimate          | Delete its files; stop pending jobs/emails; detach invoices by nulling `sourceEstimateId`. Preserve the source public number in an invoice snapshot/reference.    | Unchecked by default: also delete associated invoices, their payments/receipts/BLs/files.                                                       |
| Invoice           | Delete its payments, receipts, linked BLs and exclusively owned files; stop pending jobs/emails. Never delete its client, source estimate or products.            | No hidden upward cascade.                                                                                                                       |
| BL                | Delete its files and pending jobs/emails; remove line links; preserve its invoice and payments.                                                                   | None.                                                                                                                                           |
| Payment           | Delete its receipt/files, stop pending work, recalculate invoice balances. Never delete its invoice.                                                              | None.                                                                                                                                           |
| Category          | Delete category; set product category references to null.                                                                                                         | Unchecked by default: also delete its products and variants. Never delete sales documents.                                                      |
| Product           | Delete its variants and detach historical product/variant references; retain document line names, weights, prices and quantities. Release unshared product media. | Never cascade to estimates, invoices or BLs.                                                                                                    |
| Client            | Remove preferences and pending client emails. Detach documents while retaining their client snapshots.                                                            | Unchecked by default: also delete ALL of this client's estimates, invoices, BLs, payments, receipts and files, including independent documents. |
| Staff             | Revoke sessions/reset tokens, remove account access/personal data; preserve historical actions under a non-login “Deleted user” attribution.                      | Never delete business/audit records. Protect self-deletion and the last active administrator.                                                   |
| Bank account      | Clear company default and detach references. Preserve bank snapshots in issued documents/payment history.                                                         | Never delete documents/payments.                                                                                                                |
| Document template | Clear company default and detach references. Preserve issued appearance snapshots and needed logo/signature assets.                                               | Never delete documents.                                                                                                                         |
| Report schedule   | Delete schedule/runs and exclusively owned output files; stop queued reports/emails.                                                                              | Follow the existing approved schedule cascade.                                                                                                  |
| Report run        | Delete run and exclusively owned output files; cancel pending work.                                                                                               | Never modify source financial records.                                                                                                          |
| Media             | Delete only when no remaining record/snapshot needs it, or after explicit safe detachment.                                                                        | Never silently break an issued document.                                                                                                        |

Estimate revision deletion detaches predecessor/successor links. It does not delete
other revisions or automatically make a superseded estimate current again.

Client-only deletion must preserve usable drafts: keep/edit saved identity details
or choose a replacement client. Do not require a now-deleted client row to issue
a preserved draft. Freeze current details before detaching if a draft lacks them.

Frozen report runs remain historical captures; current dashboard totals recalculate.
Do not rewrite previously captured reports following financial record deletion.

## Cancellation rules

- Invoice: cancel active payments and all linked non-cancelled BLs in the same
  transaction. Mark receipts cancelled/invalidate active receipt caches. Keep history.
- Estimate: cancel the estimate only; existing invoices/payments/BLs remain valid.
- BL: cancel only the BL, preserving its invoice and payments.
- Payment: cancel only the payment/receipt status; recalculate the invoice balance.
- No implicit restoration of descendants when a parent is later restored.
- Already-cancelled descendants remain cancelled; do not overwrite their reasons.
- Missing descendant `.update` permission blocks the entire cascade.

Invoice cancellation impact should be shown before confirmation, just like deletion.

## Shared impact dialog (single and bulk)

```text
Delete 3 selected estimates?

[ ] Also delete their linked invoices, payments, receipts and BLs

Will delete:       3 estimates, 3 PDFs
Will preserve:    5 invoices (detached)
Pending work:     2 emails/jobs will be cancelled

Permanent deletion cannot be undone.
[Cancel]                                      [Delete permanently]
```

- Recompute impact when the checkbox changes; disable confirm while loading.
- Show names/numbers as well as deduplicated totals by resource and operation.
- Show detachments, retained/shared files, cancelled jobs and blocking reasons.
- Mixed forbidden/stale/nonexistent selections block confirmation. No silent skips
  or partial success. Avoid exposing details the operator cannot read.
- A bulk selection plus its dependency graph is one atomic action, not a loop of
  independent DELETE calls. Overlapping selections/dependencies count once.
- Keep destructive actions last, use the shared destructive button, and keep
  detail-page full buttons versus icon-only table actions consistent.
- French defaults and English support, shared mobile dialog and dark-mode tokens.

## Server protocol and concurrency

Implement preview/execute contracts in OpenAPI and generate both API/UI schemas,
types and React Query clients. Never hand-write duplicate request/response types.

Preview input: action, resource, selected IDs/versions, cascade options. Preview
output: affected records/counts, detachments, blocked reasons, required permissions,
short-lived confirmation fingerprint bound to actor/action/options/selection/impact.
The fingerprint is not authorization; current permissions are always checked again.

Execution carries the same inputs and confirmation fingerprint. Lock roots and
dependencies deterministically, rebuild/revalidate the impact graph and versions,
then commit all business changes and audit/cleanup work together. A changed graph,
version or option returns an impact-changed conflict; refresh and reconfirm.
Child creation and background jobs must coordinate on the same ownership locks.
Retries must be idempotent and must not recreate already-deleted work.

Stop queued work and fence running workers before deleting owners; a late worker
must not publish a PDF or email for a deleted record. Release attachment/artifact
pins only when no preserved record/message still requires them. Cleanup retries
must be durable; storage failure must not roll back a committed database deletion.

## Architecture and sequencing

Preserve existing domains and controller/service/repository layers. Domain services
own their rules; share preview/confirmation mechanics rather than moving all business
logic into UI handlers or a generic support service. Cross-domain calls use module
public APIs. UI uses shared impact-dialog/buttons/Can, generated hooks and query
invalidation; no per-page copies or permission-array checks.

1. **Implemented:** establish one invoice per BL in API and PostgreSQL; retain
   allocation rows only for line traceability and update regression tests.
2. **Implemented:** shared signed preview/fingerprint confirmation and dialog,
   including load/error/review-again states and the bulk confirmation extension.
3. **Implemented:** invoice cancellation cascades (single/bulk) cancel
   active payments and draft/delivered BLs atomically, invalidate current receipts
   and pending emails, audit every change and preserve already cancelled records.
   **Also implemented:** permanent deletion of estimates, invoices, BLs and
   payments from details and lists, with one atomic bulk graph, shared impact
   dialog, explicit estimate cascade, revision/source detachment, preserved source
   numbers, file retention/cleanup and queued/running preparation fencing.
   Estimate, BL and payment single/bulk cancellation also use signed atomic
   confirmation. Billed BL cancellation retains its allocations and does not
   cancel invoices/payments. Other bulk lifecycle actions (archive/restore,
   mark delivered, PDF regeneration) retain their existing per-record semantics.
4. **Implemented:** client/product/category single and atomic bulk deletion with
   signed impact confirmation, explicit cascade options, editable orphan drafts
   and preservation of historical snapshots/shared media.
5. **Implemented:** staff access/personal-data removal with retained historical
   attribution; bank/template reference detachment and company-default clearing.
6. End-to-end review: all table/detail actions, permissions, races, worker fencing,
   rollback, shared file retention, French/English, mobile and dark mode.

Do not enable an unrestricted legacy DELETE before its impact-confirmed execution
path exists. The database is deployed: keep applied migrations and historical
snapshots immutable. Implement schema changes in new forward migrations and new
Drizzle snapshots. Never reset an existing database automatically.

### Current impact-confirmed endpoints

- `POST /v1/invoices/cancellation/preview`: accepts `invoices: [{ id,
expectedVersion }]` (1–100). Returns the actual invoice/payment/BL identifiers
  and numbers, issued receipt count, already-cancelled count and confirmation token.
- `POST /v1/invoices/cancellation`: same selection plus `token` and `reason`.
  Locks and revalidates the complete graph and permissions; returns 204 only after
  the entire transaction commits. A stale/expired preview changes nothing.
- Both the invoice detail action and list bulk cancellation use this flow.
  Invalid entries block the entire selection; none are silently skipped.
- Tokens expire after five minutes and are bound to the actor, action and full
  current graph. A process-local signing key intentionally invalidates previews
  on API restart. Multiple API replicas would require a shared signing key.
- Cancelled draft BLs may retain a null number; cancellation never issues a new
  legal document number. Other snapshots stay frozen; current receipt access is
  invalidated through the payment version. Historical artifacts are retained.
- The deprecated `/v1/invoices/{id}/cancel` remains conservative and non-cascading;
  existing related-record blockers remain. The UI no longer uses it.

### Sales permanent deletion

- `POST /v1/sales/deletion/preview` accepts `resource` (`estimates`, `invoices`,
  `delivery_notes` or `payments`), `records: [{ id, expectedVersion }]` (1–100)
  and `cascadeInvoices` (false by default; valid only for estimates).
- The response lists deduplicated delete/detach groups, required permissions,
  exclusively owned/shared file counts, active preparation jobs, queued emails,
  sending-email blockers, and the signed five-minute confirmation.
- `POST /v1/sales/deletion` accepts the identical inputs plus `token`. Both
  single and bulk UI actions use it; invalid selections block the whole action.
  The legacy DELETE endpoints remain conservative and are not used by the UI.
- Estimate-only deletion nulls invoice provenance links but retains the source
  number in `invoices.source_estimate_number_snapshot`. Invoice printable content
  and already generated files are not rewritten. Revision links are detached
  without reactivating superseded predecessors.
- Invoice deletion removes payments/receipts, every linked BL, line allocations
  and owned artifacts. Deleting a BL removes only its own lines/allocations;
  deleting a payment recalculates the preserved invoice balance.
- Removed-owner preparation jobs become cancelled tombstones with cleared
  payloads/leases; late completion fails its lease fence and owner publication
  checks. Associated dispatch/message/attachment rows are removed. An email in
  `sending` state blocks deletion until its outcome is known; sent mail cannot
  be recalled. Frozen report runs and shared brand media are not changed.
- Generated file metadata is released transactionally; storage deletion is
  attempted after commit under existing object-reference locks. Other artifact
  and attachment references retain shared files. Failed deletions and worker
  upload orphans remain discoverable by the existing 24-hour-grace maintenance
  scan, so cleanup survives API restarts without holding a database transaction
  open around storage I/O.
- Deleted invoice conversion operation IDs are retained in audit history. Retrying
  the same operation cannot recreate a deleted invoice; intentional creation uses
  a new operation ID.
- Forward migration `0002_flexible_document_lifecycle.sql` adds and backfills the
  source-number column. Applied baseline migrations and snapshots remain unchanged.

### Client, catalogue and staff deletion

- `POST /v1/clients/deletion[/preview]`: `records: [{id, expectedVersion}]`
  and `cascadeDocuments` (default false). Client-only deletion nulls document
  client links and removes preferences/pending emails. Issued identities and
  content versions remain frozen. Draft identities are captured at deletion;
  retained drafts can still be edited and issued or assigned a replacement
  active client. New documents cannot be created with an empty client identity.
  Creating a new BL from an orphan invoice, or converting orphan BLs, requires
  an active client; unrelated removed identities must never be combined.
- `POST /v1/catalog/deletion[/preview]`: `resource: products|categories`,
  versioned `records` and `cascadeProducts` (default false, categories only).
  Category-only deletion uncategorises products. Product deletion removes its
  variants and detaches live catalogue links from sales lines, preserving all
  printable names, references, weights, prices and quantities. Issued content
  versions are unchanged. Product images are released only if unreferenced.
- `POST /v1/staff/deletion[/preview]`: `ids` (1–100). Confirmation adds `token`
  to each request above. Every selection is atomic and requires root and affected
  resource permissions. Client/catalogue confirmations also bind record versions.
- Staff deletion retains a hidden, disabled `users.deleted_at` attribution row
  named `Deleted user`, with a unique non-deliverable replacement email and no
  usable password. Roles, sessions, recovery tokens, avatar and preferences are
  removed. Immutable audit rows, report snapshots and business ownership FKs
  are not rewritten or cascaded. Owned schedules are stopped through the existing
  authorization-change callback. Self-deletion and removal of the last active
  administrator remain blocked.
- Forward migration `0002_flexible_document_lifecycle.sql` adds `users.deleted_at`
  and nullable document client links. Existing installations upgrade through the
  normal migration runner; no reset or replacement database is required. The new
  Drizzle snapshot represents the upgraded state, preserving earlier snapshots.

### Settings deletion and remaining cancellation flows

- `POST /v1/settings/deletion[/preview]` accepts `resource` (`bank_accounts` or
  `templates`) and versioned `records` (1–100). Confirmation adds `token`.
  All roots and referenced sales records are locked, permissions checked and
  included in the signed impact. Clearing a company default additionally requires
  `company_settings.read/update`. Mixed invalid selections block the whole batch.
- Deleting banks/templates nulls live references, never financial records or
  issued appearance/bank snapshots. Payment bank details are captured in nullable
  `payments.bank_account_snapshot` on creation and, for older rows, on detachment.
  Technical bank detachment deliberately retains the payment version so an issued
  receipt remains accessible. The immutable creation request is not rewritten.
- Template media release checks surviving estimate/invoice/receipt appearance
  snapshots. Required assets remain pinned even after template removal. BLs do
  not store template or brand-asset references in the current schema; their saved
  renderer uses its existing fixed design.
- `POST /v1/sales/cancellation[/preview]` accepts `resource` (`estimates`,
  `delivery_notes`, `payments`) and versioned `records`; confirmation adds `reason`
  and `token`. Preview and confirmation require `.read/update` on the selected
  resource. Every selected row must be eligible; no silent skips or partial success.
- Estimate cancellation preserves its invoices and descendants. BL cancellation
  preserves invoice links/allocations and payments, including already billed BLs.
  Payment cancellation invalidates current receipt access and recalculates balances.
  Pending notification work is invalidated transactionally. Invoice cancellation
  continues using its existing cascading signed endpoint, now checking descendant
  read permissions before exposing identifiers in preview.
- Single/detail and list/bulk UI actions share the same feature dialogs and generated
  operations. Legacy settings DELETE remains conservative. Existing explicit
  single-record cancellation endpoints remain compatible; BL cancellation now
  allows billed notes and invalidates printable state/pending notifications.

## Required verification

Latest automated verification (2026-10-19): all 24 API integration files passed
(218 tests passed; the opt-in live-S3 test was skipped because `TEST_MEDIA_S3`
was not enabled). The clean UI suite passed 364 tests; API unit/contract tests
passed 178 tests. Architecture/generator checks, TypeScript, lint and French
translation coverage also passed. Integration fixtures use an isolated localhost
test database; no existing application database is reset by these checks.
The incremental-upgrade tests start from the deployed `0000`/`0001` schema with
existing records and migration history, verify backfills and once-only execution,
and verify complete rollback/retry when legacy BL ownership is ambiguous.

- At most one invoice per BL, enforced through API and direct SQL, including races.
- Multiple BLs per invoice and idempotent conversion retries.
- Defaults unchecked; checkbox changes preview; failed preview blocks confirmation.
- Every permission denial/stale selection/changed dependency rolls back the batch.
- Client-only and product-only deletion preserve usable drafts and frozen documents.
- Estimate-only deletion preserves invoices; explicit cascade deletes their chain once.
- Invoice cancellation cancels payments/BLs but does not touch unrelated records.
- Worker completion during deletion cannot send/create orphaned output.
- Storage failures retry cleanup without losing protected/shared files.
- Existing sent mail, real transfers/delivery and frozen report captures are unaffected.
