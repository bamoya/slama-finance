import { createHash, randomUUID } from 'node:crypto'

import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { CreateStaffInvitationSchema } from '../src/contracts/generated/identity/staff-invitations.schemas.js'
import type { OrganizationInvitationDelivery } from '../src/integrations/contracts.js'
import { inTenantScope, tenantDatabase } from '../src/lib/tenant-database.js'
import { createIdentityModule } from '../src/modules/organization/identity/index.js'
import { createSubscriptionsModule } from '../src/modules/platform/subscriptions/index.js'
import {
  attachTestDatabase,
  isolatedDatabase,
  testOrganizationId,
  testOwnerId,
  testUserId,
} from './helpers/postgres.js'

const origin = 'http://localhost:5173',
  sessionToken = 's'.repeat(43),
  hash = (value: string) => createHash('sha256').update(value).digest('hex')
describe('Organization staff invitations', () => {
  let f: Awaited<ReturnType<typeof isolatedDatabase>>,
    app: Awaited<ReturnType<typeof buildApp>>,
    identity: ReturnType<typeof createIdentityModule>
  let mail: Parameters<OrganizationInvitationDelivery['send']>[0][],
    failDelivery: boolean,
    adminRole: string
  // The final-seat test needs the trial owner (two staff seats); the others use paid coverage.
  const trialOwner = new Set([
    'atomically admits just one invitation at the final seat and rejects later token replay',
  ])
  beforeEach(async ({ task }) => {
    f = await isolatedDatabase({ owner: trialOwner.has(task.name) ? 'trial' : 'paid' })
    mail = []
    failDelivery = false
    const [role] =
      await f.client`select id from roles where organization_id=${testOrganizationId} and key='admin'`
    adminRole = role!.id
    await f.client`insert into user_roles(user_id,role_id) values (${testUserId},${adminRole})`
    await f.client`insert into sessions(user_id,token_hash,expires_at) values (${testUserId},${hash(sessionToken)},now()+interval '1 day')`
    const delivery: OrganizationInvitationDelivery = {
      async send(input) {
        mail.push(input)
        if (failDelivery) throw Error('test transport failure')
      },
    }
    app = await buildApp({
      logger: false,
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      organizationInvitationDelivery: delivery,
    })
    attachTestDatabase(app, f)
    const db = () => tenantDatabase(f.db, testOrganizationId)
    identity = createIdentityModule({
      database: db,
      subscriptions: createSubscriptionsModule(db).publicApi,
      invitationDelivery: delivery,
      organizationOrigin: async () => origin,
      ttlDays: 14,
      secure: false,
    })
  })
  afterEach(async () => {
    await app?.close()
    await f?.cleanup()
  })
  const post = (path: string, payload?: object) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/staff/invitations${path}`,
      headers: { origin },
      cookies: { slama_staff_session: sessionToken },
      payload,
    })
  const publicPost = (action: string, token: string, extra = {}, org = testOrganizationId) =>
    app.inject({
      method: 'POST',
      url: `/api/v1/organization-auth/invitations/${action}`,
      headers: { origin, 'x-organization-id': org },
      payload: { token, ...extra },
    })
  const create = async (email = 'invite@example.test', roleIds: string[] = [adminRole]) => {
    const r = await post('', { email, roleIds })
    expect(r.statusCode, r.body).toBe(201)
    return r.json()
  }
  const run = () => inTenantScope(testOrganizationId, () => identity.invitations.runOne())
  const rawToken = (index = 0) =>
    new URLSearchParams(new URL(mail[index]!.url).hash.slice(1)).get('token')!
  const details = { firstName: 'Sara', lastName: 'Amrani', password: 'invited-password-2026' }

  it('delivers a hashed one-use token and creates an independent organization account with chosen roles', async () => {
    const invitation = await create()
    expect(invitation.expiresAt).toBeNull()
    expect(invitation.delivery.state).toBe('queued')
    expect((await f.client`select count(*)::int n from users`)[0]!.n).toBe(1)
    await run()
    expect(mail).toHaveLength(1)
    expect(mail[0]!.language).toBe('fr')
    const token = rawToken(),
      [stored] =
        await f.client`select token_hash,expires_at from staff_invitations where id=${invitation.id}`
    expect(stored!.token_hash).toBe(hash(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(new URL(mail[0]!.url).search).toBe('')
    expect(new URL(mail[0]!.url).pathname).toBe('/accept-invitation')
    expect((await publicPost('inspect', token)).json()).toMatchObject({
      organizationName: 'Fixture',
      email: invitation.email,
    })
    const accepted = await publicPost('accept', token, details)
    expect(accepted.statusCode, accepted.body).toBe(200)
    expect(accepted.cookies).toHaveLength(0)
    expect((await publicPost('accept', token, details)).json().code).toBe('INVITATION_ALREADY_USED')
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/organization-auth/login',
      headers: { origin, 'x-organization-id': testOrganizationId },
      payload: { email: invitation.email, password: details.password },
    })
    expect(login.statusCode, login.body).toBe(200)
    expect(login.json().purpose).toBe('full')
    expect(login.json().permissionKeys).toContain('staff.create')
  })
  it('rejects expired, revoked and rotated tokens; resends are throttled and revocation is idempotent', async () => {
    const row = await create()
    await run()
    const old = rawToken()
    expect((await post(`/${row.id}/resend`)).statusCode).toBe(429)
    await f.client`update staff_invitations set updated_at=now()-interval '2 minutes', expires_at=now()-interval '1 second' where id=${row.id}`
    expect((await publicPost('inspect', old)).json().code).toBe('INVITATION_EXPIRED')
    expect((await post(`/${row.id}/resend`)).statusCode).toBe(200)
    expect((await publicPost('inspect', old)).json().code).toBe('INVALID_INVITATION_TOKEN')
    await run()
    expect(mail).toHaveLength(2)
    expect(rawToken(1)).not.toBe(old)
    expect((await post(`/${row.id}/revoke`)).json().status).toBe('revoked')
    expect((await post(`/${row.id}/revoke`)).json().status).toBe('revoked')
    expect((await publicPost('accept', rawToken(1), details)).json().code).toBe(
      'INVITATION_REVOKED',
    )
  })
  it('bounds retries and rotates tokens after a transport failure without business-email quota consumption', async () => {
    await create()
    failDelivery = true
    await run()
    const failedToken = rawToken()
    expect(
      (await f.client`select attempts,delivery_state from staff_invitations`)[0],
    ).toMatchObject({ attempts: 1, delivery_state: 'queued' })
    await f.client`update staff_invitations set available_at=now()`
    failDelivery = false
    await run()
    expect(rawToken(1)).not.toBe(failedToken)
    expect((await publicPost('inspect', failedToken)).statusCode).toBe(400)
    expect(
      (await f.client`select attempts,delivery_state from staff_invitations`)[0],
    ).toMatchObject({ attempts: 2, delivery_state: 'sent' })
    expect((await f.client`select count(*)::int n from outbound_messages`)[0]!.n).toBe(0)
    expect((await f.client`select count(*)::int n from subscription_emails`)[0]!.n).toBe(0)
  })
  it('never overwrites accounts and prevents duplicate pending invitations', async () => {
    expect((await post('', { email: 'operator@example.test' })).statusCode).toBe(409)
    const row = await create(' SARA@example.test ', [])
    expect(row.email).toBe('sara@example.test')
    expect((await post('', { email: 'sara@example.test' })).statusCode).toBe(409)
    await run()
    await f.client`insert into users(email,password_hash,must_change_password) values ('sara@example.test','untouched',false)`
    expect((await publicPost('accept', rawToken(), details)).json().code).toBe('DUPLICATE_RECORD')
    expect(
      (await f.client`select password_hash from users where email='sara@example.test'`)[0]!
        .password_hash,
    ).toBe('untouched')
  })
  it('revalidates inviter status and deleted roles before acceptance', async () => {
    const roleId = randomUUID()
    await f.client`insert into roles(id,key,name) values (${roleId},'invited','Invited')`
    await create('role@example.test', [roleId])
    await run()
    await f.client`delete from roles where id=${roleId}`
    expect((await publicPost('accept', rawToken(), details)).json().code).toBe('FORBIDDEN')
    await create('disabled@example.test', [])
    await run()
    await f.client`update users set disabled_at=now() where id=${testUserId}`
    expect((await publicPost('accept', rawToken(1), details)).json().code).toBe('FORBIDDEN')
  })
  it('isolates tenant tokens and denies owner cookies access to management', async () => {
    const row = await create()
    await run()
    const other = randomUUID()
    await f.client`insert into organizations(id,owner_id,name,slug,activated_at) values (${other},${testOwnerId},'Other','other',now())`
    expect((await publicPost('inspect', rawToken(), {}, other)).statusCode).toBe(400)
    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/staff/invitations/${row.id}/revoke`,
      headers: { origin, 'x-organization-id': other },
      cookies: { slama_staff_session: sessionToken },
    })
    expect(response.statusCode).toBe(403)
    const ownerToken = 'o'.repeat(43)
    await f.client`insert into owner_sessions(owner_id,token_hash,expires_at) values (${testOwnerId},${hash(ownerToken)},now()+interval '1 day')`
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/staff/invitations',
          cookies: { slama_owner_session: ownerToken },
        })
      ).statusCode,
    ).toBe(403)
    const [schema] = await f.client`select current_schema() n`
    await f.client.unsafe(`GRANT USAGE ON SCHEMA "${schema!.n}" TO "${f.role}"`)
    await f.client.unsafe(`GRANT SELECT ON "${schema!.n}".staff_invitations TO "${f.role}"`)
    const count = await f.db.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local role "${f.role}"`))
      await tx.execute(sql`select set_config('app.organization_id',${other},true)`)
      return tx.execute(sql`select count(*)::int n from staff_invitations`)
    })
    expect(count[0]!.n).toBe(0)
  })
  it('atomically admits just one invitation at the final seat and rejects later token replay', async () => {
    await create('one@example.test', [])
    await create('two@example.test', [])
    await run()
    await run()
    const outcomes = await Promise.all([
      publicPost('accept', rawToken(), details),
      publicPost('accept', rawToken(1), details),
    ])
    expect(outcomes.map((r) => r.statusCode).sort()).toEqual([200, 409])
    expect(outcomes.find((r) => r.statusCode === 409)!.json().code).toBe('STAFF_LIMIT')
    const acceptedIndex = outcomes.findIndex((r) => r.statusCode === 200)
    expect((await publicPost('accept', rawToken(acceptedIndex), details)).json().code).toBe(
      'INVITATION_ALREADY_USED',
    )
    expect((await f.client`select count(*)::int n from users`)[0]!.n).toBe(2)
  })
  it('consumes the same invitation only once under concurrent acceptance', async () => {
    await create('race@example.test', [])
    await run()
    const token = rawToken()
    const responses = await Promise.all([
      publicPost('accept', token, details),
      publicPost('accept', token, details),
    ])
    expect(responses.map((r) => r.statusCode).sort()).toEqual([200, 410])
    expect(responses.find((r) => r.statusCode === 410)!.json().code).toBe('INVITATION_ALREADY_USED')
    expect(
      (await f.client`select count(*)::int n from users where email='race@example.test'`)[0]!.n,
    ).toBe(1)
  })
  it('prevents a delegated inviter escalating roles and rechecks authority after revocation', async () => {
    const manager = randomUUID(),
      role = randomUUID(),
      cookie = 'm'.repeat(43)
    await f.client`insert into users(id,email,password_hash,must_change_password) values (${manager},'manager@example.test','not-a-login',false)`
    await f.client`insert into roles(id,key,name) values (${role},'manager','Manager')`
    await f.client`insert into role_permissions(role_id,permission_id) select ${role},id from permissions where key in ('staff.create','roles.update')`
    await f.client`insert into user_roles(user_id,role_id) values (${manager},${role})`
    await f.client`insert into sessions(user_id,token_hash,expires_at) values (${manager},${hash(cookie)},now()+interval '1 day')`
    const send = (roleIds: string[]) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/staff/invitations',
        headers: { origin },
        cookies: { slama_staff_session: cookie },
        payload: { email: 'delegated@example.test', roleIds },
      })
    expect((await send([adminRole])).statusCode).toBe(403)
    expect((await send([])).statusCode).toBe(201)
    await run()
    await f.client`delete from user_roles where user_id=${manager}`
    expect((await publicPost('accept', rawToken(), details)).json().code).toBe('FORBIDDEN')
  })
  it('rejects suspended organizations and malformed public tokens', async () => {
    await create()
    await run()
    await f.client`update organizations set paused_at=now() where id=${testOrganizationId}`
    expect((await publicPost('accept', rawToken(), details)).json().code).toBe(
      'ORGANIZATION_SUSPENDED',
    )
    expect((await publicPost('inspect', 'malformed')).statusCode).toBe(400)
    expect(CreateStaffInvitationSchema.parse({ email: 'new@example.test' })).toEqual({
      email: 'new@example.test',
      roleIds: [],
      language: 'fr',
    })
  })
})
