import '../../../../lib/notifications-i18n'

import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw, X } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmAction } from '../../../../components/management/confirm-action'
import { DataTable } from '../../../../components/management/data-table'
import { DataTablePagination } from '../../../../components/management/data-table-pagination'
import { FormError } from '../../../../components/management/form-error'
import { RequestState } from '../../../../components/management/request-state'
import { Button } from '../../../../components/ui/button'
import { uiLocale } from '../../../../lib/i18n'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import {
  type NotificationDocumentType,
  refreshDocumentNotifications,
  useDocumentNotifications,
  useSendDocumentActions,
} from '../queries'

export function DocumentNotificationHistory({
  documentType,
  id,
}: {
  documentType: NotificationDocumentType
  id: string
}) {
  useUiLanguage()

  const { t } = useTranslation('notifications'),
    cache = useQueryClient(),
    actions = useSendDocumentActions(),
    [offset, setOffset] = useState(0),
    query = useDocumentNotifications(documentType, id, { limit: 25, offset })
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>()
  const sendAuthority = documentType === 'report_run' ? 'reports.read' : `${documentType}s.update`
  const act = async (action: () => Promise<unknown>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
      await refreshDocumentNotifications(cache, documentType, id)
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <details className="overflow-hidden rounded-panel border border-border bg-[var(--surface)]">
      <summary className="cursor-pointer p-5 font-semibold">{t('history')}</summary>
      <p className="px-5 pb-4 text-xs text-muted-foreground">{t('deliveryHint')}</p>
      <FormError error={error} />
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <>
          <DataTable
            items={query.data.items}
            emptyTitle={t('noHistory')}
            emptyDescription={t('deliveryHint')}
            columns={[
              {
                title: t('date'),
                render: (row) => new Date(row.createdAt).toLocaleString(uiLocale()),
              },
              { title: t('kind'), render: (row) => t(row.kind) },
              { title: t('status'), render: (row) => t(row.status) },
              { title: t('recipient', { email: '' }), render: (row) => row.recipient ?? '—' },
              { title: t('attempts'), render: (row) => row.attempts },
              { title: t('error'), render: (row) => row.errorCode ?? '—' },
              {
                title: t('actions'),
                align: 'right',
                render: (row) => (
                  <div className="flex justify-end gap-2">
                    {row.status === 'failed' && (
                      <Can permission={['notification_dispatches.update', sendAuthority]}>
                        <Button
                          variant="outline"
                          size="icon-md"
                          title={t('retry')}
                          aria-label={t('retry')}
                          disabled={busy}
                          onClick={() =>
                            void act(() =>
                              row.kind === 'preparation'
                                ? actions.retryPreparation(documentType, id, row.id)
                                : actions.retry(documentType, id, row.id),
                            )
                          }
                        >
                          <RotateCcw />
                        </Button>
                      </Can>
                    )}
                    {row.status === 'queued' && (
                      <Can permission="notification_dispatches.update">
                        <ConfirmAction
                          label={t('cancelDelivery')}
                          description={t('cancelWarning')}
                          variant="destructive"
                          disabled={busy}
                          iconOnly
                          icon={<X />}
                          onConfirm={() =>
                            act(() =>
                              row.kind === 'preparation'
                                ? actions.cancelPreparation(documentType, id, row.id)
                                : actions.cancel(documentType, id, row.id),
                            )
                          }
                        />
                      </Can>
                    )}
                  </div>
                ),
              },
            ]}
          />
          <DataTablePagination
            total={query.data.total}
            offset={offset}
            limit={25}
            onOffset={setOffset}
            disabled={query.isFetching}
          />
        </>
      )}
    </details>
  )
}
