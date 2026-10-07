import './lib/visual-translations'

import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { LoadingState } from '../../components/management/page-state'
import { useUiLanguage } from '../../lib/i18n'

const Dashboard = lazy(() =>
  import('./pages/analytics-page').then((module) => ({
    default: () => <module.AnalyticsPage dashboard />,
  })),
)
const Reports = lazy(() =>
  import('./pages/analytics-page').then((module) => ({ default: module.AnalyticsPage })),
)

function VisualizationLoading() {
  useUiLanguage()

  const { t } = useTranslation('reportVisuals')
  return (
    <div className="mx-auto min-h-96 max-w-[1500px] p-page">
      <LoadingState label={t('loading')} />
    </div>
  )
}

/** Keep visualization libraries out of the initial authentication/application bundle. */
export function DashboardVisualization() {
  useUiLanguage()

  return (
    <Suspense fallback={<VisualizationLoading />}>
      <Dashboard />
    </Suspense>
  )
}
export function ReportsVisualization() {
  useUiLanguage()

  return (
    <Suspense fallback={<VisualizationLoading />}>
      <Reports />
    </Suspense>
  )
}
