import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import type { PaymentRow } from '../src/modules/sales/payments/repositories/payment.repository.js'
import { renderPaymentReceiptPdf } from '../src/modules/sales/payments/services/payment-receipt-pdf.service.js'

const row: PaymentRow = {
  id: '11111111-1111-4111-8111-111111111111',
  number: 'PAY-2026-3188460612',
  operationId: '22222222-2222-4222-8222-222222222222',
  creationRequest: {},
  invoiceId: '33333333-3333-4333-8333-333333333333',
  amount: '1500.00',
  currency: 'MAD',
  method: 'cheque',
  status: 'pending',
  paymentDate: '2026-10-02',
  collectedOn: null,
  bankAccountId: null,
  reference: null,
  chequeBank: 'Attijariwafa Bank',
  chequeNumber: 'CHQ-10292026',
  confirmedAt: null,
  cancelledAt: null,
  cancellationReason: null,
  version: 1,
  createdAt: new Date('2026-10-02T10:00:00Z'),
  updatedAt: new Date('2026-10-02T10:00:00Z'),
  createdByUserId: null,
  updatedByUserId: null,
  receiptIssuedAt: null,
  receiptSnapshot: {
    invoiceNumber: 'FAC-2026-4919302341',
    invoiceTotal: '4500.00',
    issuer: {
      legalName: 'Slama Agricole',
      addressLine1: '12 Avenue Hassan II',
      city: 'Casablanca',
      ice: '001234567890123',
    },
    client: {
      type: 'company',
      legalName: 'Atlas Distribution SARL',
      addressLine1: '25 Rue des Oliviers',
      city: 'Rabat',
      ice: '002345678901234',
    },
    appearance: {},
    templateId: null,
    capturedAt: '2026-10-02T10:00:00.000Z',
    paidAtRecording: '1000.00',
    remainingAtRecording: '3500.00',
  },
}

describe('Payment receipt PDF', () => {
  for (const layout of [
    'classic',
    'modern',
    'minimal',
    'signature',
    'atelier',
    'ledger',
    'essential',
  ]) {
    it(`renders ${layout} receipt with logo and signature`, async () => {
      const logo = await sharp(
        Buffer.from(
          '<svg width="210" height="65"><rect width="210" height="65" fill="#ad7d1d"/><text x="15" y="42" font-size="26" fill="white">SLAMA</text></svg>',
        ),
      )
        .png()
        .toBuffer()
      const signature = await sharp(
        Buffer.from(
          '<svg width="200" height="70"><path d="M10 50 Q40 0 60 40 T110 35 T180 25 M20 60 L180 45" fill="none" stroke="#273248" stroke-width="3"/></svg>',
        ),
      )
        .png()
        .toBuffer()
      const bytes = await renderPaymentReceiptPdf(row, {
        appearance: {
          layout,
          accentColor: '#ad7d1d',
          showSignature: true,
          footerText: 'Slama Agricole - Thank you for your trust.',
        },
        logo,
        signature,
      })
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(1)
      expect(pdf.getTitle()).toBe('Reçu de paiement REC-2026-3188460612')
      if (process.env.PDF_VISUAL_OUTPUT) {
        await mkdir(process.env.PDF_VISUAL_OUTPUT, { recursive: true })
        await writeFile(path.join(process.env.PDF_VISUAL_OUTPUT, `receipt-${layout}.pdf`), bytes)
      }
    })
  }
  it('wraps long text and marks cancelled legacy receipts', async () => {
    const legacy = {
      ...(row.receiptSnapshot as Record<string, unknown>),
      capturedAt: null,
      paidAtRecording: null,
      remainingAtRecording: null,
    }
    const bytes = await renderPaymentReceiptPdf(
      {
        ...row,
        status: 'cancelled',
        cancellationReason: 'Cheque returned by bank. '.repeat(12),
        reference: 'REFERENCE'.repeat(35),
        receiptSnapshot: legacy,
      },
      { appearance: { layout: 'classic' } },
    )
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeLessThanOrEqual(3)
    if (process.env.PDF_VISUAL_OUTPUT) {
      await mkdir(process.env.PDF_VISUAL_OUTPUT, { recursive: true })
      await writeFile(
        path.join(process.env.PDF_VISUAL_OUTPUT, 'receipt-cancelled-legacy.pdf'),
        bytes,
      )
    }
  })
})
