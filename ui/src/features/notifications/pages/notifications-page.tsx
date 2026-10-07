import '../../../lib/notifications-i18n'

import { useTranslation } from 'react-i18next'

import { PageHeader } from '../../../components/management/page-header'
import { EmptyState } from '../../../components/management/page-state'
import { RequestState } from '../../../components/management/request-state'
import { useUiLanguage } from '../../../lib/i18n'
import { useNotificationRules } from '../../settings'
import { RuleCard } from '../components/rule-card'

export function NotificationsPage() {
  useUiLanguage()

  const { t } = useTranslation('notifications'),
    query = useNotificationRules()
  return (
    <div className="mx-auto grid max-w-[1500px] gap-section p-page">
      <PageHeader eyebrow={t('title')} title={t('title')} description={t('description')} />
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : query.data.items.length ? (
        <div className="grid gap-content lg:grid-cols-2">
          {query.data.items.map((rule) => (
            <RuleCard key={rule.id} rule={rule} />
          ))}
        </div>
      ) : (
        <EmptyState title={t('empty')} />
      )}
    </div>
  )
}
