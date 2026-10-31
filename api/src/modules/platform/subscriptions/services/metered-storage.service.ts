import { createHash } from 'node:crypto'

import type { ObjectStorage } from '../../../../integrations/contracts.js'
import type { createSubscriptionService } from './subscription.service.js'

/** Reservations commit before writes; ambiguous failures stay charged until confirmed deletion. */
export function createMeteredStorage(
  storage: ObjectStorage,
  usage: ReturnType<typeof createSubscriptionService>,
): ObjectStorage {
  return {
    ...storage,
    async putImmutable(input) {
      await usage.reserveStorage(
        input.key,
        input.bytes.length,
        createHash('sha256').update(input.bytes).digest('hex'),
      )
      const stored = await storage.putImmutable(input)
      await usage.confirmStorage(input.key)
      return stored
    },
    get: (key) => storage.get(key),
    signedDownloadUrl: (key, seconds) => storage.signedDownloadUrl(key, seconds),
    ...(storage.list ? { list: (prefix: string) => storage.list!(prefix) } : {}),
    async deleteUnreferenced(key) {
      await storage.deleteUnreferenced(key)
      await usage.releaseStorage(key)
    },
  }
}
