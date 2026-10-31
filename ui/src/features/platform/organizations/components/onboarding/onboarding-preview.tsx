import { type CSSProperties, useEffect, useState } from 'react'

import { useGetOwnerBrandImage } from '../../../../../api/generated/identity/identity'
import type { OwnerOnboardingConfiguration } from '../../../../../api/generated/models'
import { FormError } from '../../../../../components/management/form-error'
import { Button } from '../../../../../components/ui/button'
import { translate, useUiLanguage } from '../../../../../lib/i18n'

export function OnboardingPreview({
  configuration: c,
  organizationId,
}: {
  configuration: OwnerOnboardingConfiguration
  organizationId?: string
}) {
  useUiLanguage()
  const [expanded, setExpanded] = useState(() => window.matchMedia('(min-width:1001px)').matches)
  useEffect(() => {
    const media = window.matchMedia('(min-width:1001px)')
    const change = () => setExpanded(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const logo = useGetOwnerBrandImage(organizationId ?? '', c.branding.logoAssetId ?? '', {
    query: { enabled: !!organizationId && !!c.branding.logoAssetId, retry: false },
  })
  const signature = useGetOwnerBrandImage(organizationId ?? '', c.branding.signatureAssetId ?? '', {
    query: { enabled: !!organizationId && !!c.branding.signatureAssetId, retry: false },
  })
  const fr = c.defaults.language === 'fr'
  return (
    <details
      className="onboarding-preview"
      open={expanded}
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary>
        {translate('Document preview')}
        <span>{translate('Example')}</span>
      </summary>
      {(logo.error || signature.error) && (
        <div>
          <FormError error={logo.error ?? signature.error} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (logo.error) void logo.refetch()
              if (signature.error) void signature.refetch()
            }}
          >
            {translate('Retry')}
          </Button>
        </div>
      )}
      <div
        className={`onboarding-paper layout-${c.defaults.layout} ${c.defaults.compact ? 'is-compact' : ''}`}
        style={{ '--document-accent': c.branding.accentColor } as CSSProperties}
      >
        <header>
          {logo.data?.data ? (
            <img src={`data:image/png;base64,${logo.data.data}`} alt={translate('Company logo')} />
          ) : null}
          <strong>{c.company.legalName || c.name}</strong>
          <span>{fr ? 'FACTURE' : 'INVOICE'}</span>
        </header>
        <section className="onboarding-paper-meta">
          <strong>{fr ? 'Aperçu de mise en page' : 'Layout preview'}</strong>
          {c.company.address && <p>{c.company.address}</p>}
          {c.company.city && <p>{c.company.city}</p>}
          {c.company.email && <p>{c.company.email}</p>}
          {c.company.phone && <p>{c.company.phone}</p>}
          <div>
            {c.company.ice && <p>ICE : {c.company.ice}</p>}
            {c.company.registrationNumber && <p>RC : {c.company.registrationNumber}</p>}
            {c.company.taxIdentifier && <p>IF : {c.company.taxIdentifier}</p>}
          </div>
        </section>
        <table>
          <thead>
            <tr>
              <th>{fr ? 'Produit' : 'Product'}</th>
              <th>{fr ? 'Qté' : 'Qty'}</th>
              <th>MAD</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: c.defaults.compact ? 8 : 4 }, (_, i) => (
              <tr key={i}>
                <td>
                  <i />
                </td>
                <td>
                  <i />
                </td>
                <td>
                  <i />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="onboarding-paper-total">
          <span>{fr ? 'Total' : 'Total'}</span>
          <strong>— MAD</strong>
          {c.defaults.vatEnabled && (
            <small>
              {fr ? 'TVA' : 'VAT'} {c.defaults.vatRate}%
            </small>
          )}
        </div>
        {signature.data?.data && (
          <img
            className="onboarding-paper-signature"
            src={`data:image/png;base64,${signature.data.data}`}
            alt={translate('Signature')}
          />
        )}
        {(c.defaults.bankName || c.defaults.rib || c.defaults.iban) && (
          <footer>
            {c.defaults.bankName && <p>{c.defaults.bankName}</p>}
            {c.defaults.rib && <p>RIB : {c.defaults.rib}</p>}
            {c.defaults.iban && <p>IBAN : {c.defaults.iban}</p>}
          </footer>
        )}
        {c.defaults.footerText && <footer>{c.defaults.footerText}</footer>}
      </div>
      <p className="onboarding-preview-note">
        {translate('Layout preview only. Missing company details are omitted.')}
      </p>
    </details>
  )
}
