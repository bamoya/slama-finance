import type { BillingCustomer } from '../../../../api/generated/models'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import { customerTypeLabel } from './billing-customer'

/** Customer type and identity snapshot, compact for table cells and dialogs. */
export function BillingCustomerSummary({ customer }: { customer: BillingCustomer | null }) {
  useUiLanguage()
  const type = customer?.type === 'company' ? 'company' : 'individual'
  return (
    <div data-testid="customer-summary">
      <span className="whitespace-nowrap">{customerTypeLabel(type)}</span>
      {customer?.legalName && <p className="text-xs">{customer.legalName}</p>}
      {customer?.ice && (
        <p className="text-xs text-[var(--muted)]">
          {translate('ICE')} {customer.ice}
        </p>
      )}
      {customer?.address && (
        <p className="max-w-xs whitespace-normal break-words text-xs text-[var(--muted)]">
          {customer.address}
        </p>
      )}
      {customer?.registrationNumber && (
        <p className="text-xs text-[var(--muted)]">
          {translate('RC')} {customer.registrationNumber}
        </p>
      )}
      {customer?.taxIdentifier && (
        <p className="text-xs text-[var(--muted)]">
          {translate('IF')} {customer.taxIdentifier}
        </p>
      )}
    </div>
  )
}
