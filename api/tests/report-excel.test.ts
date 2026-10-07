import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import {
  ReportAnalysisSchema,
  ReportScheduleInputSchema,
} from '../src/contracts/generated/reporting/reporting.schemas.js'
import { reportFormats } from '../src/modules/reporting/shared/services/report-output.js'
import { renderReport } from '../src/modules/reporting/shared/services/report-renderer.service.js'
import { reportTable } from '../src/modules/reporting/shared/services/report-table.js'

const snapshot = () =>
  ReportAnalysisSchema.parse({
    snapshotVersion: 3,
    metricDefinitionVersion: '2',
    companyName: 'Atlas',
    capturedAt: '2026-10-04T12:00:00Z',
    currencies: ['MAD', 'EUR'],
    filters: {
      from: '2026-09-01',
      to: '2026-09-30',
      timezone: 'UTC',
      sections: ['revenue'],
      bucket: 'day',
      limit: 25,
      offset: 0,
      sort: 'date_desc',
      start: '2026-09-01T00:00:00Z',
      endExclusive: '2026-10-01T00:00:00Z',
    },
    sections: [
      {
        key: 'revenue',
        timeBasis: 'period',
        metrics: [
          { key: 'gross', value: '120.50', currency: 'MAD', unit: 'money', timeBasis: 'period' },
        ],
        series: [{ date: '2026-09-02', currency: 'MAD', key: 'gross', value: '120.50' }],
        visuals: [
          {
            group: 'buyer_type',
            key: 'first',
            label: 'first',
            currency: 'MAD',
            unit: 'money',
            value: '120.50',
          },
        ],
        rows: ['MAD', 'EUR'].map((currency) => ({
          id: null,
          label: '=SUM(1,2)',
          clientName: 'Client & Co',
          currency,
          date: '2026-09-02',
          status: 'issued',
          net: '100.50',
          vat: '20.00',
          gross: '120.50',
          amount: '120.50',
          quantity: null,
          weightKg: null,
          unknownWeightCount: 0,
        })),
        total: 2,
        limit: 25,
        offset: 0,
        coverage: null,
      },
    ],
  })
describe('Excel and section-table reports', () => {
  it('defaults requests to PDF and preserves legacy frozen format sets', () => {
    expect(reportFormats()).toEqual(['pdf', 'csv'])
    expect(reportFormats('pdf')).toEqual(['pdf'])
    expect(reportFormats('excel')).toEqual(['xlsx'])
    expect(reportFormats('both')).toEqual(['pdf', 'xlsx'])
    const input = ReportScheduleInputSchema.parse({
      name: 'Report',
      frequency: 'weekly',
      weekday: 1,
      monthDay: null,
      localTime: '08:00',
      timezone: 'UTC',
      period: 'previous_week',
      includedSections: ['revenue'],
      recipientIds: ['11111111-1111-4111-8111-111111111111'],
      enabled: false,
    })
    expect(input.output).toBe('pdf')
  })
  it('exports typed cells, safe user text, currency-specific totals, native linked charts and print setup', async () => {
    const bytes = await renderReport(snapshot(), 'xlsx', 'fr')
    const zip = await JSZip.loadAsync(bytes)
    const chartFiles = Object.keys(zip.files).filter((key) =>
      /^xl\/charts\/chart\d+\.xml$/.test(key),
    )
    expect(chartFiles).toHaveLength(2)
    const chart = await zip.file(chartFiles[0]!)!.async('string')
    expect(chart).toContain('<c:lineChart>')
    expect(chart).toContain('<c:f>')
    expect(chart).toContain('120.5')
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(bytes as unknown as ExcelJS.Buffer)
    const section = book.worksheets[1]!
    expect(section.pageSetup).toMatchObject({ paperSize: 9, fitToWidth: 1, fitToHeight: 0 })
    const cells: ExcelJS.Cell[] = []
    section.eachRow((row) => row.eachCell((cell) => cells.push(cell)))
    const names = cells.filter((cell) => cell.value === '=SUM(1,2)')
    expect(names).toHaveLength(2)
    expect(names.every((cell) => cell.type === ExcelJS.ValueType.String)).toBe(true)
    expect(cells.some((cell) => cell.value instanceof Date)).toBe(true)
    expect(cells.some((cell) => cell.value === 120.5)).toBe(true)
    const tables = reportTable(snapshot().sections[0]!, 'fr')
    expect(tables.map((table) => table.currency)).toEqual(['MAD', 'EUR'])
    expect(tables.every((table) => table.rows.length === 1)).toBe(true)
  })
  it('rejects missing records, paginates complete PDF tables and keeps legacy PDF behavior', async () => {
    const data = snapshot()
    data.sections[0]!.total = 100
    await expect(renderReport(data, 'pdf')).rejects.toMatchObject({
      code: 'REPORT_DETAILS_INCOMPLETE',
    })
    await expect(renderReport(data, 'xlsx')).rejects.toMatchObject({
      code: 'REPORT_DETAILS_INCOMPLETE',
    })
    data.snapshotVersion = 2
    expect((await renderReport(data, 'pdf')).subarray(0, 5).toString()).toBe('%PDF-')
    data.snapshotVersion = 3
    data.sections[0]!.rows = Array.from({ length: 100 }, () => snapshot().sections[0]!.rows[0]!)
    const pdf = await PDFDocument.load(await renderReport(data, 'pdf'))
    expect(pdf.getPageCount()).toBeGreaterThan(2)
  })
})
