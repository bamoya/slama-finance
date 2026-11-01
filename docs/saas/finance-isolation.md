# Organization-scoped finance isolation

Implemented on 30-10-2026. This is the isolation layer, not organization activation,
subscription enforcement or a completed owner-to-workspace journey.

## Request boundary

```text
Owner portal                         Organization staff
owner session                        organization login + staff session
      |                                      |
owner-scoped transactions            <slug>. host (finance requests)
      |                                      |
owner metadata/onboarding            authenticated scope + permission check
                                             |
                                   tenant database facade
                                             |
                                   short database transaction
                                   SET LOCAL app.organization_id
                                             |
                                   FORCE RLS + relationship constraints
```

The organization slug from the request host selects the scope; it grants no permission. The staff session must belong
to that organization, the organization must be available, and the requested permission
must be granted. Organization authentication selects scope in its existing route. Missing,
invalid or conflicting scope is rejected. Owner endpoints keep their independent owner scope.
Staff cookies are host-only and cover `/api/v1`; server checks, rather than cookie paths, isolate organizations.
Logging into another organization replaces that browser's current staff cookie.

Contracts declare organization scope as an API-key header alongside the appropriate session
security scheme. Transport schemas and UI clients continue to be generated from OpenAPI.
The upcoming workspace-entry UI must install the selected organization header centrally and
isolate/reset its TanStack Query cache when switching organizations or accounts.

## Database coverage

All 34 finance/staff/support tables have a required `organization_id`, tenant-aware defaults,
ENABLE/FORCE RLS, and policies for both reads and writes. This covers:

- Staff, staff settings, sessions, recovery, roles and role assignments.
- Company settings, bank accounts, document templates and media.
- Categories, products and variants; clients and notification preferences.
- Estimates/invoices/BLs/payments, their lines and allocation links.
- Artifacts, jobs, outbound messages/attachments and notification dispatches/rules.
- Report schedules/recipients/runs and audit events.

The permissions catalog and owner identity/session/token tables remain platform-level.
Organizations, domains, onboarding profiles and owner brand assets retain their separately
reviewed owner/tenant policies.

Company settings use a composite `(organization_id, id)` primary key: `id=1` now means one
settings record **within an organization**. Tenant-local unique constraints and indexes include
organization scope. Globally random credential token hashes remain globally unique.

89 supplementary composite foreign keys reject cross-organization references even for a
privileged writer. These are deferred NO ACTION checks alongside the existing lifecycle foreign
keys, preserving their SET NULL/CASCADE/RESTRICT behavior. Their supporting unique keys and
FORCE RLS clauses are SQL-managed, like the existing integrity triggers; Drizzle does not model
all of these details. Keep them when generating future migrations.

Creating an organization provisions only its own admin role, role permissions, company defaults
and six disabled bilingual notification rules. The owner is not duplicated as a staff account.
No sample businesses, default passwords or global company record are installed by migrations.
Setup completion still does not activate the organization.

## Execution and workers

`tenantDatabase` preserves repository APIs and transaction boundaries. Standalone queries are
replayed inside short scoped transactions. Explicit transactions preserve their isolation options
(including repeatable-read reports), nested savepoints and commit/rollback behavior. Context is
transaction-local, never a persistent SET on a pooled connection. Request-local AsyncLocalStorage
captures scope; parallel requests cannot overwrite a shared global organization variable.
Prepared/relational queries must be used inside an explicit tenant transaction; the facade rejects
those escape paths rather than silently executing them without the selected scope.

The worker runner discovers organization IDs through a metadata-only worker policy and then
executes each organization separately. Preparation, delivery, scheduled reports, reminders and
metrics skip inactive, paused, suspended and deletion-pending organizations. Cleanup may run for
inactive organizations. One organization's failure does not prevent processing subsequent ones;
failures are reported at the end of the polling pass.

Job/message idempotency keys and claims are tenant-local. Payload document IDs are resolved under
the job row's tenant scope. No organization is inferred from a user-supplied job payload.

## Private files

```text
organizations/{organizationId}/
  branding/{assetId}.png
  media/{assetId}.png
  artifacts/{documentType}/{artifactId}.{pdf|csv|xlsx}
```

Media, artifact and attachment metadata validate the organization-specific prefix. API reads
first authorize tenant metadata; callers cannot supply arbitrary object-storage keys. Artifact
cleanup lists only the current organization's artifact prefix, checks references under that same
scope, retains its grace period/key locks and ignores any foreign entries returned by a provider.
Local and S3 adapters accept the new scoped paths/prefixes.

## Migration and local verification

The project is still predeployment, so the current schema is represented directly in the single
`0000_initial_schema.sql` baseline and its regenerated snapshot. No legacy upgrade is reintroduced.
The local development schema was rebuilt using a validated staging database while preserving the
existing owner's account, sessions, organization onboarding and branding metadata. Hosted databases
were not accessed. No customer business data or credentials were seeded.

Regression coverage includes all finance workflows plus non-bypass PostgreSQL tests for all 34
policies, missing scope, concurrent queries, raw SQL, nested transactions/isolation levels, foreign
relationships, storage prefixes, mixed-tenant bulk selections, artifact downloads, staff permissions,
paused access, worker scopes and failure isolation. The existing schema, startup, owner and auth
regressions also run against the new baseline.

## Still pending

- Apply completed onboarding configuration and brand assets to live company/document defaults.
- Enforce plan/trial limits before activation or staff creation.
- Connect secure owner workspace entry and owner-aware audit attribution without inventing staff.
- Bind shared UI requests/caches to the selected organization during workspace entry.
- Complete verified website/email domains and lifecycle/subscription tasks.

Keep owner-created organizations in Setup until those activation requirements are connected.

Final checks: 205 API unit tests, 19 architecture checks, 5 contract-generator checks and
266 PostgreSQL integration tests passed (one optional storage test skipped). API build/types/lint,
UI generated-client typecheck, schema-drift check and repository formatting passed. Both local
servers are running; API readiness and UI return HTTP 200. Full end-to-end two-organization
export/PDF/cascade release rehearsal still belongs to the activation/release verification tasks.

## Activation follow-up — 2026-10-30

Owner activation, actor-based audit attribution, selected-organization transport and private workspace caches are now connected. Subscription expiry and organization/staff admission checks are enforced. Earlier references to keeping every completed organization in Setup are superseded. Pooled storage/email resource metering is implemented; custom-domain handoff and the final release rehearsal remain open.
