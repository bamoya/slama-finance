import { Link } from 'wouter'

import type { ApiError } from '../../../../../lib/api-error'
import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useAuthorization } from '../../../identity'

const fieldLabels: Record<string, string> = {
  legalName: 'Legal company name',
  ice: 'ICE',
  taxIdentifier: 'Tax identifier (IF)',
  registrationNumber: 'Commercial register (RC)',
  professionalTaxNumber: 'Professional tax / Patente',
  shareCapital: 'Share capital (MAD)',
  addressLine1: 'Address line 1',
  city: 'City',
}

/** Lists the company fields a legal invoice still needs, with a link to complete them. */
export function MissingLegalIdentity({ error }: { error: ApiError }) {
  useUiLanguage()

  const { can } = useAuthorization()

  const missing = Object.keys(error.fieldErrors ?? {})
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]"
    >
      <p className="font-semibold">
        {translate('This invoice cannot be issued as a legal invoice yet.')}
      </p>
      <p className="mt-1">
        {translate('Complete these company details, then issue the invoice again:')}
      </p>
      <ul className="mt-2 list-disc pl-5">
        {missing.map((field) => (
          <li key={field}>{translate(fieldLabels[field] ?? field)}</li>
        ))}
      </ul>
      {can('company_settings.read') ? (
        <Link
          href="/settings/company"
          className="mt-3 inline-block font-semibold underline underline-offset-2"
        >
          {translate('Open company settings')}
        </Link>
      ) : (
        <p className="mt-3">
          {translate('Ask an administrator to complete the company settings.')}
        </p>
      )}
    </div>
  )
}
