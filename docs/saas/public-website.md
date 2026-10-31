# BaMoYa Finance public website

The approved public design is integrated into the existing UI under `ui/src/features/marketing/`.
The isolated design references remain in `ui/.local/` and are not runtime dependencies.

## Module structure

```text
ui/src/features/marketing/
├── index.ts                  # Public entry: MarketingSite
├── marketing-site.tsx        # Public layout, routing, titles and style lifecycle
├── components/               # Header/footer, pricing, previews, reading controls
├── hooks/                    # Shared-language/theme adapter and motion policy
├── data/                     # Feature translations, launch plan copy, public contact config
├── pages/                    # Home, features, pricing, contact and legal pages
├── styles/marketing.css      # Public-site styles scoped to the marketing layout/portals
└── marketing.test.tsx        # Account integration, language, contact and copy coverage
```

The app router imports this feature only through its public `index.ts`. Marketing does not import
identity internals or call identity endpoints directly. Shared public paths connect its CTAs to
identity's existing API-backed account pages.

## Routes and integration

| Route                       | Behavior                                                     |
| --------------------------- | ------------------------------------------------------------ |
| `/`                         | Public home, including shared pricing cards                  |
| `/fonctionnalites`          | Workflow sections and bottom reading progress / touch picker |
| `/tarifs`                   | Monthly/annual plans, full comparison and FAQ                |
| `/contact`                  | Questions; `/contact?tab=demo` selects the demo form         |
| `/confidentialite`          | Privacy draft                                                |
| `/conditions`               | Terms draft                                                  |
| `/mentions-legales`         | Legal notice draft                                           |
| `/auth/login`               | Existing owner login                                         |
| `/auth/register`            | Existing owner registration and verification-email flow      |
| `/auth/forgot-password`     | Existing owner recovery request                              |
| `/auth/reset-password`      | Existing token-based owner password reset                    |
| `/auth/verify-email`        | Existing owner verification confirmation                     |
| `/auth/resend-verification` | Existing verification resend                                 |

Legacy `/owner/login`, `/owner/register`, recovery and verification URLs remain functional,
including token fragments in existing email links. The owner portal remains at `/owner` and the
organization application at `/dashboard` and its existing resource routes. Staff login and
organization-specific account routes are preserved. `/` now serves the public website, rather
than redirecting to the staff dashboard.

There are no simulated account dialogs: trial buttons link to real registration. Registration
itself follows the existing verification process; it does not create a subscription or organization.
The static launch plan catalog reflects the approved specification. Public billing/catalog APIs
and subscription enforcement are separate SaaS tasks; pricing copy is not an entitlement authority.

## Shared resources and isolation

- Controls reuse the application's Button variants, Input, Textarea, Checkbox, Select, Dialog,
  Tooltip and DropdownMenu primitives. The marketing adapter supplies layout classes, not a second
  global control system.
- Existing `slama.ui.language` and `slama-theme` preferences remain the single source of truth.
  Copy lives in the feature-owned `marketing` i18next namespace, defaulting to French.
- Marketing styles are scoped to `.marketing-site`, `.marketing-portal` and the temporary
  `marketing-document` document class. Workspace density, typography and scrollbars are restored
  when the public layout unmounts.
- Floating header, restrained motion, reduced-motion support, responsive full-width feature sections
  and the hold/slide/release picker are retained.
- The supplied BaMoYa logo is a shared `PlatformBrand` component. Owner account screens use it;
  existing staff/company branding remains unchanged.
- Screenshots are static demonstrations, explicitly labeled as fictional data. They do not expose
  live organization records and do not load the isolated prototype.

## Contact configuration and delivery

There is no public contact/demo delivery API in the existing backend. The integrated forms do not
fabricate a successful email delivery or a booked appointment. With a configured email they prepare
an encoded `mailto:` draft; the visitor reviews and sends it in their own mail application. Without
an email the submit action is disabled and the missing contact setup is explained.

| Deployment            | Email                       | WhatsApp                      |
| --------------------- | --------------------------- | ----------------------------- |
| Local Vite            | `VITE_PUBLIC_CONTACT_EMAIL` | `VITE_PUBLIC_WHATSAPP_NUMBER` |
| Prebuilt UI container | `PUBLIC_CONTACT_EMAIL`      | `PUBLIC_WHATSAPP_NUMBER`      |

Container startup adds these public values to the existing `config.js` runtime configuration using
JSON encoding. Compose deployment files pass them to the UI service. They contain public contact
information, never provider keys. Leave them blank until the operator confirms the public details.
WhatsApp uses a validated international number and a `wa.me` link. All form fields are retained only
in component state. No form data is persisted or sent to the API.

## Publication checklist

The operator identity, business status, address, hosting/provider details and legal texts remain
explicit draft placeholders, as requested. Validate them before commercial launch. The proposed
20% tax illustration must be confirmed against the operator's applicable tax status. Manual
activation/renewal and the seven-day first-payment refund proposal are described in the public copy;
these texts do not replace implementing and validating the subscription lifecycle.

## Verification

Run the existing UI checks: `pnpm --dir ui lint`, `pnpm --dir ui typecheck`, `pnpm --dir ui test`
and `pnpm --dir ui build`. Focused tests verify canonical/legacy owner routes, real generated
registration, style cleanup, shared language state, contact behavior and French copy/interpolations.
Browser checks cover public routes, mobile/tablet/desktop, both themes, dialogs and touch navigation.
