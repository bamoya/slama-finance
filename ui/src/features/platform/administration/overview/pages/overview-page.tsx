import { CalendarClock, CircleCheck, CirclePause, CircleX, Hourglass, Wallet } from 'lucide-react'

import { useGetAdminOverview } from '../../../../../api/generated/administration/administration'
import { RequestState } from '../../../../../components/management/request-state'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { adminPaths } from '../../shared/admin-paths'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import { OverviewCard } from '../components/overview-card'

export function AdminOverviewPage() {
  useUiLanguage()
  const query = useGetAdminOverview({ query: { retry: false } })
  const overview = query.data
  return (
    <AdministrationLayout title="Overview">
      <AdministrationPageHeader
        title="Overview"
        description="What needs your attention across customers and subscriptions."
      />
      {query.isPending || query.isError || !overview ? (
        <RequestState query={query} />
      ) : (
        <section
          aria-label={translate('Attention')}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
        >
          <OverviewCard
            label="Payments to verify"
            hint="Submitted payments awaiting confirmation or rejection."
            value={overview.pendingPayments}
            href={`${adminPaths.payments}?status=submitted`}
            icon={Wallet}
            emphasized={overview.pendingPayments > 0}
          />
          <OverviewCard
            label="Trials ending soon"
            hint="Free trials ending within 7 days."
            value={overview.trialsEndingSoon}
            href={`${adminPaths.customers}?status=trial`}
            icon={CalendarClock}
          />
          <OverviewCard
            label="In grace period"
            hint="Coverage ended; access continues for up to 7 days."
            value={overview.inGracePeriod}
            href={`${adminPaths.customers}?status=past_due`}
            icon={Hourglass}
          />
          <OverviewCard
            label="Active subscriptions"
            hint="Customers with a current paid period."
            value={overview.activeSubscriptions}
            href={`${adminPaths.customers}?status=active`}
            icon={CircleCheck}
          />
          <OverviewCard
            label="Expired"
            hint="Customers whose access is blocked."
            value={overview.expired}
            href={`${adminPaths.customers}?status=expired`}
            icon={CircleX}
          />
          <OverviewCard
            label="Suspended subscriptions"
            hint="Customers whose subscription was suspended by an administrator."
            value={overview.suspended}
            href={`${adminPaths.customers}?status=suspended`}
            icon={CirclePause}
          />
        </section>
      )}
    </AdministrationLayout>
  )
}
