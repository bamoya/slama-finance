# UI Proof of Concept

## Purpose and scope

This document defines the UI-only proof of concept that will be presented to
the client. API and database implementation is intentionally paused while the
product workflows and visual direction are validated.

The proof of concept must be fully navigable and use realistic typed mock data.
Important interactions should behave like the final product: lists, filters,
creation, editing, status changes, previews, empty states, notifications, and
permission-aware controls. Mock mutations may be stored in memory and reset
when the browser refreshes.

The required functional areas are:

- Product and service management.
- Client management.
- Invoice management.
- Estimate management.
- Staff management.
- Dynamic roles and permissions.
- Invoice and estimate appearance configuration.
- Financial reporting.
- Configurable scheduled reports for staff.
- Optional email notifications for clients.

## Navigation

```text
Slama Finance
|
|- Dashboard
|
|- Sales
|  |- Invoices
|  |- Estimates
|  |- Delivery notes
|  |- Payments
|  `- Clients
|
|- Catalog
|  `- Products & services
|
|- Reports
|  |- Overview
|  `- Scheduled reports
|
`- Settings
   |- Company profile
   |- Invoice appearance
   |- Staff
   |- Roles & permissions
   `- Notifications
```

The product must consistently use the term **Estimate** in the UI and code
unless the client explicitly chooses a different business term.

## UI project structure

Routes are explicitly declared with Wouter. Route files map URLs to feature
pages and apply layout or authorization boundaries; business UI remains inside
feature modules.

```text
ui/src/
|- app/
|  |- App.tsx
|  `- router/
|     |- public-routes.tsx
|     |- protected-route.tsx
|     `- protected-routes.tsx
|- components/
|  |- layout/
|  |- ui/
|  |- data-table/
|  |- page-header/
|  |- status-badge/
|  |- empty-state/
|  |- confirmation-dialog/
|  |- money/
|  `- permission-gate/
`- features/
   |- dashboard/
   |- products/
   |- clients/
   |- invoices/
   |- estimates/
   |- reports/
   |- notifications/
   |- staff/
   |- roles/
   |- invoice-appearance/
   `- company-settings/
```

## Route map

```text
/dashboard

/products
/products/new
/products/:productId
/products/:productId/edit

/clients
/clients/new
/clients/:clientId
/clients/:clientId/edit

/invoices
/invoices/new
/invoices/:invoiceId
/invoices/:invoiceId/edit

/estimates
/estimates/new
/estimates/:estimateId
/estimates/:estimateId/edit
/estimates/:estimateId/convert

/delivery-notes
/delivery-notes/new
/delivery-notes/:deliveryNoteId
/delivery-notes/:deliveryNoteId/edit

/payments
/payments/new

/reports
/reports/schedules
/reports/schedules/new
/reports/schedules/:scheduleId/edit

/settings/company
/settings/invoice-appearance
/settings/staff
/settings/staff/new
/settings/staff/:staffId
/settings/staff/:staffId/edit
/settings/roles
/settings/roles/new
/settings/roles/:roleId/edit
/settings/notifications
```

## Shared management patterns

All management features must use consistent interaction patterns.

```text
List page
|- Page title and description
|- Primary create action
|- Search and filters
|- Sortable data table
|- Row actions
|- Pagination
|- Empty state
`- Bulk actions where useful

Detail page
|- Summary header
|- Status and primary actions
|- Information tabs
|- Activity history
`- Related records

Create/edit page
|- Validated form sections
|- Unsaved-changes protection
|- Save or save-draft actions
`- Cancel navigation
```

Every feature described as “management” includes list, view, create, update,
archive or deactivate where applicable, and contextual actions. Permanent
deletion should only be presented where business history will not be damaged.

## Products and services

Products and billable services share one catalog. The distinction is stored as
an item type and can be filtered from the list.

### Catalog list

```text
Products & services                              [+ Add item]

[Search]  [Type: All]  [Status: Active]  [Category]

