import type {
  EntitlementKey,
  EntitlementSource,
  SubscriptionEntitlements,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'

type Feature = SubscriptionEntitlements['features'][number]
const features: Feature[] = [
  'custom_templates',
  'business_emails',
  'scheduled_reports',
  'report_exports',
  'staff_roles',
  'advanced_analytics',
  'custom_domains',
]
const limits = ['organizations', 'staffPerOrganization', 'storageBytes', 'businessEmails'] as const
const unlimitedAllowed = new Set<EntitlementKey>(['organizations', 'staffPerOrganization'])

export type OverrideValue = {
  entitlementKey: string
  booleanValue: boolean | null
  integerValue: number | null
  isUnlimited: boolean
  startsAt: Date
  endsAt: Date | null
  revokedAt: Date | null
  createdAt?: Date
}

/** End of the effective half-open window: the earlier of the planned end and the revocation. */
export const overrideEnd = (o: Pick<OverrideValue, 'endsAt' | 'revokedAt'>) =>
  o.endsAt && o.revokedAt
    ? new Date(Math.min(o.endsAt.getTime(), o.revokedAt.getTime()))
    : (o.endsAt ?? o.revokedAt)

export const overrideActive = (o: OverrideValue, at: Date) => {
  const end = overrideEnd(o)
  return o.startsAt <= at && (end === null || at < end)
}

/**
 * The single evaluator: plan values replaced by the owner subscription's override active at `at`.
 * Restrictions (suspension, expiry, organization state, RBAC) are enforced by callers and always win.
 * A malformed override (unknown key, wrong type, forbidden unlimited) is ignored, never permissive.
 */
export function effectiveEntitlements(
  plan: SubscriptionEntitlements,
  overrides: OverrideValue[],
  at: Date,
): { entitlements: SubscriptionEntitlements; sources: EntitlementSource[] } {
  const values: Record<(typeof limits)[number], number | null> = {
    organizations: plan.organizations,
    staffPerOrganization: plan.staffPerOrganization,
    storageBytes: plan.storageBytes,
    businessEmails: plan.businessEmails,
  }
  const enabled = new Set(plan.features)
  const applied = new Map<EntitlementKey, Date | null>()
  // Deterministic even if storage ever held overlapping rows: latest start, then latest creation wins.
  const ordered = [...overrides].sort(
    (a, b) =>
      b.startsAt.getTime() - a.startsAt.getTime() ||
      (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0),
  )
  for (const o of ordered) {
    if (!overrideActive(o, at)) continue
    const key = o.entitlementKey as EntitlementKey
    if (applied.has(key)) continue
    if ((features as string[]).includes(key)) {
      if (typeof o.booleanValue !== 'boolean') continue
      if (o.booleanValue) enabled.add(key as Feature)
      else enabled.delete(key as Feature)
    } else if ((limits as readonly string[]).includes(key)) {
      const limit = key as (typeof limits)[number]
      if (o.isUnlimited) {
        if (!unlimitedAllowed.has(limit)) continue
        values[limit] = null
      } else {
        const min = limit === 'organizations' ? 1 : 0
        if (!Number.isSafeInteger(o.integerValue) || o.integerValue! < min) continue
        values[limit] = o.integerValue
      }
    } else continue
    applied.set(key, overrideEnd(o))
  }
  // Only organization/staff counts may be unlimited; storage and email stay finite.
  const entitlements: SubscriptionEntitlements = {
    organizations: values.organizations,
    staffPerOrganization: values.staffPerOrganization,
    storageBytes: values.storageBytes ?? plan.storageBytes,
    businessEmails: values.businessEmails ?? plan.businessEmails,
    features: features.filter((f) => enabled.has(f)),
  }
  const keys = [...limits, ...features] as EntitlementKey[]
  return {
    entitlements,
    sources: keys.map((entitlementKey) =>
      applied.has(entitlementKey)
        ? {
            entitlementKey,
            source: 'override',
            effectiveUntil: applied.get(entitlementKey)?.toISOString() ?? null,
          }
        : { entitlementKey, source: 'plan', effectiveUntil: null },
    ),
  }
}
