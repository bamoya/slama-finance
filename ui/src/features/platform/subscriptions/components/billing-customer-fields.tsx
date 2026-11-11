import { Field, FieldError, FieldLabel } from '../../../../components/ui/field'
import { Input } from '../../../../components/ui/input'
import { Select, SelectOption } from '../../../../components/ui/select'
import { Textarea } from '../../../../components/ui/textarea'
import { validationMessage } from '../../../../lib/error-messages'
import { translate, useUiLanguage } from '../../../../lib/i18n'
import type { CustomerErrors, CustomerField, CustomerForm } from './billing-customer'

/** Individual-or-company choice and company details, shared by checkout and billing settings. */
export function BillingCustomerFields({
  idPrefix,
  value,
  onChange,
  errors,
  apiErrors = {},
}: {
  idPrefix: string
  value: CustomerForm
  onChange: (next: CustomerForm) => void
  errors: CustomerErrors
  apiErrors?: Record<string, string[]>
}) {
  useUiLanguage()
  const set = (patch: Partial<CustomerForm>) => onChange({ ...value, ...patch })
  const messages = (field: CustomerField) => [
    ...(errors[field] ? [translate(errors[field])] : []),
    ...(apiErrors[field] ?? []).map(validationMessage),
  ]
  const text = (field: CustomerField, label: string, extra?: { maxLength: number }) => {
    const id = `${idPrefix}-${field}`,
      list = messages(field)
    return (
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        {field === 'address' ? (
          <Textarea
            id={id}
            maxLength={500}
            value={value[field]}
            aria-invalid={list.length > 0}
            aria-describedby={list.length ? `${id}-error` : undefined}
            onChange={(e) => set({ [field]: e.target.value })}
          />
        ) : (
          <Input
            id={id}
            maxLength={extra?.maxLength}
            inputMode={field === 'ice' ? 'numeric' : undefined}
            value={value[field]}
            aria-invalid={list.length > 0}
            aria-describedby={list.length ? `${id}-error` : undefined}
            onChange={(e) => set({ [field]: e.target.value })}
          />
        )}
        {list.length > 0 && <FieldError id={`${id}-error`}>{list.join(' ')}</FieldError>}
      </Field>
    )
  }
  return (
    <div className="space-y-4" data-testid={`${idPrefix}-customer`}>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-type`}>{translate('Individual or company?')}</FieldLabel>
        <Select
          id={`${idPrefix}-type`}
          aria-label={translate('Individual or company?')}
          value={value.type}
          onValueChange={(v) => set({ type: v === 'company' ? 'company' : 'individual' })}
        >
          <SelectOption value="individual">{translate('Individual')}</SelectOption>
          <SelectOption value="company">{translate('Company')}</SelectOption>
        </Select>
      </Field>
      {value.type === 'company' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('legalName', translate('Legal name'), { maxLength: 200 })}
            {text('ice', translate('ICE'), { maxLength: 20 })}
          </div>
          {text('address', translate('Address'))}
          <div className="grid gap-4 sm:grid-cols-2">
            {text('registrationNumber', translate('RC (optional)'), { maxLength: 40 })}
            {text('taxIdentifier', translate('IF (optional)'), { maxLength: 40 })}
          </div>
        </>
      )}
    </div>
  )
}
