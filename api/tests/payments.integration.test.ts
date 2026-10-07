import { createHash, randomUUID } from 'node:crypto'

import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../src/app.js'
import { loadEnvironment } from '../src/config/env.js'
import type { ObjectStorage } from '../src/integrations/contracts.js'
import { companyDate } from '../src/lib/validation.js'
import { createPasswordService } from '../src/modules/identity/auth/services/password.service.js'
import { isolatedDatabase, testUserId } from './helpers/postgres.js'

const headers = { origin: 'http://localhost:5173' }
const clientId = '33333333-3333-4333-8333-333333333333'
const files = new Map<string, Uint8Array>()
const storage: ObjectStorage = {
  async putImmutable({ key, bytes, contentType }) {
    files.set(key, bytes)
    return {
      key,
      contentType,
      byteSize: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    }
  },
  async get(key) {
    const bytes = files.get(key)
    if (!bytes) throw new Error('Missing test file')
    return bytes
  },
  async deleteUnreferenced() {},
  async signedDownloadUrl() {
    throw new Error('Not used')
  },
  async list() {
    return []
  },
}

describe('Payments lifecycle', () => {
  let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
  let app: Awaited<ReturnType<typeof buildApp>>
  let cookies: { slama_session: string }
  let invoiceId: string
  let today: string

  beforeEach(async () => {
    files.clear()
    fixture = await isolatedDatabase()
    await fixture.client`update company_settings set legal_name='Slama Agricole', address_line1='Rue Atlas', city='Casablanca' where id=1`
    await fixture.client`insert into clients (id,type,legal_name,address_line1,city) values (${clientId},'company','Atlas SARL','Rue Hassan','Rabat')`
    const hash = await createPasswordService().hash('payments-password-123')
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
      payload: { email: 'operator@example.test', password: 'payments-password-123' },
    })
    expect(login.statusCode).toBe(200)
    cookies = { slama_session: login.cookies[0]!.value }
    today = companyDate(new Date())
    const draft = await post('/v1/invoices', {
      clientId,
      templateId: null,
      issueDate: today,
      dueDate: today,
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
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    await app?.close()
    await fixture?.cleanup()
  })

  const post = (url: string, payload: object) =>
    app.inject({ method: 'POST', url, headers, cookies, payload })
  const remove = (id: string, expectedVersion: number) =>
    app.inject({
      method: 'DELETE',
      url: `/v1/payments/${id}`,
      headers,
      cookies,
      payload: { expectedVersion },
    })
  const payment = (overrides: Record<string, unknown> = {}) => ({
    operationId: randomUUID(),
    invoiceId,
    amount: '50.00',
    currency: 'MAD',
    method: 'cheque',
    status: 'pending',
    paymentDate: today,
    collectedOn: null,
    bankAccountId: null,
    reference: null,
    chequeBank: 'Attijariwafa',
    chequeNumber: randomUUID(),
    ...overrides,
  })

  it('captures installment balances once and issues on-demand receipts that prevent deletion', async () => {
    const first = await post(
      '/v1/payments',
      payment({
        method: 'cash',
        status: 'confirmed',
        collectedOn: today,
        chequeBank: null,
        chequeNumber: null,
        amount: '30.00',
      }),
    )
    expect(first.statusCode, first.body).toBe(201)
    expect(first.json()).toMatchObject({
      receiptNumber: expect.stringMatching(/^REC-\d{4}-\d{10}$/),
      receiptIssuedAt: null,
    })
    const id = first.json().id
    await post('/v1/payments', payment({ amount: '20.00' }))
    const [stored] = await fixture.client`select receipt_snapshot from payments where id=${id}`
    expect(stored!.receipt_snapshot).toMatchObject({
      paidAtRecording: '30.00',
      remainingAtRecording: '70.00',
    })
    const receipt = await post(`/v1/payments/${id}/receipt`, {})
    expect(receipt.statusCode, receipt.body).toBe(200)
    expect((await post(`/v1/payments/${id}/receipt`, {})).json().id).toBe(receipt.json().id)
    expect(files.size).toBe(1)
    const downloaded = await app.inject({
      url: `/v1/artifacts/${receipt.json().id}/download`,
      cookies,
    })
    expect(downloaded.statusCode).toBe(200)
    expect(downloaded.rawPayload.subarray(0, 5).toString()).toBe('%PDF-')
    expect((await remove(id, 1)).json().code).toBe('RECEIPT_ISSUED')
    expect(
      (await app.inject({ url: `/v1/payments/${id}`, cookies })).json().receiptIssuedAt,
    ).toBeTruthy()
    const [after] = await fixture.client`select receipt_snapshot from payments where id=${id}`
    expect(after!.receipt_snapshot).toEqual(stored!.receipt_snapshot)
  })

  it('invalidates receipts on confirmation, cancellation and restoration, keeping one active artifact', async () => {
    const pending = await post('/v1/payments', payment())
    const id = pending.json().id
    const prepared = await post(`/v1/payments/${id}/receipt`, {})
    expect(prepared.statusCode, prepared.body).toBe(200)
    const url = `/v1/artifacts/${prepared.json().id}/download`
    const [snapshot] = await fixture.client`select receipt_snapshot from payments where id=${id}`
    expect(snapshot!.receipt_snapshot).toMatchObject({
      paidAtRecording: '0.00',
      remainingAtRecording: '100.00',
    })
    expect(
      (await post(`/v1/payments/${id}/confirm`, { expectedVersion: 1, collectedOn: today }))
        .statusCode,
    ).toBe(200)
    expect((await app.inject({ url, cookies })).statusCode).toBe(409)
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(200)
    expect(
      (await post(`/v1/payments/${id}/cancel`, { expectedVersion: 2, reason: 'Returned cheque' }))
        .statusCode,
    ).toBe(200)
    expect((await app.inject({ url, cookies })).statusCode).toBe(409)
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(200)
    expect((await app.inject({ url, cookies })).statusCode).toBe(200)
    expect((await remove(id, 3)).json().code).toBe('RECEIPT_ISSUED')
    expect((await post(`/v1/payments/${id}/restore`, { expectedVersion: 3 })).statusCode).toBe(200)
    expect((await app.inject({ url, cookies })).statusCode).toBe(409)
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(200)
    const rows =
      await fixture.client`select * from document_artifacts where document_type='payment_receipt' and document_id=${id}`
    expect(rows).toHaveLength(1)
    expect(rows[0]!.source_version).toBe(4)
  })

  it('leaves no issued receipt on storage failure and never invents legacy balances', async () => {
    const pending = await post('/v1/payments', payment())
    const id = pending.json().id
    await fixture.client`update payments set receipt_snapshot=null where id=${id}`
    const put = vi
      .spyOn(storage, 'putImmutable')
      .mockRejectedValueOnce(new Error('Storage offline'))
    const failed = await post(`/v1/payments/${id}/receipt`, {})
    expect(failed.statusCode, failed.body).toBe(503)
    expect(
      (await app.inject({ url: `/v1/payments/${id}`, cookies })).json().receiptIssuedAt,
    ).toBeNull()
    const [legacy] = await fixture.client`select receipt_snapshot from payments where id=${id}`
    expect(legacy!.receipt_snapshot).toMatchObject({
      capturedAt: null,
      paidAtRecording: null,
      remainingAtRecording: null,
    })
    put.mockRestore()
    const prepared = await post(`/v1/payments/${id}/receipt`, {})
    expect(prepared.statusCode, prepared.body).toBe(200)
    const [before] =
      await fixture.client`select object_key from document_artifacts where document_id=${id}`
    vi.spyOn(storage, 'putImmutable').mockRejectedValueOnce(new Error('Storage offline'))
    expect(
      (await post(`/v1/documents/payment_receipt/${id}/regenerate-pdf`, { design: 'saved' }))
        .statusCode,
    ).toBe(503)
    const [after] =
      await fixture.client`select object_key from document_artifacts where document_id=${id}`
    expect(after!.object_key).toBe(before!.object_key)
  })

  it('does not publish a receipt if the payment changes during storage I/O', async () => {
    const pending = await post('/v1/payments', payment())
    const id = pending.json().id
    vi.spyOn(storage, 'putImmutable').mockImplementationOnce(
      async ({ key, bytes, contentType }) => {
        files.set(key, bytes)
        const cancelled = await post(`/v1/payments/${id}/cancel`, {
          expectedVersion: 1,
          reason: 'Changed during generation',
        })
        expect(cancelled.statusCode).toBe(200)
        return {
          key,
          contentType,
          byteSize: bytes.length,
          sha256: createHash('sha256').update(bytes).digest('hex'),
        }
      },
    )
    const result = await post(`/v1/payments/${id}/receipt`, {})
    expect(result.statusCode, result.body).toBe(409)
    expect(
      (await app.inject({ url: `/v1/payments/${id}`, cookies })).json().receiptIssuedAt,
    ).toBeNull()
    expect(
      await fixture.client`select id from document_artifacts where document_id=${id}`,
    ).toHaveLength(0)
  })

  it('regenerates with the latest design without changing receipt identity or balances', async () => {
    const pending = await post('/v1/payments', payment())
    const id = pending.json().id
    const prepared = await post(`/v1/payments/${id}/receipt`, {})
    expect(prepared.statusCode, prepared.body).toBe(200)
    const [before] = await fixture.client`select receipt_snapshot from payments where id=${id}`
    const [template] =
      await fixture.client`insert into document_templates (name,layout,accent_color) values ('Receipt design','modern','#225566') returning id`
    await fixture.client`update company_settings set default_template_id=${template!.id} where id=1`
    const regenerated = await post(`/v1/documents/payment_receipt/${id}/regenerate-pdf`, {
      design: 'latest',
    })
    expect(regenerated.statusCode, regenerated.body).toBe(200)
    expect(regenerated.json().id).toBe(prepared.json().id)
    const [after] = await fixture.client`select receipt_snapshot from payments where id=${id}`
    expect(after!.receipt_snapshot).toEqual(before!.receipt_snapshot)
  })

  it('requires Edit to first issue or regenerate receipts, but only Read to download issued receipts', async () => {
    const pending = await post('/v1/payments', payment())
    const id = pending.json().id
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(403)
    const [role] =
      await fixture.client`insert into roles (key,name) values ('receipt_reader','Receipt reader') returning id`
    await fixture.client`insert into user_roles (user_id,role_id) values (${testUserId},${role!.id})`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key='payments.read'`
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(403)
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key='payments.update'`
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(200)
    await fixture.client`delete from role_permissions where role_id=${role!.id} and permission_id in (select id from permissions where key='payments.update')`
    expect((await post(`/v1/payments/${id}/receipt`, {})).statusCode).toBe(200)
    expect(
      (await post(`/v1/documents/payment_receipt/${id}/regenerate-pdf`, { design: 'saved' }))
        .statusCode,
    ).toBe(403)
  })

  it('resolves saved logo and signature through media management into the downloaded PDF', async () => {
    const bytes = await sharp({
      create: { width: 100, height: 40, channels: 4, background: '#ad7d1d' },
    })
      .png()
      .toBuffer()
    const ids: string[] = []
    for (const purpose of ['company_logo', 'company_signature']) {
      const id = randomUUID()
      const key = `media/${id}.png`
      files.set(key, bytes)
      await fixture.client`insert into media_assets (id,object_key,original_filename,content_type,byte_size,sha256,purpose,status) values (${id},${key},'brand.png','image/png',${bytes.length},${createHash('sha256').update(bytes).digest('hex')},${purpose},'ready')`
      ids.push(id)
    }
    const appearance = {
      layout: 'classic',
      accentColor: '#ad7d1d',
      logoAssetId: ids[0],
      signatureAssetId: ids[1],
      showSignature: true,
    }
    await fixture.client`update invoices set appearance_snapshot=${JSON.stringify(appearance)}::jsonb where id=${invoiceId}`
    const pending = await post('/v1/payments', payment())
    const prepared = await post(`/v1/payments/${pending.json().id}/receipt`, {})
    expect(prepared.statusCode, prepared.body).toBe(200)
    const downloaded = await app.inject({
      url: `/v1/artifacts/${prepared.json().id}/download`,
      cookies,
    })
    expect(downloaded.statusCode).toBe(200)
    const pdf = await PDFDocument.load(downloaded.rawPayload)
    expect(
      pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict).keys(),
    ).toHaveLength(2)
  })

  it('reserves pending amounts, confirms them, and restores balance after cancellation', async () => {
    const pending = await post('/v1/payments', payment())
    expect(pending.statusCode, JSON.stringify(pending.json())).toBe(201)
    expect(pending.json()).toMatchObject({ status: 'pending', invoiceId, clientName: 'Atlas SARL' })
    const duplicateCheque = await post(
      '/v1/payments',
      payment({
        chequeBank: pending.json().chequeBank,
        chequeNumber: pending.json().chequeNumber,
      }),
    )
    expect(duplicateCheque.statusCode).toBe(409)
    expect(duplicateCheque.json().code).toBe('DUPLICATE_CHEQUE')
    const reserved = await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })
    expect(reserved.json()).toMatchObject({
      paidAmount: '0.00',
      pendingAmount: '50.00',
      outstandingAmount: '100.00',
      availableBalance: '50.00',
    })
    const tooMuch = await post('/v1/payments', payment({ amount: '50.01' }))
    expect(tooMuch.statusCode).toBe(409)
    const confirmed = await post(`/v1/payments/${pending.json().id}/confirm`, {
      expectedVersion: 1,
      collectedOn: today,
    })
    expect(confirmed.statusCode, JSON.stringify(confirmed.json())).toBe(200)
    expect(confirmed.json()).toMatchObject({ status: 'confirmed', version: 2, collectedOn: today })
    expect(
      (
        await post(`/v1/payments/${pending.json().id}/confirm`, {
          expectedVersion: 1,
          collectedOn: today,
        })
      ).statusCode,
    ).toBe(409)
    const collected = await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })
    expect(collected.json()).toMatchObject({
      paidAmount: '50.00',
      pendingAmount: '0.00',
      outstandingAmount: '50.00',
      availableBalance: '50.00',
    })
    const cancelled = await post(`/v1/payments/${pending.json().id}/cancel`, {
      expectedVersion: 2,
      reason: 'Bank returned the cheque',
    })
    expect(cancelled.statusCode, JSON.stringify(cancelled.json())).toBe(200)
    expect(cancelled.json()).toMatchObject({ status: 'cancelled', collectedOn: today, version: 3 })
    const restored = await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })
    expect(restored.json()).toMatchObject({
      paidAmount: '0.00',
      pendingAmount: '0.00',
      availableBalance: '100.00',
    })
    const replacement = await post(
      '/v1/payments',
      payment({
        method: 'cash',
        status: 'confirmed',
        amount: '100.00',
        collectedOn: today,
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(replacement.statusCode, JSON.stringify(replacement.json())).toBe(201)
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      paymentStatus: 'paid',
      outstandingAmount: '0.00',
    })
  })

  it('serializes parallel requests and honors operation idempotency', async () => {
    const input = payment({
      method: 'cash',
      status: 'confirmed',
      amount: '60.00',
      collectedOn: today,
      chequeBank: null,
      chequeNumber: null,
    })
    const first = await post('/v1/payments', input)
    expect(first.statusCode, JSON.stringify(first.json())).toBe(201)
    const retry = await post('/v1/payments', input)
    expect(retry.statusCode).toBe(201)
    expect(retry.json().id).toBe(first.json().id)
    const conflict = await post('/v1/payments', { ...input, amount: '61.00' })
    expect(conflict.statusCode).toBe(409)
    const [a, b] = await Promise.all([
      post(
        '/v1/payments',
        payment({
          method: 'cash',
          status: 'confirmed',
          amount: '30.00',
          collectedOn: today,
          chequeBank: null,
          chequeNumber: null,
        }),
      ),
      post(
        '/v1/payments',
        payment({
          method: 'cash',
          status: 'confirmed',
          amount: '30.00',
          collectedOn: today,
          chequeBank: null,
          chequeNumber: null,
        }),
      ),
    ])
    expect([a.statusCode, b.statusCode].sort()).toEqual([201, 409])
  })

  it('validates methods and collection dates, and exposes searchable history', async () => {
    const future = new Date(Date.now() + 86_400_000)
    const futureDate = companyDate(future)
    const invalidDate = await post(
      '/v1/payments',
      payment({
        method: 'cash',
        status: 'confirmed',
        collectedOn: futureDate,
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(invalidDate.statusCode).toBe(400)
    const invalidMethod = await post(
      '/v1/payments',
      payment({ method: 'bank_transfer', reference: null, chequeBank: null, chequeNumber: null }),
    )
    expect(invalidMethod.statusCode).toBe(400)
    const wrongCurrency = await post('/v1/payments', payment({ currency: 'EUR' }))
    expect(wrongCurrency.statusCode).toBe(400)
    const previousDay = new Date(`${today}T12:00:00Z`)
    previousDay.setUTCDate(previousDay.getUTCDate() - 1)
    const backdatedDate = previousDay.toISOString().slice(0, 10)
    const backdated = await post(
      '/v1/payments',
      payment({
        method: 'cash',
        status: 'confirmed',
        amount: '10.00',
        paymentDate: backdatedDate,
        collectedOn: backdatedDate,
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(backdated.statusCode, JSON.stringify(backdated.json())).toBe(201)
    expect(backdated.json().collectedOn).toBe(backdatedDate)
    const recorded = await post(
      '/v1/payments',
      payment({
        method: 'bank_transfer',
        reference: 'WIRE-2026-A',
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(recorded.statusCode, JSON.stringify(recorded.json())).toBe(201)
    const list = await app.inject({
      url: '/v1/payments?search=WIRE-2026-A&limit=10&offset=0',
      cookies,
    })
    expect(list.statusCode, JSON.stringify(list.json())).toBe(200)
    expect(list.json()).toMatchObject({
      total: 1,
      items: [{ id: recorded.json().id, invoiceId, clientId }],
    })
    const detail = await app.inject({ url: `/v1/payments/${recorded.json().id}`, cookies })
    expect(detail.statusCode).toBe(200)
    expect(detail.json()).toMatchObject({
      id: recorded.json().id,
      invoiceNumber: expect.stringMatching(/^FAC-/),
      clientName: 'Atlas SARL',
    })
  })

  it('keeps a bank account that is attached to a payment', async () => {
    const bank = await post('/v1/bank-accounts', {
      name: 'Collection account',
      bankName: 'Attijariwafa',
      accountHolder: 'Slama Agricole',
      rib: '000000000000000000000000',
      iban: null,
      currency: 'MAD',
    })
    expect(bank.statusCode, JSON.stringify(bank.json())).toBe(201)
    const recorded = await post(
      '/v1/payments',
      payment({
        method: 'bank_transfer',
        reference: 'WIRE-BANK-ACCOUNT',
        chequeBank: null,
        chequeNumber: null,
        bankAccountId: bank.json().id,
      }),
    )
    expect(recorded.statusCode, JSON.stringify(recorded.json())).toBe(201)
    const removed = await app.inject({
      method: 'DELETE',
      url: `/v1/bank-accounts/${bank.json().id}`,
      headers,
      cookies,
      payload: { expectedVersion: 1 },
    })
    expect(removed.statusCode).toBe(409)
    expect(
      (await app.inject({ url: `/v1/payments/${recorded.json().id}`, cookies })).json(),
    ).toMatchObject({ bankAccountId: bank.json().id })
  })

  it('requires confirmation permission for direct transfer confirmation and pending transitions', async () => {
    await fixture.client`delete from user_roles where user_id=${testUserId}`
    const [role] =
      await fixture.client`insert into roles (key,name) values ('payment_creator','Payment creator') returning id`
    await fixture.client`insert into user_roles (user_id,role_id) values (${testUserId},${role!.id})`
    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key='payments.create'`

    const cash = await post(
      '/v1/payments',
      payment({
        method: 'cash',
        status: 'confirmed',
        amount: '25.00',
        collectedOn: today,
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(cash.statusCode, JSON.stringify(cash.json())).toBe(201)
    const pending = await post('/v1/payments', payment({ amount: '25.00' }))
    expect(pending.statusCode, JSON.stringify(pending.json())).toBe(201)
    const directTransfer = await post(
      '/v1/payments',
      payment({
        method: 'bank_transfer',
        status: 'confirmed',
        amount: '25.00',
        collectedOn: today,
        reference: 'WIRE-CREATE-ONLY',
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(directTransfer.statusCode).toBe(403)
    expect(
      (
        await post(`/v1/payments/${pending.json().id}/confirm`, {
          expectedVersion: 1,
          collectedOn: today,
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (
        await post(`/v1/payments/${pending.json().id}/cancel`, {
          expectedVersion: 1,
          reason: 'Correction',
        })
      ).statusCode,
    ).toBe(403)
    expect(
      (await post(`/v1/payments/${pending.json().id}/restore`, { expectedVersion: 1 })).statusCode,
    ).toBe(403)
    expect((await remove(pending.json().id, 1)).statusCode).toBe(403)
    expect((await app.inject({ url: '/v1/payments', cookies })).statusCode).toBe(403)

    await fixture.client`insert into role_permissions (role_id,permission_id) select ${role!.id},id from permissions where key='payments.update'`
    expect(
      (
        await post(`/v1/payments/${pending.json().id}/confirm`, {
          expectedVersion: 1,
          collectedOn: today,
        })
      ).statusCode,
    ).toBe(200)
    const authorizedTransfer = await post(
      '/v1/payments',
      payment({
        method: 'bank_transfer',
        status: 'confirmed',
        amount: '25.00',
        collectedOn: today,
        reference: 'WIRE-AUTHORIZED',
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(authorizedTransfer.statusCode, JSON.stringify(authorizedTransfer.json())).toBe(201)
  })

  it('restores prior pending and confirmed states, then deletes a confirmed payment without recreating its operation', async () => {
    const input = payment({ amount: '40.00' })
    const pending = await post('/v1/payments', input)
    expect(pending.statusCode, JSON.stringify(pending.json())).toBe(201)
    const id = pending.json().id
    const cancelledPending = await post(`/v1/payments/${id}/cancel`, {
      expectedVersion: 1,
      reason: 'Recheck cheque',
    })
    expect(cancelledPending.statusCode).toBe(200)
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      availableBalance: '100.00',
    })
    const restoredPending = await post(`/v1/payments/${id}/restore`, { expectedVersion: 2 })
    expect(restoredPending.statusCode, JSON.stringify(restoredPending.json())).toBe(200)
    expect(restoredPending.json()).toMatchObject({
      status: 'pending',
      version: 3,
      cancellationReason: null,
    })
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      pendingAmount: '40.00',
      availableBalance: '60.00',
    })
    expect((await post(`/v1/payments/${id}/restore`, { expectedVersion: 2 })).statusCode).toBe(409)
    const confirmed = await post(`/v1/payments/${id}/confirm`, {
      expectedVersion: 3,
      collectedOn: today,
    })
    expect(confirmed.statusCode).toBe(200)
    const cancelledConfirmed = await post(`/v1/payments/${id}/cancel`, {
      expectedVersion: 4,
      reason: 'Correction',
    })
    expect(cancelledConfirmed.statusCode).toBe(200)
    const restoredConfirmed = await post(`/v1/payments/${id}/restore`, { expectedVersion: 5 })
    expect(restoredConfirmed.statusCode, JSON.stringify(restoredConfirmed.json())).toBe(200)
    expect(restoredConfirmed.json()).toMatchObject({
      status: 'confirmed',
      version: 6,
      collectedOn: today,
    })
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      paidAmount: '40.00',
      outstandingAmount: '60.00',
    })
    expect((await remove(id, 5)).statusCode).toBe(409)
    expect((await remove(id, 6)).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/payments/${id}`, cookies })).statusCode).toBe(404)
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      paidAmount: '0.00',
      availableBalance: '100.00',
    })
    const retried = await post('/v1/payments', input)
    expect(retried.statusCode).toBe(409)
    expect(retried.json().code).toBe('PAYMENT_DELETED')
    const audit =
      await fixture.client`select before_values->>'operationId' as operation_id from audit_events where entity_table='payments' and action='delete' and entity_key->>'id'=${id}`
    expect(audit[0]?.operation_id).toBe(input.operationId)
  })

  it('prevents overpayment when restoring and allows deleting pending payments', async () => {
    const pending = await post('/v1/payments', payment({ amount: '60.00' }))
    expect(pending.statusCode).toBe(201)
    const id = pending.json().id
    expect(
      (await post(`/v1/payments/${id}/cancel`, { expectedVersion: 1, reason: 'Hold' })).statusCode,
    ).toBe(200)
    const replacement = await post(
      '/v1/payments',
      payment({
        method: 'cash',
        status: 'confirmed',
        amount: '60.00',
        collectedOn: today,
        chequeBank: null,
        chequeNumber: null,
      }),
    )
    expect(replacement.statusCode).toBe(201)
    const blocked = await post(`/v1/payments/${id}/restore`, { expectedVersion: 2 })
    expect(blocked.statusCode).toBe(409)
    expect(blocked.json().code).toBe('OVERPAYMENT')
    expect((await remove(replacement.json().id, 1)).statusCode).toBe(204)
    expect((await post(`/v1/payments/${id}/restore`, { expectedVersion: 2 })).statusCode).toBe(200)
    expect((await remove(id, 3)).statusCode).toBe(204)
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      availableBalance: '100.00',
    })
  })

  it('rejects restoration after invoice cancellation but permits deleting the cancelled payment', async () => {
    const pending = await post('/v1/payments', payment({ amount: '20.00' }))
    expect(pending.statusCode).toBe(201)
    const id = pending.json().id
    expect(
      (await post(`/v1/payments/${id}/cancel`, { expectedVersion: 1, reason: 'Void payment' }))
        .statusCode,
    ).toBe(200)
    const invoice = await post(`/v1/invoices/${invoiceId}/cancel`, {
      expectedVersion: 2,
      reason: 'Void invoice',
    })
    expect(invoice.statusCode, JSON.stringify(invoice.json())).toBe(200)
    const restore = await post(`/v1/payments/${id}/restore`, { expectedVersion: 2 })
    expect(restore.statusCode).toBe(409)
    expect(restore.json().code).toBe('INVOICE_NOT_PAYABLE')
    expect((await remove(id, 2)).statusCode).toBe(204)
  })

  it('serializes restoration against a new payment on the same invoice', async () => {
    const pending = await post('/v1/payments', payment({ amount: '70.00' }))
    expect(pending.statusCode).toBe(201)
    const id = pending.json().id
    expect(
      (await post(`/v1/payments/${id}/cancel`, { expectedVersion: 1, reason: 'Hold' })).statusCode,
    ).toBe(200)
    const [restored, replacement] = await Promise.all([
      post(`/v1/payments/${id}/restore`, { expectedVersion: 2 }),
      post(
        '/v1/payments',
        payment({
          method: 'cash',
          status: 'confirmed',
          amount: '70.00',
          collectedOn: today,
          chequeBank: null,
          chequeNumber: null,
        }),
      ),
    ])
    expect(
      [restored.statusCode, replacement.statusCode].filter((code) => code === 409),
    ).toHaveLength(1)
    expect(
      [restored.statusCode, replacement.statusCode].some((code) => code === 200 || code === 201),
    ).toBe(true)
    expect((await app.inject({ url: `/v1/invoices/${invoiceId}`, cookies })).json()).toMatchObject({
      availableBalance: '30.00',
    })
  })
})
