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
})
