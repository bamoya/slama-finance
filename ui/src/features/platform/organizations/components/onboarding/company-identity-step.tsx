import { useGetOwnerLegalTypeRequirements } from '../../../../../api/generated/identity/identity'
import { Input } from '../../../../../components/ui/input'
import { Select, SelectOption } from '../../../../../components/ui/select'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { legalRules, legalTypeOptions } from '../../../../../lib/legal-types'
import { companyFields } from './onboarding-options'
import type { OnboardingFieldsProps } from './onboarding-types'
export function CompanyIdentityStep({ configuration: c, onChange }: OnboardingFieldsProps) {
  useUiLanguage()
  const requirements = useGetOwnerLegalTypeRequirements({ query: { staleTime: 5 * 60_000 } })
  const legalType = c.company.legalType ?? 'individual'
  const rules = legalRules(requirements.data, legalType)
  const updateCompany = (key: keyof typeof c.company, value: string) =>
    onChange({ ...c, company: { ...c.company, [key]: value || null } })
  const input = (label: string, key: keyof typeof c.company, referenceKey: string) => (
    <label
      className={key === 'address' ? 'onboarding-field is-wide' : 'onboarding-field'}
      key={key}
    >
      <span>
        {translate(label)}{' '}
        <small>
          {rules.required(referenceKey)
            ? translate('Required for legal invoices')
            : translate('Optional')}
        </small>
      </span>
      <Input
        type={key === 'email' ? 'email' : 'text'}
        maxLength={key === 'address' ? 500 : 200}
        value={c.company[key] ?? ''}
        onChange={(e) => updateCompany(key, e.target.value)}
      />
    </label>
  )
  return (
    <div className="onboarding-fields">
      <label className="onboarding-field is-wide">
        <span>
          {translate('Legal type')} <small>{translate('Optional')}</small>
        </span>
        <Select
          id="legalType"
          value={legalType}
          onValueChange={(value) =>
            onChange({
              ...c,
              company: { ...c.company, legalType: value as typeof c.company.legalType },
            })
          }
        >
          {legalTypeOptions().map((option) => (
            <SelectOption key={option.value} value={option.value}>
              {option.label}
            </SelectOption>
          ))}
        </Select>
      </label>
      <p className="onboarding-hint is-wide">
        {rules.registered
          ? translate(
              'Complete the fields marked “Required for legal invoices” to issue legal invoices. This never blocks you: save now and finish later.',
            )
          : translate(
              'As an individual you issue simple invoices (FS series), clearly labelled as not a legal tax invoice. Choose a registered type to issue legal invoices.',
            )}
      </p>
      {companyFields
        .filter(([, , referenceKey]) => rules.shows(referenceKey))
        .map(([key, label, referenceKey]) => input(label, key, referenceKey))}
      <p className="onboarding-hint is-wide">
        {translate('Add only the information you have. Empty fields will not appear on documents.')}
      </p>
    </div>
  )
}
