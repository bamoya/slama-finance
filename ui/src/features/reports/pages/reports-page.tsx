import { useUiLanguage } from '../../../lib/i18n'
import { ReportsVisualization } from '../visual-entry'

export function ReportsPage() {
  useUiLanguage()

  return <ReportsVisualization />
}
