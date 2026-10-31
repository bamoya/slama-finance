# Owner portal — Classic dashboard integration

Current implementation: the dashboard uses `/v1/owner/analytics/financial-summary` for real MAD totals and daily revenue/collection trends. The organization selector and inclusive date range scope period figures; outstanding/overdue remain current snapshots. Dedicated platform repositories check ownership and run read-only repeatable-read aggregate queries against the shared schema. Organization links open the independent organization login. This supersedes the earlier financial-placeholder boundary described below.

The approved Classic direction is integrated into the application under `ui/src/features/identity/owners`. The isolated prototype is a design reference, not a runtime dependency.

## Routes

| Route                                  | Purpose                                                                                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `/owner`                               | Owner overview                                                                                         |
| `/owner/organizations`                 | Existing API-backed organization search, status filters and pagination                                 |
| `/owner/organizations/:organizationId` | Owned organization identity and access details                                                         |
| `/owner/subscription`                  | Explicit unavailable state until subscription services are implemented; link to public plan comparison |
| `/owner/account`                       | Existing owner profile and logout                                                                      |

The common owner layout uses the shared shadcn sidebar, global buttons, language/theme controls, dropdown menu and BaMoYa branding. Desktop navigation collapses with the shared sidebar component; mobile uses bottom navigation. This portal is separate from organization finance workspaces.

## Data and behavior

- Owner authentication remains API-backed and independent of staff authentication.
- The generated owner organization client supplies all organization metadata.
- `useOwnerPortfolio` loads every organization page before calculating totals. Owner-prefixed query keys participate in the existing account-switch/logout cache cleanup.
- Organization scope filters the availability chart, organization list, staff counts and attention items together.
- Availability shows real active, setup, paused, suspended and pending-deletion counts, with text labels as well as color.
- Attention links lead to owned organization details. They do not bypass lifecycle restrictions or create an unscoped finance session.
- A metadata details link is labeled “View details”; it does not claim to enter the organization's workspace.
- French and English, dark/light themes and DD-MM-YYYY dates follow shared application preferences. The overview's current date uses Africa/Casablanca.

## Explicit unfinished capabilities

The current owner API has no consolidated financial endpoint, subscription usage endpoint or owner-to-organization session exchange. [Guided organization onboarding](organization-onboarding.md) now persists isolated setup drafts and branding.

Consequently, the dashboard does not invent turnover, collections, unpaid balances, overdue amounts, subscription plans, storage/email usage or sample organizations. Financial cards show unavailable values as dashes, with a clear financial visualization empty state. They must not be interpreted as zero balances.

Revenue/collections represent period activity; unpaid and overdue represent current balances, with overdue included in unpaid. These definitions are visible in metric tooltips and must be maintained when financial aggregation is connected. Revenue is not profit.

Guided creation is available and persists real setup data. Organizations remain in Setup pending the secure activation/entry slice. Subscription navigation likewise does not imply that billing, upgrades or payment are currently implemented.

## Next integration sequence

1. Owner-scoped consolidated finance contract and service, with organization ownership checks, tenant isolation, selected period and real series/contribution data.
2. Materialize completed onboarding into tenant finance settings and enforce trial/subscription capacity before activation.
3. Secure owner-to-organization entry through the resolved tenant domain.
4. Subscription entitlements, allowances and usage.

The initial dashboard UI needed no backend changes; the subsequent onboarding slice adds migration 0012 and owner setup endpoints. Legacy Slama data migration remains deferred.

## Validation

Targeted tests cover all-page organization totals, scope changes, lifecycle attention items, unavailable financial values, empty portfolios, expired sessions and existing owner authentication/organization views. Browser visual checks use intercepted fixtures exclusively; fixtures are not shipped as production data.
