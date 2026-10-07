# 12 — Business notification rules, preferences and dispatch history

[Index](README.md) · Depends on 07–11 and generic transport from 06 · Next: [Release](13-release.md)

## Models and boundaries

Create `notification_rules` and `client_notification_preferences` with approved
fields, unique event key and composite client/rule PK. Rules default disabled;
absence of a client override inherits the rule. Reuse dispatches/outbound queue,
not another sender. Business modules own composition and eligibility. The worker
must still have no invoice/client/report/policy dependencies.

## API routes

| Route                                                                       | Behavior / permission                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `GET /v1/notification-rules`                                                | Registry/configuration, `notifications.view`                                               |
| `PATCH /v1/notification-rules/:id`                                          | Enable, timing and validated template/settings, `notifications.manage`                     |
| `POST /v1/notification-rules/:id/test`                                      | Safe sample to current authorized operator only, `notifications.manage`; rate-limited      |
| `GET /v1/clients/:id/notification-preferences`                              | Effective and explicit values, `clients.view` + `notifications.view`                       |
| `PUT /v1/clients/:id/notification-preferences/:ruleId`                      | Explicit override/CCs, `clients.update` + `notifications.manage`                           |
| `DELETE /v1/clients/:id/notification-preferences/:ruleId`                   | Remove override → inherit, same guards                                                     |
| `POST /v1/invoices/:id/send`, `POST /v1/estimates/:id/send`                 | Validate issued state/recipient, schedule preparation, `invoices.send` or `estimates.send` |
| `GET /v1/invoices/:id/notifications`, `GET /v1/estimates/:id/notifications` | Business dispatch + safe transport status, corresponding view permission                   |

Payment-received notifications are internal producers; reports already compose
their messages in 11. Rules are a fixed event registry, not an arbitrary SQL or
code-based automation builder. Define whether manual send honors each applicable
preference; baseline: respect explicit client opt-outs and missing-email blocks,
never silently bypass them. Do not send on every ordinary form save.

## Business rules and scheduling

Document initial supported events explicitly in contracts: invoice/estimate send,
payment receipt and invoice due reminders. Template variables are allowlisted and
escaped; unknown variables fail validation. Render in chosen locale with frozen
document facts. Sender must match configured permitted identities, not arbitrary
addresses. No SMTP/provider secrets in rules.

Date-based reminders run as business jobs that evaluate current invoice balance,
status, due date, rules and preferences. Use deterministic occurrence keys per
rule/document/recipient/date so repeated scans do not duplicate sends. Disable,
payment settlement or cancellation stops future reminders and explicitly cancels
pending messages through dispatch IDs. Recheck eligibility before enqueue after
PDF preparation. Already-sending or delivered messages cannot be guaranteed recalled.

Business source transactions durably schedule preparation; job completion commits
ready message, attachments and dispatch together. Generic worker never updates
invoice status directly. A business reconciliation task consumes dispatch delivery
outcomes idempotently to set sent_at/status if still valid; cancellation is not
reversed by a late send result. Report/transport failures remain visible separately.

## UI and stores

Reporting refinement (2026-10-03): this settings area is for operational business
notification rules and client preferences, not financial report subscriptions.
Staff schedules, their recipients and execution history stay under Scheduled reports.
The reporting producer composes the frozen summary/PDF email described in
[11-reporting.md](11-reporting.md); both workflows reuse generic transport.
Client opt-outs and staff report eligibility remain separate policies. Use the
current explicit action permissions in the agent specification; older `.view` and
`.manage` names in this historical sequence are not implementation authority.

Reuse `/settings/notifications` for rule switches, timing/template forms and tests;
delivery operations page remains separate. Client detail gains preferences panel
with explicit inherit/enabled/disabled states and optional CCs. Invoice/estimate
detail gains SendDialog and DispatchTimeline. No email is assumed for every client;
show a clear missing-email state rather than a failed background job.
Use Query for policies/preferences/history and Form for drafts. Invalidate effective
preferences after override removal, and poll dispatches only while pending. Session
permissions gate controls; no notification business state copied into global context.

## HTML email customization — implemented 2026-10-04

Migration `0026_branded_notification_defaults` installs the five French Slama
examples from `docs/notification-email-examples` as database defaults. It upgrades
only the exact original French placeholder subject/body in text mode; customized
subjects, bodies and non-French rules are preserved. Existing sender identities,
enabled states and timing stay unchanged, with a version increment on upgraded
rows. Fresh installations still start with all rules disabled. Re-running the
data migration does not overwrite the HTML templates or increment their versions.

- `/settings/notifications` keeps the existing fixed events, eligibility, sender
  restrictions, concurrency/version checks and `notification_rules.read/update`
  permissions. No new permissions or business-aware transport are introduced.
- `notification_rules.body_format` is `text` or `html`; migration 0025 defaults all
  existing rules to `text`. Existing text is escaped, never reinterpreted as HTML.
  `body_template` stores the content (up to 50,000 characters), not another copy.
- The shared Tiptap editor supports headings, emphasis, alignment, text color,
  lists, links, buttons, HTTPS images, tables and allowed event variables.
  Simple/branded starting designs replace only the body after confirmation.
- Existing HTML opens in source mode without an automatic editor round-trip.
  Converting to visual mode requires confirmation: custom layouts/styles can be
  simplified by the editor. Safe inline HTML remains customizable in source mode;
  this is not an unrestricted executable HTML or CSS page builder.
- `POST /v1/notification-rules/:id/preview` requires `notification_rules.update`
  and is rate-limited. It renders unsaved content with synthetic data through the
  **same composition path used for delivery**. No save, enqueue or client contact.
  It returns subject, HTML, text, sanitized source and a normalization flag.
- HTML is allowlist-sanitized on save and delivery using `sanitize-html`.
  Scripts, forms, embedded documents, unsafe URLs/CSS and variable-based attributes
  are removed. Variable values are escaped as text; unknown variables are rejected.
  `html-to-text` generates the plain-text alternative from the rendered HTML.
- The preview is a sandboxed iframe with a restrictive CSP. It offers desktop and
  mobile widths and plain-text inspection. HTTPS images are loaded remotely;
  email-client image policies and rendering differences still apply.
- A normalization notice explains changes made for safety. Language selection
  controls direction and starting-design language, not automatic translation of
  an administrator's custom text. Existing French/Arabic rule locales are kept.
- The existing **test** action sends the **saved** rule with synthetic data only to
  the current operator. Save before testing. No client email is used. Already queued
  frozen email content is not rewritten by template edits.
- OpenAPI is the source of generated Zod schemas/types and Orval mutations.
  Tests cover literal legacy text, malicious HTML/URLs/styles, variable escaping,
  source preservation/conversion, preview without sending, saving, and operator-only
  test delivery. Browser QA uses an isolated database; no external email is sent.

## Acceptance checks

Test inheritance, opt-out, missing/invalid email, permitted sender, template escaping,
duplicate reminder scans, offset/repeat boundaries, settlement/cancellation before
enqueue, queue cancellation races, worker restart and late delivery reconciliation.
Assert manual report export creates no email. UI tests settings, client overrides,
send status and error recovery. Exit: opt-in customer notifications and automated
reports operate through the same simple transport without coupling it to domains.
