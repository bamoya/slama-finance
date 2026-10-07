import type { ReportSection } from '../../../../contracts/generated/reporting/reporting.schemas.js'
import type { createDocumentCanvas } from '../../../../lib/documents/canvas.js'
import { H, W } from '../../../../lib/documents/canvas.js'
import { frenchReportLabel } from './report-labels.js'
import { reportTable } from './report-table.js'

export function drawReportTable(
  c: Awaited<ReturnType<typeof createDocumentCanvas>>,
  section: ReportSection,
  language: 'fr' | 'en',
  start: number,
  newPage: () => number,
) {
  let y = start
  const left = 30,
    width = W - 60,
    size = 7
  const title = language === 'fr' ? 'Données détaillées' : 'Supporting records'
  const text = (value: unknown) => String(value ?? '—')
  for (const group of reportTable(section, language)) {
    const weights = group.columns.map((column) =>
      column.key === 'label' ? 2.3 : column.kind === 'text' ? 1.5 : 1,
    )
    const total = weights.reduce((a, b) => a + b, 0)
    const widths = weights.map((value) => (width * value) / total)
    const heading = () => {
      c.text(`${title}${group.heading ? ` · ${group.heading}` : ''}`, left, y, 9, '#26322e', 'bold')
      y += 17
      const lines = group.columns.map((column, i) =>
        c.wrap(column.label, widths[i]! - 8, size, 'bold'),
      )
      const height = Math.max(...lines.map((line) => line.length)) * 10 + 8
      c.rect(left, y, width, height, '#e9eeeb')
      let x = left
      lines.forEach((lines, i) => {
        lines.forEach((line, n) => c.text(line, x + 4, y + 4 + n * 10, size, '#26322e', 'bold'))
        x += widths[i]!
      })
      y += height
    }
    if (y > H - 120) y = newPage()
    heading()
    const records = [
      ...group.rows.map((row) =>
        group.columns.map((column) => {
          const value = row[column.key]
          if (value == null) return '—'
          if (column.kind === 'number')
            return new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
              maximumFractionDigits: column.key === 'quantity' || column.key === 'weightKg' ? 3 : 2,
            })
              .format(Number(value))
              .replaceAll('\u202f', ' ')
          if (column.key === 'status' || column.key === 'method')
            return language === 'fr'
              ? frenchReportLabel(text(value))
              : text(value).replaceAll('_', ' ')
          return text(value)
        }),
      ),
      group.totals,
    ]
    records.forEach((values, index) => {
      const totals = index === records.length - 1
      const lines = values.map((value, i) =>
        c.wrap(value, widths[i]! - 8, size, totals ? 'bold' : 'regular'),
      )
      const height = Math.max(...lines.map((line) => line.length), 1) * 10 + 8
      const keepTotal = index === records.length - 2 ? 28 : 0
      if (y + height + keepTotal > H - 48) {
        y = newPage()
        heading()
      }
      if (totals || index % 2 === 0) c.rect(left, y, width, height, totals ? '#e9eeeb' : '#f5f7f5')
      let x = left
      lines.forEach((lines, i) => {
        lines.forEach((line, n) =>
          c.text(line, x + 4, y + 4 + n * 10, size, '#26322e', totals ? 'bold' : 'regular'),
        )
        x += widths[i]!
      })
      y += height
    })
    y += 14
  }
  return y
}
