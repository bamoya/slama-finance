import { useQueryClient } from '@tanstack/react-query'
import { Archive, RotateCcw } from 'lucide-react'

import { ConfirmAction } from '../../../components/management/confirm-action'
import { translate, useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'
import { refreshCatalog, useCatalogActions } from '../queries'
import { CatalogDeletionDialog } from './catalog-deletion-dialog'

export function CatalogRecordActions({
  resource,
  record,
  compact = false,
  onDeleted,
}: {
  resource: 'products' | 'categories'
  record: { id: string; name: string; version: number; archivedAt: string | null }
  compact?: boolean
  onDeleted?: () => void
}) {
  useUiLanguage()

  const api = useCatalogActions()
  const cache = useQueryClient()
  const product = resource === 'products'
  async function transition(restore: boolean) {
    try {
      if (product)
        await (restore ? api.restoreProduct : api.archiveProduct)(record.id, record.version)
      else await (restore ? api.restoreCategory : api.archiveCategory)(record.id, record.version)
    } finally {
      await refreshCatalog(cache)
    }
  }
  return (
    <div
      className={
        compact
          ? 'flex shrink-0 items-center gap-2 whitespace-nowrap'
          : 'flex flex-wrap items-center gap-2'
      }
    >
      {!record.archivedAt && (
        <Can permission={`${resource}.update`}>
          <ConfirmAction
            label={translate('Archive')}
            icon={<Archive size={16} />}
            iconOnly={compact}
            variant="outline"
            description={translate('Archive {{value0}}? Historical records remain available.', {
              value0: record.name,
            })}
            onConfirm={() => transition(false)}
          />
        </Can>
      )}
      {record.archivedAt && (
        <Can permission={`${resource}.update`}>
          <ConfirmAction
            label={translate('Restore')}
            icon={<RotateCcw size={16} />}
            iconOnly={compact}
            variant="outline"
            description={translate('Restore {{value0}} for new selections?', {
              value0: record.name,
            })}
            onConfirm={() => transition(true)}
          />
        </Can>
      )}
      <Can permission={`${resource}.delete`}>
        <CatalogDeletionDialog
          resource={resource}
          selected={[record]}
          compact={compact}
          onComplete={async () => {
            await refreshCatalog(cache)
            onDeleted?.()
          }}
        />
      </Can>
    </div>
  )
}
