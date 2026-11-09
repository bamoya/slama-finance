import { type SQL, sql } from 'drizzle-orm'

/** S5c coverage read authority (SUBSCRIPTION_COVERAGE_READS). */
export type CoverageReads = 'legacy' | 'periods'

/**
 * Per-owner lifecycle status in SQL for bounded administrator counts and filters. Yields owner_id,
 * trial_ends_at and status, mirroring the selected resolver at `at`.
 *
 * legacy mirrors resolveCoverage (services/coverage.ts): an administrator suspension wins; coverage
 * = confirmed payments; active = a period contains `at`; without coverage the owner is in trial until
 * trial_ends_at, then expired; with coverage but none current the grace is 7 days after the latest
 * period end (none when cancelling), then expired.
 *
 * periods mirrors resolvePeriods (services/period-resolver.service.ts): an open suspension wins;
 * coverage = non-trial periods ending at their supersession; the trial window is the trial period;
 * a started subscription without a trial period fails closed as expired; no grace after a scheduled
 * cancellation or when the latest period is complimentary.
 */
export function coverageLifecycleSql(reads: CoverageReads) {
  return reads === 'periods' ? periodsLifecycle : legacyLifecycle
}

function legacyLifecycle(at: SQL) {
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

function periodsLifecycle(at: SQL) {
  return sql`
    select s.owner_id, t.ends_at as trial_ends_at,
           case
             when exists (select 1 from subscription_suspensions u
                          where u.owner_id = s.owner_id and u.ended_at is null) then 'suspended'
             when t.owner_id is null then 'expired'
             when c.owner_id is null then
               case when ${at} >= t.ends_at then 'expired' else 'trial' end
             when c.is_current then 'active'
             when ${at} >= (case when c.last_kind = 'complimentary' or exists (
                                   select 1 from subscription_scheduled_changes x
                                   where x.owner_id = s.owner_id and x.kind = 'cancel'
                                     and x.status = 'scheduled')
                                 then c.paid_through
                                 else c.paid_through + interval '7 days' end) then 'expired'
             else 'past_due'
           end as status
    from owner_subscriptions s
    left join subscription_periods t on t.owner_id = s.owner_id and t.kind = 'trial'
    left join (
      select owner_id,
             bool_or(starts_at <= ${at} and ${at} < coalesce(superseded_at, ends_at)) as is_current,
             max(coalesce(superseded_at, ends_at)) as paid_through,
             (array_agg(kind order by coalesce(superseded_at, ends_at) desc, starts_at desc))[1] as last_kind
      from subscription_periods
      where kind <> 'trial'
      group by owner_id
    ) c on c.owner_id = s.owner_id`
}
