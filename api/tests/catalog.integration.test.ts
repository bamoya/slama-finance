import { createHash } from 'node:crypto'

import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const draft = (overrides: Record<string, unknown> = {}) => ({
  reference: 'WHT-001',
  name: 'Premium wheat',
  description: 'Internal note',
  categoryId: null,
  imageAssetId: null,
  suggestedVatRate: null,
  variants: [
    { weightG: 100, pricePerItem: '4.00', costPerItem: null, active: true },
    { weightG: 500, pricePerItem: '18.00', costPerItem: '12.00', active: true },
  ],
  ...overrides,
})

describe('Catalog with per-item variants', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let objects: Map<string, Uint8Array>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('catalog-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    objects = new Map()
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: {
        async putImmutable(input) {
          objects.set(input.key, input.bytes)
          return {
            key: input.key,
            byteSize: input.bytes.length,
            contentType: input.contentType,
            sha256: createHash('sha256').update(input.bytes).digest('hex'),
          }
        },
        async get(key) {
          const value = objects.get(key)
          if (!value) throw new Error('Missing')
          return value
        },
        async deleteUnreferenced(key) {
          objects.delete(key)
        },
        async signedDownloadUrl() {
          throw new Error('Unused')
        },
      },
    })
    app.database = () => fixture.db
    const session = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'catalog-password-123' },
    })
    cookies = { slama_session: session.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const request = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: object) =>
    app.inject({ method, url, cookies, headers, payload })
  it('creates two priced packages, filters them, and preserves product identity', async () => {
    const category = await request('POST', '/v1/categories', {
      name: ' Cereals ',
      description: null,
    })
    expect(category.statusCode).toBe(201)
    const id = category.json().id
    const created = await request('POST', '/v1/products', draft({ categoryId: id }))
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      name: 'Premium wheat',
      categoryId: id,
      suggestedVatRate: null,
      variants: [
        { weightG: 100, pricePerItem: '4.00' },
        { weightG: 500, pricePerItem: '18.00' },
      ],
    })
    expect(
      (await app.inject({ url: `/v1/products?q=wht&categoryId=${id}`, cookies })).json(),
    ).toHaveLength(1)
    expect((await app.inject({ url: '/v1/products?q=other', cookies })).json()).toHaveLength(0)
    expect(
      (await request('POST', '/v1/products', draft({ reference: 'wht-001' }))).statusCode,
    ).toBe(409)
    expect(
      (await request('POST', '/v1/categories', { name: 'cereals', description: null })).statusCode,
    ).toBe(409)
  })
  it('rejects empty/duplicate variants and direct SQL removal of the last active variant', async () => {
    expect((await request('POST', '/v1/products', draft({ variants: [] }))).statusCode).toBe(400)
    expect(
      (
        await request(
          'POST',
          '/v1/products',
          draft({ variants: [draft().variants[0], draft().variants[0]] }),
        )
      ).statusCode,
    ).toBe(400)
    const created = await request(
      'POST',
      '/v1/products',
      draft({ variants: [draft().variants[0]] }),
    )
    expect(created.statusCode).toBe(201)
    const id = created.json().id
    await expect(
      fixture.client`update product_variants set archived_at=now() where product_id=${id}`,
    ).rejects.toThrow('A product requires at least one active variant')
    await expect(
      fixture.client`delete from product_variants where product_id=${id}`,
    ).rejects.toThrow('A product requires at least one active variant')
    expect(
      (
        await request('PATCH', `/v1/products/${id}`, {
          ...draft({ variants: [{ ...created.json().variants[0], active: false }] }),
          expectedVersion: 1,
        })
      ).statusCode,
    ).toBe(400)
  })
  it('updates prices without changing package identity, and archives/restores variants', async () => {
    const created = (await request('POST', '/v1/products', draft())).json()
    const small = created.variants[0],
      large = created.variants[1]
    const changed = await request('PATCH', `/v1/products/${created.id}`, {
      ...draft({
        variants: [
          { id: small.id, weightG: 100, pricePerItem: '5.00', costPerItem: null, active: true },
          {
            id: large.id,
            weightG: 500,
            pricePerItem: '18.00',
            costPerItem: '12.00',
            active: false,
          },
        ],
      }),
      expectedVersion: created.version,
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json().variants[0]).toMatchObject({
      id: small.id,
      weightG: 100,
      pricePerItem: '5.00',
      archivedAt: null,
    })
    expect(changed.json().variants[1].archivedAt).toBeTruthy()
    expect(
      (
        await request('PATCH', `/v1/products/${created.id}`, {
          ...draft(),
          expectedVersion: created.version,
        })
      ).statusCode,
    ).toBe(409)
    const immutable = await request('PATCH', `/v1/products/${created.id}`, {
      ...draft({
        variants: [
          { id: small.id, weightG: 200, pricePerItem: '5.00', costPerItem: null, active: true },
        ],
      }),
      expectedVersion: changed.json().version,
    })
    expect(immutable.statusCode).toBe(409)
    const restored = await request('PATCH', `/v1/products/${created.id}`, {
      ...draft({
        variants: [
          { id: small.id, weightG: 100, pricePerItem: '5.00', costPerItem: null, active: true },
          { id: large.id, weightG: 500, pricePerItem: '18.00', costPerItem: '12.00', active: true },
        ],
      }),
      expectedVersion: changed.json().version,
    })
    expect(restored.statusCode).toBe(200)
    expect(restored.json().variants[1].archivedAt).toBeNull()
  })
  it('keeps archived categories readable, blocks new assignment, and safely deletes only unused records', async () => {
    const category = (
      await request('POST', '/v1/categories', { name: 'Wheat', description: null })
    ).json()
    const product = (
      await request('POST', '/v1/products', draft({ categoryId: category.id }))
    ).json()
    expect(
      (
        await request('DELETE', `/v1/categories/${category.id}`, {
          expectedVersion: category.version,
        })
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await request('POST', `/v1/categories/${category.id}/archive`, {
          expectedVersion: category.version,
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (await app.inject({ url: `/v1/products/${product.id}`, cookies })).json().categoryId,
    ).toBe(category.id)
    expect(
      (
        await request(
          'POST',
          '/v1/products',
          draft({ reference: 'WHT-002', categoryId: category.id }),
        )
      ).statusCode,
    ).toBe(409)
    const archived = (
      await request('POST', `/v1/products/${product.id}/archive`, {
        expectedVersion: product.version,
      })
    ).json()
    expect((await app.inject({ url: '/v1/products', cookies })).json()).toHaveLength(0)
    expect(
      (await app.inject({ url: '/v1/products?status=archived', cookies })).json(),
    ).toHaveLength(1)
    expect(
      (
        await request('POST', `/v1/products/${product.id}/restore`, {
          expectedVersion: archived.version,
        })
      ).statusCode,
    ).toBe(200)
    expect(
      (
        await request('DELETE', `/v1/products/${product.id}`, {
          expectedVersion: archived.version + 1,
        })
      ).statusCode,
    ).toBe(204)
    const currentCategory = (
      await app.inject({ url: `/v1/categories/${category.id}`, cookies })
    ).json()
    expect(
      (
        await request('DELETE', `/v1/categories/${category.id}`, {
          expectedVersion: currentCategory.version,
        })
      ).statusCode,
    ).toBe(204)
  })
  it('protects referenced product images, then releases them when detached', async () => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#fff' } })
      .png()
      .toBuffer()
    const image = await request('POST', '/v1/media/uploads', {
      purpose: 'product_image',
      originalFilename: 'wheat.png',
      contentType: 'image/png',
      data: bytes.toString('base64'),
    })
    expect(image.statusCode).toBe(201)
    const asset = image.json()
    const product = (
      await request('POST', '/v1/products', draft({ imageAssetId: asset.id }))
    ).json()
    expect(
      (await request('DELETE', `/v1/media/${asset.id}`, { expectedVersion: asset.version + 1 }))
        .statusCode,
    ).toBe(409)
    expect((await app.inject({ url: `/v1/media/${asset.id}/download`, cookies })).statusCode).toBe(
      200,
    )
    expect(
      (
        await request('PATCH', `/v1/products/${product.id}`, {
          ...draft({
            imageAssetId: null,
            variants: product.variants.map(
              (v: {
                id: string
                weightG: number
                pricePerItem: string
                costPerItem: string | null
              }) => ({
                id: v.id,
                weightG: v.weightG,
                pricePerItem: v.pricePerItem,
                costPerItem: v.costPerItem,
                active: true,
              }),
            ),
          }),
          expectedVersion: product.version,
        })
      ).statusCode,
    ).toBe(200)
    const metadata = (await app.inject({ url: `/v1/media/${asset.id}`, cookies })).json()
    expect(metadata.expiresAt).toBeTruthy()
  })
  it('rechecks role grants and requires full sessions', async () => {
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    expect((await request('POST', '/v1/products', draft())).statusCode).toBe(403)
    expect((await app.inject({ url: '/v1/products', cookies })).statusCode).toBe(403)
    await fixture.client`update users set must_change_password=true where id=${testUserId}`
    expect(
      (await request('POST', '/v1/categories', { name: 'No', description: null })).statusCode,
    ).toBe(403)
  })
})
