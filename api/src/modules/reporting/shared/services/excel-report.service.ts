import ExcelJS from 'exceljs'

import type { ReportAnalysis } from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { addExcelCharts, type ExcelChart } from './excel-charts.js'
import { frenchReportLabel } from './report-labels.js'
import { exportMetrics, exportVisuals } from './report-presentation.js'
import { reportTable } from './report-table.js'
import { reportLabel } from './visual-pdf.service.js'

export async function renderReportExcel(snapshot: ReportAnalysis, language: 'fr' | 'en') {
  const book = new ExcelJS.Workbook()
  book.creator = 'Slama Finance'
  book.created = new Date(snapshot.capturedAt)
  const fr = language === 'fr',
    label = fr ? frenchReportLabel : reportLabel
  const basisLabel = (value: string) =>
    value === 'capture'
      ? fr
        ? 'À la capture'
        : 'At capture'
      : value === 'lifecycle'
        ? fr
          ? 'Événements de la période'
          : 'Period events'
        : fr
          ? 'Période sélectionnée'
          : 'Selected period'
  const metrics = (section: ReportAnalysis['sections'][number]) =>
    exportMetrics(section).filter(
      (metric) =>
        metric.key !== 'amount' ||
        !section.metrics.some(
          (other) =>
            other.key === 'gross' &&
            other.currency === metric.currency &&
            other.value === metric.value,
        ),
    )
  const metricLabel = (section: ReportAnalysis['sections'][number], key: string) =>
    section.key === 'sales_by_client' && key === 'quantity'
      ? fr
        ? 'Nombre de factures'
        : 'Invoice count'
      : label(key)
  const charts: ExcelChart[] = []
  const cover = book.addWorksheet(fr ? 'Synthèse' : 'Overview')
  cover.addRow([snapshot.companyName])
  cover.addRow([fr ? 'Rapport financier' : 'Financial report'])
  cover.addRow([
    fr ? 'Du' : 'From',
    new Date(snapshot.filters.from + 'T12:00:00Z'),
    fr ? 'Au' : 'To',
    new Date(snapshot.filters.to + 'T12:00:00Z'),
  ])
  cover.addRow([
    fr ? 'Capture' : 'Captured',
    new Date(snapshot.capturedAt).toLocaleString(fr ? 'fr-FR' : 'en-GB', {
      timeZone: snapshot.filters.timezone,
    }),
    snapshot.filters.timezone,
  ])
  cover.addRow([
    fr ? 'Critères figés' : 'Frozen criteria',
    [
      snapshot.filters.currency ??
        (fr ? 'Toutes les devises (séparées)' : 'All currencies (separate)'),
      ...['clientId', 'productId', 'categoryId', 'segment'].flatMap((key) => {
        const value = snapshot.filters[key as keyof typeof snapshot.filters]
        return value ? [`${label(key)}: ${value}`] : []
      }),
    ].join(' · '),
  ])
  cover.addRow([
    fr
      ? 'Les devises restent séparées. Les lignes reflètent le segment sélectionné ; les indicateurs couvrent toute la période.'
      : 'Currencies stay separate. Rows reflect the selected segment; metrics cover the full period.',
  ])
  cover.addRow([])
  cover.addRow([
    fr ? 'Section' : 'Section',
    fr ? 'Indicateur' : 'Metric',
    fr ? 'Devise' : 'Currency',
    fr ? 'Valeur' : 'Value',
    fr ? 'Base temporelle' : 'Time basis',
  ])
  const overview = snapshot.sections.some((section) => section.key === 'summary')
    ? snapshot.sections.filter((section) => section.key === 'summary')
    : snapshot.sections
  for (const section of overview)
    for (const metric of section.key === 'summary'
      ? metrics(section)
      : metrics(section).filter((item) => item.key === metrics(section)[0]?.key))
      cover.addRow([
        label(section.key),
        metricLabel(section, metric.key),
        metric.currency,
        Number(metric.value),
        basisLabel(metric.timeBasis),
      ])
  let tableId = 0
  for (const section of snapshot.sections.filter((item) => item.key !== 'summary')) {
    const sheet = book.addWorksheet(
      `${book.worksheets.length}. ${label(section.key)}`.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '),
    )
    sheet.addRow([label(section.key)])
    sheet.addRow([
      `${snapshot.filters.from} → ${snapshot.filters.to}`,
      snapshot.filters.timezone,
      basisLabel(section.timeBasis),
    ])
    sheet.addRow([
      fr ? 'Indicateur' : 'Metric',
      fr ? 'Devise' : 'Currency',
      fr ? 'Valeur' : 'Value',
      fr ? 'Unité' : 'Unit',
    ])
    for (const metric of metrics(section))
      sheet.addRow([
        metricLabel(section, metric.key),
        metric.currency,
        Number(metric.value),
        metric.unit === 'money'
          ? fr
            ? 'Montant'
            : 'Amount'
          : metric.unit === 'count'
            ? fr
              ? 'Nombre'
              : 'Count'
            : metric.unit,
      ])
    const previous = snapshot.comparison?.sections.find((item) => item.key === section.key)
    if (previous) {
      sheet.addRow([
        `${fr ? 'Période précédente' : 'Previous period'}: ${snapshot.comparison!.from} → ${snapshot.comparison!.to}`,
      ])
      for (const metric of metrics(previous).filter((item) => item.timeBasis !== 'capture'))
        sheet.addRow([
          metricLabel(previous, metric.key),
          metric.currency,
          Number(metric.value),
          fr ? 'Précédent' : 'Previous',
        ])
    }
    let row = sheet.rowCount + 2,
      helperRow = 1
    const groups = new Map<
      string,
      { title: string; kind: ExcelChart['kind']; labels: string[]; values: number[] }
    >()
    for (const point of section.series) {
      const key = `series:${point.currency}:${point.key}`
      const group = groups.get(key) ?? {
        title: `${label(point.key)} ${point.currency ?? ''}`,
        kind: 'line' as const,
        labels: [],
        values: [],
      }
      group.labels.push(point.date)
      group.values.push(Number(point.value))
      groups.set(key, group)
    }
    for (const group of groups.values()) {
      const points = new Map(group.labels.map((date, index) => [date, group.values[index]!]))
      group.labels = []
      group.values = []
      const cursor = new Date(`${snapshot.filters.from}T12:00:00Z`)
      if (snapshot.filters.bucket === 'week')
        cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7))
      if (snapshot.filters.bucket === 'month') cursor.setUTCDate(1)
      while (cursor.toISOString().slice(0, 10) <= snapshot.filters.to) {
        const date = cursor.toISOString().slice(0, 10)
        group.labels.push(`${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(2, 4)}`)
        group.values.push(points.get(date) ?? 0)
        if (snapshot.filters.bucket === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        else cursor.setUTCDate(cursor.getUTCDate() + (snapshot.filters.bucket === 'week' ? 7 : 1))
      }
    }
    if (section.key === 'vat')
      for (const currency of new Set(section.metrics.map((item) => item.currency))) {
        const points = ['net', 'vat'].map((key) =>
          section.metrics.find((item) => item.key === key && item.currency === currency),
        )
        groups.set(`vat:${currency}`, {
          title: `${fr ? 'Composition HT / TVA' : 'Net / VAT composition'} · ${currency ?? ''}`,
          kind: 'doughnut',
          labels: ['net', 'vat'].map(label),
          values: points.map((point) => Number(point?.value ?? 0)),
        })
      }
    for (const point of exportVisuals(snapshot, section)) {
      const key = `visual:${point.currency}:${point.group}:${point.unit}`
      const group = groups.get(key) ?? {
        title: `${label(point.group)} ${point.currency ?? ''}`,
        kind: ['methods', 'buyer_type', 'outcome', 'delivery_status', 'delivery_billing'].includes(
          point.group,
        )
          ? ('doughnut' as const)
          : ('bar' as const),
        labels: [],
        values: [],
      }
      group.labels.push(label(point.label))
      group.values.push(Number(point.value))
      groups.set(key, group)
    }
    for (const group of groups.values()) {
      const first = helperRow
      group.labels.forEach((value, index) => {
        sheet.getCell(helperRow, 20).value = value
        sheet.getCell(helperRow++, 21).value = group.values[index]!
      })
      const ref = `'${sheet.name.replaceAll("'", "''")}'!`
      charts.push({
        ...group,
        sheet: sheet.id,
        row,
        categoryFormula: `${ref}$T$${first}:$T$${helperRow - 1}`,
        valueFormula: `${ref}$U$${first}:$U$${helperRow - 1}`,
      })
      helperRow++
      row += 16
    }
    sheet.getColumn(20).hidden = true
    sheet.getColumn(21).hidden = true
    if (!section.rows.length)
      sheet.getCell(row++, 1).value = fr ? 'Aucune donnée correspondante.' : 'No matching records.'
    for (const group of reportTable(section, language)) {
      sheet.getCell(row++, 1).value =
        `${fr ? 'Données détaillées' : 'Supporting records'} · ${group.heading || '—'}`
      const header = row
      sheet.addTable({
        name: `Details${++tableId}`,
        ref: `A${row}`,
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: group.columns.map((column, i) => ({
          name: column.label,
          filterButton: true,
          ...(column.kind === 'number' &&
          column.key !== 'daysOverdue' &&
          section.key !== 'estimates'
            ? { totalsRowFunction: 'sum' as const }
            : i === 0
              ? { totalsRowLabel: fr ? 'Total' : 'Total' }
              : {}),
        })),
        rows: group.rows.map((record) =>
          group.columns.map((column) => {
            const value = record[column.key]
            if (value == null) return null
            if (column.kind === 'date') return new Date(`${value}T12:00:00Z`)
            if (column.kind === 'number') return Number(value)
            return column.key === 'status' || column.key === 'method'
              ? label(String(value))
              : String(value)
          }),
        ),
      })
      group.columns.forEach((column, index) => {
        for (let n = header + 1; n <= header + group.rows.length + 1; n++) {
          const cell = sheet.getCell(n, index + 1)
          cell.numFmt =
            column.kind === 'date'
              ? 'dd/mm/yyyy'
              : column.kind === 'number'
                ? '#,##0.00;[Red](#,##0.00);"—"'
                : '@'
        }
        if (column.kind === 'number' && column.key !== 'daysOverdue' && section.key !== 'estimates')
          sheet.getCell(header + group.rows.length + 1, index + 1).value = {
            formula: `SUBTOTAL(109,${sheet.getColumn(index + 1).letter}${header + 1}:${sheet.getColumn(index + 1).letter}${header + group.rows.length})`,
            result: Number(group.totals[index]),
          }
      })
      row += group.rows.length + 4
    }
    sheet.pageSetup.printArea = `A1:${sheet.getColumn(Math.max(8, ...reportTable(section, language).map((group) => group.columns.length))).letter}${row}`
  }
  for (const sheet of book.worksheets) {
    sheet.views = [{ state: 'frozen', ySplit: sheet === cover ? 8 : 3, showGridLines: false }]
    sheet.properties.defaultRowHeight = 20
    for (let index = 1; index <= 14; index++) sheet.getColumn(index).width = index === 1 ? 30 : 16
    sheet.pageSetup = {
      ...sheet.pageSetup,
      paperSize: 9,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.15, footer: 0.15 },
      printTitlesRow: sheet === cover ? '1:8' : '1:3',
    }
    sheet.headerFooter.oddFooter = '&LSlama Finance&R&P / &N'
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF26322E' } }
        cell.alignment = { vertical: 'middle', wrapText: true }
        if (cell.value instanceof Date) cell.numFmt = 'dd/mm/yyyy'
      }),
    )
    sheet.getRow(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFA87828' } }
    sheet.mergeCells('A1:H1')
    sheet.getRow(1).height = 30
    const headings = sheet.getRow(sheet === cover ? 8 : 3)
    headings.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF26322E' } }
    headings.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9EEEB' } }
    })
    sheet.eachRow((row) => {
      let lines = 1
      row.eachCell((cell) => {
        if (!cell.isMerged && typeof cell.value === 'string')
          lines = Math.max(
            lines,
            Math.ceil(cell.value.length / ((sheet.getColumn(cell.col).width ?? 16) * 0.9)),
          )
      })
      row.height = Math.max(row.height ?? 20, Math.min(100, lines * 14 + 6))
    })
  }
  cover.pageSetup.printArea = `A1:E${cover.rowCount}`
  cover.getRow(5).height = 55
  cover.mergeCells('B5:H5')
  cover.mergeCells('A6:H6')
  cover.getRow(6).height = 35
  cover.pageSetup.printArea = `A1:H${cover.rowCount}`
  return addExcelCharts(new Uint8Array(await book.xlsx.writeBuffer()), charts)
}
