import { describe, expect, it, vi } from 'vitest'

import type { ObjectStorage } from '../src/integrations/contracts.js'
import type { Transaction } from '../src/lib/db.js'
import type { createArtifactRepository } from '../src/support/artifacts/repositories/artifact.repository.js'
import {
  type ArtifactOwnerAccess,
  createArtifactService,
} from '../src/support/artifacts/services/artifact.service.js'

const documentId = '11111111-1111-4111-8111-111111111111'
const actor = '22222222-2222-4222-8222-222222222222'
const pdf = new Uint8Array(Buffer.from('%PDF-1.7\n%%EOF'))

function fixture() {
  let saved: Record<string, unknown> | null = null
  const putImmutable = vi.fn(async () => ({ key: '', contentType: '', byteSize: 0, sha256: '' }))
  const get = vi.fn(async () => pdf)
  const deleteUnreferenced = vi.fn(async () => undefined)
  const storage = { putImmutable, get, deleteUnreferenced } as unknown as ObjectStorage
  const assertPublishable = vi.fn(async () => undefined)
  const assertReadable = vi.fn(async () => undefined)
  const owners = { assertPublishable, assertReadable } as ArtifactOwnerAccess
  const repo = {
    deleteIfUnreferenced: vi.fn(async (_key: string, remove: () => Promise<void>) => remove()),
    transaction: async <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
    findOwnerVersion: vi.fn(async () => saved),
    insertIfAbsent: vi.fn(async (row: Record<string, unknown>) => {
      saved = row
      return row
    }),
    get: vi.fn(async () => saved),
    listByOwner: vi.fn(async () => (saved ? [saved] : [])),
  }
  const service = createArtifactService(
    repo as unknown as ReturnType<typeof createArtifactRepository>,
    storage,
    owners,
  )
  const input = { type: 'invoice' as const, documentId, sourceVersion: 2, bytes: pdf, actor }
  return {
    service,
    input,
    repo,
    putImmutable,
    get,
    deleteUnreferenced,
    assertPublishable,
    assertReadable,
  }
}

describe('document artifact publication', () => {
  it('checks producer lease guards before and after storage I/O', async () => {
    const f = fixture()
    let checks = 0
    const guard = vi.fn(async () => {
      checks++
      if (checks === 2) throw new Error('Lease lost')
    })
    await expect(f.service.publishPdf({ ...f.input, guard })).rejects.toThrow('Lease lost')
    expect(guard).toHaveBeenCalledTimes(2)
    expect(f.repo.insertIfAbsent).not.toHaveBeenCalled()
    expect(f.repo.deleteIfUnreferenced).toHaveBeenCalledTimes(1)
  })
  it('publishes one immutable PDF and reuses it on retry', async () => {
    const f = fixture()
    const first = await f.service.publishPdf(f.input)
    const second = await f.service.publishPdf(f.input)
    expect(first).toBe(second)
    expect(f.putImmutable).toHaveBeenCalledTimes(1)
    expect(f.repo.insertIfAbsent).toHaveBeenCalledTimes(1)
    expect(f.assertPublishable).toHaveBeenCalledTimes(3)
    expect(first.byteSize).toBe(f.input.bytes.length)
    expect(first.sha256).toMatch(/^[a-f0-9]{64}$/)
  })

  it('refuses invalid output before writing storage', async () => {
    const f = fixture()
    await expect(
      f.service.publishPdf({ ...f.input, bytes: new Uint8Array([1, 2, 3]) }),
    ).rejects.toMatchObject({ code: 'INVALID_PDF' })
    expect(f.putImmutable).not.toHaveBeenCalled()
  })

  it('checks owner access for every download', async () => {
    const f = fixture()
    const artifact = await f.service.publishPdf(f.input)
    expect(await f.service.download(artifact.id, actor)).toMatchObject({ bytes: pdf })
    expect(f.assertReadable).toHaveBeenCalledWith(expect.anything(), 'invoice', documentId, actor)
    expect(f.get).toHaveBeenCalledWith(artifact.objectKey)
    expect(await f.service.list('invoice', documentId, actor)).toEqual([artifact])
    expect(f.assertReadable).toHaveBeenCalledTimes(2)
  })

  it('removes an uploaded orphan when owner revalidation fails', async () => {
    const f = fixture()
    f.assertPublishable.mockRejectedValueOnce(new Error('owner changed'))
    await expect(f.service.publishPdf(f.input)).rejects.toThrow('owner changed')
    expect(f.putImmutable).not.toHaveBeenCalled()

    f.assertPublishable.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('changed'))
    await expect(f.service.publishPdf(f.input)).rejects.toThrow('changed')
    expect(f.putImmutable).toHaveBeenCalledTimes(1)
    expect(f.deleteUnreferenced).toHaveBeenCalledTimes(1)
  })
})
