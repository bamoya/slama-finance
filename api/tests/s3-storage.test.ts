import type * as S3 from '@aws-sdk/client-s3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createS3Storage } from '../src/integrations/storage/s3.js'

const { send, sign, configuration } = vi.hoisted(() => ({
  send: vi.fn(),
  sign: vi.fn(),
  configuration: vi.fn(),
}))
vi.mock('@aws-sdk/client-s3', async (original) => {
  const actual = await original<typeof S3>()
  return {
    ...actual,
    S3Client: class {
      constructor(config: unknown) {
        configuration(config)
      }
      send = send
    },
  }
})
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: sign }))
const config = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'test',
  accessKeyId: 'local',
  secretAccessKey: 'local-secret',
}
beforeEach(() => {
  vi.clearAllMocks()
  send.mockResolvedValue({})
  sign.mockResolvedValue('https://signed.example.test')
})
describe('shared S3 storage', () => {
  it('uses the configured endpoint and portable client settings', () => {
    createS3Storage(config)
    expect(configuration).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: config.endpoint,
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
      }),
    )
  })
  it('writes privately with conditional creation and returns metadata', async () => {
    const result = await createS3Storage(config).putImmutable({
      key: 'products/image.png',
      bytes: new Uint8Array([1, 2]),
      contentType: 'image/png',
    })
    expect(send.mock.calls[0]?.[0].input).toEqual({
      Bucket: 'test',
      Key: 'products/image.png',
      Body: new Uint8Array([1, 2]),
      ContentType: 'image/png',
      IfNoneMatch: '*',
    })
    expect(result.byteSize).toBe(2)
    expect(result.sha256).toHaveLength(64)
  })
  it('maps missing keys but preserves infrastructure errors', async () => {
    const storage = createS3Storage(config)
    send.mockRejectedValueOnce({ name: 'NoSuchKey' })
    await expect(storage.get('missing.png')).rejects.toMatchObject({ code: 'ASSET_NOT_FOUND' })
    const unavailable = new Error('Unavailable')
    send.mockRejectedValueOnce(unavailable)
    await expect(storage.get('missing.png')).rejects.toBe(unavailable)
  })
  it('validates keys and signed URL lifetime before contacting storage', async () => {
    const storage = createS3Storage(config)
    for (const key of ['../secret', '/absolute', 'a/../b', 'https://host/key', 'a//b']) {
      await expect(storage.get(key)).rejects.toMatchObject({ code: 'INVALID_ASSET_KEY' })
      await expect(storage.deleteUnreferenced(key)).rejects.toMatchObject({
        code: 'INVALID_ASSET_KEY',
      })
    }
    for (const expiry of [0, 901, 1.5])
      await expect(storage.signedDownloadUrl('a.png', expiry)).rejects.toMatchObject({
        code: 'INVALID_URL_EXPIRY',
      })
    expect(send).not.toHaveBeenCalled()
    expect(sign).not.toHaveBeenCalled()
    await storage.signedDownloadUrl('a.png', 60)
    expect(sign.mock.calls[0]?.[2]).toEqual({ expiresIn: 60 })
  })
})
