import { eq, sql } from 'drizzle-orm'

import {
  entitlementDefinitions,
  planEntitlements,
  planVersionPrices,
  planVersions,
} from '../../../../../db/schema/subscription-catalog.js'
import { billingSettings, subscriptionPlans } from '../../../../../db/schema/subscriptions.js'
import type { Transaction } from '../../../../lib/db.js'

/** Comparison-only catalog reads. This repository never chooses an owner's version or writes. */
export function createCatalogRepository() {
  return {
    async version(id: string, tx: Transaction) {
      const [version] = await tx.select().from(planVersions).where(eq(planVersions.id, id))
      if (!version) return null
      const values = await tx
        .select({
          key: planEntitlements.entitlementKey,
          valueType: planEntitlements.valueType,
          booleanValue: planEntitlements.booleanValue,
          integerValue: planEntitlements.integerValue,
          isUnlimited: planEntitlements.isUnlimited,
          unit: entitlementDefinitions.unit,
          kind: entitlementDefinitions.kind,
          scope: entitlementDefinitions.scope,
          unlimitedAllowed: entitlementDefinitions.unlimitedAllowed,
        })
        .from(planEntitlements)
        .innerJoin(
          entitlementDefinitions,
          eq(entitlementDefinitions.key, planEntitlements.entitlementKey),
        )
        .where(eq(planEntitlements.planVersionId, id))
      const prices = await tx
        .select()
        .from(planVersionPrices)
        .where(eq(planVersionPrices.planVersionId, id))
      const [legacy] = await tx
        .select({
          plan: subscriptionPlans,
          currency: billingSettings.currency,
          sourceHash: sql<string>`encode(sha256(convert_to(subscription_catalog_snapshot(${subscriptionPlans},${billingSettings.currency})::text,'UTF8')),'hex')`,
        })
        .from(subscriptionPlans)
        .innerJoin(billingSettings, eq(billingSettings.id, 1))
        .where(eq(subscriptionPlans.code, version.planCode))
      return { version, values, prices, legacy: legacy ?? null }
    },
  }
}
