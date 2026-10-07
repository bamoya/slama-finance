import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'wouter'

import { buttonVariants } from '../../../components/ui/button'
import { useUiLanguage } from '../../../lib/i18n'
import { Can } from '../../identity'

export function ClientDocumentActions({
  clientId,
  archived,
}: {
  clientId: string
  archived: boolean
}) {
  useUiLanguage()

  const { t } = useTranslation('clients')
  return (
    <>
      {!archived && (
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['estimates', 'estimates.create', 'newEstimate'],
              ['invoices', 'invoices.create', 'newInvoice'],
              ['delivery-notes', 'delivery_notes.create', 'newDelivery'],
            ] as const
          ).map(([path, permission, label]) => (
            <Can
              key={path}
              permission={[
                permission,
                path === 'delivery-notes' ? 'delivery_notes.read' : `${path}.read`,
              ]}
            >
              <Link
                href={`/${path}/new?clientId=${clientId}`}
                className={buttonVariants({ variant: 'outline' })}
              >
                <Plus size={16} />
                {t(label)}
              </Link>
            </Can>
          ))}
        </div>
      )}
    </>
  )
}
