import type { Estimate } from '../../../api/generated/schemas/sales/estimates.schemas'
import { translate, useUiLanguage } from '../../../lib/i18n'

export function DocumentPaymentSummary({
  document,
}: {
  document: Pick<Estimate, 'agreedPaymentMethod' | 'bankDetailsSnapshot'>
}) {
  useUiLanguage()
  const bank = document.bankDetailsSnapshot
  const method = document.agreedPaymentMethod
  return (
    <section className="grid gap-3 rounded-panel border border-[var(--border)] bg-[var(--surface)] p-panel">
      <h2 className="text-lg font-bold">{translate('Agreed payment method')}</h2>
      <p className="text-sm">
        {method
          ? translate({ cash: 'Cash', bank_transfer: 'Bank transfer', cheque: 'Cheque' }[method])
          : translate('Not specified')}
      </p>
      {bank && (
        <div className="grid gap-1 break-all text-sm">
          <span className="text-[var(--muted)]">{translate('Bank details')}</span>
          <span>
            {bank.bankName} · {bank.accountHolder}
          </span>
          {bank.rib && <span>RIB : {bank.rib}</span>}
          {bank.iban && <span>IBAN : {bank.iban}</span>}
        </div>
      )}
    </section>
  )
}
