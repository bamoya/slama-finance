import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadEnvironment } from '../src/config/env.js'
import { createLocalStorage } from '../src/integrations/storage/local.js'

describe('private local media storage', () => {
  it('stores immutable bytes privately, refuses traversal and preserves older keys', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slama-assets-test-'))
    try {
      const storage = createLocalStorage(directory)
      const key = 'media/11111111-1111-4111-8111-111111111111.png'
      const bytes = new Uint8Array([1, 2, 3])
      const first = await storage.putImmutable({ key, bytes, contentType: 'image/png' })
      expect(first.byteSize).toBe(3)
      expect(first.sha256).toHaveLength(64)
      expect(await storage.get(key)).toEqual(Buffer.from(bytes))
      await expect(
        storage.putImmutable({ key, bytes: new Uint8Array([9]), contentType: 'image/png' }),
      ).rejects.toThrow()
      await expect(storage.get('../secrets')).rejects.toMatchObject({ code: 'INVALID_ASSET_KEY' })
      await expect(
        storage.get('media/22222222-2222-4222-8222-222222222222.png'),
      ).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
      expect(await storage.get(key)).toEqual(Buffer.from(bytes))
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('rejects partially configured object storage', () => {
    expect(() =>
      loadEnvironment({ NODE_ENV: 'test', S3_ENDPOINT: 'https://storage.example.test' }),
    ).toThrow('S3_BUCKET')
  })
  it('lists private report CSVs and payment receipts without allowing arbitrary CSV owners', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slama-report-storage-'))
    try {
      const storage = createLocalStorage(directory)
      const csv = 'artifacts/report_run/11111111-1111-4111-8111-111111111111.csv'
      const receipt = 'artifacts/payment_receipt/22222222-2222-4222-8222-222222222222.pdf'
      await storage.putImmutable({
        key: csv,
        bytes: Buffer.from('section,value\nrevenue,1.00'),
        contentType: 'text/csv',
      })
      await storage.putImmutable({
        key: receipt,
        bytes: Buffer.from('%PDF'),
        contentType: 'application/pdf',
      })
      expect((await storage.list!('artifacts/')).map((item) => item.key).sort()).toEqual(
        [receipt, csv].sort(),
      )
      expect(Buffer.from(await storage.get(csv)).toString()).toContain('revenue,1.00')
      await expect(storage.get(csv.replace('report_run', 'invoice'))).rejects.toMatchObject({
        code: 'INVALID_ASSET_KEY',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('stores immutable document PDFs without allowing arbitrary local paths', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'slama-artifacts-test-'))
    try {
      const storage = createLocalStorage(directory)
      const key = 'artifacts/invoice/11111111-1111-4111-8111-111111111111.pdf'
      const bytes = new Uint8Array([37, 80, 68, 70])
      await storage.putImmutable({ key, bytes, contentType: 'application/pdf' })
      expect(await storage.get(key)).toEqual(Buffer.from(bytes))
      await expect(
        storage.putImmutable({ key, bytes, contentType: 'application/pdf' }),
      ).rejects.toThrow()
      await expect(storage.get('artifacts/invoice/../secret.pdf')).rejects.toMatchObject({
        code: 'INVALID_ASSET_KEY',
      })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
