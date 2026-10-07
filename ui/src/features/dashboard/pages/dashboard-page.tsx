import { useUiLanguage } from '../../../lib/i18n'
import { DashboardVisualization } from '../../reports'

export function DashboardPage() {
  useUiLanguage()

  return <DashboardVisualization />
}
