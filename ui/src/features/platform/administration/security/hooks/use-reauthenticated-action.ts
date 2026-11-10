import { useState } from 'react'

import { ApiError } from '../../../../../lib/api-error'

export const isReauthenticationRequired = (error: unknown) =>
  error instanceof ApiError && error.status === 403 && error.code === 'REAUTHENTICATION_REQUIRED'

/**
 * Runs a credential change. When the API answers REAUTHENTICATION_REQUIRED the action is parked,
 * the reauthentication dialog opens and, once it succeeds, the action is retried exactly once;
 * a second refusal is reported instead of prompting again.
 */
export function useReauthenticatedAction() {
  const [parked, setParked] = useState<(() => Promise<void>) | null>(null)
  const run = async (action: () => Promise<void>) => {
    try {
      await action()
    } catch (error) {
      if (!isReauthenticationRequired(error)) throw error
      setParked(() => action)
    }
  }
  return {
    run,
    prompting: parked !== null,
    cancel: () => setParked(null),
    /** Called after reauthentication succeeded; throws what the single retry throws. */
    resume: async () => {
      const action = parked
      setParked(null)
      await action?.()
    },
  }
}
