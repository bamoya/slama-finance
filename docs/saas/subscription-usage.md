# Subscription usage

Implemented for the owner subscription pool. All organizations owned by the same account share storage and business email allowances; organization staff counts remain per organization.

## Approved counting rules

- 1 GB means 1,000,000,000 bytes. Pending writes, retained branding originals/copies, media and persisted document/report files count. Downloads of existing files do not add consumption.
- The trial has one email allowance across its exact seven-day window. Paid email allowances use calendar months in Africa/Casablanca, including timezone offset changes. Paid coverage and trial usage are separate pools.
- Each distinct recipient of a newly queued message consumes one email. Retrying that message or replaying its idempotency key does not consume another email. Cancellation, failure and deletion do not refund queued email consumption.
- Account verification and password recovery use separate delivery paths and are excluded.
- At a limit, reject the affected new operation. Keep existing records and files accessible; never automatically delete data on downgrade.

## Implementation

`subscriptions` owns the usage ledgers, repositories and services. The public subscription response includes storage/email consumption and the current email allowance window. API schemas and UI contracts/hooks are generated from the modular OpenAPI source.

Storage writes pass through one metered object-storage decorator wired in the application composition root. An owner-scoped advisory lock serializes quota admission. Reservations commit before provider writes, so uncertain provider failures cannot make capacity appear free. A confirmed storage deletion releases the reservation. The same bytes at the same immutable key do not consume a second reservation; conflicting content is rejected.

Abandoned reservations remain conservative. After 24 hours, maintenance lists only that organization's relevant storage prefix and releases reservations for confirmed missing objects. Listing failure releases nothing. Retried reservations refresh their timestamp; cleanup rechecks the reservation version and confirmation state before releasing capacity. Existing objects and confirmed files are left to their domain's reference/retention cleanup. At most 1,000 abandoned reservations are inspected per tenant per maintenance run.

Business email admission executes inside the notification enqueue transaction. Message creation and usage consumption commit together or roll back together. A durable usage ledger is independent of message-retention cleanup, so deleting email history cannot restore the allowance. Feature gating still applies independently of RBAC.

The subscription page uses the shared owner layout and generated query hook. It displays actual consumption, reset/end time and visible warnings from 80% of an allowance, with French and English text and theme tokens.

## Boundaries

This is an undeployed SaaS baseline change, not a migration path for old Slama installations. The local database received only the two new usage tables and runtime grants; existing owner/setup data and the two existing branding files were preserved and counted. No hosted database was changed.

Manual payment-confirmation administration, invitation delivery, audited plan exceptions and the full archive/restore plan matrix remain separate work. Multi-file generation reserves each file independently; a later failure leaves already written files charged until their normal cleanup. A file replacement temporarily needs capacity for both old and new objects.

## Verification

- PostgreSQL: 276 integration tests passed, including concurrent storage/email admission, trial/paid separation, Casablanca month rollover, failed-write retention, safe abandoned-reservation cleanup and cross-owner pools; one optional storage test skipped.
- API: 205 unit tests, architecture and generator checks passed. Typechecks, lint, formatting and API/UI production builds passed; the initializer retains two console warnings and Vite reports the existing bundle-size warning.
- UI: the existing 416-test suite and the new subscription-page test passed. Mocked subscription browser checks at 1440px and 390px passed in light/dark themes with no runtime errors or horizontal overflow. These checks do not send real emails or modify subscriptions.
