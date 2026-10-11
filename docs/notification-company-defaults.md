# Company defaults and client overrides

Settings → Notifications configures the company default for each event, its sender,
French/English email templates and (for reminders only) its timing. Defaults are
disabled on new installations. Client details → Email preferences initially inherits
company defaults; Customize preferences exposes independent event switches and CC
recipients. Reset removes the overrides and restores inheritance.

Effective preference: `client override ?? company default`. A client opt-in can
enable a company-disabled event. An explicit opt-out suppresses a company-enabled
event. Missing/invalid client email and archived clients remain ineligible.

| Event                             | Automatic trigger                                    | Attachment                                             |
| --------------------------------- | ---------------------------------------------------- | ------------------------------------------------------ |
| Invoice issued (`invoice_sent`)   | First issue of this invoice                          | Invoice PDF                                            |
| Estimate issued (`estimate_sent`) | First issue of this estimate/revision                | Estimate PDF                                           |
| Payment confirmation              | First confirmation                                   | Existing text/HTML notification, no receipt attachment |
| Delivery note prepared            | First preparation                                    | Delivery-note PDF                                      |
| Invoice due reminder              | Configured due-date offset/repetition, while unpaid  | No attachment                                          |
| Estimate expiry reminder          | Configured validity offset/repetition, while current | No attachment                                          |

Issue/preparation queues durable work in the same database transaction. PDFs are
prepared/reused by the existing worker; provider calls happen outside the business
transaction. Automatic preparation belongs to the system, not the issuing operator's
later permissions. Manual sends still require the initiating operator's current
Read/Edit grants. History retries/cancellation require the existing permissions.
Delivery-note details now expose the shared collapsible email history.

Workers recheck current client preferences, recipient/CC set, document status and
content version before enqueueing email. Preference changes cancel unstarted
ineligible work; accepted/sending mail cannot be recalled. Company-default changes
do not cancel clients who remain explicitly opted in. Automatic issue/preparation
uses a stable per-document key; a revision has its own identity. PDF regeneration,
delivery acknowledgment and repeated issue requests do not queue another automatic
email. Existing historical documents are not backfilled when defaults are enabled.
Manual explicit sends can intentionally send another email and still respect the
effective notification preference; no bypass/force-send option is introduced.

Migration 0029 adds the disabled bilingual delivery rule without changing existing
company defaults, templates or client overrides. Deploy the updated release/API/UI
images; normal initialization applies the migration. No additional permissions or
environment variables are required.
