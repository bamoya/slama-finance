import {
  type SubscriptionEntitlements,
  SubscriptionEntitlementsSchema,
} from '../../../../contracts/generated/subscriptions/subscriptions.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createCatalogRepository } from '../repositories/catalog.repository.js'

type CatalogRepository = ReturnType<typeof createCatalogRepository>
export type CatalogVersion = NonNullable<Awaited<ReturnType<CatalogRepository['version']>>>

/** Terms of one published version: the only source of plan values and prices once activated. */
export type VersionTerms = {
  versionId: string
  planCode: string
  versionNumber: number
  name: string
  rank: number
  entitlements: SubscriptionEntitlements
  /** Integer MAD minor units HT; null for the trial (no sellable price). */
  prices: { monthly: number; annual: number } | null
}

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
const units = {
  organizations: 'count',
  staffPerOrganization: 'count',
  storageBytes: 'byte',
  businessEmails: 'recipient',
} as const

export class CatalogValueError extends Error {}

export const catalogUnavailable = () =>
  new AppError(
    503,
    'SUBSCRIPTION_CATALOG_UNAVAILABLE',
    'Subscription plans are temporarily unavailable. Please try again later.',
  )

/**
 * Validates a published version against its definitions and maps it to the transport DTO. Every
 * supported key is required exactly once; unlimited only where the definition allows it; prices are
 * exactly monthly+annual MAD for paid plans and absent for the trial. Anything else throws.
 */
export function versionTerms(catalog: CatalogVersion): VersionTerms {
  const invalid = (): never => {
    throw new CatalogValueError(`Invalid subscription catalog version ${catalog.version.id}`)
  }
  if (catalog.version.status !== 'published') invalid()
  const values = new Map(catalog.values.map((v) => [v.key, v]))
  if (values.size !== catalog.values.length || values.size !== limits.length + features.length)
    invalid()
  const entitlements: Record<string, unknown> = { features: [] }
  for (const key of limits) {
    const value = values.get(key) ?? invalid()
    if (
      value.valueType !== 'integer' ||
      value.booleanValue !== null ||
      value.unit !== units[key] ||
      (value.isUnlimited && (!value.unlimitedAllowed || value.integerValue !== null))
    )
      invalid()
    if (value.isUnlimited) entitlements[key] = null
    else if (
      value.integerValue === null ||
      !Number.isSafeInteger(value.integerValue) ||
      value.integerValue < 0
    )
      invalid()
    else entitlements[key] = value.integerValue
  }
  for (const key of features) {
    const value = values.get(key) ?? invalid()
    if (
      value.valueType !== 'boolean' ||
      typeof value.booleanValue !== 'boolean' ||
      value.integerValue !== null ||
      value.isUnlimited ||
      value.unit !== 'flag'
    )
      invalid()
    if (value.booleanValue) (entitlements.features as string[]).push(key)
  }
  const parsed = SubscriptionEntitlementsSchema.safeParse(entitlements)
  if (!parsed.success) invalid()
  const trial = catalog.version.planCode === 'trial'
  const prices = new Map(catalog.prices.map((p) => [p.cycle, p]))
  if (prices.size !== catalog.prices.length || catalog.prices.length !== (trial ? 0 : 2)) invalid()
  for (const price of catalog.prices)
    if (
      price.currency !== 'MAD' ||
      !Number.isSafeInteger(price.amountHtMinor) ||
      price.amountHtMinor < 0
    )
      invalid()
  return {
    versionId: catalog.version.id,
    planCode: catalog.version.planCode,
    versionNumber: catalog.version.versionNumber,
    name: catalog.version.displayName,
    rank: catalog.version.rank,
    entitlements: parsed.data!,
    prices: trial
      ? null
      : {
          monthly: prices.get('monthly')?.amountHtMinor ?? invalid(),
          annual: prices.get('annual')?.amountHtMinor ?? invalid(),
        },
  }
}

/**
 * Pinned and selling terms. Published versions are immutable, so validated terms are cached by
 * version id; the selling pointer is read every time. Errors fail closed: never JSON, never another
 * version, never unlimited.
 */
export function createCatalogReader(repo: CatalogRepository) {
  const cache = new Map<string, VersionTerms>()
  async function pinned(versionId: string, tx: Transaction) {
    const hit = cache.get(versionId)
    if (hit) return hit
    const catalog = await repo.version(versionId, tx)
    if (!catalog) throw catalogUnavailable()
    let terms: VersionTerms
    try {
      terms = versionTerms(catalog)
    } catch (error) {
      if (error instanceof CatalogValueError) throw catalogUnavailable()
      throw error
    }
    cache.set(versionId, terms)
    return terms
  }
  return {
    pinned,
    /** New sale, trial or grant: the selling version; withdrawn is 409, missing pointer is 503. */
    async selling(planCode: string, tx: Transaction) {
      const id = await repo.selling(planCode, tx)
      if (id === undefined) throw catalogUnavailable()
      if (id === null)
        throw new AppError(409, 'PLAN_NOT_SELLABLE', 'This plan is no longer available.')
      return pinned(id, tx)
    },
    /** Owner catalog: paid plans on sale, by rank. A withdrawn or invalid plan is omitted. */
    async sellingPaid(tx: Transaction) {
      const terms: VersionTerms[] = []
      for (const row of await repo.sellingVersions(tx)) {
        if (row.planCode === 'trial' || !row.id) continue
        try {
          terms.push(await pinned(row.id, tx))
        } catch (error) {
          if (!(error instanceof AppError) || error.code !== 'SUBSCRIPTION_CATALOG_UNAVAILABLE')
            throw error
        }
      }
      return terms.sort((a, b) => a.rank - b.rank)
    },
  }
}
