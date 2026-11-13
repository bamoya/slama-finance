import { Link } from 'wouter'

import { translate, useUiLanguage } from '../../../../../lib/i18n'
import { useAuthorization } from '../../../identity'
import { useCompanySettings } from '../../../settings'

/**
 * Shown while the organization legal type is individual: invoices are issued as simple invoices.
 * The link to company settings is offered only to users who may edit them.
 */
export function SimpleInvoiceNotice() {
  useUiLanguage()

  const { can } = useAuthorization()
  const company = useCompanySettings(can('company_settings.read'))
  if (company.data?.legalType !== 'individual') return null
  return (
    <p
      role="note"
      className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]"
    >
      {translate(
        'Your organization is set up as an individual: invoices are issued as simple invoices (FS series), labelled as not a legal tax invoice. Choose a registered legal type to issue legal invoices.',
      )}{' '}
      {can('company_settings.update') && (
        <Link
          href="/settings/company/edit"
          className="font-semibold text-[var(--text)] underline underline-offset-2"
        >
          {translate('Open company settings')}
        </Link>
      )}
    </p>
  )
}
