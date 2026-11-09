import { and, asc, eq, gt, isNotNull, isNull, sql } from 'drizzle-orm'

import { organizations, platformUsers } from '../../db/schema/organizations.js'
import type { Database } from './db.js'
import { inTenantScope } from './tenant-database.js'

export type WorkerFeature = 'business_emails' | 'scheduled_reports'

/**
 * Discovery reads metadata only (pagination plus organization/customer restrictions). Every business
 * operation then uses a separate tenant scope. Subscription eligibility is injected (the
 * subscriptions public API) and checked per organization at execution, featureless jobs included,
 * so workers use the same coverage authority and effective entitlements as API admissions.
 * includeInactive maintenance skips eligibility except for an explicit feature.
 */
export function createTenantWorkerRunner(
  database: () => Database,
  eligible: (feature?: WorkerFeature) => Promise<boolean>,
) {
  return async (
    work: (organizationId: string) => Promise<unknown>,
    includeInactive = false,
    feature?: WorkerFeature,
  ) => {
    let cursor: string | undefined
    const failures: unknown[] = []
    while (true) {
      const page = await database().transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.actor_type','worker',true)`)
        return tx
          .select({ id: organizations.id })
          .from(organizations)
          .innerJoin(platformUsers, eq(platformUsers.id, organizations.ownerId))
          .where(
            and(
              cursor ? gt(organizations.id, cursor) : undefined,
              ...(!includeInactive
                ? [
                    isNotNull(organizations.activatedAt),
                    isNull(organizations.pausedAt),
                    isNull(organizations.suspendedAt),
                    isNull(organizations.deletionRequestedAt),
                    // Administrator restrictions: blocked or deleting customer (subscription
                    // suspension and coverage are part of the injected eligibility).
                    isNull(platformUsers.blockedAt),
                    isNull(platformUsers.deletionRequestedAt),
                  ]
                : []),
            ),
          )
          .orderBy(asc(organizations.id))
          .limit(100)
      })
      for (const organization of page) {
        try {
          await inTenantScope(organization.id, async () => {
            if (
              includeInactive ? feature && !(await eligible(feature)) : !(await eligible(feature))
            )
              return
            await work(organization.id)
          })
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
