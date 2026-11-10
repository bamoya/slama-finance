import { useState } from 'react'

import {
  activateAdminSubscriptionPlan,
  useGetAdminBillingSettings,
} from '../../../../../api/generated/administration/administration'
import type { AdminOwnerDetail } from '../../../../../api/generated/models'
import { DateInput } from '../../../../../components/ui/date-input'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import {
  cycleLabel,
  paymentMethodLabel,
  planLabel,
} from '../../../subscriptions/components/billing-format'
import { useRefreshAdministration } from '../hooks/use-refresh-administration'
import { coverageEnd, type Cycle, todayIso } from './coverage-period'
import { CustomerActionDialog } from './customer-action-dialog'

const plans = ['essential', 'business', 'pro'] as const
const cycles: Cycle[] = ['monthly', 'annual']
type Duration = 'month' | 'year' | 'custom'
type Settlement = 'confirmed_payment' | 'complimentary'

const durationEnd = (start: string, duration: Duration, cycle: Cycle) =>
  duration === 'month'
    ? coverageEnd(start, 'monthly')
    : duration === 'year'
      ? coverageEnd(start, 'annual')
      : coverageEnd(start, cycle)

/** Converts a trial customer to a paid plan over explicit coverage days. */
export function ActivatePlanDialog({
  detail,
  onClose,
}: {
  detail: AdminOwnerDetail
  onClose: () => void
}) {
  useUiLanguage()
  const refresh = useRefreshAdministration()
  const billing = useGetAdminBillingSettings({ query: { retry: false } })
  const methods = billing.data?.paymentMethods ?? []
  const today = todayIso()
  const [plan, setPlan] = useState<(typeof plans)[number]>('essential')
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [start, setStart] = useState(today)
  const [duration, setDuration] = useState<Duration>('month')
  const [end, setEnd] = useState(coverageEnd(today, 'monthly'))
  const [settlement, setSettlement] = useState<Settlement>('confirmed_payment')
  const [method, setMethod] = useState('')
  const [reference, setReference] = useState('')
  const paid = settlement === 'confirmed_payment'
  const chosenMethod = method || methods[0] || ''
  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(start) && start >= today && end > start
  const paymentValid = !paid || (chosenMethod !== '' && reference.trim() !== '')
  const changeStart = (value: string) => {
    setStart(value)
    if (duration !== 'custom') setEnd(durationEnd(value, duration, cycle))
  }
  const changeDuration = (value: Duration) => {
    setDuration(value)
    if (value !== 'custom') setEnd(durationEnd(start, value, cycle))
  }
  return (
    <CustomerActionDialog
      title={translate('Activate a plan')}
      description={translate('Convert this trial customer to a paid plan over chosen dates.')}
      impacts={[
        translate('The plan applies from the start date; the trial end date is not changed.'),
        translate(
          paid
            ? 'A confirmed payment at the current plan price is added to the history.'
            : 'Complimentary access: a 0 DH adjustment is added to the history.',
        ),
      ]}
      submitLabel={translate('Activate plan')}
      fieldsReady={datesValid && paymentValid && !billing.isPending}
      onClose={onClose}
      fields={
        <div className="space-y-content">
          <div className="space-y-2">
            <Label htmlFor="activate-plan">{translate('Plan')}</Label>
            <Select
              id="activate-plan"
              aria-label={translate('Plan')}
              value={plan}
              onValueChange={(value) => setPlan(value as (typeof plans)[number])}
            >
              <SelectGroup>
                {plans.map((item) => (
                  <SelectOption key={item} value={item}>
                    {planLabel(item)}
                  </SelectOption>
                ))}
              </SelectGroup>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activate-cycle">{translate('Billing cycle')}</Label>
            <Select
              id="activate-cycle"
              aria-label={translate('Billing cycle')}
              value={cycle}
              onValueChange={(value) => {
                setCycle(value as Cycle)
                if (duration === 'custom') return
                setEnd(durationEnd(start, duration, value as Cycle))
              }}
            >
              <SelectGroup>
                {cycles.map((item) => (
                  <SelectOption key={item} value={item}>
                    {cycleLabel(item)}
                  </SelectOption>
                ))}
              </SelectGroup>
            </Select>
          </div>
          <div className="grid gap-content sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="activate-start">{translate('Coverage starts')}</Label>
              <DateInput
                id="activate-start"
                value={start}
                onChange={(event) => changeStart(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="activate-duration">{translate('Duration')}</Label>
              <Select
                id="activate-duration"
                aria-label={translate('Duration')}
                value={duration}
                onValueChange={(value) => changeDuration(value as Duration)}
              >
                <SelectGroup>
                  <SelectOption value="month">{translate('One month')}</SelectOption>
                  <SelectOption value="year">{translate('One year')}</SelectOption>
                  <SelectOption value="custom">{translate('Custom end date')}</SelectOption>
                </SelectGroup>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="activate-end">{translate('Coverage ends')}</Label>
            <DateInput
              id="activate-end"
              value={end}
              onChange={(event) => {
                setDuration('custom')
                setEnd(event.target.value)
              }}
            />
            <p
              role={datesValid ? undefined : 'alert'}
              className={
                datesValid ? 'text-xs text-[var(--muted)]' : 'text-sm text-[var(--error-text)]'
              }
            >
              {translate(
                datesValid
                  ? 'The end day itself is not included.'
                  : 'The start cannot be in the past and the end must be after the start.',
              )}
            </p>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{translate('Settlement')}</legend>
            {(['confirmed_payment', 'complimentary'] as const).map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="activate-settlement"
                  className="accent-[var(--accent)]"
                  checked={settlement === option}
                  onChange={() => setSettlement(option)}
                />
                {translate(option === 'confirmed_payment' ? 'Payment received' : 'Complimentary')}
              </label>
            ))}
          </fieldset>
          {paid && (
            <>
              <div className="space-y-2">
                <Label htmlFor="activate-method">{translate('Payment method')}</Label>
                <Select
                  id="activate-method"
                  aria-label={translate('Payment method')}
                  value={chosenMethod}
                  onValueChange={setMethod}
                >
                  <SelectGroup>
                    {methods.map((item) => (
                      <SelectOption key={item} value={item}>
                        {paymentMethodLabel(item)}
                      </SelectOption>
                    ))}
                  </SelectGroup>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="activate-reference">{translate('Received reference')}</Label>
                <Input
                  id="activate-reference"
                  maxLength={120}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </div>
            </>
          )}
        </div>
      }
      onSubmit={async ({ reason }) => {
        await activateAdminSubscriptionPlan(detail.owner.id, {
          planCode: plan,
          cycle,
          startsOn: start,
          endsOn: end,
          settlement,
          ...(paid ? { paymentMethod: chosenMethod, receivedReference: reference.trim() } : {}),
          reason,
        })
        await refresh()
      }}
    />
  )
}
