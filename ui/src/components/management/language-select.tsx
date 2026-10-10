import { translate, useUiLanguage } from '../../lib/i18n'
import { Select, SelectGroup, SelectOption } from '../ui/select'

/** Absence means company default, not the viewer's interface language. */
export function LanguageSelect({
  value,
  onValueChange,
}: {
  value?: 'fr-MA' | 'en-GB' | null
  onValueChange: (value: 'fr-MA' | 'en-GB' | null) => void
}) {
  useUiLanguage()
  return (
    <label className="grid gap-2 text-sm font-medium">
      {translate('Document language')}
      <Select
        value={value ?? 'company'}
        onValueChange={(next) => {
          if (next === 'company') onValueChange(null)
          else if (next === 'fr-MA' || next === 'en-GB') onValueChange(next)
        }}
      >
        <SelectGroup>
          <SelectOption value="company">{translate('Company defaults')}</SelectOption>
          <SelectOption value="fr-MA">{translate('French')}</SelectOption>
          <SelectOption value="en-GB">{translate('English')}</SelectOption>
        </SelectGroup>
      </Select>
    </label>
  )
}
