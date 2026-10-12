# 09 — Delivery notes and delivery-first invoicing

[Index](README.md) · Depends on 08 · Next: [Payments](10-payments.md)

`delivery_notes.client_id` references `clients.id` with `ON DELETE RESTRICT`, so
attached clients cannot be permanently deleted.

Implementation note (September 2026): this phase is implemented with integer
package quantities and gram package-weight snapshots, matching the current
product-variant model. The API supports delivery-first conversion from multiple notes and
reports billed/remaining quantities; the UI supports selecting eligible lines
from the client's delivered notes. Draft invoice deletion releases allocations.
For issued delivery-derived invoices, cancellation is deliberately blocked until
a client-approved correction/credit policy is specified. Payment dependencies,
notifications, and final statutory PDF review remain later phases.

## Models

October 2026 lifecycle update: `draft → delivered`. The Prepared and
Received/Acknowledged states and their `/prepare` and `/acknowledge` routes are removed. Delivering
a draft assigns its BL number, freezes its current client snapshot, queues the PDF
and triggers the existing delivery notification policy in one transaction.
Receiver name is optional on delivery. Existing Prepared and Acknowledged BLs
are migrated to Delivered, retaining their number and document content; their
previous update timestamp supplies the delivery timestamp where absent.
Invoice details can create a linked draft with all invoice lines and quantities
using `POST /v1/invoices/:id/delivery-note`.

Create `delivery_notes`, `delivery_note_lines`, `delivery_invoice_allocations`.
Invoice-first notes use optional invoice/header and source invoice-line FKs;
delivery-first notes leave these NULL and use the billing-allocation junction
later. Composite allocation PK is invoice-line/delivery-line; quantity counts
packages as an integer and each line snapshots package weight in grams. Add
position uniqueness, positive quantities, audit columns, status
checks and both document versions. Keep no prices/totals on delivery notes.

## API routes

| Route                                                                     | Behavior / permission                                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `GET /v1/delivery-notes`, `GET /v1/delivery-notes/:id`                    | Filter client/status/invoice, `delivery_notes.read`                                                       |
| `POST /v1/delivery-notes`                                                 | Independent or invoice-first draft; `delivery_notes.create`                                               |
| `PATCH /v1/delivery-notes/:id`                                            | Draft changes/reservations with expectedVersion; `delivery_notes.update`                                  |
| `DELETE /v1/delivery-notes/:id`                                           | Draft only, release reservations; `delivery_notes.delete`                                                 |
| `POST /v1/delivery-notes/:id/deliver`                                     | Draft → delivered, number/freeze, timestamp, optional receiver, PDF/notification; `delivery_notes.update` |
| `POST /v1/delivery-notes/:id/cancel`                                      | Dependency checks/reason; `delivery_notes.cancel`                                                         |
| `POST /v1/delivery-notes/:id/pdf`, `GET /v1/delivery-notes/:id/artifacts` | Prepared document artifact, `delivery_notes.read`                                                         |
| `POST /v1/invoices/from-deliveries`                                       | Eligible lines/quantities/prices → invoice draft + allocations; `delivery_notes.read` + `invoices.create` |

Conversion request supports multiple eligible notes for the same client and an
operation UUID for retry identity. Prices must be explicitly confirmed, never
invented from delivery lines. VAT remains absent until selected. Selection/detail
responses expose billed and remaining billable package quantities separately.

## Transactions and lifecycle

Lock source lines in stable ID order and validate package quantities exactly. Invoice-first
notes require matching source invoice, client ID and source lines. The new note
captures current client identity on draft save and delivery, independently of
the source invoice's frozen identity; non-cancelled drafts
reserve fulfillment quantities. Delivery-first billing is only for delivered independent notes. Active draft/issued invoice allocations cannot
exceed delivered quantities and must fully cover delivery-derived invoice lines.
Never record the same relationship using both mapping mechanisms.

Invoice draft deletion releases billing reservations. Cancellation of an issued
delivery-derived invoice requires a correction policy and is blocked for now.
Cancelling a billed delivery requires resolving active billing
allocations. Lock both related resources consistently; validate invoice-first
invoice cancellation against active deliveries instead of leaving contradictory
fulfillment records. Preserve prepared PDFs; later acknowledgment is metadata,
not an overwrite of the original file. No inventory stock movements.

## UI/context

Reuse delivery list/new/detail/edit routes. Components: DeliverySourcePicker,
DeliveryAddressForm, DeliveryWeightEditor, FulfillmentSummary, ReceiverDialog,
CreateInvoiceFromDeliveriesDialog and printable preview. Invoice details gain
linked deliveries; client detail gains authorized deliveries tab. Forms own
selection; Query owns remaining quantities and allocation summaries. After any
allocation/lifecycle mutation invalidate delivery and invoice detail/lists;
server conflict must refresh remaining weight without discarding unrelated input.

## Acceptance

Test partial delivery, gram package-weight snapshots, concurrent last-quantity allocations,
draft reservations, duplicate conversion retries, multiple-note billing, cross-client
rejection, cancellation release and unchanged prepared PDFs. UI walkthrough:
independent delivery → delivered → invoice draft → issued. Exit: both workflows
are functional and over-delivery/double billing cannot bypass server rules.
