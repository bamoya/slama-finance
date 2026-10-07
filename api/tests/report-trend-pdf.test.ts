import { describe, expect, it, vi } from 'vitest'

import { createDocumentCanvas } from '../src/lib/documents/canvas.js'
import {
  drawReportTrend,
  trendAxis,
} from '../src/modules/reporting/shared/services/report-trend-pdf.js'

describe('report chart axes and projections', () => {
  it('uses readable tick intervals above the largest plotted amount, including zero and small amounts', () => {
    expect(trendAxis([0, 2800, 1400])).toEqual({ upper: 3000, ticks: [0, 1000, 2000, 3000] })
    expect(trendAxis([0]).upper).toBeGreaterThan(0)
    expect(trendAxis([0.03, 0.12]).upper).toBeGreaterThanOrEqual(0.12)
  })
  it.each([
    ['2026-09-01', '2026-09-30', ['2026-09-01', '2026-09-30'], ['01/09', '30/09']],
    ['2026-09-15', '2026-09-15', ['2026-09-15'], ['15/09']],
    ['2026-01-01', '2026-12-31', ['2026-01-01', '2026-12-31'], ['01/01/26', '31/12/26']],
  ])(
    'labels the selected range %s to %s and keeps numeric text printable',
    async (from, to, dates, labels) => {
      const canvas = await createDocumentCanvas()
      canvas.addPage()
      const text = vi.spyOn(canvas, 'text')
      const lines = vi.spyOn(canvas.pdf.getPage(0), 'drawLine')
      const height = drawReportTrend(canvas, {
        left: 30,
        top: 70,
        width: 535,
        from,
        to,
        dates,
        currency: 'MAD',
        datasets: [
          { label: 'Ventes', color: '#a87828', dashed: false, values: dates.map(() => 2800) },
        ],
      })
      const values = text.mock.calls.map(([value]) => value)
      for (const label of [...labels, 'MAD', 'Date', '3 000', '2 800'])
        expect(values).toContain(label)
      expect(values.join('')).not.toContain(String.fromCharCode(0))
      expect(values.join('')).not.toMatch(/[\u202f\u00a0]/)
      expect(height).toBeLessThan(200)
      expect(lines.mock.calls.some(([options]) => options.dashArray)).toBe(true)
      expect(
        text.mock.calls.every(([, x, y]) => x >= 30 && x <= 565 && y >= 70 && y < 70 + height),
      ).toBe(true)
    },
  )
})
