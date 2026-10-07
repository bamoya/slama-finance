import { PDFDocument } from 'pdf-lib'
import { describe, expect, it, vi } from 'vitest'

import {
  ReportAnalysisSchema,
  ReportScheduleInputSchema,
  ReportScheduleSchema,
} from '../src/contracts/generated/reporting/reporting.schemas.js'
import { createDocumentCanvas } from '../src/lib/documents/canvas.js'
import {
  drawReportDonut,
  isRingBreakdown,
  reportDonutHeight,
} from '../src/modules/reporting/shared/services/report-breakdown-pdf.js'
import {
  collectionMonths,
  drawCollectionMonth,
} from '../src/modules/reporting/shared/services/report-calendar-pdf.js'
import { composeReportEmail } from '../src/modules/reporting/shared/services/report-email.service.js'
import { renderReportPdf } from '../src/modules/reporting/shared/services/report-renderer.service.js'

const schedule = {
  name: 'Weekly',
  frequency: 'weekly',
  weekday: 1,
  monthDay: null,
  localTime: '08:00',
  timezone: 'Africa/Casablanca',
  period: 'previous_week',
  includedSections: ['revenue'],
  recipientIds: ['11111111-1111-4111-8111-111111111111'],
  enabled: false,
}
const snapshot = () =>
  ReportAnalysisSchema.parse({
    snapshotVersion: 2,
    metricDefinitionVersion: '2',
    companyName: '<Company & Co>',
    capturedAt: '2026-10-04T12:00:00Z',
    currencies: ['MAD'],
    filters: {
      from: '2026-09-21',
      to: '2026-09-27',
      timezone: 'Africa/Casablanca',
      sections: ['revenue'],
      bucket: 'day',
      limit: 25,
      offset: 0,
      sort: 'date_desc',
      start: '2026-09-20T23:00:00Z',
      endExclusive: '2026-09-27T23:00:00Z',
    },
    sections: [
      {
        key: 'revenue',
        timeBasis: 'period',
        metrics: [
          { key: 'gross', value: '1250.50', unit: 'money', currency: 'MAD', timeBasis: 'period' },
        ],
        series: [],
        visuals: [],
        rows: [],
        total: 0,
        limit: 25,
        offset: 0,
        coverage: null,
      },
    ],
  })
describe('scheduled report languages and visual parity', () => {
  it('defaults old requests and frozen configurations to French and rejects unsupported languages', () => {
    expect(ReportScheduleInputSchema.parse(schedule).language).toBe('fr')
    expect(ReportScheduleInputSchema.parse({ ...schedule, language: 'en' }).language).toBe('en')
    expect(ReportScheduleInputSchema.safeParse({ ...schedule, language: 'es' }).success).toBe(false)
    expect(
      ReportScheduleSchema.parse({
        ...schedule,
        id: schedule.recipientIds[0],
        nextRunAt: null,
        archivedAt: null,
        version: 1,
        createdAt: '2026-10-01T00:00:00Z',
        updatedAt: '2026-10-01T00:00:00Z',
      }).language,
    ).toBe('fr')
  })
  it.each(['fr', 'en'] as const)(
    'creates escaped, structured %s HTML and plain text with matching PDF language',
    async (language) => {
      const email = composeReportEmail(
        snapshot(),
        '<Weekly & report>',
        'https://finance.example/reports?x=1&y=2',
        language,
      )
      expect(email.html).toContain(`<html lang="${language}">`)
      expect(email.html).toContain('&lt;Weekly &amp; report&gt;')
      expect(email.html).toContain('&lt;Company &amp; Co&gt;')
      expect(email.html).not.toContain('<Weekly')
      expect(email.html).toContain('role="presentation"')
      expect(email.html).toContain('x=1&amp;y=2')
      expect(email.text).toContain(language === 'fr' ? 'Période sélectionnée' : 'Selected period')
      expect(email.subject).toBe(
        language === 'fr' ? 'Votre rapport financier programmé' : 'Your scheduled financial report',
      )
      const pdf = await PDFDocument.load(await renderReportPdf(snapshot(), language))
      expect(pdf.getTitle()).toContain(language === 'fr' ? 'Rapport financier' : 'Financial report')
    },
  )
  it('matches UI donut choices without turning overlapping estimate cohorts into pie slices', () => {
    for (const group of ['methods', 'buyer_type', 'outcome', 'delivery_billing'])
      expect(isRingBreakdown('summary', group)).toBe(true)
    expect(isRingBreakdown('sales_by_category', 'ranking')).toBe(true)
    expect(isRingBreakdown('sales_by_client', 'ranking')).toBe(false)
    expect(isRingBreakdown('estimates', 'cohort')).toBe(false)
  })
  it('draws 100% and zero donuts safely and labels every legend value', async () => {
    const canvas = await createDocumentCanvas()
    canvas.addPage()
    const text = vi.spyOn(canvas, 'text'),
      paths = vi.spyOn(canvas.pdf.getPage(0), 'drawSvgPath')
    const points = [
      { label: 'Cash', value: 100, formatted: '100.00 MAD' },
      { label: 'Bank', value: 0, formatted: '0.00 MAD' },
    ]
    const height = drawReportDonut(canvas, {
      left: 30,
      top: 50,
      width: 535,
      points,
      language: 'en',
    })
    expect(paths).toHaveBeenCalledTimes(2)
    expect(text.mock.calls.map(([value]) => value)).toContain('100.00 MAD · 100%')
    expect(height).toBeLessThanOrEqual(reportDonutHeight(canvas, 535, points, 0))
    drawReportDonut(canvas, {
      left: 30,
      top: 200,
      width: 535,
      points: points.map((p) => ({ ...p, value: 0 })),
      language: 'fr',
    })
    expect(paths).toHaveBeenCalledTimes(2)
  })
  it('keeps partial-week dates and calendar values visible without inventing activity', async () => {
    const months = collectionMonths('2026-09-29', '2026-10-02')
    expect(months).toEqual([
      ['2026-09', ['2026-09-29', '2026-09-30']],
      ['2026-10', ['2026-10-01', '2026-10-02']],
    ])
    const canvas = await createDocumentCanvas()
    canvas.addPage()
    const text = vi.spyOn(canvas, 'text')
    drawCollectionMonth(canvas, {
      left: 30,
      top: 50,
      width: 535,
      month: '2026-09',
      dates: months[0]![1],
      amounts: new Map([['2026-09-29', 1200]]),
      maximum: 1200,
      currency: 'MAD',
      language: 'en',
    })
    expect(text.mock.calls.map(([value]) => value)).toEqual(
      expect.arrayContaining(['29', '30', '1,200', '0']),
    )
  })
})
