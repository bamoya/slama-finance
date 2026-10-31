import { Input } from '../../../../../components/ui/input'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import type { OnboardingFieldsProps } from './onboarding-types'
export function OrganizationStep({ configuration: c, onChange }: OnboardingFieldsProps) {
  useUiLanguage()

  return (
    <div className="onboarding-fields">
      <label className="onboarding-field is-wide">
        <span>
          {translate('Organization name')} <small>{translate('Required')}</small>
        </span>
        <Input
          required
          maxLength={160}
          value={c.name}
          onChange={(e) => onChange({ ...c, name: e.target.value })}
        />
        <small>{translate('The workspace name can differ from your legal company name.')}</small>
      </label>
      <label className="onboarding-field is-wide">
        <span>
          {translate('Business activity')} <small>{translate('Optional')}</small>
        </span>
        <Input
          maxLength={200}
          value={c.activity ?? ''}
          onChange={(e) => onChange({ ...c, activity: e.target.value || null })}
        />
      </label>
      <p className="onboarding-hint is-wide">
        {translate(
          'This creates an independent workspace for its clients, products and documents.',
        )}
      </p>
    </div>
  )
}
