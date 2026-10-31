import { sql } from 'drizzle-orm'

import type { AdminOverview } from '../../../../../contracts/generated/administration/administration.schemas.js'
import type { Transaction } from '../../../../../lib/db.js'
import { subscriptionLifecycle } from '../../shared/repositories/subscription-lifecycle.repository.js'

export function createAdminOverviewRepository() {
  return {
    /** Counts per lifecycle status; suspended subscriptions are counted only as suspended. */
    async counts(now: Date, tx: Transaction): Promise<AdminOverview> {
      const at = sql`${now.toISOString()}::timestamptz`
      const rows = await tx.execute<AdminOverview>(sql`
        with lifecycle as (${subscriptionLifecycle(at)})
        select
          (select count(*)::int from subscription_payments where status = 'submitted') as "pendingPayments",
          (count(*) filter (where status = 'active'))::int as "activeSubscriptions",
          (count(*) filter (where status = 'trial' and trial_ends_at <= ${at} + interval '7 days'))::int as "trialsEndingSoon",
          (count(*) filter (where status = 'past_due'))::int as "inGracePeriod",
          (count(*) filter (where status = 'expired'))::int as "expired",
          (count(*) filter (where status = 'suspended'))::int as "suspended"
        from lifecycle
      `)
      return rows[0]!
    },
  }
}
