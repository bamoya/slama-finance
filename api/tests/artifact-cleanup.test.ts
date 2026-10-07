import { describe, expect, it, vi } from 'vitest'

import type { ObjectStorage } from '../src/integrations/contracts.js'
import type { createArtifactRepository } from '../src/support/artifacts/repositories/artifact.repository.js'
import { createArtifactCleanupService } from '../src/support/artifacts/services/artifact-cleanup.service.js'

const key = (id: string) => `artifacts/invoice/${id}.pdf`
const retained = key('11111111-1111-4111-8111-111111111111')
const orphan = key('22222222-2222-4222-8222-222222222222')
const recent = key('33333333-3333-4333-8333-333333333333')

describe('artifact orphan cleanup', () => {
  it('retains issued PDFs and recent uploads, deleting only old unreferenced files', async () => {
    const list = vi.fn(async () => [
      { key: retained, lastModified: new Date('2026-01-01') },
      { key: orphan, lastModified: new Date('2026-01-01') },
      { key: recent, lastModified: new Date('2026-01-03T11:00:00Z') },
    ])
    const deleteUnreferenced = vi.fn(async () => undefined)
    const referencedKeys = vi.fn(
      async (keys: string[]) => new Set(keys.filter((key) => key === retained)),
    )
    const cleanup = createArtifactCleanupService(
      { referencedKeys } as unknown as ReturnType<typeof createArtifactRepository>,
      { list, deleteUnreferenced } as unknown as ObjectStorage,
    )
    expect(await cleanup(new Date('2026-01-03T12:00:00Z'))).toEqual({
      scanned: 3,
      removed: 1,
      failed: 0,
    })
    expect(deleteUnreferenced).toHaveBeenCalledTimes(1)
    expect(deleteUnreferenced).toHaveBeenCalledWith(orphan)
  })
})
