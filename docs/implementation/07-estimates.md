# 07 — Estimates

[Index](README.md) · Depends on 04–06 · Next: [Invoices](08-invoices.md)

`estimates.client_id` references `clients.id` with `ON DELETE RESTRICT`, so
attached clients cannot be permanently deleted.

## Models and boundaries

### Implemented revisions

- `POST /v1/estimates/:id/revisions` accepts `expectedVersion` and requires
  `estimates.read` plus `estimates.create`. It copies a current finalized estimate
  and its lines into a draft with fresh IDs; retries return the same draft.
- `revision_of_id` is a restrictive self-reference with a unique index: one
  direct successor, so no competing draft branches. Deleting the draft allows a
  replacement. A revision keeps the same client; products, quantities and prices
  can be edited. Copied dates must be reviewed before issuing.
- Issuing the revision atomically marks its predecessor **Superseded**. Creating
  or editing a draft does not invalidate the predecessor. A cancelled predecessor
  blocks issuing its draft revision. A failed issue rolls back both status changes.
- Superseded estimates stay readable/downloadable but cannot be cancelled,
  accepted, revised again, or converted to new invoices. Continue revisions from
  the current successor. Accepted current estimates still support multiple invoices.
- Existing invoices, payment records, source links and historical PDF content are
  unchanged. Audit events record revision creation and superseding. Details pages
  link predecessor/successor; status filters include Superseded.
- Sending and automatic expiry transitions are not implemented by this change.

Create `estimates` and `estimate_lines`, independently from invoices. Use approved
client/template/product FKs, unique nullable public number, unique line position,
issuer/client/appearance/bank snapshots, dates, locale/currency, totals, status
timestamps, optimistic `version` and printable `content_version`. Include audit
columns on header and lines. No invoice tables are needed to create estimates.

## API routes

| Route                                        | Behavior / permission                                                             |
| -------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /v1/estimates`, `GET /v1/estimates/:id` | Filter client/status/date; `estimates.view`                                       |
| `POST /v1/estimates`                         | Create draft with client and initial snapshot/defaults; `estimates.create`        |
| `PATCH /v1/estimates/:id`                    | Atomic draft header + ordered lines, expectedVersion; `estimates.update`          |
| `DELETE /v1/estimates/:id`                   | Draft only, child cleanup + audit; `estimates.delete`                             |
| `POST /v1/estimates/:id/issue`               | Validate completeness, snapshot/freeze and number; `estimates.issue`              |
| `POST /v1/estimates/:id/accept`, `/reject`   | Valid lifecycle transition + timestamp; `estimates.update`                        |
| `POST /v1/estimates/:id/cancel`              | Reason required, preserve issued record; `estimates.cancel`                       |
| `POST /v1/estimates/:id/pdf`                 | Return existing current-content artifact or 202 preparation job; `estimates.view` |
| `GET /v1/estimates/:id/artifacts`            | Safe file list, `estimates.view`                                                  |

Email send actions are completed in 12, not implemented as a fake status toggle.
Conversion ships in 08 after invoices exist. Detail can show an empty conversion
section until then. Lifecycle contract must define allowed source states and
terminal behavior; stale/invalid transitions return 409.

## Business services and middleware

Use tested decimal/weight helpers to calculate net/tax/gross server-side. Lines
snapshot product name/reference and g/kg price basis; manual lines may omit product
FK but require a printable name. VAT defaults NULL, explicit zero differs from
absent VAT. Total is sum of rounded line amounts; browser totals are previews.
Drafts may have zero lines, but the current schema still requires client/date and
snapshot fields: the create UI must supply those minimums, not send an empty row.
Issue validates at least one line, issuer identity, valid-until date and snapshots.
Lock header, compare version and audit the whole transaction; stable numbers on
retries, no accidental repeated issuance. Expiry is date-based in company timezone;
define an idempotent business task to materialize expired state if persisted.

## UI, components and state

Reuse `/estimates`, `/new`, `/:documentId`, `/:documentId/edit`. Keep list and
editor composition in estimate feature pages; shared document widgets are visual
reuse, not a combined backend document model. Components: DocumentToolbar,
ClientPicker, WeightedLineEditor, ProductSearchCombobox, OptionalVatControl,
TotalsPanel, TermsPanel, ArtifactDownload and LifecycleActions.
Form owns unsaved lines and their stable local keys; an editor-scoped context may
connect panels. Query owns saved records; URL owns list filters. On save/transition,
invalidate list/detail/artifacts as relevant. Never overwrite dirty form state
when a background query refreshes; show a conflict and explicit reload choice.

## Acceptance

Test VAT off/zero/positive, line ordering, grams conversion, server total tampering,
concurrent edits/issue, archived selections, missing client, expiry and immutable
issued snapshots. Test random-number collision retry and PDF product-name rendering.
UI verifies draft→issue→download and guarded edit/actions. Exit: independent
estimate lifecycle working without invoice-table coupling.
