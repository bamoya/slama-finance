import { mkdir, writeFile } from 'node:fs/promises'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { CreateDocumentTemplateSchema } from '../src/contracts/generated/settings/settings.schemas.js'
import { renderTemplatePreview } from '../src/modules/settings/services/template-html.js'

const data = CreateDocumentTemplateSchema.parse({
  name: 'Test',
  layout: 'classic',
  accentColor: '#ad7d1d',
  logoAssetId: null,
  signatureAssetId: null,
  showSignature: true,
  showBankDetails: true,
  showPaymentTerms: true,
  paymentTerms: 'Payment within 30 days.',
  footerText: '<script>unsafe</script>',
})
const layouts = [
  'classic',
  'modern',
  'minimal',
  'signature',
  'atelier',
  'ledger',
  'essential',
] as const
const image = sharp(
  Buffer.from(
    '<svg width="200" height="70"><path d="M10 50 Q40 0 60 40 T110 35 T180 25 M20 60 L180 45" fill="none" stroke="#273248" stroke-width="3"/></svg>',
  ),
)
  .png()
  .toBuffer()

describe('canonical document preview', () => {
  for (const layout of layouts)
    for (const density of ['standard', 'compact'] as const) {
      it(`renders ${layout}/${density} consistently for all four document types`, async () => {
        for (const kind of ['invoice', 'estimate', 'delivery', 'payment_receipt'] as const) {
          const result = await renderTemplatePreview({ ...data, layout, density }, kind, {
            logo: await image,
            signature: await image,
          })
          expect(result.pageCount).toBe(1)
          expect(result.html).toContain(`class="${layout}"`)
          expect(result.html).toContain(`data-density="${density}"`)
          expect(result.html).toContain('aria-label="Company signature"')
          expect(result.html).toContain('&lt;script&gt;')
          expect(result.html).not.toContain('<script>')
          expect(result.html).not.toContain('>VAT<')
          const title = {
            invoice: 'Invoice',
            estimate: 'Estimate',
            delivery: 'Delivery note',
            payment_receipt: 'Payment receipt',
          }[kind]
          const textX = (label: string) =>
            Number(result.html.match(new RegExp(`<text x="([\\d.-]+)"[^>]*>${label}</text>`))?.[1])
          if (layout === 'atelier' || layout === 'essential') {
            expect(textX('DOCUMENT DATE')).toBeGreaterThan(textX(title))
          } else {
            expect(textX('DOCUMENT DATE')).toBeCloseTo(textX(title), 5)
          }
          if (kind === 'delivery') {
            expect(result.html).toContain('Received by / signature')
            expect(result.html).not.toContain('Unit price')
            expect(result.html).not.toContain('700.00')
          }
          if (kind === 'payment_receipt') {
            expect(result.html).toContain('Cheque received - awaiting collection')
            expect(result.html).toContain('1500.00 MAD')
            expect(result.html).toContain('3500.00 MAD')
            expect(result.html).not.toContain('Product name')
            expect(result.html).not.toContain('Bank details from')
          }
          // Every drawn text baseline stays inside A4, including notes and signatures.
          for (const match of result.html.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)) {
            expect(Number(match[1])).toBeGreaterThanOrEqual(0)
            expect(Number(match[1])).toBeLessThan(595.28)
            expect(Number(match[2])).toBeGreaterThan(0)
            expect(Number(match[2])).toBeLessThan(841.89)
          }
          if (process.env.HTML_VISUAL_OUTPUT) {
            await mkdir(process.env.HTML_VISUAL_OUTPUT, { recursive: true })
            await writeFile(
              `${process.env.HTML_VISUAL_OUTPUT}/${kind}-${layout}-${density}.html`,
              result.html,
            )
          }
        }
      })
      it(`paginates ${layout}/${density} without dropping rows`, async () => {
        const result = await renderTemplatePreview(
          { ...data, layout, density },
          'invoice',
          {},
          'many',
        )
        expect(result.pageCount).toBeGreaterThan(1)
        expect(result.html.match(/>Product name<\/text>/g)).toHaveLength(result.pageCount)
        for (let index = 1; index <= 45; index++) expect(result.html).toContain(`Item ${index}<`)
        expect(result.html).toContain('4500.00 MAD')
      })
    }
  it.each(layouts)('compact density fits more rows for %s', async (layout) => {
    const standard = await renderTemplatePreview(
      { ...data, layout, density: 'standard' },
      'invoice',
      {},
      'many',
    )
    const compact = await renderTemplatePreview(
      { ...data, layout, density: 'compact' },
      'invoice',
      {},
      'many',
    )
    expect(compact.pageCount).toBeLessThanOrEqual(standard.pageCount)
    const firstPageRows = (html: string) =>
      (html.split('</svg>')[0]!.match(/Item \d+</g) ?? []).length
    expect(firstPageRows(compact.html)).toBeGreaterThan(firstPageRows(standard.html))
  })
  it('hides disabled signatures and does not change immutable presets', async () => {
    const before = JSON.stringify(data)
    const result = await renderTemplatePreview({ ...data, showSignature: false }, 'invoice', {
      signature: await image,
    })
    expect(result.html).not.toContain('Company signature')
    expect(JSON.stringify(data)).toBe(before)
  })
})
