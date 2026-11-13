import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { createArtifactRepository } from '../repositories/artifact.repository.js'

const GRACE_MS = 24 * 60 * 60 * 1000

export function createArtifactCleanupService(
  repo: Pick<
    ReturnType<typeof createArtifactRepository>,
    'referencedKeys' | 'deleteIfUnreferenced' | 'storageKey'
  >,
  storage: ObjectStorage,
) {
  return async function cleanup(now = new Date()) {
    if (!storage.list) throw new Error('Artifact storage listing is not configured.')
    const prefix = await repo.storageKey('artifacts/')
    const listed = await storage.list(prefix)
    const stale = listed.filter(
      (item) =>
        item.key.startsWith(prefix) &&
        item.lastModified.getTime() <= now.getTime() - GRACE_MS &&
        /^organizations\/[a-f0-9-]{36}\/artifacts\/(?:invoice|estimate|delivery_note|report_run|payment_receipt|credit_note)\/[a-f0-9-]{36}\.(pdf|csv|xlsx)$/.test(
          item.key,
        ),
    )
    let removed = 0
    let failed = 0
    for (let offset = 0; offset < stale.length; offset += 100) {
      const batch = stale.slice(offset, offset + 100)
      const referenced = await repo.referencedKeys(batch.map((item) => item.key))
      for (const item of batch) {
        if (referenced.has(item.key)) continue
        try {
          if (await repo.deleteIfUnreferenced(item.key, () => storage.deleteUnreferenced(item.key)))
            removed++
        } catch {
          failed++
        }
      }
    }
    return { scanned: listed.length, removed, failed }
  }
}
