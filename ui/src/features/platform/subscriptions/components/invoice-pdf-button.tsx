import { Download } from 'lucide-react'
import { useState } from 'react'

import { downloadAdminInvoicePdf } from '../../../../api/generated/administration/administration'
import type { BillingInvoice } from '../../../../api/generated/models'
import { downloadOwnerSubscriptionInvoicePdf } from '../../../../api/generated/subscriptions/subscriptions'
import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../lib/i18n'

/** Downloads the invoice or credit note PDF in the current interface language (French by default). */
export function InvoicePdfButton({
  invoice,
  scope,
}: {
  invoice: Pick<BillingInvoice, 'id' | 'number'>
  scope: 'owner' | 'admin'
}) {
  const language = useUiLanguage() === 'en' ? 'en' : 'fr'
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function download() {
    setBusy(true)
    setError(null)
    try {
      const blob = await (scope === 'admin'
        ? downloadAdminInvoicePdf(invoice.id, { language })
        : downloadOwnerSubscriptionInvoicePdf(invoice.id, { language }))
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${invoice.number}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        aria-label={translate('Download PDF {{number}}', { number: invoice.number })}
        onClick={() => void download()}
      >
        <Download data-icon="inline-start" />
        {translate(busy ? 'Preparing…' : 'PDF')}
      </Button>
      <FormError error={error} />
    </div>
  )
}
