import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  getGetAdminBillingSettingsQueryKey,
  useGetAdminBillingSettings,
  useUpdateAdminBillingSettings,
} from '../../../../../api/generated/administration/administration'
import { FormActionBar } from '../../../../../components/management/form-action-bar'
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
import { AdministrationPageHeader } from '../../shared/components/administration-page-header'
import {
  type BillingErrors,
  type BillingFormValues,
  toFormValues,
  validateBilling,
} from '../billing-settings'
import { IssuerProfileWarning } from '../components/issuer-profile-warning'
import { PaymentMethodsInput } from '../components/payment-methods-input'

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
  const [methodDraft, setMethodDraft] = useState('')
  const [errors, setErrors] = useState<BillingErrors>({})
  const [error, setError] = useState<unknown>(null)
  const [saved, setSaved] = useState(false)
  const setIssuer = (key: keyof BillingFormValues['issuer'], value: string) => {
    setSaved(false)
    setValues((current) => ({ ...current, issuer: { ...current.issuer, [key]: value } }))
  }
  const set = <K extends keyof BillingFormValues>(key: K, value: BillingFormValues[K]) => {
    setSaved(false)
    setValues((current) => ({ ...current, [key]: value }))
  }
  const fieldError = (key: keyof BillingErrors) =>
    errors[key] && (
      <p id={`${key}-error`} role="alert" className="text-sm text-[var(--error-text)]">
        {translate(errors[key])}
      </p>
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle>{translate('Payment settings')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          id="billing-settings-form"
          noValidate
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            setSaved(false)
            setError(null)
            const result = validateBilling({
              ...values,
              paymentMethods: [values.paymentMethods, methodDraft].filter(Boolean).join(', '),
            })
            setErrors(result.errors ?? {})
            if (!result.payload) return
            update.mutate(
              { data: result.payload },
              {
                onSuccess: (settings) => {
                  client.setQueryData(getGetAdminBillingSettingsQueryKey(), settings)
                  setValues(toFormValues(settings))
                  setMethodDraft('')
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
              onCheckedChange={(checked) => {
                setSaved(false)
                setValues((current) => ({
                  ...current,
                  vatApplicable: checked,
                  vatPercent: checked && !current.vatPercent.trim() ? '20' : current.vatPercent,
                }))
              }}
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
            <PaymentMethodsInput
              id="paymentMethods"
              value={values.paymentMethods}
              draft={methodDraft}
              invalid={!!errors.paymentMethods}
              describedBy={errors.paymentMethods ? 'paymentMethods-error' : undefined}
              onChange={(value) => set('paymentMethods', value)}
              onDraftChange={(draft) => {
                setSaved(false)
                setMethodDraft(draft)
              }}
            />
            <p className="text-xs text-[var(--muted)]">
              {translate('Lowercase codes such as bank_transfer or cash. Press Enter to add one.')}
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
          <fieldset className="space-y-4 border-t border-[var(--border)] pt-5">
            <legend className="text-base font-semibold">{translate('Issuer profile')}</legend>
            <p className="text-sm text-[var(--muted)]">
              {translate(
                'Identity printed on every invoice and credit note. It is copied onto each document when it is issued.',
              )}
            </p>
            {fieldError('issuerForm')}
            <div className="grid gap-4 sm:grid-cols-2">
              {(
                [
                  ['legalName', 'Legal name', 200],
                  ['ice', 'ICE', 20],
                  ['registrationNumber', 'RC', 40],
                  ['taxIdentifier', 'IF', 40],
                ] as const
              ).map(([key, label, max]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`issuer-${key}`}>{translate(label)}</Label>
                  <Input
                    id={`issuer-${key}`}
                    maxLength={max}
                    value={values.issuer[key]}
                    aria-invalid={key === 'ice' && !!errors.issuerIce}
                    aria-describedby={
                      key === 'ice' && errors.issuerIce ? 'issuerIce-error' : undefined
                    }
                    onChange={(event) => setIssuer(key, event.target.value)}
                  />
                  {key === 'ice' && fieldError('issuerIce')}
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label htmlFor="issuer-address">{translate('Address')}</Label>
              <Textarea
                id="issuer-address"
                maxLength={500}
                value={values.issuer.address}
                onChange={(event) => setIssuer('address', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issuer-taxMention">{translate('Tax mention')}</Label>
              <Textarea
                id="issuer-taxMention"
                maxLength={500}
                value={values.issuer.taxMention}
                onChange={(event) => setIssuer('taxMention', event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="issuer-paymentTerms">{translate('Payment terms and footer')}</Label>
              <Textarea
                id="issuer-paymentTerms"
                maxLength={1000}
                value={values.issuer.paymentTerms}
                onChange={(event) => setIssuer('paymentTerms', event.target.value)}
              />
            </div>
          </fieldset>
          <FormError error={error} />
          {saved && <p role="status">{translate('Billing settings saved.')}</p>}
          <FormActionBar>
            <Button type="submit" form="billing-settings-form" disabled={update.isPending}>
              {update.isPending ? translate('Please wait…') : translate('Save')}
            </Button>
          </FormActionBar>
        </form>
      </CardContent>
    </Card>
  )
}

export function AdminBillingSettingsPage() {
  const query = useGetAdminBillingSettings({ query: { retry: false } })
  return (
    <AdministrationLayout title="Billing settings">
      <AdministrationPageHeader
        title="Billing settings"
        description="VAT, payment methods and instructions shown to customers when they pay."
      />
      {query.isPending || query.isError ? (
        <RequestState query={query} />
      ) : (
        <>
          <IssuerProfileWarning missing={query.data.issuerMissing} />
          <BillingSettingsForm initial={toFormValues(query.data)} currency={query.data.currency} />
        </>
      )}
    </AdministrationLayout>
  )
}
