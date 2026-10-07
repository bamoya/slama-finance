import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { PDFDocument, PDFPage } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import { ReportAnalysisSchema } from '../src/contracts/generated/reporting/reporting.schemas.js'
import { frenchReportLabel } from '../src/modules/reporting/shared/services/report-labels.js'
import { renderReport } from '../src/modules/reporting/shared/services/report-renderer.service.js'

const snapshot = (outstanding: string[] | null, overdue: string[]) =>
  ReportAnalysisSchema.parse({
    snapshotVersion: 3,
    metricDefinitionVersion: '2',
    companyName: 'Atlas',
    capturedAt: '2026-10-04T12:00:00Z',
    currencies: [...new Set([...(outstanding ?? []), ...overdue])],
    filters: {
      from: '2026-09-01',
      to: '2026-09-30',
      timezone: 'UTC',
      sections: outstanding === null ? ['overdue'] : ['outstanding', 'overdue'],
      bucket: 'day',
      start: '2026-09-01T00:00:00Z',
      endExclusive: '2026-10-01T00:00:00Z',
    },
    sections: [
      ...(outstanding === null ? [] : [{ key: 'outstanding', currencies: outstanding }]),
      { key: 'overdue', currencies: overdue },
    ].map(({ key, currencies }) => ({
      key,
      timeBasis: 'capture',
      metrics: [
        { key: 'amount', currency: 'MAD', value: '123.45', unit: 'money', timeBasis: 'capture' },
      ],
      series: [],
      visuals: currencies.flatMap((currency) =>
        (key === 'outstanding' ? ['current', '1_30'] : ['1_30']).map((bucket) => ({
          group: 'aging',
          key: bucket,
          label: bucket,
          currency,
          value: '50',
          unit: 'money',
        })),
      ),
      rows: [
        {
          id: null,
          label: `${key}-record`,
          clientName: 'Atlas Client',
          currency: 'MAD',
          date: '2026-09-01',
          status: 'issued',
          amount: '123.45',
          net: null,
          vat: null,
          gross: null,
          quantity: null,
          weightKg: null,
          unknownWeightCount: 0,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
      coverage: null,
    })),
  })

const scenarios = [
  {
    name: 'combined matching currencies',
    outstanding: ['MAD', 'EUR'],
    overdue: ['MAD', 'EUR'],
    expected: ['MAD', 'EUR'],
  },
  { name: 'standalone overdue', outstanding: null, overdue: ['MAD'], expected: ['MAD'] },
  { name: 'missing outstanding visuals', outstanding: [], overdue: ['MAD'], expected: ['MAD'] },
  {
    name: 'overdue currency fallback',
    outstanding: ['MAD'],
    overdue: ['MAD', 'EUR'],
    expected: ['MAD', 'EUR'],
  },
]

describe('Export receivables presentation', () => {
  describe.each(['fr', 'en'] as const)('%s', (language) => {
    const heading = language === 'fr' ? frenchReportLabel('aging') : 'Receivables aging'
    it.each(scenarios)(
      'PDF: $name keeps charts unique and source records intact',
      async ({ outstanding, overdue, expected }) => {
        const data = snapshot(outstanding, overdue)
        const before = structuredClone(data)
        const drawText = vi.spyOn(PDFPage.prototype, 'drawText')
        try {
          const bytes = await renderReport(data, 'pdf', language)
          expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0)
          const text = drawText.mock.calls.map(([value]) => value)
          for (const currency of expected)
            expect(text.filter((value) => value === `${heading} · ${currency}`)).toHaveLength(1)
          for (const section of data.sections) expect(text).toContain(`${section.key}-record`)
          expect(text).toContain(language === 'fr' ? '123,45 MAD' : '123.45 MAD')
          expect(data).toEqual(before)
        } finally {
          drawText.mockRestore()
        }
      },
    )
    it.each(scenarios)(
      'Excel: $name keeps charts unique and source records intact',
      async ({ outstanding, overdue, expected }) => {
        const data = snapshot(outstanding, overdue)
        const before = structuredClone(data)
        const bytes = await renderReport(data, 'xlsx', language)
        const zip = await JSZip.loadAsync(bytes)
        const charts = await Promise.all(
          Object.keys(zip.files)
            .filter((key) => /^xl\/charts\/chart\d+\.xml$/.test(key))
            .map((key) => zip.file(key)!.async('string')),
        )
        expect(charts).toHaveLength(expected.length)
        for (const currency of expected)
          expect(charts.filter((chart) => chart.includes(`${heading} ${currency}`))).toHaveLength(1)
        const book = new ExcelJS.Workbook()
        await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
        expect(book.worksheets).toHaveLength(data.sections.length + 1)
        for (const [index, section] of data.sections.entries()) {
          const cells: unknown[] = []
          book.worksheets[index + 1]!.eachRow((row) =>
            row.eachCell((cell) => cells.push(cell.value)),
          )
          expect(cells).toContain(`${section.key}-record`)
          expect(cells).toContain(123.45)
        }
        expect(data).toEqual(before)
      },
    )
  })
})
