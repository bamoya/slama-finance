import { translate } from './i18n'
export type FieldErrors = Record<string, string[]>
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly requestId?: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message)
    this.name = 'ApiError'
  }
  get isConflict() {
    return this.status === 409
  }
}

export function decodeApiError(status: number, value: unknown, headerRequestId?: string): ApiError {
  const data = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const fields: FieldErrors = {}
  if (data.fieldErrors && typeof data.fieldErrors === 'object') {
    for (const [key, messages] of Object.entries(data.fieldErrors)) {
      if (Array.isArray(messages) && messages.every((message) => typeof message === 'string'))
        Object.defineProperty(fields, key, { value: messages, enumerable: true })
    }
  }
  return new ApiError(
    status,
    typeof data.code === 'string' ? data.code : 'REQUEST_FAILED',
    typeof data.message === 'string'
      ? data.message
      : translate('The request could not be completed.'),
    typeof data.requestId === 'string' ? data.requestId : headerRequestId,
    Object.keys(fields).length ? fields : undefined,
  )
}

export function shouldRetryQuery(failureCount: number, error: unknown) {
  return (
    failureCount < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500)
  )
}
