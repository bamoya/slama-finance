import { randomUUID } from 'node:crypto'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { companyDate } from '../src/lib/validation.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const atlasId = '33333333-3333-4333-8333-333333333333'
const otherId = '44444444-4444-4444-8444-444444444444'
const storage: ObjectStorage = {
  async putImmutable() {
    throw new Error('Not used')
  },
  async get() {
    throw new Error('Not used')
  },
  async deleteUnreferenced() {},
  async signedDownloadUrl() {
    throw new Error('Not used')
  },
  async list() {
    return []
  },
}
const shift = (date: string, days: number) => {
  const value = new Date(`${date}T12:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

describe('Sales search and client overview', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let today: string
  let invoiceId: string
  let invoiceNumber: string

  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })
  const get = (url: string) => app.inject({ url, cookies })

  beforeEach(async () => {
    fixture = await isolatedDatabase()
    await fixture.client`update company_settings set legal_name='Slama Agricole', address_line1='Rue Atlas', city='Casablanca' where id=1`
    await fixture.client`insert into clients (id,type,legal_name,trade_name,address_line1,city) values (${atlasId},'company','Atlas SARL','Atlas Trade','Rue Hassan','Rabat'), (${otherId},'company','Beta SARL',null,'Rue 2','Fes')`
    const hash = await createPasswordService().hash('queries-password-123')
    await fixture.client`update users set password_hash=${hash} where id=${testUserId}`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='admin'`
    app = await buildApp({
      environment: loadEnvironment({ NODE_ENV: 'test' }),
      logger: false,
      mediaStorage: storage,
    })
    app.database = () => fixture.db
    const login = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers,
      payload: { email: 'operator@example.test', password: 'queries-password-123' },
    })
    expect(login.statusCode).toBe(200)
    cookies = { slama_session: login.cookies[0]!.value }
    today = companyDate(new Date())
    const draft = await post('/v1/invoices', {
      clientId: atlasId,
      templateId: null,
      issueDate: shift(today, -2),
      dueDate: shift(today, -1),
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'Wheat',
          quantity: 1,
          unitPrice: '100.00',
          vatRate: null,
        },
      ],
    })
    expect(draft.statusCode, JSON.stringify(draft.json())).toBe(201)
    invoiceId = draft.json().id
    const issued = await post(`/v1/invoices/${invoiceId}/issue`, { expectedVersion: 1 })
    expect(issued.statusCode, JSON.stringify(issued.json())).toBe(200)
    invoiceNumber = issued.json().number
  })

  afterEach(async () => {
    await app?.close()
    await fixture?.cleanup()
  })

  const cheque = () => ({
    operationId: randomUUID(),
    invoiceId,
    amount: '30.00',
    currency: 'MAD',
    method: 'cheque',
    status: 'pending',
    paymentDate: today,
    collectedOn: null,
    bankAccountId: null,
    reference: null,
    chequeBank: 'Atlas Bank',
    chequeNumber: randomUUID(),
  })

  it.each(['invoices', 'estimates', 'delivery-notes'] as const)(
    'refreshes %s client identity at draft save/finalization and freezes it afterward',
    async (resource) => {
      const table = resource === 'delivery-notes' ? 'delivery_notes' : resource
      const source = (await get(`/v1/invoices/${invoiceId}`)).json()
      const input =
        resource === 'delivery-notes'
          ? {
              clientId: atlasId,
              invoiceId,
              deliveryDate: today,
              deliveryAddress: 'Custom delivery destination',
              instructions: null,
              includeReceptionSignature: true,
              lines: [
                {
                  sourceInvoiceLineId: source.lines[0].id,
                  productVariantId: null,
                  productName: 'Wheat',
                  quantity: 1,
                },
              ],
            }
          : {
              clientId: atlasId,
              templateId: null,
              issueDate: today,
              ...(resource === 'invoices'
                ? { dueDate: shift(today, 7) }
                : { validUntil: shift(today, 7) }),
              notes: null,
              paymentTerms: null,
              lines: [
                {
                  productVariantId: null,
                  productName: 'Wheat',
                  quantity: 1,
                  unitPrice: '100.00',
                  vatRate: null,
                },
              ],
            }
      await fixture.client`update clients set legal_name='Name at creation', trade_name=null where id=${atlasId}`
      const created = await post(`/v1/${resource}`, input)
      expect(created.statusCode, created.body).toBe(201)
      const id = created.json().id
      const snapshot = async () =>
        (
          await fixture.client`select client_snapshot from ${fixture.client(table)} where id=${id}`
        )[0]!.client_snapshot
      expect((await snapshot()).legalName).toBe('Name at creation')
      await fixture.client`update clients set legal_name='Name at draft save' where id=${atlasId}`
      const saved = await app.inject({
        method: 'PATCH',
        url: `/v1/${resource}/${id}`,
        headers,
        cookies,
        payload: { ...input, expectedVersion: created.json().version },
      })
      expect(saved.statusCode, saved.body).toBe(200)
      expect((await snapshot()).legalName).toBe('Name at draft save')
      await fixture.client`update clients set legal_name='Name at finalization', email='current@example.test' where id=${atlasId}`
      const finalized = await post(
        `/v1/${resource}/${id}/${resource === 'delivery-notes' ? 'prepare' : 'issue'}`,
        { expectedVersion: saved.json().version },
      )
      expect(finalized.statusCode, finalized.body).toBe(200)
      expect(await snapshot()).toMatchObject({
        legalName: 'Name at finalization',
        email: 'current@example.test',
      })
      if (resource === 'delivery-notes')
        expect(finalized.json().deliveryAddress).toBe('Custom delivery destination')
      else expect(finalized.json().total).toBe(saved.json().total)
      await fixture.client`update clients set legal_name='Later profile rename' where id=${atlasId}`
      await get(`/v1/${resource}/${id}`)
      expect((await snapshot()).legalName).toBe('Name at finalization')
      const forbidden = await app.inject({
        method: 'PATCH',
        url: `/v1/${resource}/${id}`,
        headers,
        cookies,
        payload: { ...input, expectedVersion: finalized.json().version },
      })
      expect(forbidden.statusCode).toBe(409)
      expect((await snapshot()).legalName).toBe('Name at finalization')
      // The source invoice stays frozen even while its new delivery note evolves.
      const [original] =
        await fixture.client`select client_snapshot from invoices where id=${invoiceId}`
      expect(original!.client_snapshot.legalName).toBe('Atlas SARL')
    },
  )

  it('filters matching counts and returns real financial and related activity', async () => {
    const estimate = await post('/v1/estimates', {
      clientId: atlasId,
      templateId: null,
      issueDate: today,
      validUntil: shift(today, 7),
      notes: null,
      paymentTerms: null,
      lines: [
        {
          productVariantId: null,
          productName: 'Wheat',
          quantity: 1,
          unitPrice: '80.00',
          vatRate: null,
        },
      ],
    })
    expect(estimate.statusCode).toBe(201)
    const delivery = await post('/v1/delivery-notes', {
      clientId: atlasId,
      invoiceId: null,
      deliveryDate: today,
      deliveryAddress: 'Rabat',
      instructions: null,
      includeReceptionSignature: false,
      lines: [
        { sourceInvoiceLineId: null, productVariantId: null, productName: 'Wheat', quantity: 1 },
      ],
    })
    expect(delivery.statusCode, JSON.stringify(delivery.json())).toBe(201)
    const pending = await post('/v1/payments', cheque())
    expect(pending.statusCode, JSON.stringify(pending.json())).toBe(201)
    expect(
      (
        await post(`/v1/payments/${pending.json().id}/confirm`, {
          expectedVersion: 1,
          collectedOn: today,
        })
      ).statusCode,
    ).toBe(200)

    const invoicePage = await get(
      `/v1/invoices?search=Atlas%20Trade&paymentStatus=partial&overdue=true&amountMin=90&dateTo=${today}&sortBy=outstandingAmount&page=1&pageSize=1`,
    )
    expect(invoicePage.statusCode, JSON.stringify(invoicePage.json())).toBe(200)
    expect(invoicePage.json()).toMatchObject({
      total: 1,
      limit: 1,
      offset: 0,
      items: [
        {
          id: invoiceId,
          clientDisplayName: 'Atlas SARL',
          paidAmount: '30.00',
          outstandingAmount: '70.00',
          paymentStatus: 'partial',
          overdue: true,
        },
      ],
    })
    expect(
      (await get(`/v1/invoices?search=${invoiceNumber}&paymentStatus=paid`)).json().total,
    ).toBe(0)
    expect(
      (await get(`/v1/estimates?search=Atlas&dateFrom=${today}&amountMax=80&sortBy=total`)).json(),
    ).toMatchObject({
      total: 1,
      items: [{ id: estimate.json().id, clientDisplayName: 'Atlas SARL' }],
    })
    expect(
      (
        await get(`/v1/delivery-notes?search=Atlas&billingStatus=unbilled&dateFrom=${today}`)
      ).json(),
    ).toMatchObject({
      total: 1,
      items: [{ id: delivery.json().id, clientDisplayName: 'Atlas SARL' }],
    })
    const overview = await get(`/v1/clients/${atlasId}/overview`)
    expect(overview.statusCode, JSON.stringify(overview.json())).toBe(200)
    expect(overview.json().financialSummary).toEqual({
      currencies: [
        {
          currency: 'MAD',
          invoicedAmount: '100.00',
          receivedAmount: '30.00',
          outstandingAmount: '70.00',
          overdueAmount: '70.00',
        },
      ],
    })
    expect(overview.json().recentActivity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'payment', number: pending.json().number }),
        expect.objectContaining({ type: 'invoice', number: invoiceNumber }),
      ]),
    )
    const clients = await get(
      '/v1/clients?balanceMin=70&balanceMax=70&overdueOnly=true&sortBy=outstanding&page=1&pageSize=1',
    )
    expect(clients.statusCode, JSON.stringify(clients.json())).toBe(200)
    expect(clients.json()).toMatchObject({
      financialCurrency: 'MAD',
      total: 1,
      items: [{ id: atlasId, financialSummary: { currencies: [{ outstandingAmount: '70.00' }] } }],
    })
  })

  it('protects invoice cancellation and hides finance from client-only readers', async () => {
    const pending = await post('/v1/payments', cheque())
    expect(pending.statusCode).toBe(201)
    const cancel = () =>
      post(`/v1/invoices/${invoiceId}/cancel`, { expectedVersion: 2, reason: 'Void invoice' })
    expect((await cancel()).json().code).toBe('INVOICE_HAS_PAYMENTS')
    expect(
      (
        await post(`/v1/payments/${pending.json().id}/confirm`, {
          expectedVersion: 1,
          collectedOn: today,
        })
      ).statusCode,
    ).toBe(200)
    expect((await cancel()).json().code).toBe('INVOICE_HAS_PAYMENTS')

    await fixture.client`delete from user_roles where user_id=${testUserId}`
    await fixture.client`insert into roles (key,name) values ('overview_reader','Overview reader')`
    await fixture.client`insert into role_permissions (role_id,permission_id) select r.id,p.id from roles r cross join permissions p where r.key='overview_reader' and p.key='clients.read'`
    await fixture.client`insert into user_roles (user_id,role_id) select ${testUserId},id from roles where key='overview_reader'`
    const overview = await get(`/v1/clients/${atlasId}/overview`)
    expect(overview.statusCode, JSON.stringify(overview.json())).toBe(200)
    expect(overview.json()).toMatchObject({ financialSummary: null, recentActivity: [] })
    expect((await get('/v1/clients?balanceMin=1')).statusCode).toBe(403)
    expect((await get('/v1/clients?sortBy=lastActivity')).statusCode).toBe(403)
    const clients = await get('/v1/clients')
    expect(clients.statusCode).toBe(200)
    expect(clients.json().items[0]).toMatchObject({ financialSummary: null, lastActivityAt: null })
  })
})
