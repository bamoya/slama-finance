import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Transaction } from '../src/lib/db.js'
import { renderDocument } from '../src/lib/documents/render-document.js'
import {
  type createPaymentRepository,
  paymentBalanceForInvoice,
  type PaymentRow,
} from '../src/modules/sales/payments/repositories/payment.repository.js'
import { createPaymentService } from '../src/modules/sales/payments/services/payment.service.js'
import { createPaymentReceiptService } from '../src/modules/sales/payments/services/payment-receipt.service.js'
import { renderPaymentReceiptPdf } from '../src/modules/sales/payments/services/payment-receipt-pdf.service.js'
import { captureReceiptBalance } from '../src/modules/sales/payments/services/receipt-balance.js'
import type { createArtifactSupport } from '../src/support/artifacts/index.js'

vi.mock('../src/modules/sales/payments/repositories/payment.repository.js', () => ({
  paymentBalanceForInvoice: vi.fn(),
}))
vi.mock('../src/lib/documents/render-document.js', () => ({
  renderDocument: vi.fn(async () => ({ pdf: { save: async () => new Uint8Array([1]) } })),
}))

const id = '11111111-1111-4111-8111-111111111111'
const snapshot = {
  invoiceNumber: 'FAC-2026-1234567890',
  invoiceTotal: '125315.00',
  issuer: { legalName: 'Slama' },
  client: { legalName: 'Atlas' },
  appearance: { layout: 'classic' },
  templateId: null,
  capturedAt: '2026-01-01T10:00:00.000Z',
  paidAtRecording: '0.00',
  remainingAtRecording: '125315.00',
}
function setup(status: PaymentRow['status'] = 'pending') {
  let row: PaymentRow = {
    id,
    number: 'PAY-2026-1234567890',
    invoiceId: id,
    operationId: id,
    creationRequest: {},
    amount: '46100.00',
    currency: 'MAD',
    method: 'bank_transfer',
    status,
    paymentDate: '2026-01-01',
    collectedOn: status === 'pending' ? null : '2026-01-01',
    confirmedAt: status === 'pending' ? null : new Date('2026-01-01T12:00:00Z'),
    bankAccountId: null,
    bankAccountSnapshot: null,
    reference: null,
    chequeBank: null,
    chequeNumber: null,
    cancelledAt: status === 'cancelled' ? new Date() : null,
    cancellationReason: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByUserId: null,
    updatedByUserId: null,
    receiptIssuedAt: new Date(),
    receiptSnapshot: snapshot,
  }
  const repo = {
    transaction: async <T>(work: (tx: Transaction) => Promise<T>) => work({} as Transaction),
    authorize: vi.fn(),
    one: vi.fn(async () => row),
    invoice: vi.fn(async () => ({ id, status: 'issued', total: '125315.00', currency: 'MAD' })),
    timezone: vi.fn(async () => 'UTC'),
    audit: vi.fn(),
    hasConfirmation: vi.fn(async () => true),
    related: vi.fn(async () => ({
      payment: row,
      invoiceNumber: snapshot.invoiceNumber,
      clientId: null,
      clientName: 'Atlas',
    })),
    update: vi.fn(async (_id: string, data: Partial<PaymentRow>) => {
      row = { ...row, ...data, version: row.version + 1 }
      return row
    }),
    receiptMetadata: vi.fn(async (_id: string, data: Partial<PaymentRow>) => {
      row = { ...row, ...data }
      return row
    }),
  }
  return {
    repo,
    repository: repo as unknown as ReturnType<typeof createPaymentRepository>,
    row: () => row,
  }
}
beforeEach(() => {
  vi.mocked(renderDocument).mockClear()
  vi.mocked(paymentBalanceForInvoice).mockReset().mockResolvedValue({
    paidAmount: '46100.00',
    pendingAmount: '0.00',
    outstandingAmount: '79215.00',
    availableBalance: '79215.00',
    paymentStatus: 'partial',
    overdue: false,
  })
})
describe('receipt balance capture', () => {
  it.each([
    ['confirmation', 'INVOICE BALANCE AFTER COLLECTION'],
    ['restoration', 'INVOICE BALANCE AFTER PAYMENT RESTORATION'],
    ['receipt_generation', 'INVOICE BALANCE AT RECEIPT GENERATION'],
  ] as const)('prints the captured amounts with the correct %s heading', async (stage, heading) => {
    const row = {
      ...setup('confirmed').row(),
      receiptSnapshot: captureReceiptBalance(snapshot, '46100.00', stage),
    }
    await renderPaymentReceiptPdf(row, { appearance: {} })
    expect(vi.mocked(renderDocument).mock.calls[0]![0].receipt).toMatchObject({
      balanceTitle: heading,
      balances: [
        ['Invoice total', '125315.00 MAD'],
        ['Collected to date', '46100.00 MAD'],
        ['Remaining', '79215.00 MAD'],
      ],
    })
  })
  it('captures the example balance with exact decimal arithmetic and retains document identity', () => {
    expect(captureReceiptBalance(snapshot, '46100.00', 'confirmation')).toMatchObject({
      invoiceTotal: '125315.00',
      paidAtRecording: '46100.00',
      remainingAtRecording: '79215.00',
      balanceStage: 'confirmation',
      issuer: snapshot.issuer,
      client: snapshot.client,
      appearance: snapshot.appearance,
    })
    expect(captureReceiptBalance(snapshot, '125315.00', 'confirmation').remainingAtRecording).toBe(
      '0.00',
    )
  })
  it('refreshes the pending snapshot after confirming a bank transfer', async () => {
    const state = setup()
    await createPaymentService(state.repository).confirm(id, 1, '2026-01-01', id)
    expect(state.row().receiptSnapshot).toMatchObject({
      balanceStage: 'confirmation',
      paidAtRecording: '46100.00',
      remainingAtRecording: '79215.00',
    })
    expect(state.row().version).toBe(2)
  })
  it('captures the balance after restoring a collected payment', async () => {
    const state = setup('cancelled')
    await createPaymentService(state.repository).restore(id, 1, id)
    expect(state.row().receiptSnapshot).toMatchObject({
      balanceStage: 'restoration',
      paidAtRecording: '46100.00',
      remainingAtRecording: '79215.00',
    })
  })
  it('repairs old confirmed receipts on regeneration and invalidates the previous version', async () => {
    const state = setup('confirmed')
    const regeneratePdf = vi.fn(async () => ({ id, generatedAt: new Date() }))
    const artifacts = { regeneratePdf } as unknown as ReturnType<
      typeof createArtifactSupport
    >['service']
    const service = createPaymentReceiptService(state.repository, artifacts, vi.fn())
    await service.regenerate(id, id, 'saved')
    expect(state.row().receiptSnapshot).toMatchObject({
      balanceStage: 'receipt_generation',
      paidAtRecording: '46100.00',
      remainingAtRecording: '79215.00',
    })
    expect(regeneratePdf).toHaveBeenCalledWith(expect.objectContaining({ sourceVersion: 2 }))
    expect(state.repo.audit).toHaveBeenCalledWith(
      expect.anything(),
      id,
      'correct_receipt_balance',
      id,
      expect.anything(),
      expect.anything(),
      expect.any(String),
    )
    await service.regenerate(id, id, 'saved')
    expect(state.repo.update).toHaveBeenCalledOnce()
  })
  it('does not replace a recording snapshot for a payment that was already collected at creation', async () => {
    const state = setup('confirmed')
    state.repo.hasConfirmation.mockResolvedValue(false)
    const artifacts = {
      regeneratePdf: vi.fn(async () => ({ id, generatedAt: new Date() })),
    } as unknown as ReturnType<typeof createArtifactSupport>['service']
    await createPaymentReceiptService(state.repository, artifacts, vi.fn()).regenerate(
      id,
      id,
      'saved',
    )
    expect(state.repo.update).not.toHaveBeenCalled()
  })
  it('labels a repaired receipt as a new capture when later installments have changed the balance', async () => {
    const state = setup('confirmed')
    vi.mocked(paymentBalanceForInvoice).mockResolvedValue({
      paidAmount: '60000.00',
      pendingAmount: '5000.00',
      outstandingAmount: '65315.00',
      availableBalance: '60315.00',
      paymentStatus: 'partial',
      overdue: false,
    })
    const artifacts = {
      regeneratePdf: vi.fn(async () => ({ id, generatedAt: new Date() })),
    } as unknown as ReturnType<typeof createArtifactSupport>['service']
    await createPaymentReceiptService(state.repository, artifacts, vi.fn()).regenerate(
      id,
      id,
      'saved',
    )
    expect(state.row().receiptSnapshot).toMatchObject({
      balanceStage: 'receipt_generation',
      paidAtRecording: '60000.00',
      remainingAtRecording: '65315.00',
    })
  })
  it('does not fabricate historical balances when an old snapshot has no captured totals', async () => {
    const state = setup('confirmed')
    state.row().receiptSnapshot = {
      ...snapshot,
      capturedAt: null,
      paidAtRecording: null,
      remainingAtRecording: null,
    }
    const artifacts = {
      regeneratePdf: vi.fn(async () => ({ id, generatedAt: new Date() })),
    } as unknown as ReturnType<typeof createArtifactSupport>['service']
    await createPaymentReceiptService(state.repository, artifacts, vi.fn()).regenerate(
      id,
      id,
      'saved',
    )
    expect(state.repo.update).not.toHaveBeenCalled()
  })
})
