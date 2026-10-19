import { useQueryClient } from '@tanstack/react-query'
import { Archive, RotateCcw } from 'lucide-react'

import type {
  BankAccount,
  DocumentTemplate,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { refreshSettings, settingsKeys, useSettingsActions } from '../queries'
import { SettingsDeletionDialog } from './settings-deletion-dialog'

export function SettingsRecordActions({
  resource,
  record,
  onDeleted,
  compact = false,
}: {
  resource: 'bank' | 'template'
  record: BankAccount | DocumentTemplate
  onDeleted?: () => void
  compact?: boolean
}) {
  useUiLanguage()

  const settingsApi = useSettingsActions()

  const cache = useQueryClient()
  const bank = resource === 'bank'
  const transition = async (action: 'archive' | 'restore') => {
    try {
      if (action === 'restore') await settingsApi.restoreBank(record.id, record.version)
      else if (bank) await settingsApi.archiveBank(record.id, record.version)
      else await settingsApi.archiveTemplate(record.id, record.version)
    } finally {
      await refreshSettings(cache)
    }
  }
  return (
    <>
      <Can permission={`${bank ? 'bank_accounts' : 'templates'}.update`}>
        {!record.archivedAt && (
          <ConfirmAction
            label={translate('Archive')}
            iconOnly={compact}
            variant="destructive"
            icon={<Archive size={16} />}
            description={
              bank
                ? translate(
                    'Archive {{value0}}? It will no longer be selectable for new payments. Historical records remain unchanged.',
                    { value0: record.name },
                  )
                : translate(
                    'Archive {{value0}}? If it is the company default, that selection will be cleared. Existing documents and assets are retained.',
                    { value0: record.name },
                  )
            }
            onConfirm={() => transition('archive')}
          />
        )}
      </Can>

      <Can permission={`${bank ? 'bank_accounts' : 'templates'}.update`}>
        {bank && record.archivedAt && (
          <ConfirmAction
            label={translate('Restore account')}
            iconOnly={compact}
            icon={<RotateCcw size={16} />}
            description={translate(
              'Restore {{value0}}? It will become available for new payments again. Existing history is preserved.',
              { value0: record.name },
            )}
            onConfirm={() => transition('restore')}
          />
        )}
      </Can>

      <Can permission={`${bank ? 'bank_accounts' : 'templates'}.delete`}>
        {
          <SettingsDeletionDialog
            resource={resource}
            selected={[record]}
            compact={compact}
            onComplete={async () => {
              onDeleted?.()
              cache.removeQueries({ queryKey: settingsKeys.detail(resource, record.id) })
              await refreshSettings(cache)
            }}
          />
        }
      </Can>
    </>
  )
}
