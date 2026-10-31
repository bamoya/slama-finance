# SaaS foundation rollout

## Current baseline

Development now starts from `api/db/migrations/0000_initial_schema.sql`, generated from the
current schema, with explicit integrity triggers and FORCE RLS. It includes independent owners,
organizations/domains, scoped staff credentials, owner sessions/tokens, onboarding profiles and
private brand-asset metadata. Historical migrations and customer-data adoption are removed.

Owner authentication, owner organization metadata, guided setup persistence and scoped staff
authentication are implemented. Owners register; there are no default credentials or demo records.
Organization/domain/profile/brand policies enforce their reviewed transaction contexts.
Finance isolation now covers all 34 business/support tables; see [finance isolation](finance-isolation.md).

## Remaining activation sequence

1. Verify the implemented organization scope, tenant settings and relationships before release.
2. Preserve the implemented request/repository, worker, storage and report scope in subsequent changes.
3. Keep tenant foreign keys, indexes and FORCE RLS covered by non-bypass regression tests.
4. Apply onboarding to tenant settings and provision organization roles/staff without duplicating owners.
5. Enforce subscription/trial quotas and implement secure owner workspace entry.
6. Enable activation only after two-tenant isolation and full workflow integration checks pass.

No existing Slama company migration/backfill is part of this fresh project. Organizations remain
in setup until tenant finance activation is connected. Consolidated financial analytics, custom-domain
entry and subscriptions are separate pending slices; the schema cleanup does not implement them.

## Verification

Use the dedicated local test database:

```sh
TEST_DATABASE_URL=postgres://slama_test:slama_test@127.0.0.1:55439/slama_finance_test pnpm --dir api test:integration
```

Tests create isolated schemas/databases and never reset a hosted database. The baseline README
explains local initialization, metadata and the requirement for forward migrations after deployment.
