import type { ReportAnalysis } from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { createDocumentCanvas, H, W } from '../../../../lib/documents/canvas.js'
import { AppError } from '../../../../lib/errors.js'
import { renderReportExcel } from './excel-report.service.js'
import type { ReportFormat } from './report-output.js'
import { exportContext, exportMetrics, percentageChange } from './report-presentation.js'
import { REPORT_LIMITS } from './report-time.service.js'
import { renderVisualPdf } from './visual-pdf.service.js'

export function assertExportSize(snapshot: ReportAnalysis, format: ReportFormat) {
  if (format === 'pdf' && snapshot.snapshotVersion === 2) return
  const bound = format === 'pdf' ? REPORT_LIMITS.pdfRows : REPORT_LIMITS.csvRows
  if (snapshot.sections.reduce((sum, section) => sum + section.total, 0) > bound)
    throw new AppError(
      400,
      'EXPORT_TOO_LARGE',
      `This ${format.toUpperCase()} exceeds ${bound} detail rows. Narrow the period, sections or filters.`,
    )
  if (
    (format !== 'pdf' || snapshot.snapshotVersion >= 3) &&
    snapshot.sections.some((section) => section.rows.length !== section.total)
  )
    throw new AppError(
      409,
      'REPORT_DETAILS_INCOMPLETE',
      'This frozen snapshot does not contain all detail rows. Generate a new report; historical figures cannot be reconstructed safely.',
    )
}
export function csvCell(value: string | number | null | undefined) {
  // Typed numbers cannot contain spreadsheet formulas; preserve negative changes
  // as numbers instead of prefixing them with the text-only injection escape.
  if (typeof value === 'number' && Number.isFinite(value)) return `"${value}"`
  let text = String(value ?? '')
  if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text) || text.charCodeAt(0) < 32)
    text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
