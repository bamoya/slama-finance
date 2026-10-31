# SaaS architecture and commercial agreement

Implementation breakdown: [ordered tasks, dependencies and acceptance criteria](tasks/README.md).
The agreement below remains the source of truth for product decisions.
Current implementation: [database foundation](foundation-rollout.md) and
[central owner authentication](owner-authentication.md), and
[organization staff authentication](organization-staff-authentication.md), and
[owner organization portal](owner-organization-portal.md).

Status: approved target decisions from the architecture discussion, recorded 2026-10-27.
This document describes future work; it does not claim that SaaS functionality is implemented.
The existing application remains a single-company system. Read this alongside
[the current architecture](../architecture.md) and [the existing database design](../database-schema-design.md).
Where those describe single-company behavior, this document defines the agreed SaaS target.

## 1. Product and repository scope

Evolve the current application into a SaaS while retaining its finance features and existing data.
Keep `api/` and `ui/` at the repository root, API-owned database/OpenAPI definitions, generated
transport types and UI query hooks, shared UI components, and the layered modular monolith.
Infrastructure remains under `infra/`. This agreement does not authorize a framework rewrite.

Support French and English, with French as the default. Optional customer information remains
optional. Existing document lifecycle, payment, revision and deletion rules continue within each tenant.
The planned SaaS subscription billing is separate from payments recorded on customer invoices.

## 2. Identities, ownership and access

An organization is a tenant. A platform user is an organization owner and may own multiple organizations.
A SaaS administrator operates the platform and manages customer subscriptions and restrictions.
An organization staff user is an independent identity scoped to one organization.

```text
Platform account --> owned organizations, subscriptions, read-only consolidated analytics
                         |
                         +-- independent organization administrator (normal staff account)
                         +-- other organization-specific staff accounts
```

- Creating an organization also creates its initial administrator, using the platform owner's email as the initial contact. Credentials, profile and roles remain independent.
- The initial administrator consumes a member slot. There is no Owner role or special staff privilege; the usual last-active-administrator safeguards apply.
- Platform cookies never authenticate organization business operations. Organization logins use organization-specific credentials only, including future verified custom domains.
- A generated, expiring temporary password is delivered after activation. First login consumes it and requires replacement before normal access. Delivery retries rotate credentials; cleartext passwords are not persisted in the job.
- Staff email uniqueness is `(organization_id,email)`. Matching addresses do not link accounts or synchronize passwords.
- Ownership grants financial visibility through dedicated platform analytics repositories. These perform ownership-scoped, read-only aggregate queries against the shared finance schema. This shared-schema dependency is an approved monolith tradeoff.
- Platform administrators have no implicit tenant financial bypass.

See [platform/organization boundaries](platform-organization-boundaries.md) for the current source layout and provisioning flow. This supersedes the previously proposed owner-to-workspace authentication handoff.

## 3. Tenant isolation

Approved: shared PostgreSQL database and shared tables, with application authorization,
repository scoping, PostgreSQL Row-Level Security (RLS), and tenant-aware constraints.

```text
Request / background job
       |
Verified identity + authorized organization
       |
Organization access context + permission / plan checks
       |
Repository scopes reads and writes
       |
Transaction-local organization context
       |
PostgreSQL RLS + tenant-aware foreign keys
```

- Every tenant-owned record has an organization scope, including staff, roles, settings, clients,
  catalog, sales documents, payments, media, artifacts, jobs, notifications, schedules and report runs.
- Unique business identifiers are scoped appropriately: staff emails, role keys, product codes and
  document numbers may repeat across organizations.
- Composite foreign keys prevent cross-organization relationships, for example
  `invoices(organization_id, client_id)` references `clients(organization_id, id)`.
- Verify staff membership before establishing operational organization context; platform analytics verifies ownership separately.
  A browser-provided organization ID alone is never authorization.
- Establish database context transaction-locally, for example
  `set_config('app.organization_id', verified_id, true)`, inside the transaction executing queries.
- No context means no tenant access. Runtime roles must not bypass RLS; use forced RLS where needed.
  Migrations use a separate privileged connection. Pooled connections must not retain tenant context.
- Jobs carry their organization and establish the same context before executing tenant work.
- Storage paths are organization-scoped, but prefixes alone are not authorization. Downloads and
  signed URLs must verify access; tenant storage usage is measured for subscription quotas.
- Portfolio analytics use an explicitly authorized aggregation path over owned organizations;
  do not disable tenant protection for general API queries.

## 4. Owner analytics

