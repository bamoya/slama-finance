import '../translations'

import { useTranslation } from 'react-i18next'

import { FormError } from '../../../../../components/management/form-error'
import { ApiError } from '../../../../../lib/api-error'
import { useUiLanguage } from '../../../../../lib/i18n'

const messages: Record<string, string> = {
  CREDIT_EXCEEDS_INVOICE: 'errorCreditExceeds',
  INVOICE_NOT_CREDITABLE: 'errorNotCreditable',
  INVALID_CREDIT_LINE: 'errorInvalidLine',
  INVALID_STATUS: 'errorInvalidStatus',
  STALE_VERSION: 'errorStale',
  VERSION_CONFLICT: 'errorStale',
}

/** Translated, code-based presentation of credit note refusals; anything else falls back to FormError. */
export function CreditNoteError({ error }: { error: unknown }) {
  useUiLanguage()

  const { t } = useTranslation('creditNotes')
  if (!error) return null
  const key = error instanceof ApiError ? messages[error.code] : undefined
  if (!key) return <FormError error={error} />
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]"
    >
      <p>{t(key)}</p>
      {error instanceof ApiError && error.requestId && (
        <p className="mt-2 text-xs">{t('reference', { id: error.requestId })}</p>
      )}
    </div>
  )
}