export function renderReportCsv(snapshot: ReportAnalysis) {
  assertExportSize(snapshot, 'csv')
  const headers = [
    'record_type',
    'section',
    'time_basis',
    'currency',
    'key',
    'value',
    'date',
    'id',
    'label',
    'status',
    'net',
    'vat',
    'gross',
    'amount',
    'quantity',
    'weight_kg',
    'unknown_weight_count',
    'visual_group',
    'unit',
    'period',
    'period_from',
    'period_to',
    'scope',
    'change_percent',
  ]
  const rows: (string | number | null | undefined)[][] = [
    headers,
    ...exportContext(snapshot).map(([key, value]) => ['metadata', '', '', '', key, value]),
  ]
  const periods = [
    {
      key: 'current',
      from: snapshot.filters.from,
      to: snapshot.filters.to,
      sections: snapshot.sections,
    },
    ...(snapshot.comparison ? [{ key: 'previous', ...snapshot.comparison }] : []),
  ]
  for (const period of periods) {
    for (const section of period.sections) {
      const start = rows.length
      for (const point of section.visuals ?? [])
        if (
          period.key === 'current' ||
          !['aging', 'outcome', 'delivery_status', 'delivery_billing'].includes(point.group)
        )
          rows.push([
            'visual',
            section.key,
            ['aging', 'outcome', 'delivery_status', 'delivery_billing'].includes(point.group)
              ? 'capture'
              : section.timeBasis,
            point.currency,
            point.key,
            point.value,
            '',
            '',
            point.label,
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
            point.group,
            point.unit,
          ])
      for (const metric of exportMetrics(section)) {
        if (period.key === 'previous' && metric.timeBasis === 'capture') continue
        const row: (string | number | null | undefined)[] = [
          'metric',
          section.key,
          metric.timeBasis,
          metric.currency,
          metric.key,
          metric.value,
        ]
        row[18] = metric.unit
        if (period.key === 'current' && metric.timeBasis !== 'capture' && snapshot.comparison) {
          const previous = snapshot.comparison.sections.find((item) => item.key === section.key)
          const baseline =
            previous &&
            exportMetrics(previous).find(
              (item) =>
                item.key === metric.key &&
                item.currency === metric.currency &&
                item.timeBasis === metric.timeBasis,
            )
          const change = percentageChange(metric.value, baseline?.value)
          row[23] = change === null ? 'N/A' : Number(change)
        }
        rows.push(row)
      }
      for (const point of section.series)
        rows.push([
          'series',
          section.key,
          section.timeBasis,
          point.currency,
          point.key,
          point.value,
          point.date,
        ])
      for (const row of period.key === 'current' ? section.rows : [])
        rows.push([
          'detail',
          section.key,
          section.key === 'summary' && row.status === 'outstanding' ? 'capture' : section.timeBasis,
          row.currency,
          '',
          '',
          row.date,
          row.id,
          row.label,
          row.status,
          row.net,
          row.vat,
          row.gross,
          row.amount,
          row.quantity,
          row.weightKg,
          row.unknownWeightCount,
        ])
      if (!section.total && period.key === 'current')
        rows.push(['empty', section.key, section.timeBasis])
      for (const row of rows.slice(start)) {
        row[19] = period.key
        row[20] = period.from
        row[21] = period.to
        row[22] =
          row[0] === 'detail' &&
          snapshot.filters.segment &&
          snapshot.filters.detailSection === section.key
            ? 'selected_segment'
            : 'full_period_and_criteria'
      }
    }
  }
  return Buffer.from(
    '\ufeff' +
      rows.map((row) => headers.map((_, index) => csvCell(row[index])).join(',')).join('\r\n') +
      '\r\n',
    'utf8',
  )
}
export async function renderReportPdf(snapshot: ReportAnalysis, language: 'fr' | 'en' = 'fr') {
  assertExportSize(snapshot, 'pdf')
  if (snapshot.snapshotVersion >= 2) return renderVisualPdf(snapshot, language)
  assertExportSize(snapshot, 'pdf')
  const deadline = Date.now() + 30000
  const c = await createDocumentCanvas()
  const left = 36,
    width = W - 72,
    bottom = H - 48
  let y = 36
  const headers = ['Label / metric', 'Basis / date / status', 'Values']
  const widths = [180, 150, width - 330]
  function header() {
    c.rect(left, y, width, 22, '#edf0ee')
    let x = left
    headers.forEach((value, index) => {
      c.text(value, x + 4, y + 6, 8, '#222c28', 'bold')
      x += widths[index]!
    })
    y += 24
  }
  function newPage() {
    c.addPage()
    y = 30
    for (const line of c.wrap(snapshot.companyName, width, 12, 'bold')) {
      c.text(line, left, y, 12, '#222c28', 'bold')
      y += 19
    }
    c.text('Financial report', left, y, 14, '#222c28', 'bold')
    y += 22
    for (const text of [
      `${snapshot.filters.from} – ${snapshot.filters.to} · ${snapshot.filters.timezone}`,
      `Captured ${snapshot.capturedAt} · metric definitions ${snapshot.metricDefinitionVersion}`,
    ])
      for (const line of c.wrap(text, width, 8)) {
        c.text(line, left, y, 8)
        y += 12
      }
    y += 8
    header()
  }
  function row(values: string[], bold = false) {
    if (Date.now() > deadline)
      throw new AppError(
        503,
        'REPORT_RENDER_TIMEOUT',
        'Report rendering exceeded 30 seconds. Narrow the filters and retry.',
      )
    const cells = values.map((value, index) =>
      c.wrap(value, widths[index]! - 8, 8, bold ? 'bold' : 'regular'),
    )
    const height = Math.max(...cells.map((cell) => cell.length)) * 11 + 10
    if (y + height > bottom && height < bottom - 140) newPage()
    let offset = 0
    const count = Math.max(...cells.map((cell) => cell.length))
    while (offset < count) {
      let capacity = Math.floor((bottom - y - 10) / 11)
      if (capacity < 1) {
        newPage()
        capacity = Math.floor((bottom - y - 10) / 11)
      }
      const size = Math.min(count - offset, capacity)
      let x = left
      cells.forEach((cell, index) => {
        cell
          .slice(offset, offset + size)
          .forEach((value, j) =>
            c.text(value, x + 4, y + 5 + j * 11, 8, '#222c28', bold ? 'bold' : 'regular'),
          )
        x += widths[index]!
      })
      y += size * 11 + 10
      c.rect(left, y - 2, width, 0.5, '#d9dfdb')
      offset += size
    }
  }
  newPage()
  for (const section of snapshot.sections) {
    row(
      [
        section.key.replaceAll('_', ' '),
        `${section.timeBasis} basis`,
        `${section.total} detail rows`,
      ],
      true,
    )
    for (const metric of section.metrics)
      row([
        metric.unit !== 'money' && metric.currency
          ? `${metric.key} (${metric.currency})`
          : metric.key,
        metric.timeBasis,
        `${metric.value}${metric.unit === 'money' ? ` ${metric.currency ?? ''}` : metric.unit === 'kg' ? ' kg' : ''}`,
      ])
    if (section.coverage) row(['Coverage', section.coverage, ''])
    if (!section.total) row(['No matching records', '', ''])
    for (const item of section.rows) {
      const values = [
        ['Net', item.net],
        ['VAT', item.vat],
        ['Gross', item.gross],
        ['Amount', item.amount],
        ['Qty', item.quantity],
        ['Kg', item.weightKg],
      ]
        .filter(([, value]) => value !== null)
        .map(([label, value]) => `${label}: ${value}`)
      if (item.unknownWeightCount) values.push(`${item.unknownWeightCount} unknown weights`)
      row([
        item.label,
        [
          section.key === 'summary' && item.status === 'outstanding'
            ? 'capture basis'
            : section.timeBasis + ' basis',
          item.date,
          item.status,
          item.currency,
        ]
          .filter(Boolean)
          .join('\n'),
        values.join('\n'),
      ])
    }
  }
  for (let index = 0; index < c.pageCount; index++) {
    c.selectPage(index)
    c.text(`${index + 1} / ${c.pageCount}`, W - 80, H - 30, 8)
  }
  c.pdf.setTitle(`Financial report ${snapshot.filters.from} to ${snapshot.filters.to}`)
  return Buffer.from(await c.pdf.save())
}
export async function renderReport(
  snapshot: ReportAnalysis,
  format: ReportFormat,
  language: 'fr' | 'en' = 'fr',
) {
  assertExportSize(snapshot, format)
  const started = Date.now()
  if (
    format === 'xlsx' &&
    [...snapshot.sections, ...(snapshot.comparison?.sections ?? [])].reduce(
      (sum, section) =>
        sum + section.metrics.length + section.series.length + (section.visuals?.length ?? 0),
      0,
    ) > 10000
  )
    throw new AppError(
      400,
      'EXPORT_TOO_LARGE',
      'Too many visual measures. Narrow the currency, period or selected sections.',
    )
  const bytes =
    format === 'xlsx'
      ? await renderReportExcel(snapshot, language)
      : format === 'pdf'
        ? await renderReportPdf(snapshot, language)
        : renderReportCsv(snapshot)
  if (bytes.length > REPORT_LIMITS.artifactBytes)
    throw new AppError(
      400,
      'EXPORT_TOO_LARGE',
      'The report file exceeds 8 MiB. Narrow the filters.',
    )
  if (Date.now() - started > 30000)
    throw new AppError(
      400,
      'EXPORT_TOO_LARGE',
      'Report generation exceeded 30 seconds. Narrow the period or sections.',
    )
  return bytes
}
