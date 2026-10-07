# 04 — Clients

Status: implemented in the API and UI. The local migration is `0005_tiresome_sunset_bain.sql`.

[Index](README.md) · Depends on 02/03 · Next: [Catalog](05-catalog.md)

## Models

Create `clients` with explicit `individual | company` type. Individual first/last
names and company legal/trade/contact names follow conditional checks. Include
Moroccan ICE/IF/RC/registration city/TP fields, optional email/phone, billing and
optional separate delivery address, locale, notes, archival and L3 audit columns.
Keep identifiers as strings. Do not add staff-login credentials or client portals.
Client email is optional and is not a universal unique client identity.

## API, rules and permissions

| Route                          | Behavior                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `GET /v1/clients`              | Search name/identifier/contact, filter type/archive, paginate; `clients.read` |
| `GET /v1/clients/:id`          | Safe complete client profile; `clients.read`                                  |
| `POST /v1/clients`             | Validate discriminator and address, create + audit; `clients.create`          |
| `PATCH /v1/clients/:id`        | Update master data, never historical snapshots; `clients.update`              |
| `POST /v1/clients/:id/archive` | Exclude from new document selection; `clients.archive`                        |
| `POST /v1/clients/:id/restore` | Return client to active selection; `clients.restore`                          |
| `DELETE /v1/clients/:id`       | Permanently delete only unattached clients; `clients.delete`                  |

Document selection uses this search endpoint with bounded active-only results.
Type changes validate the full resulting record, removing incompatible fields
explicitly in one transaction. A missing separate delivery address means use the
whole billing address, not an accidental mixture of both. Normalize contact data
without turning missing email into a validation failure. Deletion requires a
version check and must be blocked by future document foreign keys using
`ON DELETE RESTRICT`; never delete documents with a client.

## Services and guards

Client service owns normalization, type/address validation and display-name
projection. Document modules will call the module's public read/snapshot service
rather than copying validation. Require full session, per-action permission and audit. Returning a
client profile does not grant access to all that client's financial documents;
later related-document endpoints apply their own permissions.

## UI pages, components and state

The `/clients`, `/clients/new`, `/clients/:clientId`, and
`/clients/:clientId/edit` pages now use generated TanStack Query clients.
The form selects company or individual identity, supports separate delivery
addresses, and leaves email optional. List filters live in the URL. Archive and
restore are versioned, audited actions. Financial metrics, related-document tabs,
and notification preferences are intentionally absent until those modules ship.

Query keys include normalized list filters and client ID. Mutation success
invalidates list/detail/search results. Use URL filters and form-local state;
no ClientsContext mirror. Preserve unsaved form changes on failed requests.

## Acceptance

Test both types, incompatible fields, optional email, delivery fallback,
Moroccan identifier strings with leading zeros, search escaping, pagination and
archive selection rules. Test unauthorized reads/writes independently. Once
documents exist, add regression proving client edits do not change issued PDFs.
Exit: real client CRUD/archive replaces POC client persistence.
