import { Plus } from 'lucide-react'
import { Link } from 'wouter'

import { buttonVariants } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'

export function OwnerNewOrganizationButton() {
  useUiLanguage()
  return (
    <Link href="/owner/organizations/new" className={`${buttonVariants()} owner-create-action`}>
      <Plus size={16} />
      {translate('New organization')}
    </Link>
  )
}
