# Guided organization onboarding

The owner portal now offers a persisted six-step setup at `/owner/organizations/new`. Existing drafts resume at `/owner/organizations/:organizationId/setup`.

## Experience

1. Organization name (required) and optional activity. The workspace name is independent of the legal company name.
2. Optional company identity, email, flexible phone text, address, city, ICE, RC and IF. Missing information is omitted from the document preview.
3. Optional logo/signature uploads and document accent color. PNG, JPEG and WebP are supported, with a 2 MiB input limit. Images retain their proportions.
4. Essential, Signature or Atelier layout; French/English document language; MAD currency; payment deadline and estimate validity; compact mode; VAT **off by default**; optional bank details and footer.
5. Owner administrator identity and optional prepared staff invitations. The owner does not consume a staff identity. Invitations are scoped to this organization and **are not sent or activated yet**.
6. Review with edit links, then complete setup.

Continue saves each step. Previous preserves current values. Save & exit saves the current step; drafts can be resumed. Unsaved navigation prompts, disabled pending controls, step focus, reduced-motion support and a reload action for conflicts protect the form. Mobile uses compact progress, collapsible preview and fixed Previous/Continue controls; normal bottom navigation is hidden during setup.

The preview is a layout illustration, not the PDF generation pipeline. Placeholder rows are examples. It updates immediately for appearance and optional identity changes, and loads uploaded private assets through the authorized owner API.

## API and module boundaries

Contract source: `api/openapi/modules/identity/owner-onboarding.yaml`; creation is exposed alongside the existing organization-list contract. Validators, transport types and Orval clients/hooks are generated, not handwritten.

| Method | Path                                                          | Behavior                                                                 |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------ |
| POST   | `/v1/owner/organizations`                                     | Create an independent setup draft; request UUID makes retries idempotent |
| GET    | `/v1/owner/organizations/:organizationId/onboarding`          | Read the owned configuration and version                                 |
| PUT    | `/v1/owner/organizations/:organizationId/onboarding`          | Save configuration/current step with expected-version concurrency        |
| POST   | `/v1/owner/organizations/:organizationId/onboarding/complete` | Record setup completion once                                             |
| POST   | `/v1/owner/organizations/:organizationId/branding`            | Normalize and privately store a logo/signature                           |
| GET    | `/v1/owner/organizations/:organizationId/branding/:assetId`   | Read an authorized image for preview                                     |

Identity owns owner authorization, controllers, services, profile repository and wizard. Its service collaborates with the media module through a public interface. Media owns image normalization, private object storage and its asset repository. UI uses shared buttons, controls, dialogs, theme/language resources, Axios and generated TanStack Query consumers. The unsaved-changes component is now shared under `components/management`, with the previous settings import preserved as a re-export.

Owner-prefixed caches clear on account switching. Mutation responses check the current owner session before updating caches or navigating, so a delayed response after logout cannot restore the previous owner's setup.

## Persistence and migration

Included in the clean baseline: `0000_initial_schema.sql`.

- `organization_profiles`: one configuration snapshot per organization, current step, optimistic version and completion/update timestamps.
- `organization_brand_assets`: independent per-organization image metadata and private object key. Files use `organizations/:organizationId/branding/:assetId.png`.
- Owner policies use authenticated transaction context and ownership checks. Both new tables enforce RLS, including for the table owner where PostgreSQL permits it.
- Runtime access adds reviewed grants for the new tables, organization INSERT, and column-limited organization name/locale/update-time changes.
- The current schema is installed directly by the initial baseline. No staff account is duplicated, no customer data is inserted and no legacy company binding exists.

Configuration references are checked for organization ownership and image purpose before saving. Upload failure cleans the new object if metadata could not be stored. Replaced/detached image history is retained for now; safe unreferenced-asset retention/cleanup must be integrated before production release.

## Activation and workspace entry

Completing the wizard now atomically applies company settings, branding, the selected default document template and optional bank details, then activates the organization. The initial administrator is a normal organization user with independent credentials and a counted member seat. Platform ownership never establishes an organization session. Workspace requests and query caches are scoped to that organization.

The first organization starts a seven-calendar-day trial. Organization and staff admission checks are serialized to prevent concurrent quota bypass. Expired subscriptions and paused organizations block workspace access. Prepared staff invitations are not sent; the administrator can add staff after signing in separately.

Storage/email allowances and pooled consumption metering are implemented. Payment confirmation administration and verified custom-domain handoff remain pending. This is not a complete production billing rollout.

## Verification

- PostgreSQL integration tests: idempotent creation; optional fields; persisted drafts; concurrent save conflicts; atomic activation without staff duplication or invitation mail; owner/portal isolation; normalized and foreign/wrong-purpose images; non-bypass runtime RLS and column-limited writes.
- UI tests: six-step creation, default VAT behavior, backward navigation, save-and-exit, conflict preservation, unsaved navigation and delayed mutation after logout.
- Browser: complete journey with branding upload, layout/VAT/invitation/review interactions, French/English, light/dark and mobile/tablet/desktop layouts. Browser fixtures are intercepted test data and are not shipped in the application.

## Current independent-IAM boundary

See [platform and organization boundaries](platform-organization-boundaries.md). Organization creation provisions the initial administrator atomically; after activation an organization-owned worker delivers an expiring temporary password. The platform opens the organization login, not an owner workspace. Organization profiles and passwords are independent. Owner financial visibility uses platform-only read repositories. Staff receive effective entitlements without owner billing dates or pooled usage details.
