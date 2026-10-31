import { createHash, randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/organization/identity/auth/services/password.service.js'
import { createIdentityModule } from '../src/modules/organization/identity/index.js'
import { attachTestDatabase, isolatedDatabase } from './helpers/postgres.js'

const ownerA = '22222222-2222-4222-8222-222222222222'
const ownerB = '55555555-5555-4555-8555-555555555555'
const orgA = '33333333-3333-4333-8333-333333333333'
const orgB = '44444444-4444-4444-8444-444444444444'
const orgC = '66666666-6666-4666-8666-666666666666'
const ownerToken = 'owner-token-for-a'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const headers = { origin: 'http://localhost:5173' }

describe('Owner organization portal and shared authorization', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`insert into platform_users(id,email,password_hash,email_verified_at) values (${ownerA},'owner-a@example.test','test-only',now()),(${ownerB},'owner-b@example.test','test-only',now())`
    await fixture.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${orgA},${ownerA},'Slama Agricole','slama-agricole',now()),(${orgB},${ownerA},'Atlas','atlas',now()),(${orgC},${ownerB},'Private company','private-company',now())`
    await fixture.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${ownerA},${hash(ownerToken)},now()+interval '1 day')`
    app = await buildApp({
      environment: loadEnvironment({
        NODE_ENV: 'test',
        OWNER_AUTH_ENABLED: 'true',
        OWNER_PORTAL_ORIGIN: 'http://localhost:5173',
        CORS_ORIGIN: 'http://localhost:5173,http://localhost:5174',
      }),
      logger: false,
    })
    attachTestDatabase(app, fixture)
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const get = (url: string, token = ownerToken) =>
    app.inject({ method: 'GET', url, headers, cookies: { slama_owner_session: token } })
  const identity = () =>
    createIdentityModule({
      database: () => fixture.db,
      ttlDays: 30,
      secure: false,
    }).publicApi

  it('lists only owned organizations with real search, pagination and staff counts', async () => {
    await fixture.client`insert into users(organization_id,email,password_hash,archived_at) values (${orgA},'current@example.test','test',null),(${orgA},'archived@example.test','test',now())`
    const result = await get('/v1/owner/organizations?pageSize=1')
    expect(result.statusCode).toBe(200)
    expect(result.json()).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(result.json().items).toHaveLength(1)
    const filtered = await get('/v1/owner/organizations?q=Slama')
    expect(filtered.json()).toMatchObject({
      total: 1,
      items: [{ id: orgA, name: 'Slama Agricole', status: 'active', staffCount: 1 }],
    })
    expect((await get('/v1/owner/organizations?q=Private')).json().total).toBe(0)
    expect((await get(`/v1/owner/organizations/${orgC}`)).statusCode).toBe(404)
    expect((await get(`/v1/owner/organizations/${randomUUID()}`)).statusCode).toBe(404)
    expect((await get(`/v1/owner/organizations/${orgA}`)).body).not.toMatch(
      /ownerId|passwordHash|tokenHash/,
    )
  })

  it('keeps blocked metadata manageable while reporting the correct status', async () => {
    await fixture.client`update organizations set paused_at=now(),suspended_at=now(),deletion_requested_at=now(),deletion_due_at=now()+interval '30 days' where id=${orgA}`
    expect((await get(`/v1/owner/organizations/${orgA}`)).json().status).toBe('pending_deletion')
    expect((await get('/v1/owner/organizations?status=pending_deletion')).json().total).toBe(1)
    await fixture.client`update organizations set deletion_requested_at=null,deletion_due_at=null where id=${orgA}`
    expect((await get(`/v1/owner/organizations/${orgA}`)).json().status).toBe('suspended')
  })

  it('requires owner authentication and rejects another tenant origin', async () => {
    expect((await get('/v1/owner/organizations', 'invalid')).statusCode).toBe(401)
    const foreign = await app.inject({
      method: 'GET',
      url: '/v1/owner/organizations',
      headers: { origin: 'http://localhost:5174' },
      cookies: { slama_owner_session: ownerToken },
    })
    expect(foreign.statusCode).toBe(403)
    expect(foreign.json().code).toBe('UNTRUSTED_ORIGIN')
  })

  it('enforces owner-read RLS even when the query has no owner filter', async () => {
    await fixture.client.unsafe(`GRANT SELECT ON organizations TO "${fixture.role}"`)
    await fixture.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local role "${fixture.role}"`))
      await tx.execute(sql`select set_config('app.organization_id','',true)`)
      expect(await tx.execute(sql`select id from organizations`)).toHaveLength(0)
      await tx.execute(
        sql`select set_config('app.actor_type','owner',true),set_config('app.owner_id',${ownerA},true)`,
      )
      const rows = await tx.execute(sql`select id from organizations order by id`)
      expect(rows.map((r) => r.id)).toEqual([orgA, orgB])
      await tx.execute(sql`select set_config('app.actor_type','staff',true)`)
      expect(await tx.execute(sql`select id from organizations`)).toHaveLength(0)
    })
  })

  it('never accepts a platform owner session as an organization staff credential', async () => {
    const api = identity()
    expect(
      await api.authorizeOrganization({
        organizationId: orgA,
        identityType: 'owner',
        token: ownerToken,
        permission: 'invoices.read',
      }),
    ).toBeNull()
    expect(
      await api.authorizeOrganization({
        organizationId: orgA,
        identityType: 'staff',
        token: ownerToken,
        permission: 'invoices.read',
      }),
    ).toBeNull()
    expect((await get('/v1/owner/organizations')).statusCode).toBe(200)
  })

  it('checks staff role grants and organization-bound sessions without owner fallback', async () => {
    const [staff] =
      await fixture.client`insert into users(organization_id,email,password_hash,must_change_password) values (${orgA},'sara@example.test',${await createPasswordService().hash('sara-password-2026')},false) returning id`
    const token = 'scoped-staff-token'
    await fixture.client`insert into sessions(organization_id,user_id,token_hash,expires_at) values (${orgA},${staff!.id},${hash(token)},now()+interval '1 day')`
    const [role] =
      await fixture.client`insert into roles(organization_id,key,name) values (${orgA},'reader','Reader') returning id`
    await fixture.client`insert into user_roles(organization_id,user_id,role_id) values (${orgA},${staff!.id},${role!.id})`
    await fixture.client`insert into role_permissions(organization_id,role_id,permission_id) select ${orgA},${role!.id},id from permissions where key='invoices.read'`
    const api = identity()
    const input = {
      organizationId: orgA,
      identityType: 'staff' as const,
      token,
      permission: 'invoices.read',
    }
    expect(await api.authorizeOrganization(input)).toEqual({
      organizationId: orgA,
      actor: { type: 'staff', id: staff!.id },
    })
    expect(await api.authorizeOrganization({ ...input, organizationId: orgB })).toBeNull()
    expect(await api.authorizeOrganization({ ...input, permission: 'invoices.delete' })).toBeNull()
    expect(await api.authorizeOrganization({ ...input, identityType: 'owner' })).toBeNull()
  })
})
