import { createHash, randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { OwnerOnboarding } from '../src/contracts/generated/identity/owner-onboarding.schemas.js'
import { attachTestDatabase, isolatedDatabase } from './helpers/postgres.js'

const ownerA = '22222222-2222-4222-8222-222222222222',
  ownerB = '55555555-5555-4555-8555-555555555555'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const headers = { origin: 'http://localhost:5173' }
describe('Owner onboarding persistence and isolation', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>,
    app: Awaited<ReturnType<typeof buildApp>>
  const objects = new Map<string, Uint8Array>()
  beforeEach(async () => {
    objects.clear()
    fixture = await isolatedDatabase()
    await fixture.client`insert into platform_users(id,email,password_hash,email_verified_at) values (${ownerA},'a@example.test','fixture',now()),(${ownerB},'b@example.test','fixture',now())`
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${ownerA},${hash('owner-a')},now()+interval '1 day'),(${ownerB},${hash('owner-b')},now()+interval '1 day')`
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: 'http://localhost:5173',
        CORS_ORIGIN: 'http://localhost:5173',
      }),
      logger: false,
      mediaStorage: {
        async putImmutable(i) {
          objects.set(i.key, i.bytes)
          return {
            key: i.key,
            contentType: i.contentType,
            byteSize: i.bytes.length,
            sha256: hash(Buffer.from(i.bytes).toString('base64')),
          }
        },
        async get(key) {
          const bytes = objects.get(key)
          if (!bytes) throw new Error('missing object')
          return bytes
        },
        async signedDownloadUrl() {
          return 'https://storage.invalid/private'
        },
        async deleteUnreferenced(key) {
          objects.delete(key)
        },
      },
    })
    attachTestDatabase(app, fixture)
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const request = (
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: Record<string, unknown>,
    token = 'owner-a',
  ) => app.inject({ method, url, headers, cookies: { slama_owner_session: token }, payload })
  const create = async (token = 'owner-a') => {
    const result = await request(
      'POST',
      '/api/v1/owner/organizations',
      { name: 'Atelier Atlas', requestId: randomUUID() },
      token,
    )
    expect(result.statusCode).toBe(201)
    return result.json<OwnerOnboarding>()
  }
  const save = (draft: OwnerOnboarding, token = 'owner-a') =>
    request(
      'PUT',
      `/api/v1/owner/organizations/${draft.organization.id}/onboarding`,
      { configuration: draft.configuration, currentStep: 6, expectedVersion: draft.version },
      token,
    )
  it('creates an idempotent independent setup with an independent administrator and optional company data', async () => {
    const requestId = randomUUID(),
      payload = { name: '  Atelier Atlas  ', requestId }
    const first = await request('POST', '/api/v1/owner/organizations', payload)
    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({
      organization: { id: requestId, name: 'Atelier Atlas', status: 'setup', staffCount: 1 },
      currentStep: 2,
      version: 1,
      completedAt: null,
      configuration: {
        company: {},
        defaults: { currency: 'MAD', language: 'fr', vatEnabled: false, vatRate: 0 },
      },
    })
    const second = await request('POST', '/api/v1/owner/organizations', payload)
    expect(second.json()).toEqual(first.json())
    expect(
      (
        await fixture.client`select count(*)::int n from organizations where owner_id <> '10000000-0000-4000-8000-000000000002'`
      )[0]!.n,
    ).toBe(1)
    expect((await fixture.client`select count(*)::int n from users`)[0]!.n).toBe(2)
    expect(
      (await request('POST', '/api/v1/owner/organizations', payload, 'owner-b')).statusCode,
    ).toBe(404)
    expect(
      (
        await request('POST', '/api/v1/owner/organizations', {
          ...payload,
          requestId: randomUUID(),
          name: '   ',
        })
      ).statusCode,
    ).toBe(400)
  })
  it('persists optional details, normalizes VAT, preserves drafts and prevents stale writes', async () => {
    const draft = await create()
    draft.configuration.company.phone = '06 12 34 56 78 / 05 22 34 56 78'
    draft.configuration.name = 'Atlas updated'
    draft.configuration.defaults.vatRate = 20
    const result = await save(draft)
    expect(result.statusCode).toBe(200)
    const updated = result.json<OwnerOnboarding>()
    expect(updated).toMatchObject({
      organization: { name: 'Atlas updated' },
      configuration: {
        company: { phone: '06 12 34 56 78 / 05 22 34 56 78' },
        defaults: { vatEnabled: false, vatRate: 0 },
      },
      version: 2,
      currentStep: 6,
    })
    expect((await save(draft)).statusCode).toBe(409)
    expect(
      (
        await request('GET', `/api/v1/owner/organizations/${draft.organization.id}/onboarding`)
      ).json(),
    ).toEqual(updated)
    const concurrent = await Promise.all([save(updated), save(updated)])
    expect(concurrent.map((r) => r.statusCode).sort()).toEqual([200, 409])
  })
  it('activates configuration once and queues invitations without duplicating staff or sending inline mail', async () => {
    const draft = await create()
    draft.configuration.invitations = [{ email: 'staff@example.test', role: 'staff' }]
    const saved = (await save(draft)).json<OwnerOnboarding>()
    const url = `/api/v1/owner/organizations/${saved.organization.id}/onboarding/complete`
    const finished = await request('POST', url, { expectedVersion: saved.version })
    expect(finished.statusCode, finished.body).toBe(200)
    expect(finished.json().completedAt).toBeTruthy()
    expect(finished.json().organization.status).toBe('active')
    expect((await request('POST', url, { expectedVersion: saved.version })).json()).toEqual(
      finished.json(),
    )
    expect((await save(finished.json<OwnerOnboarding>())).statusCode).toBe(409)
    expect((await fixture.client`select count(*)::int n from users`)[0]!.n).toBe(2)
    expect(
      await fixture.client`select email,delivery_state from staff_invitations where organization_id=${saved.organization.id}`,
    ).toEqual([{ email: 'staff@example.test', delivery_state: 'queued' }])
    expect((await fixture.client`select count(*)::int n from outbound_messages`)[0]!.n).toBe(0)
  })
  it('rejects duplicate/owner invitations and restricts every setup route to its owner and portal', async () => {
    const draft = await create()
    draft.configuration.invitations = [
      { email: 'STAFF@example.test', role: 'staff' },
      { email: 'staff@example.test', role: 'administrator' },
    ]
    expect((await save(draft)).statusCode).toBe(400)
    draft.configuration.invitations = [{ email: 'a@example.test', role: 'staff' }]
    expect((await save(draft)).statusCode).toBe(400)
    for (const method of ['GET', 'PUT'] as const)
      expect(
        (
          await request(
            method,
            `/api/v1/owner/organizations/${draft.organization.id}/onboarding`,
            method === 'PUT'
              ? { expectedVersion: 1, currentStep: 2, configuration: draft.configuration }
              : undefined,
            'owner-b',
          )
        ).statusCode,
      ).toBe(404)
    expect(
      (
        await request(
          'POST',
          `/api/v1/owner/organizations/${draft.organization.id}/onboarding/complete`,
          { expectedVersion: 1 },
          'owner-b',
        )
      ).statusCode,
    ).toBe(404)
    expect(
      (
        await request(
          'GET',
          `/api/v1/owner/organizations/${draft.organization.id}/onboarding`,
          undefined,
          'invalid',
        )
      ).statusCode,
    ).toBe(401)
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/owner/organizations',
          headers: { origin: 'https://foreign.example' },
          cookies: { slama_owner_session: 'owner-a' },
          payload: { name: 'Forbidden', requestId: randomUUID() },
        })
      ).statusCode,
    ).toBe(403)
  })
  it('normalizes and isolates brand images, rejecting foreign and wrong-purpose attachments', async () => {
    const a = await create(),
      b = await create('owner-b')
    const png = await sharp({ create: { width: 4, height: 3, channels: 4, background: '#a77b28' } })
      .png()
      .toBuffer()
    const body = {
      purpose: 'company_logo',
      originalFilename: 'logo.png',
      contentType: 'image/png',
      data: png.toString('base64'),
    }
    const uploaded = await request(
      'POST',
      `/api/v1/owner/organizations/${a.organization.id}/branding`,
      body,
    )
    expect(uploaded.statusCode).toBe(201)
    const asset = uploaded.json<{ id: string }>()
    expect([...objects.keys()][0]).toContain(
      `/organizations/`.slice(1) + a.organization.id + '/branding/',
    )
    const url = `/api/v1/owner/organizations/${a.organization.id}/branding/${asset.id}`
    expect((await request('GET', url)).json().data).toBeTruthy()
    expect((await request('GET', url, undefined, 'owner-b')).statusCode).toBe(404)
    b.configuration.branding.logoAssetId = asset.id
    expect((await save(b, 'owner-b')).statusCode).toBe(404)
    a.configuration.branding.signatureAssetId = asset.id
    expect((await save(a)).statusCode).toBe(400)
    a.configuration.branding.signatureAssetId = null
    a.configuration.branding.logoAssetId = asset.id
    expect((await save(a)).statusCode).toBe(200)
    expect(
      (
        await request('POST', `/api/v1/owner/organizations/${a.organization.id}/branding`, {
          ...body,
          data: Buffer.from('<svg/>').toString('base64'),
        })
      ).statusCode,
    ).toBe(400)
  })
  it('enforces profile row isolation for the non-bypass runtime role', async () => {
    const a = await create(),
      b = await create('owner-b')
    await fixture.client.unsafe(
      `GRANT SELECT,INSERT ON roles,role_permissions,company_settings,notification_rules,permissions,owner_subscriptions,subscription_plans TO "${fixture.role}"`,
    )
    await fixture.client.unsafe(`GRANT SELECT,INSERT ON organizations TO "${fixture.role}"`)
    await fixture.client.unsafe(
      `GRANT SELECT,INSERT,UPDATE ON organization_profiles TO "${fixture.role}"`,
    )
    await fixture.client.unsafe(
      `GRANT UPDATE(name,locale,updated_at) ON organizations TO "${fixture.role}"`,
    )
    await fixture.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE "${fixture.role}"`))
      expect((await tx.execute(sql`select * from organization_profiles`)).length).toBe(0)
      await tx.execute(
        sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${ownerA},true)`,
      )
      const rows = await tx.execute(sql`select organization_id from organization_profiles`)
      const createdId = randomUUID()
      await tx.execute(
        sql`insert into organizations(id,owner_id,name,slug) values (${createdId},${ownerA},'Runtime setup',${'runtime-' + createdId})`,
      )
      await tx.execute(
        sql`insert into organization_profiles(organization_id,configuration) values (${createdId},${JSON.stringify(a.configuration)}::jsonb)`,
      )
      expect(
        (
          await tx.execute(
            sql`update organizations set name='Runtime renamed' where id=${createdId} returning name`,
          )
        )[0]!.name,
      ).toBe('Runtime renamed')
      expect(rows).toHaveLength(1)
      expect(rows[0]!.organization_id).toBe(a.organization.id)
      expect(
        (
          await tx.execute(
            sql`update organization_profiles set current_step=3 where organization_id=${b.organization.id} returning organization_id`,
          )
        ).length,
      ).toBe(0)
    })
  })
})
