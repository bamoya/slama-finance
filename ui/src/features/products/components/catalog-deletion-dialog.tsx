import { useState } from 'react'

import {
  useConfirmCatalogDeletion,
  usePreviewCatalogDeletion,
} from '../../../api/generated/catalog/catalog'
import type { CatalogDeletionSelection } from '../../../api/generated/models'
import { DeletionCascadeOption } from '../../../components/management/deletion-cascade-option'
import { DeletionImpactSummary } from '../../../components/management/deletion-impact-summary'
import { ImpactConfirmationDialog } from '../../../components/management/impact-confirmation-dialog'
import { translate } from '../../../lib/i18n'

export function CatalogDeletionDialog({
  resource,
  selected,
  compact,
  initiallyOpen,
  onDismiss,
  onComplete,
}: {
  resource: CatalogDeletionSelection['resource']
  selected: { id: string; version: number }[]
  compact?: boolean
  initiallyOpen?: boolean
  onDismiss?: () => void
  onComplete: () => Promise<unknown>
}) {
  const [cascadeProducts, setCascadeProducts] = useState(false)
  const preview = usePreviewCatalogDeletion()
  const confirm = useConfirmCatalogDeletion()
  const selection = {
    resource,
    cascadeProducts,
    records: selected.map((row) => ({ id: row.id, expectedVersion: row.version })),
  }
  return (
    <ImpactConfirmationDialog
      label={translate('Delete permanently')}
      iconOnly={compact}
      description={translate(
        'Deletion is permanent. Historical document names, weights, prices and quantities are preserved. Shared images are retained.',
      )}
      previewKey={JSON.stringify(selection)}
      initiallyOpen={initiallyOpen}
      onDismiss={() => {
        setCascadeProducts(false)
        onDismiss?.()
      }}
      options={
        resource === 'categories' ? (
          <DeletionCascadeOption
            checked={cascadeProducts}
            onCheckedChange={setCascadeProducts}
            label={translate('Also delete products and variants in these categories')}
          />
        ) : undefined
      }
      loadPreview={async () => {
        const impact = await preview.mutateAsync({ data: selection })
        return {
          token: impact.token,
          blocked: !!impact.blockers.length,
          content: <DeletionImpactSummary groups={impact.groups} media={impact.media} />,
        }
      }}
      onConfirm={async (token) => {
        await confirm.mutateAsync({ data: { ...selection, token } })
        await onComplete()
      }}
    />
  )
}
