import type { onRequestHookHandler } from 'fastify'

import { AppError } from '../lib/errors.js'

/** Portal endpoints never inherit trust from a different tenant's CORS origin. */
export function createRequirePortalOrigin(origin?: string): onRequestHookHandler {
  return async (request) => {
    if (origin && request.headers.origin && request.headers.origin !== origin)
      throw new AppError(
        403,
        'UNTRUSTED_ORIGIN',
        'Owner authentication requires the central portal origin.',
      )
  }
}
