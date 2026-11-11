import { TriangleAlert } from 'lucide-react'

import { useGetAdminBillingSettings } from '../../../../../api/generated/administration/administration'
import { translate, useUiLanguage } from '../../../../../lib/i18n'

const fieldLabels = {
  legalName: 'Legal name',
  address: 'Address',
  ice: 'ICE',
  registrationNumber: 'RC',
  taxIdentifier: 'IF',
} as const

/** Loud banner while the platform invoice issuer profile is incomplete (reads the shared settings query). */
export function IssuerProfileWarning({ missing }: { missing?: readonly string[] }) {
  useUiLanguage()
  const settings = useGetAdminBillingSettings({ query: { retry: false, enabled: !missing } })
  const list = missing ?? settings.data?.issuerMissing ?? []
  if (!list.length) return null
  const blocking = list.includes('legalName')
  return (
    <div
      role="alert"
      data-testid="issuer-warning"
      className="flex gap-3 rounded-xl border border-[var(--error-border)] bg-[var(--error-bg)] p-4 text-sm text-[var(--error-text)]"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
      <div className="space-y-1">
        <p className="font-semibold">{translate('The issuer profile is incomplete.')}</p>
        <p>
          {translate('Missing: {{fields}}.', {
            fields: list
              .map((field) => translate(fieldLabels[field as keyof typeof fieldLabels] ?? field))
              .join(', '),
          })}
        </p>
        {blocking && (
          <p className="font-semibold">
            {translate(
              'Invoices cannot be issued while the legal name is empty: payment confirmations will fail.',
            )}
          </p>
        )}
      </div>
    </div>
  )
}