Owners can compare organizations and view consolidated revenue, collections, outstanding and overdue
balances, and organization trends. Aggregate currencies separately unless an explicit conversion policy
is added. Do not label sales or collections as profit: genuine profitability needs expenses and costs,
which are not introduced by this agreement.

## 5. Organization lifecycle

```text
Setup --> Active <---- Reactivation ---- Suspended
            |                               |
            +--------- Request deletion ----+
                              |
                       Pending deletion
                         |          |
                   Cancel within   30 calendar days
                   grace period     |
                         |          v
                   Previous state  Permanently deleted
```

Optional company identity information must not block activation. Suspension preserves data.
An owner may pause an organization; a platform-administrator restriction can only be lifted by an
administrator. Restoring billing or cancelling deletion cannot bypass an administrator restriction.

### Suspended organization experience

- Block new organization logins and revoke existing organization sessions, for staff and owners.
- Sign users out automatically. Do not redirect them to a login form.
- The organization's domain displays only a static, descriptive unavailable page: no forms, buttons,
  check-again action or business data. Do not disclose internal restriction notes publicly.
- Stop automated business emails, scheduled reports and other business jobs. Necessary security,
  billing and deletion-maintenance operations remain possible through the platform.
- The owner manages billing, resolution and permitted export through the separate SaaS portal.
- Reactivation allows fresh logins; do not automatically replay every missed email or report.

### Organization deletion

- Owner-only request with reauthentication and an explicit impact confirmation.
- Immediately block organization access and stop business jobs.
- Allow cancellation and owner export through the SaaS portal for 30 calendar days.
- Cancellation restores the previous eligibility/state, including any outstanding restriction.
- At the deadline, remove organization business data, staff credentials, media, artifacts and domain
  bindings. Retain the platform account and unrelated organizations.
- Existing backups expire under backup retention; deleting tenant data is not instant selective erasure
  from every backup. Legally required subscription billing records need separate retention treatment.

## 6. Website domains

- Every organization has a default `organization-slug.platform-domain` address.
- Business and Pro may connect one active custom website domain per organization.
- Require DNS ownership verification before activation, then provision HTTPS automatically.
- Domains are globally unique. Unknown/unverified domains never expose organization data.
- Keep the default subdomain available. Domain changes/removal revoke affected-domain sessions.
- Domain verification status is independent from organization status and email-domain verification.

## 7. Subscription plans

One subscription belongs to the owner and covers all owned organizations. There are no different
subscription tiers per organization under the same owner subscription. Quotas below are approved
starting commercial values, configurable rather than hardcoded throughout the application.

| Feature / limit                                | Essential         | Business               | Pro                    |
| ---------------------------------------------- | ----------------- | ---------------------- | ---------------------- |
| Monthly price, HT                              | 99 DH             | 299 DH                 | 799 DH                 |
| Annual price, HT                               | 990 DH            | 2,990 DH               | 7,990 DH               |
| Organizations per owner                        | 1                 | 3                      | Unlimited              |
| Additional staff per organization              | 0; owner only     | 5                      | Unlimited              |
| Clients, categories, products and variants     | Unlimited         | Unlimited              | Unlimited              |
| Estimates, invoices, delivery notes            | Unlimited         | Unlimited              | Unlimited              |
| Installment payments and receipts              | Included          | Included               | Included               |
| Templates                                      | One fixed default | Customizable templates | Customizable templates |
| Company logo and signature                     | Included          | Included               | Included               |
| Staff roles and permissions                    | Not applicable    | Included               | Included               |
| Dashboard                                      | Basic overview    | Full analytics         | Full analytics         |
| Cross-organization analytics                   | Not applicable    | Included               | Included               |
| Manual business emails                         | None              | Included               | Included               |
| Automatic notifications and reminders          | None              | Included               | Included               |
| Scheduled reports                              | None              | Included               | Included               |
| Sales-document PDF downloads                   | Included          | Included               | Included               |
| Financial report PDF / Excel exports           | None              | Included               | Included               |
| Custom website domain                          | None              | One per organization   | One per organization   |
| Verified custom sending domain                 | None              | Supported              | Supported              |
| Storage, pooled per subscription               | 1 GB              | 10 GB                  | 50 GB                  |
| Business emails/month, pooled per subscription | 0                 | 2,000                  | 10,000                 |
| Support                                        | Standard          | Standard               | Priority               |

Annual billing charges ten monthly prices for twelve months of coverage. Hosting and normal platform
maintenance are included; customer domain registration is separate. Priority support does not yet
promise a response-time SLA.

