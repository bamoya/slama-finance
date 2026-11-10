# Subscription billing and manual payments

Redesign work: [S1 decisions, approved rules and open gates](decisions.md).
That record separates current implementation defaults from approved policy and the proposed normalized model.
Implementation and verification: [redesign progress](progress.md), [catalog model](entitlement-model.md) and
[S2/S4 activation](s2-s4-activation.md).

Implementation record for task 07. The decision record above identifies newly confirmed policies and defaults
that still need confirmation. Billing is manual: a submitted payment reference never activates coverage by itself.

## Payment methods and instructions

- Accepted methods are a configurable list in `billing_settings`. Defaults: `bank_transfer` and `cash`.
- Payment instruction text is configurable in `billing_settings`.

## Tax (TVA)

- `billing_settings.tax_rate_basis_points` controls the rate. `null` means not applicable and is the default. `2000` means 20%.
- Each payment snapshots currency, HT amount, rate, tax and TTC, all in centimes.
- Historical payments never change when tax configuration changes.

## Prices

- Monthly HT: 99 / 299 / 799 DH (Essential / Business / Pro).
- Annual HT: 990 / 2,990 / 7,990 DH.
- Stored in `subscription_plans` as `monthly_ht`, `annual_ht` and `rank`.

## Coverage

- Coverage is set when the administrator confirms a payment. Activation starts at confirmation.
- Renewal continues from `paid_through_at`, including during grace.
- Monthly and annual periods are calendar months and years in `Africa/Casablanca`.

## Upgrades and downgrades

- **Upgrade** (higher plan, same cycle): takes effect immediately on confirmation. Charge = price difference × unused share of the current period, rounded to the centime. The upgraded plan ends with the current period.
- **Cycle change or downgrade**: a renewal that starts at the end of the current period.

## Grace period

- 7 days, only after paid coverage has ended.
- No grace after the trial.
- No grace after cancellation at period end.

## Retention

- `retentionEndsAt = blockedAt + 90 days`, computed on read.
- Nothing is deleted here. Destructive execution is task 08.

## Administrator confirmation

Until the task 12 portal exists, an operator CLI handles confirmation:

```text
pnpm --filter ./api subscription:payment list
pnpm --filter ./api subscription:payment confirm <id> --by <name> [--received <ref>]
pnpm --filter ./api subscription:payment reject <id> --by <name>
```

- Runs with `MIGRATION_DATABASE_URL` and `actor_type = platform_admin` RLS.
- Confirmation is idempotent.
- At most one submitted payment per owner, enforced by a unique partial index.
- The runtime database role cannot update payments.

## Owner endpoints

- `GET /v1/owner/subscription`
- `GET /v1/owner/subscription/billing`
- `POST /v1/owner/subscription/quote`
- `GET` and `POST /v1/owner/subscription/payments`
- `PUT /v1/owner/subscription/cancellation`

## Known gaps

- Owner selection of organizations and staff to retain on downgrade is not implemented. Limits apply to new operations only; nothing is deleted.
- Workers use the same subscription eligibility as API admissions (per organization at execution). Plan values still come from the legacy JSON until the S2/S4 resolver slice.
- Administrator portal: task 12.
- Owner reminder emails: not done.
