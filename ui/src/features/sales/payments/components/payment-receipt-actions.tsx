import { useQueryClient } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { Payment } from '../../../../api/generated/models'
import { downloadArtifact, usePreparePaymentReceipt } from '../../../../api/generated/sales/sales'
import { FormError } from '../../../../components/management/form-error'
import { Button } from '../../../../components/ui/button'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can } from '../../../identity'
import { RegeneratePdfDialog } from '../../components/regenerate-pdf-dialog'
import { refreshPayments } from '../queries'

export function PaymentReceiptActions({ payment }: { payment: Payment }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const cache = useQueryClient()
  const prepare = usePreparePaymentReceipt({ request: { timeout: 60_000 } })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  async function download() {
    setBusy(true)
    setError(null)
    try {
      const receipt = await prepare.mutateAsync({ id: payment.id })
      // Refresh even if the subsequent file download fails: issuance already succeeded.
      await refreshPayments(cache)
      const blob = await downloadArtifact(receipt.id, { responseType: 'blob' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${payment.receiptNumber}.pdf`
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) {
      setError(failure)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Can permission="payments.read">
      <Can permission={payment.receiptIssuedAt ? 'payments.read' : 'payments.update'}>
        <Button disabled={busy} onClick={() => void download()}>
          <Download data-icon="inline-start" />
          {t(busy ? 'preparingReceipt' : 'downloadReceipt')}
        </Button>
      </Can>
      <Can permission="payments.update">
        <RegeneratePdfDialog documentType="payment_receipt" id={payment.id} disabled={busy} />
      </Can>
      <FormError error={error} />
    </Can>
  )
}
