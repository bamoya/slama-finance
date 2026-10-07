import { createHash, randomUUID } from 'node:crypto'

import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { createS3Storage } from '../src/integrations/storage/s3.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { createMediaModule } from '../src/modules/media/index.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
describe('media lifecycle and settings attachments', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let storage: ObjectStorage
  let objects: Map<string, Uint8Array>
  let bytes: Buffer
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const password = await createPasswordService().hash('media-password-123')
    await fixture.client`update users set password_hash=${password} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    bytes = await sharp({ create: { width: 8, height: 8, channels: 4, background: '#fff' } })
      .png()
      .toBuffer()
    objects = new Map()
    storage = {
      putImmutable: vi.fn(async (input) => {
        if (objects.has(input.key)) throw new Error('Immutable')
        objects.set(input.key, input.bytes)
        return {
          key: input.key,
          contentType: input.contentType,
          byteSize: input.bytes.length,
          sha256: createHash('sha256').update(input.bytes).digest('hex'),
        }
      }),
      get: vi.fn(async (key) => {
        const bytes = objects.get(key)
        if (!bytes) throw new Error('Missing')
        return bytes
      }),
      deleteUnreferenced: vi.fn(async (key) => {
        objects.delete(key)
      }),
      signedDownloadUrl: vi.fn(async () => {
        throw new Error('Not used')
      }),
    }
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: storage,
    })
    app.database = () => fixture.db
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'media-password-123' },
    })
    cookies = { slama_session: response.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const upload = (purpose = 'company_logo') =>
    app.inject({
      method: 'POST',
      url: '/v1/media/uploads',
      headers,
      cookies,
      payload: {
        purpose,
        originalFilename: '../logo.png',
        contentType: 'image/png',
        data: bytes.toString('base64'),
      },
    })
  const remove = (id: string, version: number) =>
    app.inject({
      method: 'DELETE',
      url: `/v1/media/${id}`,
      headers,
      cookies,
      payload: { expectedVersion: version },
    })
  async function companyPatch(id: string | null) {
    const {
      id: _id,
      version,
      createdAt: _ca,
      updatedAt: _ua,
      createdByUserId: _cb,
      updatedByUserId: _ub,
      ...fields
    } = (await app.inject({ url: '/v1/company-settings', cookies })).json()
    return app.inject({
      method: 'PATCH',
      url: '/v1/company-settings',
      headers,
      cookies,
      payload: { ...fields, logoAssetId: id, expectedVersion: version },
    })
  }
  it('stores validated metadata, hides storage keys and supports private reads and versioned deletion', async () => {
    const result = await upload()
    expect(result.statusCode).toBe(201)
    const asset = result.json()
    expect(asset).toMatchObject({
      status: 'ready',
      version: 2,
      uploadedBy: testUserId,
      originalFilename: '.._logo.png',
    })
    expect(asset).not.toHaveProperty('objectKey')
    expect(asset).not.toHaveProperty('sha256')
    expect((await app.inject({ url: `/v1/media/${asset.id}/download` })).statusCode).toBe(403)
    expect((await app.inject({ url: `/v1/media/${asset.id}/download`, cookies })).statusCode).toBe(
      200,
    )
    expect((await remove(asset.id, 1)).statusCode).toBe(409)
    expect((await remove(asset.id, asset.version)).statusCode).toBe(204)
    expect(objects.size).toBe(0)
    expect((await app.inject({ url: `/v1/media/${asset.id}`, cookies })).statusCode).toBe(404)
  })
  it('protects references, uses foreign keys and gives detached media a new grace period', async () => {
    const asset = (await upload()).json()
    expect((await companyPatch(asset.id)).statusCode).toBe(200)
    const attached = (await app.inject({ url: `/v1/media/${asset.id}`, cookies })).json()
    expect(attached.expiresAt).toBeNull()
    expect((await remove(asset.id, attached.version)).statusCode).toBe(409)
    await expect(fixture.client`delete from media_assets where id=${asset.id}`).rejects.toThrow()
    expect((await companyPatch(null)).statusCode).toBe(200)
    const detached = (await app.inject({ url: `/v1/media/${asset.id}`, cookies })).json()
    expect(new Date(detached.expiresAt).getTime()).toBeGreaterThan(Date.now())
    expect((await remove(asset.id, detached.version)).statusCode).toBe(204)
  })
  it('denies another uploader, wrong purposes and inactive sessions', async () => {
    const asset = (await upload()).json()
    const other = randomUUID()
    await fixture.client`insert into users (id,email,password_hash) values (${other},'other@example.test','unused')`
    await fixture.client`update media_assets set uploaded_by=${other} where id=${asset.id}`
    expect((await app.inject({ url: `/v1/media/${asset.id}`, cookies })).statusCode).toBe(403)
    expect((await companyPatch(asset.id)).statusCode).toBe(403)
    expect((await remove(asset.id, asset.version)).statusCode).toBe(403)
    const signature = (await upload('company_signature')).json()
    expect((await companyPatch(signature.id)).statusCode).toBe(400)
    expect((await upload('product_image')).statusCode).toBe(201)
    await fixture.client`update users set must_change_password=true where id=${testUserId}`
    expect((await upload()).statusCode).toBe(403)
  })
  it('requires templates Read for attached signatures, even for their uploader', async () => {
    const signature = (await upload('company_signature')).json()
    const created = await app.inject({
      method: 'POST',
      url: '/v1/document-templates',
      headers,
      cookies,
      payload: {
        name: 'Test',
        layout: 'classic',
        accentColor: '#aa8800',
        logoAssetId: null,
        signatureAssetId: signature.id,
        showSignature: true,
        showBankDetails: false,
        showPaymentTerms: false,
        footerText: null,
        paymentTerms: null,
      },
    })
    expect(created.statusCode).toBe(201)
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    const [role] =
      await fixture.client`insert into roles (key,name) values ('viewer','Viewer') returning id`
    await fixture.client`insert into user_roles (user_id,role_id) values (${testUserId},${role!.id})`
    expect(
      (await app.inject({ url: `/v1/media/${signature.id}/download`, cookies })).statusCode,
    ).toBe(403)
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key='templates.read'`
    expect(
      (await app.inject({ url: `/v1/media/${signature.id}/download`, cookies })).statusCode,
    ).toBe(200)
  })
  it('cleans expired unattached assets and retries ambiguous storage failures', async () => {
    const abandoned = (await upload()).json()
    const attached = (await upload()).json()
    await companyPatch(attached.id)
    await fixture.client`update media_assets set expires_at=now()-interval '1 day'`
    const cleanup = createMediaModule(() => fixture.db, storage).cleanup
    vi.mocked(storage.deleteUnreferenced).mockRejectedValueOnce(new Error('Unavailable'))
    expect(await cleanup()).toEqual({ removed: 0, failed: 1 })
    expect(
      (await fixture.client`select status from media_assets where id=${abandoned.id}`)[0]!.status,
    ).toBe('deleting')
    expect((await companyPatch(abandoned.id)).statusCode).toBe(404)
    expect(await cleanup()).toEqual({ removed: 1, failed: 0 })
    expect(objects.has(`media/${attached.id}.png`)).toBe(true)
    expect(objects.has(`media/${abandoned.id}.png`)).toBe(false)
  })
  it('retains a pending record for failed uploads so cleanup can recover', async () => {
    vi.mocked(storage.putImmutable).mockImplementationOnce(async (input) => {
      objects.set(input.key, input.bytes)
      throw new Error('Timeout after write')
    })
    expect((await upload()).statusCode).toBe(500)
    const [pending] = await fixture.client`select * from media_assets`
    expect(pending!.status).toBe('pending')
    await fixture.client`update media_assets set expires_at=now()-interval '1 day'`
    expect(await createMediaModule(() => fixture.db, storage).cleanup()).toEqual({
      removed: 1,
      failed: 0,
    })
    expect(objects.size).toBe(0)
  })
  it('serializes simultaneous attachment and deletion without dangling references', async () => {
    const asset = (await upload()).json()
    const [attached, deleted] = await Promise.all([
      companyPatch(asset.id),
      remove(asset.id, asset.version),
    ])
    if (attached.statusCode === 200) {
      expect(deleted.statusCode).toBe(409)
      expect(objects.has(`media/${asset.id}.png`)).toBe(true)
    } else {
      expect(deleted.statusCode).toBe(204)
      expect(attached.statusCode).toBe(404)
      expect(
        (await fixture.client`select logo_asset_id from company_settings`)[0]!.logo_asset_id,
      ).toBeNull()
    }
  })
  it.skipIf(process.env.TEST_MEDIA_S3 !== '1')(
    'runs the complete API lifecycle against local MinIO',
    async () => {
      const liveStorage = createS3Storage({
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        bucket: 'slama-media',
        accessKeyId: 'slama-local',
        secretAccessKey: 'slama-local-development-only',
      })
      await app.close()
      app = await buildApp({
        environment: loadEnvironment({ NODE_ENV: 'test' }),
        logger: false,
        mediaStorage: liveStorage,
      })
      app.database = () => fixture.db
      const result = await upload()
      expect(result.statusCode).toBe(201)
      const asset = result.json()
      try {
        const download = await app.inject({ url: `/v1/media/${asset.id}/download`, cookies })
        expect(download.statusCode).toBe(200)
        expect((await sharp(download.rawPayload).metadata()).format).toBe('png')
        expect((await companyPatch(asset.id)).statusCode).toBe(200)
        expect((await companyPatch(null)).statusCode).toBe(200)
        const metadata = (await app.inject({ url: `/v1/media/${asset.id}`, cookies })).json()
        expect((await remove(asset.id, metadata.version)).statusCode).toBe(204)
      } finally {
        // Only the unique object created by this test is removed.
        await liveStorage.deleteUnreferenced(`media/${asset.id}.png`)
      }
    },
  )
})