### Quota and entitlement behavior

- The initial organization administrator consumes a member slot. Archived staff do not count; disabled staff do.
  Restoring archived staff requires capacity.
- Suspended organizations count; pending-deletion organizations count until permanently deleted.
- Pro has no organization or staff count cap, but storage/email quotas and reasonable technical
  rate limits remain. Do not advertise unlimited storage, emails or throughput.
- Essential still receives security/account emails; these are not business emails or quota consumption.
- Warn before reaching limits. At a limit, block the affected new action rather than delete existing data.
- Enforce plan entitlements, quotas and permissions in the API, with consistent locked-feature UI.
- Keep plan entitlements separate from RBAC; use configured feature flags/limits rather than checks
  scattered around the code comparing plan names. Allow audited platform-managed exceptions.
- Approved metering rules and implementation are recorded in [subscription usage](subscription-usage.md): decimal GB, monthly paid-email reset in Africa/Casablanca, trial-wide allowance and deduplicated queued recipients.

## 8. Trial and owner onboarding

```text
Create owner account --> Verify email --> Choose plan
       --> Create first organization / start trial --> Dashboard
```

- Trial is seven calendar days, including weekends and holidays, starting at first organization creation.
  Display the exact expiry timestamp; onboarding before organization creation consumes no trial time.
- One trial per owner; another organization does not restart it. No payment is required to begin.
- Trial entitlements: Business features, one organization, two total members, 50 total business emails,
  and 1 GB storage. These are trial-wide allowances, not a second recurring monthly subscription.
- Initial organization fields: company name, organization slug and French/English language.
- Address, tax identifiers, bank details, branding and custom domains can be completed later.
- No extra payment grace period after a free trial. Paid activation requires manual confirmation.

## 9. Subscription lifecycle and manual billing

```text
Trial -- confirmed payment --> Active
  |                              |
  +-- 7 days without payment     +-- paid coverage ends unpaid
               |                              |
               v                              v
            Expired                        Past due
                                              |
                                       7 calendar days
                                              |
                                              v
                                           Expired

Active -- cancel renewal --> Active until paid-through date --> Expired
Expired -- confirmed payment --> Active, subject to independent restrictions
```

- Launch with manual payments; integrate a payment provider later without changing entitlement rules.
- Owner sees payment instructions, submits a reference, and sees current plan, status and expiry.
- SaaS administrator verifies actual receipt and records payment reference, plan and coverage dates.
  A submitted reference alone never activates a subscription.
- Accepted payment methods remain configurable; no specific list was confirmed.
- Previously paid subscriptions have seven calendar days of continued access after unpaid renewal,
  with owner reminders. With manual billing, past due means unpaid expiry, not necessarily a failed card.
- After grace expires, revoke organization sessions and show the static unavailable page.
- Owner retains SaaS portal access for payment, permitted export and account management.
- Successful payment restores eligible organizations, not independently paused/restricted organizations.
- Upgrades take effect after confirmed payment; show any prorated charge before acceptance.
  The exact proration algorithm is still to be specified.
- Downgrades take effect at next renewal. Owner selects organizations/staff to retain within limits;
  preserve data and disable unavailable automation. Never automatically delete over-quota resources.
- Cancellation stops renewal; it is not organization deletion and does not refund used time automatically.
- Retain expired subscription tenant data for 90 days after access is blocked, with warnings and owner
  export before permanent deletion. This differs from an explicit 30-day organization-deletion request.
  Billing/legal retention must be resolved separately before automated permanent deletion is enabled.

## 10. Subscription tax and price display

Approved prices exclude tax (HT). Apply 20% Moroccan TVA when legally applicable to the SaaS operator;
confirm registration/liability with the accountant before collecting it. Keep the tax rule configurable.

| Plan      | Monthly HT | Monthly TVA, 20% | Monthly TTC | Annual HT | Annual TTC |
| --------- | ---------- | ---------------- | ----------- | --------- | ---------- |
| Essential | 99 DH      | 19.80 DH         | 118.80 DH   | 990 DH    | 1,188 DH   |
| Business  | 299 DH     | 59.80 DH         | 358.80 DH   | 2,990 DH  | 3,588 DH   |
| Pro       | 799 DH     | 159.80 DH        | 958.80 DH   | 7,990 DH  | 9,588 DH   |

Display HT, applicable TVA and the TTC amount clearly before payment. Preserve currency, subtotal,
rate, tax and total on each subscription invoice so future rate changes do not rewrite history.
Subscription billing tax is separate from optional VAT on organizations' own sales documents.

