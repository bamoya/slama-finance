import { useQueryClient } from '@tanstack/react-query'
import { RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLocation } from 'wouter'

import type { Payment } from '../../../../api/generated/models'
import { PaymentVersionSchema } from '../../../../api/generated/schemas/sales/payments.schemas'
import { ConfirmAction } from '../../../../components/management/confirm-action'
import { MoreActions } from '../../../../components/management/more-actions'
import { useUiLanguage } from '../../../../lib/i18n'
import { Can, useAuthorization } from '../../../identity'
import { SalesCancellationDialog } from '../../components/sales-cancellation-dialog'
import { SalesDeletionDialog } from '../../components/sales-deletion-dialog'
import { refreshPayments, usePaymentActions } from '../queries'
import { PaymentConfirmationDialog } from './payment-confirmation-dialog'

export function PaymentActions({ payment }: { payment: Payment }) {
  useUiLanguage()

  const { t } = useTranslation('sales')
  const { can } = useAuthorization()
  const [, navigate] = useLocation()
  const cache = useQueryClient()
  const actions = usePaymentActions()
  const canConfirm = payment.status === 'pending' && can('payments.update')
  const canCancel = payment.status !== 'cancelled' && can('payments.update')
  const canRestore = payment.status === 'cancelled' && can('payments.update')
  const canDelete = can('payments.delete')
  if (!canConfirm && !canCancel && !canRestore && !canDelete) return null
  return (
    <>
      {canConfirm && (
        <Can permission="payments.update">
          <PaymentConfirmationDialog
            expectedVersion={payment.version}
            onConfirm={async (collectedOn) => {
              await actions.confirm(payment.id, { expectedVersion: payment.version, collectedOn })
              await refreshPayments(cache)
            }}
          />
        </Can>
      )}
      <MoreActions>
        {canCancel && (
          <Can permission="payments.update">
            <SalesCancellationDialog
              resource="payments"
              selected={[payment]}
              triggerLabel={t('cancelPayment')}
              onComplete={async () => {
                await refreshPayments(cache)
              }}
            />
          </Can>
        )}
        {canRestore && (
          <Can permission="payments.update">
            <ConfirmAction
              label={t('restorePayment')}
              description={t('restorePaymentWarning')}
              icon={<RotateCcw size={16} />}
              onConfirm={async () => {
                const data = PaymentVersionSchema.parse({ expectedVersion: payment.version })
                await actions.restore(payment.id, data)
                await refreshPayments(cache)
              }}
            />
          </Can>
        )}
        {canDelete && (
          <Can permission="payments.delete">
            <SalesDeletionDialog
              resource="payments"
              selected={[payment]}
              onComplete={async () => {
                await refreshPayments(cache)
                navigate('/payments')
              }}
            />
          </Can>
        )}
      </MoreActions>
    </>
  )
}
