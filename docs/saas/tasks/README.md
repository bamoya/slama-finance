# SaaS implementation tasks

Source of truth: [approved SaaS agreement](../README.md).
Tasks 01, 02, 03, 04 and 05 have initial implementation work; none is complete. See the
[foundation rollout and remaining gates](../foundation-rollout.md).
This is a delivery breakdown, not an assertion that the current application supports multi-tenancy.

## Delivery order

```text
00 Design gates --> 01 Schema / migration plan --> 02 Identity --> 03 Context / RLS
                                                                      |
                                                                      v
                                                          04 Scope finance domains
                                                                      |
                                        +-----------------------------+
                                        v
                                   05 Onboarding
                                        |
                                   06 Plans / quotas
                                        |
                                   07 Subscription billing
                                        |
                                   08 Organization lifecycle
                                        |
                       +----------------+----------------+
                       v                v                v
                   09 Domains       10 Email         11 Analytics
                       +----------------+----------------+
                                        |
                              12 Platform administration
                                        |
                              13 Release verification
```

The diagram is a conservative delivery order. The dependency column and each task's detailed
prerequisites are authoritative; domain, email and analytics work can overlap after their dependencies
are complete. Task 00 can resolve independent decisions incrementally; do not guess deferred policies.
Task 05 is not releasable without trial/quota enforcement from tasks 06–07.
Task 03's enforcement and task 04's domain migration must be coordinated as one safe rollout.

| Task                                                                                                       | Dependencies                                   | Status                                                |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------- |
| [00 — Resolve implementation design gates](00-design-gates.md)                                             | None                                           | Not started                                           |
| [01 — Design tenant schema and safe migration](01-schema-and-migration-plan.md)                            | 00 for identity and retention decisions        | In progress                                           |
| [02 — Implement separate owner and staff identities](02-owner-and-staff-identity.md)                       | 01                                             | In progress                                           |
| [03 — Implement tenant context and PostgreSQL isolation](03-organization-context-and-rls.md)               | 01, 02                                         | In progress                                           |
| [04 — Scope every existing finance domain and support resource](04-scope-existing-finance.md)              | 03                                             | In progress                                           |
| [05 — Build organization creation and owner navigation](05-organization-onboarding.md)                     | 02, 04; plan/trial checks integrate with 06–07 | In progress                                           |
| [06 — Implement plans, feature gates and quota accounting](06-plans-entitlements-and-usage.md)             | 03, 04                                         | In progress (nearly complete; exceptions moved to 12) |
| [07 — Implement trial, manual payments and subscription lifecycle](07-subscriptions-and-manual-billing.md) | 05, 06; tax and billing decisions from 00      | Not started                                           |
| [08 — Implement suspension, deletion and recovery](08-organization-lifecycle.md)                           | 04, 07; approved retention policy from 00      | Not started                                           |
| [09 — Implement default and verified custom website domains](09-website-domains.md)                        | 03, 05, 06, 08; owner-login design from 00     | Not started                                           |
| [10 — Implement shared and custom sender identities](10-email-domains-and-delivery.md)                     | 04, 06, 08; domain-sharing policy from 00      | Not started                                           |
| [11 — Build consolidated owner analytics](11-owner-portfolio-analytics.md)                                 | 04, 05, 06                                     | Not started                                           |
| [12 — Build SaaS administrator operations](12-platform-administration.md)                                  | 02, 06, 07, 08, 10                             | Not started                                           |
| [13 — Rehearse migration and validate SaaS release](13-release-and-isolation-verification.md)              | 02–12 complete; outstanding gates resolved     | Not started                                           |

## Rules for executing tasks

- Review the agreement, current architecture and applicable repository instructions before editing.
- Final table names, module ownership and routes are designed in tasks 00–01 against the current code;
  this index does not invent a second unreviewed directory architecture or fixed endpoint contract.
- Implement each vertical slice through database, contract, API authorization/business logic, generated
  UI integration and shared components. Preserve existing financial behavior and deployed records.
- Do not expose multi-tenant access until all relevant domains, jobs and file paths are isolated.
- Update the task's completion evidence and this index only after acceptance checks pass.
- No commit, push, deployment, customer email or destructive database action is authorized merely by
  the existence of these documents.