Reference: Morocco's normal TVA rate is 20%; see the
[official investment agency's tax overview](https://www.amdie.gov.ma/fiscalite/).
This agreement is a product/billing decision, not confirmation of the operator's individual tax status.

## 11. Email delivery and sending domains

Keep Resend as the delivery provider. Our backend holds the provider credentials; customers do not
need a Resend account or API key. Business sends are subject to subscription quotas.

Default sending uses a shared, verified SaaS sending domain:

```text
From: Company Name <notifications@mail.platform-domain>
Reply-To: organization's configured contact email, when present
```

Do not provision a distinct sending subdomain per organization initially. Organization branding is the
sender display name; the platform address remains visible. Do not invent a reply-to when absent.

Business and Pro may connect their own sending domain:

```text
Organization email settings
    --> Register domain through Resend API
    --> Display required DNS records
    --> Owner publishes records
    --> Verify with Resend
    --> Enable approved sender addresses for that organization
```

- Store domain ownership/binding, Resend domain ID, status and permitted sender addresses.
- Preserve existing mailbox configuration; show the exact Resend DKIM/SPF/return-path records.
- Website custom-domain verification does not authorize email sending, or vice versa.
- Never trust arbitrary sender addresses from UI input. Validate the verified organization binding.
- Shared platform sender is available while setup is pending. If an active custom sender loses
  verification, pause its sends and notify the owner rather than silently changing sender identity.
- Plan for Resend account domain limits and shared reputation. Per-domain sharing across organizations
  needs an explicit ownership policy before implementation.

Provider references: [domain API workflow](https://github.com/resend/resend-skills/blob/main/skills/resend/references/domains.md),
[custom return path](https://resend.com/changelog/custom-return-path),
[provider pricing](https://resend.com/pricing?product=transactional).

## 12. Portal navigation

```text
Owner portal
+-- Overview: consolidated organization analytics
+-- Organizations: create, open and manage
+-- Subscription: plan, usage, expiry and payment instructions
+-- Account: profile, security and login methods

Organization application
+-- Existing finance modules and dashboard
+-- Settings: company, staff/roles, templates, website and email domains

SaaS administrator portal
+-- Customers and organizations
+-- Subscriptions: confirm payments, activate and renew
+-- Plans, quotas and audited exceptions
+-- Suspensions and deletion requests
+-- Usage and audit history
```

Keep subscription management in the owner portal because coverage spans organizations.
The static suspended-domain page is not the owner management portal.

## 13. Database direction and migration safety

The following are logical entities, not final table/column names or a finalized ERD:

```text
platform_users --< organizations --< organization_domains
       |                |
       |                +--< staff_users --< staff_roles >-- roles
       |                +-- company settings / tenant business tables
       |                +-- email domain configuration
       |
       +-- subscription --> plan --> entitlements / quotas
       +-- subscription billing records / payments
       +-- usage accounting

Global permission catalog --> organization role permissions
Actor-aware sessions, credentials, recovery tokens and audit events
```

- Add new forward migrations: the database is deployed. Do not rewrite applied migrations.
- Existing Slama data becomes the first organization; preserve identifiers, links, files and history.
- Separate existing staff identities from new owner identities without assuming matching emails imply
  the same account or copying password hashes into a second identity.
- Replace singleton company assumptions with organization settings. Update generated contracts,
  repositories, workers, media authorization and UI context together.
- Plan data backfill, constraint validation, RLS activation, privileged migration roles and rollout order
  before enforcing non-null tenant scope. Do not leave a publicly accessible unscoped transition path.
- Test tenant isolation for direct requests, nested relationships, list/search/export, signed files,
  background work, owner portfolio access and pooled connection reuse.

## 14. Remaining implementation decisions

The business direction is agreed; these details still need a design/implementation specification:

1. Final central-owner/custom-domain authentication flow, recovery and session propagation.
2. Exact Basic-versus-Full dashboard content and Essential's fixed-template branding controls.
3. Manual payment methods, administrator delegation, coverage boundaries and proration calculation.
4. Quota metering/reset rules, paid add-ons and downgrade behavior when storage remains over quota.
5. Ownership transfer, account deletion, duplicate-owner prevention and trial-abuse controls.
6. Automated deletion timing, backups, legal billing retention and restore procedures.
7. Default platform domains, domain-removal verification and shared customer-email-domain policy.
8. Detailed SaaS schema, module responsibilities, contracts, rollout sequence and acceptance tests.

No implementation or deployment is performed by documenting this agreement.
