import { ApiError } from '../../lib/api-error'
import { errorMessage, validationMessage } from '../../lib/error-messages'
import { translate, useUiLanguage } from '../../lib/i18n'

export function FormError({ error }: { error: unknown }) {
  useUiLanguage()

  if (!error) return null
  return (
    <div
      role="alert"
      className="rounded-xl border border-[var(--error-border)] bg-[var(--error-bg)] p-3 text-sm text-[var(--error-text)]"
    >
      <p>{errorMessage(error)}</p>
      {error instanceof ApiError && error.fieldErrors && (
        <ul className="mt-2 list-disc pl-5">
          {Object.entries(error.fieldErrors).flatMap(([field, messages]) =>
            messages.map((message, i) => (
              <li key={`${field}-${i}`}>
                {field === '_form' ? '' : `${field}: `}
                {validationMessage(message)}
              </li>
            )),
          )}
        </ul>
      )}
      {error instanceof ApiError && error.requestId && (
        <p className="mt-2 text-xs">
          {translate('Reference:')} {error.requestId}
        </p>
      )}
    </div>
  )
}
