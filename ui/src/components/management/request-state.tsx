import { ApiError } from '../../lib/api-error'
import { translate, useUiLanguage } from '../../lib/i18n'
import { FormError } from './form-error'
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from './page-state'
export function RequestState({
  query,
}: {
  query: { isPending: boolean; error: unknown; refetch: () => unknown }
}) {
  useUiLanguage()

  if (query.isPending) return <LoadingState />
  if (query.error instanceof ApiError && query.error.status === 403) return <ForbiddenState />
  if (query.error instanceof ApiError && query.error.status === 404)
    return (
      <EmptyState
        title={translate('Record not found')}
        description={translate('This record no longer exists or is not available.')}
      />
    )
  return (
    <div className="space-y-4">
      <FormError error={query.error} />
      <ErrorState
        onRetry={() => {
          void query.refetch()
        }}
      />
    </div>
  )
}