Item          Type       Reference   Unit price   VAT   Status
Web design    Service    SRV-001      8,000 MAD   20%   Active
Consultation  Service    SRV-002        500 MAD   20%   Active
Printer       Product    PRD-014      2,400 MAD   20%   Active
```

Supported actions:

- Create, view, and update an item.
- Duplicate an item.
- Archive and restore an item.
- Delete an item only when it has never been used by a document.
- Search, filter, sort, and paginate.
- Demonstrate optional bulk archive behavior.

The product form includes:

- Product or service type.
- Name and description.
- SKU or internal reference.
- Category.
- Unit such as unit, hour, day, kilogram, or package.
- Selling price.
- Default VAT rate.
- Optional cost price.
- Active or archived status.

Selecting a catalog item in a document editor automatically fills its
name, unit, and unit price while allowing document-specific adjustments. VAT is
optional and is not applied unless the user explicitly selects a VAT rate for
the line. Product names—not internal descriptions—are printed on generated
invoice and estimate documents.

## Clients

Clients support invoices, estimates, reporting, and optional notifications.

### Client list

The list displays:

- Company or individual name.
- Contact person.
- Email and phone.
- ICE, IF, or applicable tax identifiers.
- Outstanding balance.
- Invoice count.
- Notification status.
- Active or archived status.

### Client detail

```text
Atlas Studio
ICE: 001234567890123
atlas@example.com

[Overview] [Invoices] [Estimates] [Payments] [Activity]

Outstanding       Total invoiced       Overdue
12,400 MAD        84,000 MAD           4,200 MAD
```

Supported actions include create, view, update, archive, restore, and viewing
related financial documents.

### Client notification preferences

Preferences are configured per client:

- Automatically email invoices.
- Automatically email estimates.
- Send payment reminders.
- Send overdue reminders.
- Configure optional CC recipients.

Notification controls are unavailable when the client has no valid email and
must explain how to enable them.

## Invoices

### Invoice list

```text
Invoices                                           [+ New invoice]

[Search] [Status] [Client] [Issue date] [Due date]

Number     Client          Issued      Due         Total       Status
INV-0047   Studio Budi     04 Sep      19 Sep      2,800 MAD   Overdue
INV-0048   Atlas Studio    12 Sep      27 Sep     14,200 MAD   Sent
INV-0049   Amana SARL      17 Sep      02 Oct      8,900 MAD   Draft
```

Invoice lifecycle:

```text
Draft -> Finalized -> Sent -> Partially paid -> Paid
                      `----> Overdue
          `---------------> Cancelled
```

Invoices can be paid through one or more installments. Each payment records its
amount, date, method (`Cash`, `Bank transfer`, or `Cheque`), transaction or
cheque reference, status, and optional internal note. The invoice displays the
amount paid, outstanding balance, payment progress, and full payment history.
Cheque payments may remain pending until deposited or cleared.

## Delivery notes

Delivery notes (bons de livraison) can be created independently or linked to an
invoice. They contain the client, delivery date and address, product names,
delivered quantities, units, delivery instructions, and an optional reception
signature. Their printable PDF does not display product prices or invoice
totals. Supported states are draft, prepared, delivered, and acknowledged.

Supported actions:

- Create, view, and edit a draft.
- Duplicate an invoice.
- Preview the rendered document.
- Download a PDF.
- Send the invoice by email.
- Record a payment.
- Mark as sent.
- Cancel an invoice.
- Display an activity and audit timeline.
- Reserve credit-note creation for a later phase.

### Invoice editor

```text
New invoice                         [Save draft] [Preview] [Finalize]

Client                              Invoice details
[Select client]                     Number, dates, currency, terms

Item             Qty    Unit    Price       VAT       Total
[Select item]     2      day     1,500       20%       3,600 MAD
[+ Add line]

Public note                         Subtotal               3,000 MAD
Payment instructions                VAT                      600 MAD
                                    Total                  3,600 MAD
