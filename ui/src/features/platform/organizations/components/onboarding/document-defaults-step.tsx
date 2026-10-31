import { Button } from '../../../../../components/ui/button'
import { Input } from '../../../../../components/ui/input'
import { Select, SelectGroup, SelectOption } from '../../../../../components/ui/select'
import { Switch } from '../../../../../components/ui/switch'
import { Textarea } from '../../../../../components/ui/textarea'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import type { OnboardingFieldsProps } from './onboarding-types'
export function DocumentDefaultsStep({ configuration: c, onChange }: OnboardingFieldsProps) {
  useUiLanguage()
  const updateDefaults = <K extends keyof typeof c.defaults>(
    key: K,
    value: (typeof c.defaults)[K],
  ) => onChange({ ...c, defaults: { ...c.defaults, [key]: value } })
  return (
    <div className="onboarding-defaults">
      <div
        className="onboarding-layout-options"
        role="group"
        aria-label={translate('Document layout')}
      >
        {(['essential', 'signature', 'atelier'] as const).map((layout) => (
          <Button
            key={layout}
            type="button"
            variant="outline"
            aria-pressed={c.defaults.layout === layout}
            onClick={() => updateDefaults('layout', layout)}
            className={`onboarding-layout-choice layout-${layout}`}
          >
            <span aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <strong>
              {layout === 'essential'
                ? 'Essentiel'
                : layout === 'signature'
                  ? 'Signature'
                  : 'Atelier'}
            </strong>
          </Button>
        ))}
      </div>
      <div className="onboarding-fields">
        <label className="onboarding-field">
          <span>{translate('Document language')}</span>
          <Select
            value={c.defaults.language}
            onValueChange={(v) => updateDefaults('language', v as 'fr' | 'en')}
          >
            <SelectGroup>
              <SelectOption value="fr">Français</SelectOption>
              <SelectOption value="en">English</SelectOption>
            </SelectGroup>
          </Select>
        </label>
        <label className="onboarding-field">
          <span>{translate('Currency')}</span>
          <Input value="MAD" readOnly />
        </label>
        {(
          [
            ['paymentDueDays', 'Invoice payment deadline (days)'],
            ['estimateValidDays', 'Estimate validity (days)'],
          ] as const
        ).map(([key, label]) => (
          <label className="onboarding-field" key={key}>
            <span>{translate(label)}</span>
            <Input
              type="number"
              min={0}
              max={3650}
              required
              value={c.defaults[key]}
              onChange={(e) =>
                updateDefaults(key, e.target.value === '' ? 0 : Number(e.target.value))
              }
            />
          </label>
        ))}
      </div>
      <div className="onboarding-toggle">
        <div>
          <strong>{translate('Compact documents')}</strong>
          <small>{translate('Fit more product lines while keeping the selected layout.')}</small>
        </div>
        <Switch
          aria-label={translate('Compact documents')}
          checked={c.defaults.compact}
          onCheckedChange={(v) => updateDefaults('compact', v)}
        />
      </div>
      <div className="onboarding-toggle">
        <div>
          <strong>{translate('Apply VAT by default')}</strong>
          <small>{translate('Disabled unless you explicitly enable it.')}</small>
        </div>
        <Switch
          aria-label={translate('Apply VAT by default')}
          checked={c.defaults.vatEnabled}
          onCheckedChange={(v) =>
            onChange({
              ...c,
              defaults: {
                ...c.defaults,
                vatEnabled: v,
                vatRate: v ? c.defaults.vatRate || 20 : 0,
              },
            })
          }
        />
      </div>
      {c.defaults.vatEnabled && (
        <label className="onboarding-field">
          <span>{translate('VAT rate (%)')}</span>
          <Input
            required
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={c.defaults.vatRate}
            onChange={(e) => updateDefaults('vatRate', Number(e.target.value))}
          />
        </label>
      )}
      <details className="onboarding-optional">
        <summary>
          {translate('Bank details & document footer')} <small>{translate('Optional')}</small>
        </summary>
        <div className="onboarding-fields">
          {(
            [
              ['bankName', 'Bank name'],
              ['accountHolder', 'Account holder'],
              ['rib', 'RIB'],
              ['iban', 'IBAN'],
            ] as const
          ).map(([key, label]) => (
            <label className="onboarding-field" key={key}>
              <span>{translate(label)}</span>
              <Input
                maxLength={key === 'rib' ? 50 : key === 'iban' ? 100 : 200}
                value={c.defaults[key] ?? ''}
                onChange={(e) => updateDefaults(key, e.target.value || null)}
              />
            </label>
          ))}
          <label className="onboarding-field is-wide">
            <span>{translate('Document footer')}</span>
            <Textarea
              maxLength={1000}
              value={c.defaults.footerText ?? ''}
              onChange={(e) => updateDefaults('footerText', e.target.value || null)}
            />
          </label>
        </div>
      </details>
    </div>
  )
}
