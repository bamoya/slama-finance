import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  getGetAdminBillingSettingsQueryKey,
  useGetAdminBillingSettings,
  useUpdateAdminBillingSettings,
} from '../../../../../api/generated/administration/administration'
import { FormError } from '../../../../../components/management/form-error'
import { RequestState } from '../../../../../components/management/request-state'
import { Button } from '../../../../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../../../../components/ui/card'
import { Input } from '../../../../../components/ui/input'
import { Label } from '../../../../../components/ui/label'
import { Switch } from '../../../../../components/ui/switch'
import { Textarea } from '../../../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { AdministrationLayout } from '../../shared/components/administration-layout'
import {
  type BillingErrors,
  type BillingFormValues,
  toFormValues,
  validateBilling,
} from '../billing-settings'

function BillingSettingsForm({
  initial,
  currency,
}: {
  initial: BillingFormValues
  currency: string
}) {
  useUiLanguage()
  const client = useQueryClient()
  const update = useUpdateAdminBillingSettings()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<BillingErrors>({})
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const set = <K extends keyof BillingFormValues>(key: K, value: BillingFormValues[K]) => {
    setSaved(false)
    setValues((current) => ({ ...current, [key]: value }))
  }
  const fieldError = (key: keyof BillingFormValues) =>
    errors[key] && (
      <p id={`${key}-error`} role="alert" className="text-sm text-[var(--error-text)]">
        {translate(errors[key])}
      </p>
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate('Billing settings')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          noValidate
          className="max-w-2xl space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            setSaved(false)
            setError(null)
            const result = validateBilling(values)
            setErrors(result.errors ?? {})
            if (!result.payload) return
            update.mutate(
              { data: result.payload },
              {
                onSuccess: (settings) => {
                  client.setQueryData(getGetAdminBillingSettingsQueryKey(), settings)
                  setValues(toFormValues(settings))
                  setSaved(true)
                },
                onError: setError,
              },
            )
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="currency">{translate('Currency')}</Label>
            <Input id="currency" value={currency} readOnly disabled />
          </div>
          <div className="flex items-center gap-3">
            <Switch
              id="vat-applicable"
              checked={values.vatApplicable}
              onCheckedChange={(checked) => set('vatApplicable', checked)}
            />
            <Label htmlFor="vat-applicable">{translate('VAT applicable')}</Label>
          </div>
          {values.vatApplicable && (
            <div className="space-y-2">
              <Label htmlFor="vatPercent">{translate('VAT rate (%)')}</Label>
              <Input
                id="vatPercent"
                inputMode="decimal"
                value={values.vatPercent}
                aria-invalid={!!errors.vatPercent}
                aria-describedby={errors.vatPercent ? 'vatPercent-error' : undefined}
                onChange={(event) => set('vatPercent', event.target.value)}
              />
              {fieldError('vatPercent')}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="paymentMethods">{translate('Payment methods')}</Label>
            <Input
              id="paymentMethods"
              value={values.paymentMethods}
              aria-invalid={!!errors.paymentMethods}
              aria-describedby={errors.paymentMethods ? 'paymentMethods-error' : undefined}
              onChange={(event) => set('paymentMethods', event.target.value)}
            />
            <p className="text-xs text-[var(--muted)]">
              {translate('Separate with commas, for example bank_transfer, cash.')}
            </p>
            {fieldError('paymentMethods')}
          </div>
          <div className="space-y-2">
            <Label htmlFor="paymentInstructions">{translate('Payment instructions')}</Label>
            <Textarea
              id="paymentInstructions"
              value={values.paymentInstructions}
              aria-invalid={!!errors.paymentInstructions}
              aria-describedby={
                errors.paymentInstructions ? 'paymentInstructions-error' : undefined
              }
              onChange={(event) => set('paymentInstructions', event.target.value)}
            />
            {fieldError('paymentInstructions')}
          </div>
          <FormError error={error} />
          {saved && <p role="status">{translate('Billing settings saved.')}</p>}
          <Button type="submit" disabled={update.isPending}>
            {update.isPending ? translate('Please wait…') : translate('Save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export function AdminBillingSettingsPage() {
  const query = useGetAdminBillingSettings({ query: { retry: false } })
  return (
    <AdministrationLayout title="Billing settings">
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <BillingSettingsForm initial={toFormValues(query.data)} currency={query.data.currency} />
      )}
    </AdministrationLayout>
  )
}
