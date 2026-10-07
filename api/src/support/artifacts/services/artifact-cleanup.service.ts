import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { createArtifactRepository } from '../repositories/artifact.repository.js'

const GRACE_MS = 24 * 60 * 60 * 1000

export function createArtifactCleanupService(
  repo: Pick<ReturnType<typeof createArtifactRepository>, 'referencedKeys'> &
    Partial<Pick<ReturnType<typeof createArtifactRepository>, 'deleteIfUnreferenced'>>,
  storage: ObjectStorage,
) {
  return async function cleanup(now = new Date()) {
    if (!storage.list) throw new Error('Artifact storage listing is not configured.')
    const listed = await storage.list('artifacts/')
    const stale = listed.filter(
      (item) =>
        item.lastModified.getTime() <= now.getTime() - GRACE_MS &&
        /^artifacts\/(?:invoice|estimate|delivery_note|report_run|payment_receipt)\/[a-f0-9-]{36}\.(pdf|csv|xlsx)$/.test(
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
          if (repo.deleteIfUnreferenced) {
            if (
              await repo.deleteIfUnreferenced(item.key, () => storage.deleteUnreferenced(item.key))
            )
              removed++
            continue
          }
          // Compatibility for old injected test repositories; production uses the keyed lock.
          if ((await repo.referencedKeys([item.key])).has(item.key)) continue
          await storage.deleteUnreferenced(item.key)
          removed++
        } catch {
          failed++
        }
      }
    }
    return { scanned: listed.length, removed, failed }
  }
}
