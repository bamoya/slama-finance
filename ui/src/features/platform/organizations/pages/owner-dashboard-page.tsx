import { ArrowRight, Building2, CalendarDays, Filter, ShieldCheck, Users } from 'lucide-react'
import { useState } from 'react'
import { Link, Redirect } from 'wouter'

import { useGetOwnerFinancialSummary } from '../../../../api/generated/identity/identity'
import { RequestState } from '../../../../components/management/request-state'
import { Button } from '../../../../components/ui/button'
import { Card } from '../../../../components/ui/card'
import { Combobox } from '../../../../components/ui/combobox'
import { DateRangePicker } from '../../../../components/ui/date-range-picker'
import { displayDateTime } from '../../../../lib/dates'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { ownerAuthPaths } from '../../../../lib/public-paths'
import { useOwnerAccount } from '../../identity/hooks/use-owner-account'
import { OwnerPortalLayout } from '../../shared/components/owner-portal-layout'
import { OwnerAttention } from '../components/owner-attention'
import {
  OwnerFinancialOverview,
  OwnerFinancialSummary,
} from '../components/owner-financial-overview'
import { OwnerNewOrganizationButton } from '../components/owner-new-organization-button'
import { OwnerOrganizationDistribution } from '../components/owner-organization-distribution'
import { OwnerOrganizationSummary } from '../components/owner-organization-summary'
import { useOwnerPortfolio } from '../hooks/use-owner-portfolio'

function OwnerDashboard() {
  useUiLanguage()
  const owner = useOwnerAccount()
  const portfolio = useOwnerPortfolio()
  const [scope, setScope] = useState('all')
  const [period, setPeriod] = useState(() => {
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Africa/Casablanca' }).format(
      new Date(),
    )
    return { start: today.slice(0, 7) + '-01', end: today }
  })
  const finance = useGetOwnerFinancialSummary(
    { ...period, ...(scope === 'all' ? {} : { organizationId: scope }) },
    { query: { enabled: !!portfolio.data?.length, retry: false } },
  )
  const [filtersOpen, setFiltersOpen] = useState(false)
  if (portfolio.error?.status === 401) return <Redirect to={ownerAuthPaths.login} />
  if (portfolio.isPending || portfolio.error || !portfolio.data)
    return <RequestState query={portfolio} />
  const organizations = portfolio.data
  const selected = scope === 'all' ? organizations : organizations.filter((org) => org.id === scope)
  const active = selected.filter((org) => org.status === 'active').length
  return (
    <div className="owner-dashboard">
      <header className="owner-page-heading">
        <div>
          <span className="owner-eyebrow">
            {translate('Owner portal')} <span>/</span>{' '}
            {displayDateTime(new Date().toISOString()).split(' ')[0]}
          </span>
          <h1>
            {owner.firstName
              ? translate('Hello {{name}}, here is your overview.', { name: owner.firstName })
              : translate('Your business, at a glance.')}
          </h1>
          <p>{translate('A clear view of your organizations. A direct route to each business.')}</p>
        </div>
        <OwnerNewOrganizationButton />
      </header>
      <section className="owner-dashboard-toolbar" aria-label={translate('Dashboard scope')}>
        <div className="owner-scope-summary">
          <span className="owner-scope-dot" />
          {scope === 'all' ? translate('All your organizations') : selected[0]?.name}
          <span>· MAD</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="owner-mobile-filter"
          aria-expanded={filtersOpen}
          aria-controls="owner-dashboard-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <Filter size={14} />
          {translate('Filters')}
        </Button>
        <div
          id="owner-dashboard-filters"
          className={`owner-scope-select ${filtersOpen ? 'owner-filter-open' : ''}`}
        >
          <Combobox
            aria-label={translate('Organization scope')}
            value={scope}
            onValueChange={setScope}
            options={[
              { value: 'all', label: translate('All organizations') },
              ...organizations.map((org) => ({
                value: org.id,
                label: org.name,
                keywords: [org.slug],
              })),
            ]}
          />
          <DateRangePicker
            from={period.start}
            to={period.end}
            onChange={(start, end) => {
              if (start && end) setPeriod({ start, end })
            }}
          />
        </div>
      </section>
      {organizations.length ? (
        <>
          <OwnerFinancialSummary data={finance.data} />
          <div className="owner-chart-grid">
            <OwnerFinancialOverview data={finance.data} />
            <OwnerOrganizationDistribution organizations={selected} />
          </div>
          <div className="owner-dashboard-bottom">
            <Card
              className="owner-card owner-organizations-overview"
              role="region"
              aria-labelledby="owner-organizations-title"
            >
              <div className="owner-section-heading">
                <div>
                  <span className="owner-eyebrow">{translate('YOUR ORGANIZATIONS')}</span>
                  <h2 id="owner-organizations-title">
                    {translate('Independent spaces, one account.')}
                  </h2>
                </div>
                <Link href="/organizations" className="owner-text-link">
                  {translate('Manage all')}
                  <ArrowRight size={14} />
                </Link>
              </div>
              <div className="owner-portfolio-counts">
                <span>
                  <Building2 size={15} />
                  <strong>{selected.length}</strong>
                  {translate('Organizations')}
                </span>
                <span>
                  <ShieldCheck size={15} />
                  <strong>{active}</strong>
                  {translate('Active')}
                </span>
                <span>
                  <Users size={15} />
                  <strong>{selected.reduce((total, org) => total + org.staffCount, 0)}</strong>
                  {translate('Members')}
                </span>
              </div>
              <div className="owner-org-summary-list">
                {selected.slice(0, 5).map((org) => (
                  <OwnerOrganizationSummary organization={org} key={org.id} />
                ))}
              </div>
              {selected.length > 5 && (
                <Link href="/organizations" className="owner-text-link">
                  {translate('View all organizations')}
                  <ArrowRight size={14} />
                </Link>
              )}
            </Card>
            <div className="owner-secondary-column">
              <OwnerAttention organizations={selected} />
              <Card className="owner-card owner-subscription-summary">
                <div>
                  <CalendarDays size={18} />
                  <h2>{translate('Your subscription')}</h2>
                </div>
                <p>{translate('View your plan and shared storage and email usage.')}</p>
                <Link href="/subscription" className="owner-text-link">
                  {translate('View subscription')}
                  <ArrowRight size={14} />
                </Link>
              </Card>
            </div>
          </div>
        </>
      ) : (
        <Card className="owner-card owner-empty-portfolio">
          <span className="owner-empty-icon">
            <Building2 size={30} />
          </span>
          <h2>{translate('Your first organization starts here.')}</h2>
          <p>
            {translate(
              'Each organization has its own clients, documents and staff. Your owner account includes administrator access.',
            )}
          </p>
          <OwnerNewOrganizationButton />
        </Card>
      )}
    </div>
  )
}
export function OwnerDashboardPage() {
  return (
    <OwnerPortalLayout>
      <OwnerDashboard />
    </OwnerPortalLayout>
  )
}
