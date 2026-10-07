import '../../../lib/notifications-i18n'

import { useTranslation } from 'react-i18next'

import { RequestState } from '../../../components/management/request-state'
import { useClientNotificationPreferences } from '../notification-preferences'
import { PreferenceEditor } from './preference-editor'

export function ClientNotificationPreferences({ id }: { id: string }) {
  const { t } = useTranslation('notifications'),
    query = useClientNotificationPreferences(id)
  return (
    <section className="grid gap-4 rounded-panel border border-border bg-[var(--surface)] p-5 md:p-panel">
      {query.data ? (
        <PreferenceEditor
          key={id}
          id={id}
          initial={query.data.items}
          reload={async () => {
            const result = await query.refetch()
            if (result.error) throw result.error
            return result.data!.items
          }}
        />
      ) : (
        <>
          <h2 className="text-lg font-semibold">{t('preferences')}</h2>
          <RequestState query={query} />
        </>
      )}
    </section>
  )
}
