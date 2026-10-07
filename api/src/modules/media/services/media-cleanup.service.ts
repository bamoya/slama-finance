import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { createMediaRepository } from '../repositories/media.repository.js'

export function createMediaCleanupService(
  repo: ReturnType<typeof createMediaRepository>,
  storage: ObjectStorage,
) {
  return async () => {
    let removed = 0
    let failed = 0
    for (const candidate of await repo.candidates()) {
      try {
        const asset = await repo.transaction(async (tx) => {
          await repo.lock(tx)
          const row = await repo.get(candidate.id, tx)
          if (
            row.status === 'deleted' ||
            (row.status !== 'deleting' && (!row.expiresAt || row.expiresAt > new Date()))
          )
            return null
          const refs = await repo.references(row.id, tx)
          if (refs.company || refs.templates || refs.products || refs.documents) return null
          return repo.update(row.id, { status: 'deleting' }, tx)
        })
        if (!asset) continue
        await storage.deleteUnreferenced(asset.objectKey)
        await repo.transaction(async (tx) => {
          await repo.lock(tx)
          await repo.update(
            asset.id,
            { status: 'deleted', deletedAt: new Date(), expiresAt: null },
            tx,
          )
          await repo.audit(tx, null, 'cleanup', asset.id)
        })
        removed++
      } catch {
        failed++
      }
    }
    return { removed, failed }
  }
}
