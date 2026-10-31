import { type SQL, sql } from 'drizzle-orm'

/**
 * Per-owner lifecycle status in SQL, mirroring resolveCoverage (subscriptions/services/coverage.ts):
 * an administrator suspension wins; coverage = confirmed payments; active = a period contains `at`;
 * without coverage the owner is in trial until trial_ends_at, then expired; with coverage but none
 * current the grace is 7 days after the latest period end (none when cancelling), then expired.
 * Yields owner_id, trial_ends_at and status.
 */
export function subscriptionLifecycle(at: SQL) {
  return sql`
    select s.owner_id, s.trial_ends_at,
           case
             when s.suspended_at is not null then 'suspended'
             when c.owner_id is null then
               case when ${at} >= s.trial_ends_at then 'expired' else 'trial' end
             when c.is_current then 'active'
             when ${at} >= (case when s.cancel_at_period_end then c.paid_through
                                 else c.paid_through + interval '7 days' end) then 'expired'
             else 'past_due'
           end as status
    from owner_subscriptions s
    left join (
      select owner_id,
             bool_or(coverage_start <= ${at} and ${at} < coverage_end) as is_current,
             max(coverage_end) as paid_through
      from subscription_payments
      where status = 'confirmed'
      group by owner_id
    ) c on c.owner_id = s.owner_id`
}
