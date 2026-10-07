import { useQueryClient } from '@tanstack/react-query'
import { CopyPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'wouter'

import { useCreateEstimateRevision } from '../../../../api/generated/sales/sales'
import type { Estimate } from '../../../../api/generated/schemas/sales/estimates.schemas'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { buttonVariants } from '../../../../components/ui/button'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { refreshEstimates } from '../queries'

export function EstimateRevisionAction({ estimate }: { estimate: Estimate }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const create = useCreateEstimateRevision()
  const { can } = useAuthorization()
  const editable = can('estimates.update')
  if (estimate.revisionId)
    return (
      <Link
        href={`/estimates/${estimate.revisionId}${estimate.status === 'superseded' || !editable ? '' : '/edit'}`}
        className={buttonVariants({ variant: 'outline' })}
      >
        <CopyPlus data-icon="inline-start" />
        {t(estimate.status === 'superseded' ? 'viewRevision' : 'openDraftRevision')}
      </Link>
    )
  if (!['issued', 'sent', 'accepted', 'rejected', 'expired'].includes(estimate.status)) return null
  return (
    <Can permission="estimates.create">
      <ConfirmAction
        label={t('createRevision')}
        description={t('createRevisionDescription')}
        icon={<CopyPlus />}
        variant="outline"
        disabled={create.isPending}
        onConfirm={async () => {
          const revision = await create.mutateAsync({
            id: estimate.id,
            data: { expectedVersion: estimate.version },
          })
          await refreshEstimates(cache)
          navigate(`/estimates/${revision.id}${editable ? '/edit' : ''}`)
        }}
      />
    </Can>
  )
}
