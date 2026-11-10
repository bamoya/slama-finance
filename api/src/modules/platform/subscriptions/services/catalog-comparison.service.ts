import { SubscriptionEntitlementsSchema } from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import { type CatalogVersion, versionTerms } from './catalog-values.service.js'

const limits = ['organizations', 'staffPerOrganization', 'storageBytes', 'businessEmails'] as const

/**
 * Diagnostics only: imported-version provenance against the legacy JSON row. Never an authority;
 * runtime reads use versionTerms on the pinned or selling version.
 */
export function compareCatalogVersion(catalog: CatalogVersion) {
  const terms = versionTerms(catalog)
  const reconstructed = {
    code: terms.planCode,
    name: terms.name,
    rank: terms.rank,
    entitlements: terms.entitlements,
    monthlyHt: terms.prices?.monthly ?? 0,
    annualHt: terms.prices?.annual ?? 0,
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
