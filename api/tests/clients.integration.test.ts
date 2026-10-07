import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const individual = (changes: Record<string, unknown> = {}) => ({
  type: 'individual',
  firstName: ' Sara ',
  lastName: ' Amrani ',
  legalName: null,
  tradeName: null,
  contactName: null,
  email: null,
  phone: null,
  ice: null,
  taxIdentifier: null,
  registrationNumber: null,
  registrationCity: null,
  professionalTaxNumber: null,
  addressLine1: ' 12 Rue Atlas ',
  addressLine2: null,
  city: ' Rabat ',
  postalCode: '10000',
  countryCode: 'MA',
  deliveryAddressLine1: null,
  deliveryAddressLine2: null,
  deliveryCity: null,
  deliveryPostalCode: null,
  deliveryCountryCode: null,
  locale: 'fr-MA',
  notes: null,
  ...changes,
})
const company = (changes: Record<string, unknown> = {}) =>
  individual({
    type: 'company',
    firstName: null,
    lastName: null,
    legalName: ' Atlas SARL ',
    tradeName: 'Atlas',
    contactName: 'Manager',
    ice: '000123456789012',
    taxIdentifier: '00045',
    registrationNumber: '42',
    registrationCity: 'Casablanca',
    professionalTaxNumber: '00091',
    email: ' OFFICE@ATLAS.MA ',
    ...changes,
  })

describe('Clients module', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  beforeEach(async () => {
    fixture = await isolatedDatabase()
    const hash = await createPasswordService().hash('clients-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    app = await buildApp({ environment: loadEnvironment({ NODE_ENV: 'test' }), logger: false })
    app.database = () => fixture.db
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'clients-password-123' },
    })
    cookies = { slama_session: login.cookies[0]!.value }
  })
  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })
  const request = (method: 'POST' | 'PATCH' | 'DELETE', url: string, payload: object) =>
    app.inject({ method, url, headers, cookies, payload })

  it('creates both types, normalizes fields, and paginates searchable active clients', async () => {
    const person = await request('POST', '/v1/clients', individual())
    expect(person.statusCode).toBe(201)
    expect(person.json()).toMatchObject({
      displayName: 'Sara Amrani',
      email: null,
      city: 'Rabat',
      deliveryAddressLine1: null,
    })
    const business = await request('POST', '/v1/clients', company({ email: 'office@atlas.ma' }))
    expect(business.statusCode).toBe(201)
    expect(business.json()).toMatchObject({
      displayName: 'Atlas SARL',
      ice: '000123456789012',
      email: 'office@atlas.ma',
    })
    const page = await app.inject({
      url: '/v1/clients?limit=1&offset=0&type=company&q=000123',
      cookies,
    })
    expect(page.json()).toMatchObject({
      total: 1,
      limit: 1,
      offset: 0,
      items: [{ id: business.json().id }],
    })
    expect((await app.inject({ url: '/v1/clients?q=%25', cookies })).json().total).toBe(0)
  })

  it('rejects incompatible identities, incomplete RC and delivery addresses, and invalid phone', async () => {
    expect(
      (await request('POST', '/v1/clients', individual({ ice: '000123456789012' }))).statusCode,
    ).toBe(400)
    expect(
      (await request('POST', '/v1/clients', company({ registrationCity: null }))).statusCode,
    ).toBe(400)
    expect(
      (await request('POST', '/v1/clients', company({ deliveryAddressLine1: 'Warehouse' })))
        .statusCode,
    ).toBe(400)
    expect(
      (await request('POST', '/v1/clients', individual({ phone: 'bad-phone' }))).statusCode,
    ).toBe(400)
    expect(
      (await request('POST', '/v1/clients', individual({ email: 'not-email' }))).statusCode,
    ).toBe(400)
    await expect(
      fixture.client`insert into clients (type, first_name, last_name, address_line1, city) values ('individual', null, 'Amrani', 'Street', 'Rabat')`,
    ).rejects.toThrow()
  })

  it('updates full identity atomically, preserves versions, and archives without deleting', async () => {
    const created = (await request('POST', '/v1/clients', individual())).json()
    const changed = await request('PATCH', `/v1/clients/${created.id}`, {
      ...company({
        email: 'billing@atlas.ma',
        deliveryAddressLine1: 'Warehouse',
        deliveryCity: 'Temara',
        deliveryCountryCode: 'MA',
      }),
      expectedVersion: created.version,
    })
    expect(changed.statusCode).toBe(200)
    expect(changed.json()).toMatchObject({
      type: 'company',
      firstName: null,
      displayName: 'Atlas SARL',
      deliveryCity: 'Temara',
      version: 2,
    })
    expect(
      (await request('PATCH', `/v1/clients/${created.id}`, { notes: 'stale', expectedVersion: 1 }))
        .statusCode,
    ).toBe(409)
    const archived = await request('POST', `/v1/clients/${created.id}/archive`, {
      expectedVersion: 2,
    })
    expect(archived.statusCode).toBe(200)
    expect((await app.inject({ url: '/v1/clients', cookies })).json().total).toBe(0)
    expect((await app.inject({ url: `/v1/clients/${created.id}`, cookies })).statusCode).toBe(200)
    expect(
      (await request('PATCH', `/v1/clients/${created.id}`, { notes: 'no', expectedVersion: 3 }))
        .statusCode,
    ).toBe(409)
    expect(
      (await request('POST', `/v1/clients/${created.id}/restore`, { expectedVersion: 3 }))
        .statusCode,
    ).toBe(200)
  })

  it('enforces granular permissions', async () => {
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    expect((await app.inject({ url: '/v1/clients', cookies })).statusCode).toBe(403)
    expect((await request('POST', '/v1/clients', individual())).statusCode).toBe(403)
    await fixture.client`insert into roles (key,name) values ('client_reader','Client reader')`
    await fixture.client`insert into role_permissions (role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.key='client_reader' and p.key='clients.read'`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='client_reader'`
    expect((await app.inject({ url: '/v1/clients', cookies })).statusCode).toBe(200)
    expect((await request('POST', '/v1/clients', individual())).statusCode).toBe(403)
  })
  it('deletes unattached clients but rejects stale versions and attached records', async () => {
    const unused = (await request('POST', '/v1/clients', individual())).json()
    expect(
      (await request('DELETE', `/v1/clients/${unused.id}`, { expectedVersion: 99 })).statusCode,
    ).toBe(409)
    expect(
      (await request('DELETE', `/v1/clients/${unused.id}`, { expectedVersion: unused.version }))
        .statusCode,
    ).toBe(204)
    expect((await app.inject({ url: `/v1/clients/${unused.id}`, cookies })).statusCode).toBe(404)
    const attached = (
      await request('POST', '/v1/clients', company({ email: 'office@atlas.ma' }))
    ).json()
    await fixture.client`create table client_document_links (id uuid primary key default gen_random_uuid(), client_id uuid not null references clients(id) on delete restrict)`
    await fixture.client`insert into client_document_links (client_id) values (${attached.id})`
    expect(
      (await request('DELETE', `/v1/clients/${attached.id}`, { expectedVersion: attached.version }))
        .statusCode,
    ).toBe(409)
    expect((await app.inject({ url: `/v1/clients/${attached.id}`, cookies })).statusCode).toBe(200)
  })
})
