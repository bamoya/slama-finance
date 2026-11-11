import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  getGetOwnerBillingQueryKey,
  useGetOwnerBilling,
  useUpdateOwnerBillingCustomer,
} from '../../../../api/generated/subscriptions/subscriptions'
import { FormError } from '../../../../components/management/form-error'
import { RequestState } from '../../../../components/management/request-state'
import { Button } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import {
  customerApiErrors,
  type CustomerErrors,
  type CustomerForm,
  customerToForm,
  customerTypeLabel,
  validateCustomer,
} from './billing-customer'
import { BillingCustomerFields } from './billing-customer-fields'

/** Saved identity printed on the next invoices; past invoices keep the identity they were issued with. */
export function BillingDetailsCard() {
  useUiLanguage()
  const cache = useQueryClient()
  const billing = useGetOwnerBilling({ query: { retry: false } })
  const update = useUpdateOwnerBillingCustomer()
  const [draft, setDraft] = useState<CustomerForm | null>(null)
  const [errors, setErrors] = useState<CustomerErrors>({})
  const [saved, setSaved] = useState(false)
  if (billing.isPending || billing.isError)
    return (
      <Card>
        <CardHeader>
          <CardTitle>{translate('Billing details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <RequestState query={billing} />
        </CardContent>
      </Card>
    )
  const customer = billing.data.customer
  const rows: [string, string | null | undefined][] = [
    [translate('Legal name'), customer?.legalName],
    [translate('ICE'), customer?.ice],
    [translate('Address'), customer?.address],
    [translate('RC'), customer?.registrationNumber],
    [translate('IF'), customer?.taxIdentifier],
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate('Billing details')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {draft ? (
          <form
            noValidate
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault()
              setSaved(false)
              const result = validateCustomer(draft)
              setErrors(result.errors ?? {})
              if (!result.customer) return
              update.mutate(
                { data: result.customer },
                {
                  onSuccess: (catalog) => {
                    cache.setQueryData(getGetOwnerBillingQueryKey(), catalog)
                    void cache.invalidateQueries({ queryKey: getGetOwnerBillingQueryKey() })
                    setDraft(null)
                    setSaved(true)
                  },
                },
              )
            }}
          >
            <BillingCustomerFields
              idPrefix="details"
              value={draft}
              onChange={setDraft}
              errors={errors}
              apiErrors={customerApiErrors(update.error)}
            />
            <FormError error={update.error} />
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={update.isPending}>
                {update.isPending ? translate('Please wait…') : translate('Save')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={update.isPending}
                onClick={() => {
                  setDraft(null)
                  setErrors({})
                  update.reset()
                }}
              >
                {translate('Cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <>
            <p className="text-sm font-semibold" data-testid="billing-details-type">
              {customerTypeLabel(customer?.type === 'company' ? 'company' : 'individual')}
            </p>
            {customer?.type === 'company' ? (
              <dl className="grid gap-2 text-sm">
                {rows
                  .filter(([, v]) => v)
                  .map(([label, v]) => (
                    <div key={label} className="flex flex-wrap justify-between gap-4">
                      <dt className="text-[var(--muted)]">{label}</dt>
                      <dd className="whitespace-pre-line break-words text-right">{v}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                {translate(
                  'Your invoices are issued to you as an individual, without company details.',
                )}
              </p>
            )}
            {saved && (
              <p role="status" className="text-sm font-semibold">
                {translate('Billing details saved.')}
              </p>
            )}
            <p className="text-xs text-[var(--muted)]">
              {translate(
                'Changes apply to your next invoices. Issued invoices are never modified.',
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDraft(customerToForm(customer))}
            >
              {translate('Edit billing details')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
