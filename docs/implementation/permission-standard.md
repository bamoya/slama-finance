# Resource permissions

## Four consistent actions

Permissions use `resource.action`; the matrix shows **View / Create / Edit / Delete**.
Unsupported actions appear as `—`, not invented grants. `view` and `manage` are not aliases.

| UI column | Key      | Meaning                                                                                                                                         |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| View      | `read`   | List, search, details and download existing documents.                                                                                          |
| Create    | `create` | Create records, copies and revisions. Conversion also requires source read access.                                                              |
| Edit      | `update` | Update data and change state: archive, restore, enable, disable, issue, send, cancel, confirm, regenerate PDFs and reissue temporary passwords. |
| Delete    | `delete` | Permanent deletion only, when business rules permit it.                                                                                         |

Permissions never bypass frozen issued documents, valid transitions, version checks,
reference protection, last-administrator safeguards or audit requirements. HTTP DELETE
that archives staff or resets notification preferences is **Edit**, not permanent deletion.
UI checks use shared authorization helpers and Can; the API is authoritative and sensitive
writes recheck authorization inside transactions. No administrator-name bypass.

| Resource                        | Supported keys                                                 |
| ------------------------------- | -------------------------------------------------------------- |
| Roles                           | `roles.read/create/update/delete`                              |
| Staff                           | `staff.read/create/update`; no permanent deletion              |
| Company settings                | `company_settings.read/update`; singleton                      |
| Bank accounts                   | `bank_accounts.read/create/update/delete`                      |
| Document templates              | `templates.read/create/update/delete`                          |
| Clients                         | `clients.read/create/update/delete`                            |
| Categories                      | `categories.read/create/update/delete`                         |
| Products                        | `products.read/create/update/delete`                           |
| Estimates                       | `estimates.read/create/update/delete`                          |
| Invoices                        | `invoices.read/create/update/delete`                           |
| Delivery notes                  | `delivery_notes.read/create/update/delete`                     |
| Payments                        | `payments.read/create/update/delete`                           |
| Notification rules              | `notification_rules.read/update`                               |
| Notification deliveries         | `notification_dispatches.read/update`; Edit retries or cancels |
| Client notification preferences | `client_notification_preferences.read/update`; reset is Edit   |
| Reports                         | `reports.read` only; explicit exception below                  |

Slash notation abbreviates separate permission keys, not a wildcard.

## Cross-resource boundaries

- Existing staff role assignment requires **staff Edit and roles Edit**. Creating staff
  with initial roles requires **staff Create and roles Edit**. Role selection additionally
  needs roles View in the UI. Actor-held grant and protected administrator checks remain.
- Invoice conversion requires source estimate/delivery View and invoice Create.
  Estimates must still be accepted and current; existing invoices remain unchanged.
- Media inherits owner permissions. Attached template signatures use templates View;
  uploading requires templates Create/Edit. No separate signature grants. Template
  readers can therefore access attached signatures. Unattached media remains private.
- First payment receipt issuance and explicit regeneration require payments View + Edit.
  Downloading an already-issued receipt requires View. Issued receipts still prevent
  permanent payment deletion.
- PDF regeneration does not change frozen business data. Download may rebuild an expired
  PDF cache without issuing or changing that document.

## Reports exception

`reports.read` is the single approved capability for report sections, exports, schedule
management (including deletion), history, retries and report receipt. Recipient eligibility,
email preferences and underlying document permissions still apply. See [reporting](11-reporting.md).

## Migration and deployment

`0021_crud_permissions.sql` copies assignments from retired narrow action keys to
corresponding Edit grants, then removes old keys. Signature reading maps to templates View;
staff role assignment maps to both staff Edit and roles Edit. Narrow permissions therefore
intentionally become broader resource Edit access. **No new permanent Delete grants are
assigned.** Review delegated roles after deployment. Read-only roles stay read-only.
Business records and audit history are untouched.

`0020_single_report_permission.sql` previously consolidated reporting access.
`0002_action_permissions.sql` remains historical; its granular vocabulary is superseded.
Never rewrite applied migrations. This standard supersedes granular permission examples
in earlier implementation sequences.

Deploy contracts, API, UI and migration together. Refresh the UI to reload session grants;
the API resolves current grants from the database. Back up before production migration.

## Bank account lifecycle and filtering

Search matches label, bank, holder, RIB and IBAN without case/accent sensitivity. Status,
currency and bank filters compose; URL parameters preserve filters across navigation.
Restoration requires `bank_accounts.update` and current `expectedVersion`. It clears
the archive timestamp but does not automatically make an account primary. Staff archive
remains irreversible; bank restoration does not change identity rules.

Permanent bank/template deletion requires the resource Delete grant and current version.
References from company defaults, payments and sales records prevent deletion; foreign
keys provide concurrency-safe protection. Archive remains available for referenced records.
Audit history and historical document files remain. Confirmations and conflict errors
use shared UI components.

## Verification

Integration tests cover grant consolidation, unchanged read/delete boundaries, administrator
coverage, role assignment, lifecycle transitions and reference-protected deletion. UI tests
cover four-column permissions, unavailable cells, visibility and actual bulk operations.
API/UI contracts remain generated from OpenAPI, not hand-maintained types or schemas.
