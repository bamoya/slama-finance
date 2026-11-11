import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import type { OwnerSubscription } from '../../../../api/generated/models'
import {
  getGetOwnerBillingQueryKey,
  getGetOwnerSubscriptionQueryKey,
  getListOwnerSubscriptionPaymentsQueryKey,
  useGetOwnerBilling,
  useQuoteOwnerSubscription,
  useSubmitOwnerSubscriptionPayment,
} from '../../../../api/generated/subscriptions/subscriptions'
import { FormError } from '../../../../components/management/form-error'
import { RequestState } from '../../../../components/management/request-state'
import { Button } from '../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../components/ui/card'
import { Field, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { ApiError } from '../../../../lib/api-error'
import { displayDate, displayDateTime } from '../../../../lib/dates'
import { translate } from '../../../../lib/i18n'
import {
  customerApiErrors,
  type CustomerErrors,
  type CustomerForm,
  customerToForm,
  validateCustomer,
} from './billing-customer'
import { BillingCustomerFields } from './billing-customer-fields'
import {
  cycleLabel,
  formatDh,
  paymentKindLabel,
  paymentMethodLabel,
  versionLabel,
} from './billing-format'

type PlanCode = 'essential' | 'business' | 'pro'
type Cycle = 'monthly' | 'annual'

export function PlanCheckout({ s }: { s: OwnerSubscription }) {
  const cache = useQueryClient(),
    billing = useGetOwnerBilling({ query: { retry: false } }),
    quote = useQuoteOwnerSubscription(),
    submit = useSubmitOwnerSubscriptionPayment()
  const [planCode, setPlanCode] = useState<PlanCode>(
    s.planCode === 'trial' ? 'essential' : s.planCode,
  )
  const [cycle, setCycle] = useState<Cycle>(s.cycle ?? 'monthly')
  const [method, setMethod] = useState(''),
    [reference, setReference] = useState(''),
    [submitted, setSubmitted] = useState(false)
  const [customerDraft, setCustomerDraft] = useState<CustomerForm | null>(null),
    [customerErrors, setCustomerErrors] = useState<CustomerErrors>({})
  const { mutate: requestQuote, reset: resetQuote } = quote
  const validUntil = s.accessValidUntil
  const loaded = !!billing.data
  const suspended = s.status === 'suspended'
  useEffect(() => {
    if (!loaded || suspended) return
    resetQuote()
    requestQuote({ data: { planCode, cycle } })
    // The quote is priced by the API on the selling version at this instant: ask again when access changes.
  }, [loaded, suspended, planCode, cycle, validUntil, requestQuote, resetQuote])

  // A profile saved elsewhere (billing details card, another tab) replaces an unsent checkout draft,
  // so submitting never writes the old identity back.
  const savedCustomer = JSON.stringify(billing.data?.customer ?? null)
  useEffect(() => {
    setCustomerDraft(null)
    setCustomerErrors({})
  }, [savedCustomer])

  if (billing.isPending || billing.isError) return <RequestState query={billing} />
  const catalog = billing.data,
    q = quote.data,
    methodValue = method || catalog.paymentMethods[0] || '',
    customerForm = customerDraft ?? customerToForm(catalog.customer)
  // A withdrawn plan leaves the selling catalog, but the API still renews it on the purchased version while
  // coverage continues (active or past due): keep it selectable then, labelled from the subscription's pin;
  // the price comes only from the API quote. After expiry the API sells only the catalog, so it is not offered.
  const withdrawnCurrent =
    s.planCode !== 'trial' &&
    (s.status === 'active' || s.status === 'past_due') &&
    !catalog.plans.some((p) => p.code === s.planCode)
      ? s
      : null
  const blocked = !!s.pendingPayment
  const renewalCovered = quote.error instanceof ApiError && quote.error.code === 'RENEWAL_EXISTS'
  const notice = suspended
    ? translate('Your subscription is suspended. Contact us to reactivate it.')
    : renewalCovered
      ? translate('Your next period is already covered until {{date}}.', {
          date: displayDate(s.paidThroughAt),
        })
      : null

  if (notice)
    return (
      <Card>
        <CardHeader>
          <CardTitle>{translate('Choose a plan and pay')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p
            role="status"
            data-testid="checkout-notice"
            className="rounded-xl bg-[var(--accent-soft)] p-4 text-sm"
          >
            {notice}
          </p>
        </CardContent>
      </Card>
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate('Choose a plan and pay')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="checkout-plan">{translate('Plan')}</FieldLabel>
            <Select
              id="checkout-plan"
              aria-label={translate('Plan')}
              value={planCode}
              onValueChange={(v) => setPlanCode(v as PlanCode)}
            >
              {catalog.plans.map((p) => (
                <SelectOption key={p.code} value={p.code}>
                  {p.name} · {versionLabel(p.versionNumber)} —{' '}
                  {formatDh(cycle === 'annual' ? p.annualHt : p.monthlyHt)} HT
                </SelectOption>
              ))}
              {withdrawnCurrent && (
                <SelectOption value={withdrawnCurrent.planCode}>
                  {withdrawnCurrent.planName}
                  {withdrawnCurrent.planVersionNumber !== null &&
                    ` · ${versionLabel(withdrawnCurrent.planVersionNumber)}`}{' '}
                  — {translate('Current plan, renewal on your version')}
                </SelectOption>
              )}
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="checkout-cycle">{translate('Billing cycle')}</FieldLabel>
            <Select
              id="checkout-cycle"
              aria-label={translate('Billing cycle')}
              value={cycle}
              onValueChange={(v) => setCycle(v as Cycle)}
            >
              <SelectOption value="monthly">{translate('Monthly')}</SelectOption>
              <SelectOption value="annual">{translate('Annual')}</SelectOption>
            </Select>
          </Field>
        </div>

        <FormError error={quote.error} />
        {q && (
          <dl
            data-testid="quote"
            className="grid gap-2 rounded-xl border border-[var(--border)] p-4 text-sm"
          >
            <div className="flex justify-between gap-4">
              <dt className="font-semibold">{paymentKindLabel(q.kind)}</dt>
              <dd className="text-[var(--muted)]" data-testid="quote-version">
                {versionLabel(q.planVersionNumber)} · {cycleLabel(q.cycle)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt>{translate('Amount excl. tax')}</dt>
              <dd>{formatDh(q.amount.amountHt)}</dd>
            </div>
            {q.amount.taxRateBasisPoints !== null && (
              <div className="flex justify-between gap-4">
                <dt>
                  {translate('VAT')} ({q.amount.taxRateBasisPoints / 100}%)
                </dt>
                <dd>{formatDh(q.amount.taxAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 border-t border-[var(--border)] pt-2 text-base font-semibold">
              <dt>{translate('Total incl. tax')}</dt>
              <dd>{formatDh(q.amount.amountTtc)}</dd>
            </div>
            <div className="text-xs text-[var(--muted)]">
              {translate('Estimated coverage')}: {displayDateTime(q.coverageStart)} →{' '}
              {displayDateTime(q.coverageEnd)}
            </div>
            {q.kind === 'upgrade' && (
              <div className="text-xs text-[var(--muted)]">
                {translate('The upgrade price is prorated for the remaining covered period.')}
              </div>
            )}
          </dl>
        )}

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            const identity = validateCustomer(customerForm)
            setCustomerErrors(identity.errors ?? {})
            if (!identity.customer) return
            submit.mutate(
              {
                data: {
                  planCode,
                  cycle,
                  method: methodValue,
                  reference: reference.trim(),
                  customer: identity.customer,
                },
              },
              {
                onSuccess: () => {
                  setReference('')
                  setSubmitted(true)
                  void cache.invalidateQueries({ queryKey: getGetOwnerSubscriptionQueryKey() })
                  // The submitted identity became the saved billing profile.
                  void cache.invalidateQueries({ queryKey: getGetOwnerBillingQueryKey() })
                  void cache.invalidateQueries({
                    queryKey: getListOwnerSubscriptionPaymentsQueryKey(),
                  })
                },
              },
            )
          }}
        >
          <div
            data-testid="payment-instructions"
            className="whitespace-pre-line rounded-xl bg-[var(--accent-soft)] p-4 text-sm"
          >
            <p className="mb-1 font-semibold">{translate('How to pay')}</p>
            {catalog.paymentInstructions.trim() ||
              translate('Payment instructions are not available yet. Contact us before paying.')}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="payment-method">{translate('Payment method')}</FieldLabel>
              <Select
                id="payment-method"
                aria-label={translate('Payment method')}
                value={methodValue}
                onValueChange={setMethod}
              >
                {catalog.paymentMethods.map((m) => (
                  <SelectOption key={m} value={m}>
                    {paymentMethodLabel(m)}
                  </SelectOption>
                ))}
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="payment-reference">{translate('Payment reference')}</FieldLabel>
              <Input
                id="payment-reference"
                maxLength={120}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
          </div>
          <div className="space-y-2 border-t border-[var(--border)] pt-4">
            <p className="font-semibold">{translate('Invoice details')}</p>
            <BillingCustomerFields
              idPrefix="checkout"
              value={customerForm}
              onChange={setCustomerDraft}
              errors={customerErrors}
              apiErrors={customerApiErrors(submit.error)}
            />
          </div>
          <p className="text-sm text-[var(--muted)]">
            {translate(
              'Your plan is activated only after an administrator verifies your payment. No automatic payment is taken.',
            )}
          </p>
          {blocked && (
            <p role="status" className="text-sm font-semibold">
              {translate('A payment is already awaiting verification.')}
            </p>
          )}
          {submitted && !submit.error && (
            <p role="status" className="text-sm font-semibold text-[var(--accent)]">
              {translate('Payment submitted. It will be activated once verified.')}
            </p>
          )}
          <FormError error={submit.error} />
          <Button
            type="submit"
            disabled={blocked || submit.isPending || !reference.trim() || !methodValue}
          >
            {translate('Submit payment')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
