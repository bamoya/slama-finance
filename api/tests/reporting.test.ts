import { PDFDocument } from 'pdf-lib'
import { describe, expect, it } from 'vitest'

import {
  ReportAnalysisSchema,
  ReportCriteriaSchema,
} from '../src/contracts/generated/reporting/reporting.schemas.js'
import {
  assertReportPermissions,
  normalizeCriteria,
} from '../src/modules/reporting/analysis/services/analysis.service.js'
import {
  exportMetrics,
  percentageChange,
} from '../src/modules/reporting/shared/services/report-presentation.js'
import {
  csvCell,
  renderReportCsv,
  renderReportPdf,
} from '../src/modules/reporting/shared/services/report-renderer.service.js'
import {
  localInstant,
  nextOccurrence,
  occurrencePeriod,
} from '../src/modules/reporting/shared/services/report-time.service.js'

describe('Reporting calendar and authorization', () => {
  it('uses inclusive dates and real local UTC boundaries without shifting business dates', () => {
    const filters = normalizeCriteria(
      ReportCriteriaSchema.parse({
        from: '2026-03-08',
        to: '2026-03-08',
        timezone: 'America/New_York',
      }),
      { timezone: 'Africa/Casablanca', capturedAt: new Date('2026-04-01T00:00:00Z') },
      ['summary'],
    )
    expect(filters).toMatchObject({
      from: '2026-03-08',
      to: '2026-03-08',
      start: '2026-03-08T05:00:00.000Z',
      endExclusive: '2026-03-09T04:00:00.000Z',
    })
    expect(() =>
      normalizeCriteria(
        ReportCriteriaSchema.parse({ from: '2025-01-01', to: '2026-01-02' }),
        { timezone: 'UTC', capturedAt: new Date() },
        ['summary'],
      ),
    ).toThrow('366')
    expect(() =>
      normalizeCriteria(
        ReportCriteriaSchema.parse({ productId: '11111111-1111-4111-8111-111111111111' }),
        { timezone: 'UTC', capturedAt: new Date() },
        ['collections'],
      ),
    ).toThrow('not supported')
  })
  it('resolves gaps to the first valid minute and repeated times to the earlier instant', () => {
    expect(localInstant('2026-03-08', '02:30', 'America/New_York').toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    )
    expect(localInstant('2026-11-01', '01:30', 'America/New_York').toISOString()).toBe(
      '2026-11-01T05:30:00.000Z',
    )
    const config = {
      frequency: 'daily',
      weekday: null,
      monthDay: null,
      localTime: '02:30',
      timezone: 'America/New_York',
      period: 'previous_day',
    }
    expect(nextOccurrence(config, new Date('2026-03-07T07:30:00Z')).toISOString()).toBe(
      '2026-03-08T07:00:00.000Z',
    )
    expect(
      occurrencePeriod({ ...config, period: 'previous_week' }, new Date('2026-01-01T15:00:00Z')),
    ).toEqual({ from: '2025-12-22', to: '2025-12-28' })
    expect(
      occurrencePeriod({ ...config, period: 'previous_month' }, new Date('2026-01-01T15:00:00Z')),
    ).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
  it('uses one grant for every report operation and rejects missing or obsolete grants', () => {
    expect(() => assertReportPermissions(['reports.read'])).not.toThrow()
    expect(() => assertReportPermissions([])).toThrow('Report access')
    expect(() => assertReportPermissions(['reports.sections.summary', 'reports.export'])).toThrow(
      'Report access',
    )
  })
})
describe('Report output', () => {
  const snapshot = () =>
    ReportAnalysisSchema.parse({
      metricDefinitionVersion: '1',
      snapshotVersion: 1,
      capturedAt: '2026-10-02T12:00:00Z',
      companyName: 'Société أطلس',
      filters: normalizeCriteria(
        ReportCriteriaSchema.parse({ from: '2026-09-01', to: '2026-09-30', timezone: 'UTC' }),
        { timezone: 'UTC', capturedAt: new Date('2026-10-02T12:00:00Z') },
        ['revenue'],
      ),
      currencies: ['MAD'],
      sections: [
        {
          key: 'revenue',
          timeBasis: 'period',
          metrics: [
            { key: 'gross', currency: 'MAD', value: '125.00', unit: 'money', timeBasis: 'period' },
          ],
          series: [],
          rows: [],
          total: 0,
          limit: 25,
          offset: 0,
          coverage: null,
        },
      ],
    })
  it('escapes CSV Unicode, quotes, multiline text and formula/control prefixes', () => {
    for (const unsafe of ['=SUM(A1:A2)', '+cmd', '-cmd', '@formula', '  =cmd', '\tcmd', '\rcmd'])
      expect(csvCell(unsafe)).toMatch(/^"'/)
    expect(csvCell('Société "Atlas"\nأطلس')).toBe('"Société ""Atlas""\nأطلس"')
    expect(csvCell(-50)).toBe('"-50"')
    expect(renderReportCsv(snapshot()).toString('utf8')).toContain(
      '"metric","revenue","period","MAD","gross","125.00"',
    )
  })
  it('labels summary outstanding rows at capture and keeps series on their declared basis', () => {
    const data = snapshot()
    data.filters.sections = ['summary']
    const section = data.sections[0]!
    section.key = 'summary'
    section.total = 1
    section.series = [{ date: '2026-09-01', currency: 'MAD', key: 'gross', value: '125.00' }]
    section.rows = [
      {
        id: null,
        label: 'outstanding',
        status: 'outstanding',
        currency: 'MAD',
        date: null,
        net: null,
        vat: null,
        gross: null,
        amount: '100.00',
        quantity: null,
        weightKg: null,
        unknownWeightCount: 0,
      },
    ]
    const csv = renderReportCsv(data).toString('utf8')
    expect(csv).toContain('"detail","summary","capture","MAD"')
    expect(csv).toContain('"series","summary","period","MAD"')
  })
  it('renders empty and long-name multipage A4 PDFs with vector text', async () => {
    const empty = await PDFDocument.load(await renderReportPdf(snapshot()))
    expect(empty.getPageCount()).toBe(1)
    expect(empty.getPage(0).getWidth()).toBeCloseTo(595.28)
    const data = snapshot()
    data.sections[0]!.total = 100
    data.sections[0]!.rows = Array.from({ length: 100 }, (_, index) => ({
      id: String(index),
      label: 'A long customer name with quotes Société أطلس '.repeat(5),
      currency: 'MAD',
      date: '2026-09-15',
      status: 'issued',
      net: '100.00',
      vat: '25.00',
      gross: '125.00',
      amount: '125.00',
      quantity: null,
      weightKg: null,
      unknownWeightCount: 0,
    }))
    const pdf = await PDFDocument.load(await renderReportPdf(data))
    expect(pdf.getPageCount()).toBeGreaterThan(2)
  }, 20000)
  it('rejects incomplete frozen CSV snapshots and oversized exports instead of truncating', () => {
    const data = snapshot()
    data.sections[0]!.total = 2500
    expect(() => renderReportCsv(data)).toThrow('does not contain all detail rows')
    data.sections[0]!.total = 10001
    expect(() => renderReportCsv(data)).toThrow('10000 detail rows')
  })
  it('includes criteria, units, previous metrics and series without inventing previous details or balance comparisons', () => {
    const data = snapshot()
    data.filters.clientId = '11111111-1111-4111-8111-111111111111'
    data.filters.segment = 'manual'
    data.filters.detailSection = 'sales_by_product'
    data.filters.productId = '22222222-2222-4222-8222-222222222222'
    data.filters.categoryId = '33333333-3333-4333-8333-333333333333'
    const section = data.sections[0]!
    data.comparison = {
      from: '2026-08-02',
      to: '2026-08-31',
      sections: [
        {
          ...section,
          metrics: [
            { ...section.metrics[0]!, value: '100.00' },
            { ...section.metrics[0]!, key: 'outstanding', timeBasis: 'capture', value: '999.00' },
          ],
          series: [{ key: 'gross', date: '2026-08-02', currency: 'MAD', value: '100.00' }],
        },
      ],
    }
    const csv = renderReportCsv(data).toString('utf8')
    for (const value of [
      data.filters.clientId,
      data.filters.productId,
      data.filters.categoryId,
      'selected_segment',
      'comparison_from',
      '2026-08-02',
      '2026-08-31',
    ])
      expect(csv).toContain(value)
    const records = csv
      .split('\r\n')
      .map((line) => [...line.matchAll(/"((?:[^"]|"")*)"/g)].map((match) => match[1]))
    const current = records.find((row) => row[0] === 'metric' && row[19] === 'current')!
    expect(current[18]).toBe('money')
    expect(current[23]).toBe('25')
    expect(records).toContainEqual(expect.arrayContaining(['series', '2026-08-02', 'previous']))
    expect(records.filter((row) => row[19] === 'previous' && row[0] === 'detail')).toHaveLength(0)
    expect(csv).not.toContain('999.00')
    expect(percentageChange('125', '0')).toBeNull()
    expect(percentageChange('125', undefined)).toBeNull()
    expect(percentageChange('50', '100')).toBe('-50.0')
  })
  it('derives the same per-currency average unit price as the UI from aggregates, not detail pages', () => {
    const section = snapshot().sections[0]!
    section.key = 'sales_by_product'
    section.metrics = [
      { key: 'net', currency: 'MAD', value: '36000', unit: 'money', timeBasis: 'period' },
      { key: 'quantity', currency: 'MAD', value: '360', unit: 'count', timeBasis: 'period' },
      { key: 'net', currency: 'EUR', value: '200', unit: 'money', timeBasis: 'period' },
      { key: 'quantity', currency: 'EUR', value: '0', unit: 'count', timeBasis: 'period' },
    ]
    expect(exportMetrics(section).filter((metric) => metric.key === 'average_unit_price')).toEqual([
      {
        key: 'average_unit_price',
        currency: 'MAD',
        value: '100.00',
        unit: 'money',
        timeBasis: 'period',
      },
    ])
  })
  it('renders a French visual PDF with comparisons without expanding raw detail rows', async () => {
    const data = snapshot()
    data.snapshotVersion = 2
    data.sections[0]!.series = [{ date: '2026-09-15', currency: 'MAD', key: 'gross', value: '125' }]
    data.comparison = { from: '2026-08-02', to: '2026-08-31', sections: data.sections }
    const pdf = await PDFDocument.load(await renderReportPdf(data))
    expect(pdf.getTitle()).toBe('Rapport financier 2026-09-01 - 2026-09-30')
    expect(pdf.getPageCount()).toBe(1)
    expect(pdf.getPage(0).getHeight()).toBeCloseTo(841.89)
  })
  it('packs small report sections together instead of forcing a page per section', async () => {
    const data = snapshot()
    data.snapshotVersion = 2
    data.sections = (
      [
        'summary',
        'revenue',
        'collections',
        'outstanding',
        'overdue',
        'payment_methods',
        'vat',
        'sales_by_client',
      ] as const
    ).map((key) => ({ ...data.sections[0]!, key }))
    const pdf = await PDFDocument.load(await renderReportPdf(data))
    expect(pdf.getPageCount()).toBeLessThanOrEqual(2)
  })
})
