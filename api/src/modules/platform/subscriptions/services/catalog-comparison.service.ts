import {
  type SubscriptionEntitlements,
  SubscriptionEntitlementsSchema,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { createCatalogRepository } from '../repositories/catalog.repository.js'

type Catalog = NonNullable<
  Awaited<ReturnType<ReturnType<typeof createCatalogRepository>['version']>>
>
const features: SubscriptionEntitlements['features'] = [
  'custom_templates',
  'business_emails',
  'scheduled_reports',
  'report_exports',
  'staff_roles',
  'advanced_analytics',
  'custom_domains',
]
const limits = ['organizations', 'staffPerOrganization', 'storageBytes', 'businessEmails'] as const

/** Diagnostics only: intentionally not wired into owner, billing, admission or worker reads. */
export function compareCatalogVersion(catalog: Catalog) {
  const invalid = (): never => {
    throw new Error(`Invalid subscription catalog version ${catalog.version.id}`)
  }
  if (catalog.version.status !== 'published' || catalog.values.length !== 11) invalid()
  const valueMap = new Map(catalog.values.map((v) => [v.key, v]))
  if (valueMap.size !== 11) invalid()
  const entitlements: Record<string, unknown> = { features: [] }
  for (const key of limits) {
    const value = valueMap.get(key) ?? invalid()
    const count = key === 'organizations' || key === 'staffPerOrganization'
    if (
      !value ||
      value.valueType !== 'integer' ||
      value.booleanValue !== null ||
      value.unit !==
        (key === 'storageBytes' ? 'byte' : key === 'businessEmails' ? 'recipient' : 'count') ||
      value.kind !== (key === 'businessEmails' ? 'consumption' : 'capacity') ||
      value.scope !== (key === 'staffPerOrganization' ? 'organization' : 'owner') ||
      value.unlimitedAllowed !== count
    )
      invalid()
    if (value.isUnlimited) {
      if (!count || value.integerValue !== null) invalid()
      entitlements[key] = null
    } else {
      if (
        value.integerValue === null ||
        !Number.isSafeInteger(value.integerValue) ||
        value.integerValue < 0
      )
        invalid()
      entitlements[key] = value.integerValue
    }
  }
  for (const key of features) {
    const value = valueMap.get(key) ?? invalid()
    if (
      !value ||
      value.valueType !== 'boolean' ||
      typeof value.booleanValue !== 'boolean' ||
      value.integerValue !== null ||
      value.isUnlimited ||
      value.unlimitedAllowed ||
      value.unit !== 'flag' ||
      value.kind !== 'feature' ||
      value.scope !== (key === 'advanced_analytics' ? 'owner' : 'organization')
    )
      invalid()
    if (value.booleanValue) (entitlements.features as string[]).push(key)
  }
  const parsed = SubscriptionEntitlementsSchema.safeParse(entitlements)
  if (!parsed.success) invalid()
  const trial = catalog.version.planCode === 'trial'
  if (catalog.prices.length !== (trial ? 0 : 2)) invalid()
  const prices = new Map(catalog.prices.map((p) => [p.cycle, p]))
  if (prices.size !== catalog.prices.length) invalid()
  for (const price of catalog.prices) {
    if (
      price.currency !== 'MAD' ||
      !['monthly', 'annual'].includes(price.cycle) ||
      !Number.isSafeInteger(price.amountHtMinor) ||
      price.amountHtMinor < 0
    )
      invalid()
  }
  const reconstructed = {
    code: catalog.version.planCode,
    name: catalog.version.displayName,
    rank: catalog.version.rank,
    entitlements: parsed.data!,
    monthlyHt: trial ? 0 : (prices.get('monthly')?.amountHtMinor ?? invalid()),
    annualHt: trial ? 0 : (prices.get('annual')?.amountHtMinor ?? invalid()),
  }
  const drift = (): never => {
    throw new Error(
      `Subscription catalog drift for version ${catalog.version.id}; reader activation requires reconciliation`,
    )
  }
  if (catalog.version.sourceSnapshot === null || catalog.version.sourceHash === null) {
    throw new Error(
      `Subscription catalog version ${catalog.version.id} has no imported source provenance; legacy comparison is unavailable`,
    )
  }
  const legacy = catalog.legacy
  if (!legacy || !catalog.version.sourceHash || catalog.version.sourceHash !== legacy.sourceHash)
    drift()
  const current = SubscriptionEntitlementsSchema.safeParse(legacy!.plan.entitlements)
  if (!current.success) drift()
  const expected = current.data!
  if (
    legacy!.currency !== 'MAD' ||
    reconstructed.code !== legacy!.plan.code ||
    reconstructed.name !== legacy!.plan.name ||
    reconstructed.rank !== legacy!.plan.rank ||
    reconstructed.monthlyHt !== legacy!.plan.monthlyHt ||
    reconstructed.annualHt !== legacy!.plan.annualHt ||
    limits.some((key) => reconstructed.entitlements[key] !== expected[key]) ||
    reconstructed.entitlements.features.length !== expected.features.length ||
    reconstructed.entitlements.features.some((key) => !expected.features.includes(key))
  )
    drift()
  return reconstructed
}
