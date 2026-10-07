# Notification delivery implementation — October 2026

The notification rules, client overrides, invoice/estimate send commands and document
timeline are API-backed. The five fixed rules start disabled. Enable a rule with a
configured permitted sender through notification settings; a client override never
bypasses a disabled global rule. Templates support sanitized HTML and a text fallback,
with event-specific escaped variables. The five branded French defaults are installed
by migration 0026 without overwriting customized templates or enablement settings.
Tests use synthetic recipients and recording transports.

## Notification rule pages

Rules open at `/settings/notifications/:ruleId`; editing uses
`/settings/notifications/:ruleId/edit` instead of the former modal. The list title
opens details and Configure opens editing. Shared page headers host status and
actions; edit Save/Cancel use the shared form-action destination. Sender, locale,
timing, variables, HTML/visual editing, starting designs, previews, validation and
version-conflict recovery are retained. Saving returns to details; cancelling
does not persist changes. Background refetches do not replace the edit snapshot.

Read access permits details. Editing, synthetic tests and server-generated email
previews retain `notification_rules.update`; direct edit URLs also require read
access. Read-only details expose saved content without calling the preview mutation.
These pages reuse the generated list/update/preview/test contracts; no new endpoint
or database migration is introduced.

Manual sends create a durable `prepare_notification` job. Preparation rechecks the
initiating operator, lifecycle, consent and captured recipient, prepares/reuses the
frozen document PDF and atomically pins its private key with message/dispatch/job
completion. PDF jobs claim only `prepare_pdf`; notification jobs claim their own
type. Failed preparation and transport delivery appear separately in the timeline.
The sales reconciler records provider acceptance once and preserves printable
content and later cancellation/supersession/accepted-estimate states.

The generic queue selects only messages/attachments. It performs no business
lookups, uses leases and token fences, bounds attachment/provider work to 20 seconds,
heartbeats claims and preserves payload/idempotency keys through retries. Local/test
delivery can use the recording adapter or local SMTP/Mailpit; automated tests use
recording adapters without external delivery. Existing password-reset transport
remains separate and its regression tests pass.

`sent` means provider accepted, not delivered or read. Resend currently retains
idempotency keys for 24 hours; the queue stops retries after 23 hours from the first
attempt and surfaces `PROVIDER_OUTCOME_UNCERTAIN` for review. A final-attempt crashed
claim is also visibly uncertain. Automatic retry stops for permanent rejection;
explicit retry extends the budget without resetting attempt history. A confirmed
new resend uses a new request UUID. Already claimed messages may be impossible to
recall. See [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

Publication, regeneration, attachment pins and orphan deletion share an advisory
lock keyed by immutable object path. Attachment pins retain superseded PDF keys;
artifact cleanup recognizes PDF, XLSX and historical CSV files and retains references.
The 24-hour orphan grace period is unchanged. Attachment keys remain pinned for
retained history. `NOTIFICATION_PAYLOAD_RETENTION_DAYS=0` disables payload erasure by
default; an explicitly configured positive value erases addresses/bodies only from
sent/cancelled terminal messages while retaining message/dispatch identity and pins.
Finalized business files are not deleted by this policy.

First confirmed payment mutations enqueue at most one payment occurrence; restore
never replays it and notification production never issues a receipt. Reminder scans
use company-local calendar dates, signed day offsets and optional positive repeat
intervals. Independent logical occurrence uniqueness prevents template edits from
resending the same source/date/recipient occurrence. Scans visit bounded pages,
recheck outstanding balance/current estimate lifecycle and cancel stale ready work.
Estimate expiry locks only issued/sent rows after validity end, records actual
transition time and increments concurrency version without changing content version.

Policy disable, opt-out/contact changes, source lifecycle/settlement changes and
staff grant/status changes invoke producer cancellation within the same mutation
transaction. Reporting performs its own recipient/run authorization cancellation.
The sender remains business-agnostic. Read/retry/cancel endpoints additionally check
owner access; knowing a job/dispatch UUID gives no access.

Verification: `notification-delivery.test.ts` covers consent/template escaping,
reminder timing/lifecycle and provider behavior; `notification-delivery.integration.test.ts`
covers concurrent claims, changed-input conflict, crash after acceptance, lease
fences/final-attempt recovery, cancellation races and pin-versus-delete serialization.
`sales-notifications.integration.test.ts` covers default disable/inheritance/reset,
first-create conflict, idempotent sends/reconciliation, owner substitution/policy
cancellation, expiry and first-payment/no-receipt/restore behavior. All tests inject
storage/transport and use the existing isolated test-database safeguard.
