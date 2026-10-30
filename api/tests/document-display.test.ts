import { describe, expect, it } from 'vitest'

import { displayDate } from '../src/lib/documents/display-date.js'
import { renderDocument } from '../src/lib/documents/render-document.js'
import { party } from '../src/lib/documents/types.js'

describe('document display', () => {
  it('omits missing party fields without blank lines or placeholders', () => {
    expect(party({ legalName: 'Atlas', ice: null, city: null, email: null, phone: null })).toEqual([
      'Atlas',
    ])
    expect(party({ firstName: 'Sara', lastName: null, city: 'Rabat' })).toEqual(['Sara', 'Rabat'])
    expect(displayDate('2026-10-23')).toBe('23-10-2026')
  })
  it('uses day-month-year in all document layouts and omits empty references/sections', async () => {
    for (const layout of [
      'classic',
      'modern',
      'minimal',
      'essential',
      'atelier',
      'signature',
      'ledger',
    ]) {
      const rendered = await renderDocument(
        {
          title: 'INVOICE',
          locale: 'en-GB',
          number: 'FAC-1',
          issuer: ['Slama'],
          client: party({ legalName: 'Atlas' }),
          date: '2026-10-23',
          reference: ['Due date', ''],
          sections: [{ title: 'Missing terms', text: '' }],
        },
        { layout },
      )
      const html = rendered.html
      expect(html).toContain('23-10-2026')
      expect(html).not.toContain('2026-10-23')
      expect(html).not.toContain('Missing terms')
      expect(html).not.toContain('Due date')
      expect(html).not.toContain('ICE:')
    }
  })
  it.each(['classic', 'modern', 'minimal', 'essential', 'atelier', 'signature', 'ledger'])(
    'groups financial values in the %s preview and generated PDF',
    async (layout) => {
      const rendered = await renderDocument(
        {
          title: 'INVOICE',
          locale: 'fr-MA',
          number: 'FAC-1234567',
          issuer: ['Slama', 'ICE: 123456789012345'],
          client: ['Atlas'],
          date: '2026-10-30',
          lines: [
            { name: 'Product 1234567', quantity: '12345', price: '1234.50', total: '1234567.50' },
          ],
          totals: [['Total', '1234567.50 MAD']],
          receipt: {
            amount: '1234567.50 MAD',
            status: 'Payment collected',
            fields: [['Cheque number', '1234567']],
            balances: [['Remaining', '1234567.50 MAD']],
            note: '',
          },
        },
        { layout },
      )
      expect(rendered.html).toContain('1\u00a0234\u00a0567,50 MAD')
      expect(rendered.html).toContain('12\u00a0345')
      expect(rendered.html).toContain('1\u00a0234,50')
      expect(rendered.html).toContain('FAC-1234567')
      expect(rendered.html).toContain('ICE: 123456789012345')
      expect(rendered.html).toContain('Product 1234567')
      expect(rendered.html).toContain('>1234567</text>')
      expect((await rendered.pdf.save()).length).toBeGreaterThan(1000)
    },
  )
})
