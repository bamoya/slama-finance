import type { ReactNode } from 'react'

import { PageHeader } from '../../../../../components/management/page-header'
import { translate } from '../../../../../lib/i18n'
import { adminPaths } from '../admin-paths'

/** Page header with the administration breadcrumb; sub-pages pass the list they came from. */
export function AdministrationPageHeader({
  title,
  description,
  actions,
  status,
  backHref = adminPaths.overview,
}: {
  title: string
  description: string
  actions?: ReactNode
  status?: ReactNode
  backHref?: string
}) {
  return (
    <PageHeader
      brandName="BaMoYa Finance"
      eyebrow={translate('Administration')}
      title={translate(title)}
      description={translate(description)}
      actions={actions}
      status={status}
      backHref={backHref}
    />
  )
}
