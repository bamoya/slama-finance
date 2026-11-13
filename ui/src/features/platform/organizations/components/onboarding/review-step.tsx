import { Pencil } from 'lucide-react'

import { Button } from '../../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { legalTypeOptions } from '../../../../../lib/legal-types'
import { onboardingSteps } from '../../onboarding-steps'
import { companyFields } from './onboarding-options'
import type { OnboardingFieldsProps } from './onboarding-types'
export function ReviewStep({ configuration: c, onEdit }: OnboardingFieldsProps) {
  useUiLanguage()

  return (
    <div className="onboarding-review">
      {[1, 2, 3, 4, 5].map((s) => (
        <section key={s}>
          <div className="onboarding-review-heading">
            <h3>{translate(onboardingSteps[s - 1]!)}</h3>
            <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(s)}>
              <Pencil size={13} />
              {translate('Edit')}
            </Button>
          </div>
          {s === 1 ? (
            <>
              <strong>{c.name}</strong>
              {c.activity && <p>{c.activity}</p>}
            </>
          ) : s === 2 ? (
            <>
              {c.company.legalType && (
                <p>
                  <span>{translate('Legal type')}</span>
                  {legalTypeOptions().find((o) => o.value === c.company.legalType)?.label}
                </p>
              )}
              {companyFields
                .filter(([key]) => c.company[key])
                .map(([key, label]) => (
                  <p key={key}>
                    <span>{translate(label)}</span>
                    {c.company[key]}
                  </p>
                ))}
              {!Object.entries(c.company).some(([key, value]) => key !== 'legalType' && value) &&
                !c.company.legalType && <small>{translate('No optional details added.')}</small>}
            </>
          ) : s === 3 ? (
            <>
              <p>
                {translate('Company logo')}
                <span>{translate(c.branding.logoAssetId ? 'Uploaded' : 'Not added')}</span>
              </p>
              <p>
                {translate('Signature')}
                <span>{translate(c.branding.signatureAssetId ? 'Uploaded' : 'Not added')}</span>
              </p>
              <p>
                {translate('Accent color')}
                <i style={{ background: c.branding.accentColor }} />
              </p>
            </>
          ) : s === 4 ? (
            <>
              <p>
                {translate('Document layout')}
                <span>
                  {
                    { essential: 'Essentiel', signature: 'Signature', atelier: 'Atelier' }[
                      c.defaults.layout
                    ]
                  }
                </span>
              </p>
              <p>
                {translate('Language')}
                <span>{c.defaults.language === 'fr' ? 'Français' : 'English'} · MAD</span>
              </p>
              <p>
                {translate('Invoice payment deadline (days)')}
                <span>{c.defaults.paymentDueDays}</span>
              </p>
              <p>
                {translate('Estimate validity (days)')}
                <span>{c.defaults.estimateValidDays}</span>
              </p>
              <p>
                {translate('VAT')}
                <span>
                  {c.defaults.vatEnabled ? `${c.defaults.vatRate}%` : translate('Disabled')}
                </span>
              </p>
              <p>
                {translate('Compact documents')}
                <span>{translate(c.defaults.compact ? 'Enabled' : 'Disabled')}</span>
              </p>
              {c.defaults.bankName && (
                <p>
                  {translate('Bank name')}
                  <span>{c.defaults.bankName}</span>
                </p>
              )}
              {c.defaults.accountHolder && (
                <p>
                  {translate('Account holder')}
                  <span>{c.defaults.accountHolder}</span>
                </p>
              )}
              {c.defaults.rib && (
                <p>
                  RIB<span>{c.defaults.rib}</span>
                </p>
              )}
              {c.defaults.iban && (
                <p>
                  IBAN<span>{c.defaults.iban}</span>
                </p>
              )}
              {c.defaults.footerText && (
                <p>
                  {translate('Document footer')}
                  <span>{c.defaults.footerText}</span>
                </p>
              )}
            </>
          ) : (
            <>
              <small>{translate('Initial administrator · independent organization account')}</small>
              {c.invitations.map((i) => (
                <p key={i.email}>
                  {i.email}
                  <span>{translate(i.role === 'administrator' ? 'Administrator' : 'Staff')}</span>
                </p>
              ))}
            </>
          )}
        </section>
      ))}
    </div>
  )
}
