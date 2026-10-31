import { Input } from '../../../../../components/ui/input'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { companyFields } from './onboarding-options'
import type { OnboardingFieldsProps } from './onboarding-types'
export function CompanyIdentityStep({ configuration: c, onChange }: OnboardingFieldsProps) {
  useUiLanguage()
  const updateCompany = (key: keyof typeof c.company, value: string) =>
    onChange({ ...c, company: { ...c.company, [key]: value || null } })
  const input = (label: string, key: keyof typeof c.company) => (
    <label
      className={key === 'address' ? 'onboarding-field is-wide' : 'onboarding-field'}
      key={key}
    >
      <span>
        {translate(label)} <small>{translate('Optional')}</small>
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
      {companyFields.map(([key, label]) => input(label, key))}
      <p className="onboarding-hint is-wide">
        {translate('Add only the information you have. Empty fields will not appear on documents.')}
      </p>
    </div>
  )
}