```

The editor includes:

- Searchable client and product selectors.
- Editable line descriptions.
- Automatic decimal-safe mock calculations.
- Line and global discounts.
- Tax summary.
- Notes, terms, and payment instructions.
- Sticky total and action areas where appropriate.
- Live document preview in a panel or drawer.

## Estimates

Invoices and estimates share reusable document-editor components while keeping
their lifecycle and actions distinct.

```text
Estimate editor
|- Client selector
|- Document metadata
|- Line-item editor
|- Tax and totals
|- Notes and conditions
`- Document preview
```

Estimate lifecycle:

```text
Draft -> Sent -> Viewed -> Accepted
                  |----> Rejected
                  `----> Expired
```

Supported actions:

- Create, view, and update.
- Duplicate.
- Preview and download PDF.
- Send by email.
- Mark as accepted or rejected.
- Convert an accepted estimate to a prefilled invoice.

The conversion action should be prominent on an accepted estimate and preserve
the client, lines, pricing, taxes, discounts, notes, and document relationship.

## Staff management

### Staff list

```text
Staff                                               [+ Add staff]

Name             Email                   Roles          Status
Sara Amrani      sara@company.ma         Accountant     Active
Yassine Idrissi  yassine@company.ma      Sales          Active
Omar Alami       omar@company.ma         Viewer         Suspended
```

Supported actions:

- Create a staff account.
- View and update staff information.
- Assign one or more roles.
- Suspend and reactivate access.
- Reset a password.
- Revoke active sessions.
- Prefer suspension over deletion to preserve financial history.

## Roles and permissions

Administrators configure permissions through a matrix that remains readable
for non-technical users.

```text
Role: Sales Agent

Permission                None    View    Create    Update    Delete
Products                            *        *         *
Clients                             *        *         *
Estimates                           *        *         *
Invoices                            *        *
Reports                             *
Staff                      *
Settings                   *
```

The UI may group fine-grained permission keys into readable rows, but mock
authorization must use explicit permission keys such as:

```text
products.read
products.create
products.update
products.archive

invoices.read
invoices.create
invoices.update
invoices.finalize
invoices.send
invoices.cancel

staff.read
staff.manage
roles.manage
reports.read
reports.schedule
settings.invoiceAppearance.manage
```

Permissions affect:

- Navigation visibility.
- Route access.
- Primary and contextual actions.
- Form editability.
- Disabled controls with explanatory messages where hiding would be confusing.

## Invoice and estimate appearance

The proof of concept uses a controlled document configurator rather than an
unrestricted drag-and-drop designer. This keeps previews reliable and makes the
eventual PDF implementation predictable.

```text
Invoice appearance

Configuration                         Live document preview

Template                              COMPANY LOGO
( ) Classic
(*) Modern                            INVOICE
( ) Minimal
                                      Client...       INV-0049
Logo
Brand color                           Description Qty Price Total
Font                                  ...
Header layout
Footer text                                       Total 8,900 MAD
Show bank details
Show signature

[Save] [Test PDF]
```

Configurable options:

- Company logo.
- Brand or accent color.
- Classic, modern, and minimal templates.
- Font from a controlled list.
- Header alignment.
- Visible company and tax identifiers.
- Visible document columns.
- Footer text.
- Payment and bank information.
- Signature or stamp.
- Terms and conditions.
- French and Arabic direction support.
- Separate invoice and estimate defaults if required.

The preview uses realistic document data and updates immediately when the user
changes a setting.

## Reporting

### Report overview

```text
Reports

[This month] [All clients]                 [Export PDF] [Export CSV]

Revenue             Collected            Outstanding          Overdue
184,200 MAD         142,200 MAD          42,000 MAD           18,400 MAD

