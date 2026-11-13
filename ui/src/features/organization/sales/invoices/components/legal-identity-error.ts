import { ApiError } from '../../../../../lib/api-error'

/** The issue gate refused a legal invoice because required company details are missing. */
export const isMissingLegalIdentity = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === 'MISSING_LEGAL_IDENTITY'
