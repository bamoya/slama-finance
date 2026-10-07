import { mkdir, writeFile } from 'node:fs/promises'

import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { renderDeliveryPdf } from '../src/modules/sales/shared/services/delivery-pdf.service.js'
import { renderSalesPdf } from '../src/modules/sales/shared/services/sales-pdf.service.js'

const issuerSnapshot = {
  legalName: 'Slama Agricole',
  addressLine1: '12 Rue Atlas',
  city: 'Casablanca',
  ice: '000123456789012',
}
const clientSnapshot = {
  type: 'company',
  legalName: 'Atlas SARL',
  city: 'Rabat',
  addressLine1: '25 Avenue Hassan II',
}
const line = {
  productName: 'Wheat',
  packageWeightG: 500,
  quantity: 10,
  unitPrice: '20.00',
  vatRate: null,
  totalAmount: '200.00',
}
describe('PDF fixed layouts', () => {
  it.each(['classic', 'modern', 'minimal', 'signature', 'atelier', 'ledger', 'essential'])(
    'renders the %s A4 sales layout',
    async (layout) => {
      const row = {
        number: 'FAC-2026-A7K9M2',
        issuerSnapshot,
        clientSnapshot,
        appearanceSnapshot: {
          layout,
          accentColor: '#ad7d1d',
          footerText: 'Thank you for your trust.',
          showPaymentTerms: true,
          showSignature: true,
        },
        issueDate: '2026-10-01',
        dueDate: '2026-10-31',
        currency: 'MAD',
        subtotal: '700.00',
        taxTotal: '0.00',
        total: '700.00',
        paymentTerms: null,
        notes: null,
      } as unknown as Parameters<typeof renderSalesPdf>[0]
      const bytes = await renderSalesPdf(
        row,
        [
          line,
          { ...line, productName: 'Flour', quantity: 5, totalAmount: '100.00' },
          { ...line, productName: 'Semolina', quantity: 20, totalAmount: '400.00' },
        ] as Parameters<typeof renderSalesPdf>[1],
        'INVOICE',
        {
          logo: await sharp({
            create: { width: 120, height: 60, channels: 3, background: '#346e38' },
          })
            .png()
            .toBuffer(),
          signature: await sharp({
            create: { width: 140, height: 40, channels: 3, background: '#233655' },
          })
            .png()
            .toBuffer(),
        },
      )
      const pdf = await PDFDocument.load(bytes)
      expect(pdf.getPageCount()).toBe(1)
      expect(pdf.getPage(0).getWidth()).toBeCloseTo(595.28)
      const images = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'), PDFDict)
      expect(images?.keys()).toHaveLength(2)
      if (process.env.PDF_VISUAL_OUTPUT) {
        await mkdir(process.env.PDF_VISUAL_OUTPUT, { recursive: true })
        await writeFile(`${process.env.PDF_VISUAL_OUTPUT}/${layout}.pdf`, bytes)
      }
      const long = await PDFDocument.load(
        await renderSalesPdf(
          row,
          Array.from({ length: 80 }, () => ({
            ...line,
            productName: 'Long product name '.repeat(7),
          })) as Parameters<typeof renderSalesPdf>[1],
          'ESTIMATE',
        ),
      )
      expect(long.getPageCount()).toBeGreaterThan(1)
    },
  )
  it.each(['classic', 'modern', 'minimal', 'signature', 'atelier', 'ledger', 'essential'])(
    'renders a %s delivery note without financial columns',
    async (layout) => {
      const bytes = await renderDeliveryPdf(
        {
          number: 'BL-2026-A7K9M2',
          issuerSnapshot,
          clientSnapshot,
          deliveryAddress: '25 Avenue Hassan II, Rabat',
          deliveryDate: '2026-10-01',
          instructions: null,
          includeReceptionSignature: true,
        } as Parameters<typeof renderDeliveryPdf>[0],
        [line] as unknown as Parameters<typeof renderDeliveryPdf>[1],
        {
          appearance: {
            layout,
            accentColor: '#ad7d1d',
            showSignature: true,
            footerText: 'Please check quantities on receipt.',
          },
          logo: await sharp({
            create: { width: 120, height: 60, channels: 3, background: '#346e38' },
          })
            .png()
            .toBuffer(),
          signature: await sharp({
            create: { width: 140, height: 40, channels: 3, background: '#233655' },
          })
            .png()
            .toBuffer(),
        },
      )
      expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1)
      if (process.env.PDF_VISUAL_OUTPUT) {
        await mkdir(process.env.PDF_VISUAL_OUTPUT, { recursive: true })
        await writeFile(`${process.env.PDF_VISUAL_OUTPUT}/delivery-${layout}.pdf`, bytes)
      }
    },
  )
})
