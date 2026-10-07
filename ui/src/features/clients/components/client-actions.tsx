import { useQueryClient } from '@tanstack/react-query'
import { Archive, RotateCcw, Trash2 } from 'lucide-react'

import { ConfirmAction } from '../../../components/management/confirm-action'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { refreshClients, useClientActions } from '../queries'

export function ClientActions({
  client,
  compact = false,
  onDeleted,
}: {
  client: { id: string; displayName: string; version: number; archivedAt: string | null }
  compact?: boolean
  onDeleted?: () => void
}) {
  useUiLanguage()

  const actions = useClientActions()
  const cache = useQueryClient()
  return (
    <div className="flex flex-wrap gap-2">
      {client.archivedAt ? (
        <Can permission="clients.update">
          <ConfirmAction
            label={translate('Restore')}
            icon={<RotateCcw size={16} />}
            iconOnly={compact}
            variant="outline"
            description={translate('Restore {{value0}} for new documents?', {
              value0: client.displayName,
            })}
            onConfirm={async () => {
              try {
                await actions.restore(client.id, client.version)
              } finally {
                await refreshClients(cache)
              }
            }}
          />
        </Can>
      ) : (
        <Can permission="clients.update">
          <ConfirmAction
            label={translate('Archive')}
            icon={<Archive size={16} />}
            iconOnly={compact}
            variant="outline"
            description={translate(
              'Archive {{value0}}? Existing documents will remain unchanged.',
              { value0: client.displayName },
            )}
            onConfirm={async () => {
              try {
                await actions.archive(client.id, client.version)
              } finally {
                await refreshClients(cache)
              }
            }}
          />
        </Can>
      )}
      <Can permission="clients.delete">
        <ConfirmAction
          label={translate('Delete')}
          icon={<Trash2 size={16} />}
          iconOnly={compact}
          variant="destructive"
          description={translate(
            'Permanently delete {{value0}}? Only unreferenced clients can be deleted. This cannot be undone.',
            { value0: client.displayName },
          )}
          onConfirm={async () => {
            await actions.delete(client.id, client.version)
            await refreshClients(cache)
            onDeleted?.()
          }}
        />
      </Can>
    </div>
  )
}
