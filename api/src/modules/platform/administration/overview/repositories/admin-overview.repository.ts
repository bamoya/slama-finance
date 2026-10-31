import { sql } from 'drizzle-orm'

import type { Transaction } from '../../../../../lib/db.js'

type Counts = {
  pendingPayments: number
  activeSubscriptions: number
  trialsEndingSoon: number
  inGracePeriod: number
  expired: number
}

export function createAdminOverviewRepository() {
  return {
    /**
     * Mirrors resolveCoverage (subscriptions/services/coverage.ts) per owner subscription:
     * coverage = confirmed payments; active = a period contains `now`; without coverage the owner
     * is in trial until trial_ends_at, then expired; with coverage but none current the grace is
     * 7 days after the latest period end (none when cancelling at period end), then expired.
     */
    async counts(now: Date, tx: Transaction): Promise<Counts> {
      const at = sql`${now.toISOString()}::timestamptz`
      const rows = await tx.execute<Counts>(sql`
        with coverage as (
          select owner_id,
                 bool_or(coverage_start <= ${at} and ${at} < coverage_end) as is_current,
                 max(coverage_end) as paid_through
          from subscription_payments
          where status = 'confirmed'
          group by owner_id
        ), lifecycle as (
          select s.trial_ends_at, c.is_current, c.paid_through,
                 case
                   when c.owner_id is null then
                     case when ${at} >= s.trial_ends_at then 'expired' else 'trial' end
                   when c.is_current then 'active'
                   when ${at} >= (case when s.cancel_at_period_end then c.paid_through
                                       else c.paid_through + interval '7 days' end) then 'expired'
                   else 'past_due'
                 end as status
          from owner_subscriptions s
          left join coverage c on c.owner_id = s.owner_id
        )
        select
          (select count(*)::int from subscription_payments where status = 'submitted') as "pendingPayments",
          (count(*) filter (where status = 'active'))::int as "activeSubscriptions",
          (count(*) filter (where status = 'trial' and trial_ends_at <= ${at} + interval '7 days'))::int as "trialsEndingSoon",
          (count(*) filter (where status = 'past_due'))::int as "inGracePeriod",
          (count(*) filter (where status = 'expired'))::int as "expired"
        from lifecycle
      `)
      return rows[0]!
    },
  }
}
