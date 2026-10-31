import { useUiLanguage } from '../../../../../lib/i18n'
import { AdministrationLayout } from '../../shared/components/administration-layout'

export function AdminOverviewPage() {
  useUiLanguage()
  return (
    <AdministrationLayout title="Overview">
      <div />
    </AdministrationLayout>
  )
}
