import { PaymentReceiptSnapshotSchema } from '../../../../contracts/generated/sales/payments.schemas.js'
import { FinancialDecimal } from '../../../../lib/validation.js'

/** Retain saved document identity/design while capturing an explicitly dated balance. */
export function captureReceiptBalance(
  snapshot: unknown,
  paidAmount: string,
  balanceStage: 'confirmation' | 'restoration' | 'receipt_generation',
  capturedAt = new Date(),
) {
  const saved = PaymentReceiptSnapshotSchema.parse(snapshot)
  return PaymentReceiptSnapshotSchema.parse({
    ...saved,
    balanceStage,
    capturedAt: capturedAt.toISOString(),
    paidAtRecording: new FinancialDecimal(paidAmount).toFixed(2),
    remainingAtRecording: new FinancialDecimal(saved.invoiceTotal).minus(paidAmount).toFixed(2),
  })
}
