import { and, asc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'

import { organizations } from '../../db/schema/organizations.js'
import { ownerSubscriptions, subscriptionPlans } from '../../db/schema/subscriptions.js'
import type { Database } from './db.js'
import { inTenantScope } from './tenant-database.js'

/** Discovery reads metadata only. Every business operation then uses a separate tenant scope. */
export function createTenantWorkerRunner(database: () => Database) {
  return async (
    work: (organizationId: string) => Promise<unknown>,
    includeInactive = false,
    feature?: 'business_emails' | 'scheduled_reports',
  ) => {
    let cursor: string | undefined
    const failures: unknown[] = []
    while (true) {
      const page = await database().transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.actor_type','worker',true)`)
        return tx
          .select({ id: organizations.id })
          .from(organizations)
          .leftJoin(ownerSubscriptions, eq(ownerSubscriptions.ownerId, organizations.ownerId))
          .leftJoin(subscriptionPlans, eq(subscriptionPlans.code, ownerSubscriptions.planCode))
          .where(
            and(
              cursor ? gt(organizations.id, cursor) : undefined,
              feature ? sql`${subscriptionPlans.entitlements}->'features' ? ${feature}` : undefined,
              ...(!includeInactive
                ? [
                    isNotNull(organizations.activatedAt),
                    sql`((${ownerSubscriptions.planCode}='trial' and ${ownerSubscriptions.trialEndsAt}>now()) or (${ownerSubscriptions.planCode}<>'trial' and ${ownerSubscriptions.paidThroughAt}+case when ${ownerSubscriptions.cancelAtPeriodEnd} then interval '0' else interval '7 days' end>now()))`,
                    isNull(organizations.pausedAt),
                    isNull(organizations.suspendedAt),
                    isNull(organizations.deletionRequestedAt),
                  ]
                : []),
            ),
          )
          .orderBy(asc(organizations.id))
          .limit(100)
      })
      for (const organization of page) {
        try {
          await inTenantScope(organization.id, () => work(organization.id))
        } catch (error) {
          failures.push(error)
        }
      }
      if (page.length < 100) {
        if (failures.length) throw new AggregateError(failures, 'Tenant worker operations failed')
        return
      }
      cursor = page[page.length - 1]!.id
    }
  }
}