[Revenue trend]
[Invoice status breakdown]
[Top clients]
[Taxes collected]
[Average payment delay]
```

Report categories:

- Sales and revenue.
- Collected payments.
- Outstanding invoices.
- Overdue invoices.
- Tax and VAT summary.
- Product and service performance.
- Client performance.
- Estimate conversion rate.
- Staff activity in a later phase.

Shared report filters:

- Date range.
- Client.
- Product or service.
- Invoice status.
- Staff member.
- Currency if multi-currency support is introduced.

## Internal scheduled reports

Scheduled reports are delivered to company staff and are distinct from client
document notifications.

```text
Scheduled report

Name                  Weekly finance summary
Frequency             Daily / Weekly / Monthly
Delivery day          Monday
Delivery time         08:00
Timezone              Africa/Casablanca
Recipients            Sara, Finance Team
Format                 Email summary + PDF / CSV
Report contents       Revenue, overdue, tax, collections
Status                 Active
```

Supported actions:

- List, create, and update schedules.
- Pause and resume.
- Duplicate and delete.
- Send a test report.
- Display the last execution, result, and next scheduled execution.

## Client notifications

Client notifications are event-driven and optional.

```text
Invoice finalized             Off
Invoice sent                  On
Payment received              On
Payment due soon              3 days before
Invoice overdue               On, repeat every 7 days
Estimate sent                 On
Estimate expiring             2 days before
```

Each notification rule includes:

- Enabled state.
- Eligible recipients.
- Timing and optional repetition.
- Email subject and message customization.
- Language.
- Template preview.
- Send-test action.

A client without an email displays an explicit unavailable state:

```text
Email notifications unavailable
Add an email address to enable client notifications.
```

## Mock-data approach

The UI proof of concept must not depend on unfinished API endpoints. Each
feature should expose a typed mock repository that resembles the future API
client interface.

```text
Feature page
    |
    v
TanStack Query hook
    |
    v
Typed mock repository
    |
    `-> realistic delay, data, errors, and in-memory mutations
```

This boundary makes the later replacement with generated API clients explicit.
Mock fixtures should include normal records, empty states, overdue records,
missing client emails, archived products, suspended staff, and restricted-role
examples.

## Implementation order

The proof of concept should be constructed in this order:

1. Shared management-page components and mock-data conventions.
2. Products and product editor.
3. Clients and client profile.
4. Invoice list, editor, detail, and preview.
5. Estimate list, editor, detail, and invoice conversion.
6. Invoice and estimate appearance configurator.
7. Staff and role-permission management.
8. Report overview and scheduled reports.
9. Client notification settings.
10. Final responsive and presentation-quality review.

## Client demonstration scenario

The presentation should tell one connected business story rather than showing
isolated screens.

```text
Create product or service
          |
          v
Create client
          |
          v
Create and send estimate
          |
          v
Accept estimate
          |
          v
Convert estimate to invoice
          |
          v
Preview the branded invoice
          |
          v
Record payment
          |
          v
Show the updated financial report
```

The final mockup is successful when the client can understand this workflow,
validate the terminology and document appearance, and identify missing business
rules before API implementation continues.

## Implemented POC coverage

The navigable UI currently covers the complete client-review surface:

- Dashboard with financial summaries, activity, and alerts.
- Product and service list, detail, create, and edit screens.
- Client list, detail, create, and edit screens.
- Invoice and estimate lists, detail views, editors, and estimate conversion.
- Partial invoice payments with cash, bank-transfer, and cheque tracking.
- Delivery-note list, create, edit, detail, and printable-document flows.
- Live document appearance configuration with template and color choices.
- Staff list plus create and edit forms with role assignment.
- Dynamic role-permission configuration and custom-role creation.
- Reporting overview plus recurring report schedule list, create, and edit forms.
- Optional client email-notification preferences and unavailable-email states.
- Responsive global navigation, persistent light/dark mode, and consistent
  page widths and headers.

All actions are presentation-safe mock interactions. They intentionally do not
write to the API or database; persistence and generated API contracts belong to
the implementation phase after the client validates this proof of concept.
