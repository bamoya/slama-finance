import { Decimal } from 'decimal.js'

import type { ReportAnalysis } from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { createDocumentCanvas, H, W } from '../../../../lib/documents/canvas.js'
import { AppError } from '../../../../lib/errors.js'
import { drawReportDonut, isRingBreakdown, reportDonutHeight } from './report-breakdown-pdf.js'
import {
  collectionMonthHeight,
  collectionMonths,
  drawCollectionMonth,
} from './report-calendar-pdf.js'
import { frenchReportLabel } from './report-labels.js'
import { exportMetrics, exportVisuals, percentageChange } from './report-presentation.js'
import { drawReportTable } from './report-table-pdf.js'
import { drawReportTrend } from './report-trend-pdf.js'

const palette = ['#a87828', '#3d8075', '#557ea8', '#ad8867', '#a65c72']
const ink = '#26322e',
  muted = '#64716b',
  light = '#f1f3f1'
const formatFigure = (value: string, unit: string, language: 'fr' | 'en') => {
  const [whole, fraction] = new Decimal(value)
    .toDecimalPlaces(unit === 'money' ? 2 : 3)
    .toFixed(unit === 'money' ? 2 : undefined)
    .split('.')
  return (
    whole!.replace(/\B(?=(\d{3})+(?!\d))/g, language === 'fr' ? ' ' : ',') +
    (fraction ? `${language === 'fr' ? ',' : '.'}${fraction}` : '')
  )
}
const labels: Record<string, string> = {
  revenue: 'Sales',
  collections: 'Confirmed collections',
  outstanding: 'Outstanding balances',
  overdue: 'Overdue balances',
  payment_methods: 'Payment methods',
  pending_cheques: 'Pending cheques',
  summary: 'Business summary',
  sales_by_client: 'Sales by client',
  sales_by_product: 'Sales by product',
  sales_by_category: 'Sales by category',
  estimates: 'Estimate progression',
  deliveries: 'Delivery activity',
  aging: 'Receivables aging',
  ranking: 'Sales concentration',
  methods: 'Collection mix',
  buyer_type: 'First-time and returning buyers',
  cohort: 'Unique estimates first issued in this period',
  outcome: 'Current outcomes of that estimate cohort',
  delivery_status: 'Delivery-date activity: current status',
  delivery_billing: 'Delivered notes: invoice linkage',
  weightKg: 'Known package weight',
  variants: 'Units sold by variant',
  current: 'Not yet due',
  '1_30': '1–30 days overdue',
  '31_60': '31–60 days overdue',
  '61_plus': '61+ days overdue',
  net: 'Net sales',
  gross: 'Gross sales',
  vat: 'VAT',
  invoiced_gross: 'Invoiced gross',
  invoiced_net: 'Invoiced net',
  invoiced_vat: 'Invoiced VAT',
  quantity: 'Items sold',
  average_unit_price: 'Average net price per item',
  delivered_weight_kg: 'Delivered weight',
  planned_weight_kg: 'Planned weight',
  issued_count: 'Estimates issued',
  accepted_count: 'Estimates accepted',
  rejected_count: 'Estimates rejected',
  expired_count: 'Estimates expired',
  converted_estimate_count: 'Estimates invoiced',
  converted_invoice_count: 'Invoices from estimates',
  linked: 'Linked to invoice',
  unlinked: 'Without invoice',
  first: 'First-time buyers',
  repeat: 'Returning buyers',
  first_time: 'First-time buyers',
  returning: 'Returning buyers',
  bank_transfer: 'Bank transfer',
  acknowledged: 'Acknowledged',
}
const englishReportLabel = (value: string) =>
  labels[value] ?? value.replaceAll('_', ' ').replace(/^./, (char) => char.toUpperCase())
export const reportLabel = englishReportLabel

/** A4 report; each section owns its charts and supporting frozen records. */
export async function renderVisualPdf(snapshot: ReportAnalysis, language: 'fr' | 'en' = 'fr') {
  const reportLabel = language === 'fr' ? frenchReportLabel : englishReportLabel
  const tr = (fr: string, en: string) => (language === 'fr' ? fr : en)
  const figure = (value: string, unit: string) => formatFigure(value, unit, language)
  if (
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
  const deadline = Date.now() + 30000
  const c = await createDocumentCanvas()
  const left = 30,
    width = W - left * 2
  let y = 0
  let sectionNumber = 0
  const reportTitle = tr('Rapport financier', 'Financial report')
  const continuation = tr(' - suite', ' - continued')
  let activeTitle = reportTitle
  function sectionHeading(title: string) {
    y += 6
    c.rect(left, y, width, 0.6, '#d7ded9')
    y += 10
    c.text(String(sectionNumber).padStart(2, '0'), left, y + 1, 10, palette[0]!, 'bold')
    for (const line of c.wrap(title, width - 27, 12, 'bold')) {
      c.text(line, left + 27, y, 12, ink, 'bold')
      y += 15
    }
    y += 3
  }
  const wrap = (text: string, size = 9, color = muted, bold = false) => {
    for (const line of c.wrap(text, width, size, bold ? 'bold' : 'regular')) {
      if (y > H - 65) page(`${activeTitle}${continuation}`)
      c.text(line, left, y, size, color, bold ? 'bold' : 'regular')
      y += size + 3
    }
  }
  function page(title: string) {
    c.addPage()
    y = 24
    c.rect(left, y, 32, 3, palette[0]!)
    y += 9
    wrap(snapshot.companyName, 10, ink, true)
    if (c.pageCount === 1) wrap(title, 16, ink, true)
    wrap(`${snapshot.filters.from} - ${snapshot.filters.to} · ${snapshot.filters.timezone}`, 9)
    if (c.pageCount === 1)
      wrap(
        `${tr('Données figées au', 'Captured at')} ${snapshot.capturedAt} · ${tr('définitions', 'definitions')} ${snapshot.metricDefinitionVersion}`,
        8,
      )
    y += 7
    if (sectionNumber && title.endsWith(continuation)) sectionHeading(title)
  }
  const ensure = (height: number, title: string) => {
    if (Date.now() > deadline)
      throw new AppError(
        503,
        'REPORT_RENDER_TIMEOUT',
        'Report rendering exceeded 30 seconds. Narrow the filters and retry.',
      )
    if (y + height > H - 55) page(`${title}${continuation}`)
  }
  if (!snapshot.sections.length) {
    page(reportTitle)
    wrap(tr('Aucune section sélectionnée.', 'No sections selected.'))
  }
  if (snapshot.sections.length) {
    page(reportTitle)
    wrap(
      `${tr('Devise', 'Currency')} : ${snapshot.filters.currency ?? tr('toutes, présentées séparément', 'all, shown separately')} · ${tr('regroupement', 'interval')} : ${language === 'fr' ? { day: 'jour', week: 'semaine', month: 'mois' }[snapshot.filters.bucket] : snapshot.filters.bucket}`,
      8,
    )
    for (const [label, value] of [
      [tr('Client (identifiant)', 'Client (ID)'), snapshot.filters.clientId],
      [tr('Produit (identifiant)', 'Product (ID)'), snapshot.filters.productId],
      [tr('Catégorie (identifiant)', 'Category (ID)'), snapshot.filters.categoryId],
      [
        tr('Section détaillée', 'Detail section'),
        snapshot.filters.detailSection && reportLabel(snapshot.filters.detailSection),
      ],
      [tr('Segment des lignes', 'Supporting row segment'), snapshot.filters.segment],
    ])
      if (value) wrap(`${label} : ${value}`, 8)
    if (snapshot.filters.segment)
      wrap(
        tr(
          'Le segment filtre uniquement les lignes détaillées. Les indicateurs et graphiques couvrent toute la période et les autres critères.',
          'The segment filters supporting rows only. Metrics and charts cover the full period and other criteria.',
        ),
        8,
      )
    if (snapshot.comparison)
      wrap(
        `${tr('Comparaison', 'Comparison')} : ${snapshot.comparison.from} - ${snapshot.comparison.to}. ${tr('Les soldes actuels ne sont pas comparés.', 'Current balances are not compared.')}`,
        8,
      )
    y += 6
  }
  for (const section of snapshot.sections) {
    const title = reportLabel(section.key)
    activeTitle = title
    sectionNumber++
    const previousSection = snapshot.comparison?.sections.find((s) => s.key === section.key)
    const metrics = exportMetrics(section).filter(
      (metric) =>
        (metric.key !== 'unknown_weight_count' || Number(metric.value) > 0) &&
        (metric.key !== 'amount' ||
          !section.metrics.some((m) => m.key === 'gross' && m.currency === metric.currency)),
    )
    // Keep the section heading and metric grid together where they fit on A4.
    const openingHeight = metrics.length
      ? Math.min(340, 58 + Math.ceil(metrics.length / 3) * 67)
      : section.series.length
        ? 250
        : 95
    if (y + openingHeight > H - 55) page(reportTitle)
    sectionHeading(title)
    wrap(
      section.timeBasis === 'capture'
        ? tr(
            'Soldes au moment de la capture, et non à la fin de la période.',
            'Balances at capture, not at the end of the period.',
          )
        : section.key === 'estimates'
          ? tr(
              'Les étapes comptent des devis distincts ; les indicateurs comptent les événements de la période.',
              'Stages count distinct estimates; metrics count events during the period.',
            )
          : tr('Activité pendant la période sélectionnée.', 'Activity during the selected period.'),
      8,
    )
    y += 3
    for (let index = 0; index < metrics.length; index += 3) {
      ensure(67, title)
      metrics.slice(index, index + 3).forEach((metric, column) => {
        const x = left + column * ((width + 6) / 3),
          w = (width - 12) / 3
        c.rect(x, y, w, 61, light)
        const label = `${section.key === 'sales_by_client' && metric.key === 'quantity' ? tr('Factures', 'Invoices') : reportLabel(metric.key)}${metric.unit !== 'money' && metric.currency ? ` (${metric.currency})` : ''} · ${metric.timeBasis === 'capture' ? tr('à la capture', 'at capture') : tr('période', 'period')}`
        c.wrap(label, w - 14, 7)
          .slice(0, 2)
          .forEach((line, i) => c.text(line, x + 7, y + 5 + i * 9, 7, muted))
        c.text(
          `${figure(metric.value, metric.unit)}${metric.unit === 'money' && metric.currency ? ` ${metric.currency}` : metric.unit === 'kg' ? ' kg' : ''}`,
          x + 7,
          y + 26,
          11,
          ink,
          'bold',
        )
        if (snapshot.comparison && metric.timeBasis !== 'capture') {
          const previous =
            previousSection &&
            exportMetrics(previousSection).find(
              (m) =>
                m.key === metric.key &&
                m.currency === metric.currency &&
                m.timeBasis === metric.timeBasis,
            )
          const change = percentageChange(metric.value, previous?.value)
          const comparison = previous
            ? `${tr('Précédent', 'Previous')} : ${figure(previous.value, metric.unit)}${metric.unit === 'money' ? ` ${metric.currency ?? ''}` : metric.unit === 'kg' ? ' kg' : ''} · ${change === null ? tr('variation n.d. (base nulle)', 'change N/A (zero baseline)') : `${change} %`}`
            : tr('Comparaison indisponible', 'Comparison unavailable')
          c.wrap(comparison, w - 14, 7)
            .slice(0, 2)
            .forEach((line, i) => c.text(line, x + 7, y + 42 + i * 9, 7, muted))
        }
      })
      y += 67
    }
    if (section.key === 'summary') {
      const attention = [
        [
          tr('Factures en retard', 'Overdue invoices'),
          snapshot.sections.find((s) => s.key === 'overdue')?.total,
        ],
        [
          tr('Chèques en attente', 'Pending cheques'),
          snapshot.sections.find((s) => s.key === 'pending_cheques')?.total,
        ],
        [
          tr('Devis en attente de réponse', 'Estimates awaiting response'),
          snapshot.sections
            .find((s) => s.key === 'estimates')
            ?.visuals?.filter((p) => p.group === 'outcome' && ['issued', 'sent'].includes(p.key))
            .reduce((sum, p) => sum + Number(p.value), 0),
        ],
      ] as const
      const entries = attention.filter(([, value]) => value !== undefined)
      if (entries.length) {
        ensure(46, title)
        wrap(tr('Points à suivre à la date de capture', 'Attention at capture'), 9, ink, true)
        wrap(entries.map(([label, count]) => `${label} : ${count}`).join(' · '), 8, ink)
        y += 4
      }
    }
    const chartSections = [section]
    for (const currency of [
      ...new Set(chartSections.flatMap((s) => s.series.map((point) => point.currency))),
    ]) {
      const recorded = new Map(
        section.series
          .filter((point) => point.currency === currency)
          .map((point) => [point.date, point.value]),
      )
      const series: { date: string; value: string }[] = []
      const cursor = new Date(`${snapshot.filters.from}T12:00:00Z`)
      if (snapshot.filters.bucket === 'week')
        cursor.setUTCDate(cursor.getUTCDate() - ((cursor.getUTCDay() + 6) % 7))
      if (snapshot.filters.bucket === 'month') cursor.setUTCDate(1)
      while (cursor.toISOString().slice(0, 10) <= snapshot.filters.to) {
        const date = cursor.toISOString().slice(0, 10)
        series.push({ date, value: recorded.get(date) ?? '0' })
        if (snapshot.filters.bucket === 'month') cursor.setUTCMonth(cursor.getUTCMonth() + 1)
        else cursor.setUTCDate(cursor.getUTCDate() + (snapshot.filters.bucket === 'week' ? 7 : 1))
      }
      if (!series.length) continue
      const datasets = [
        {
          label: reportLabel(section.key),
          color: palette[0]!,
          values: series.map((p) => Number(p.value)),
          dashed: false,
        },
      ]
      // Match the UI: prior-period daily points are aligned by elapsed day,
      // never by calendar date or mismatched partial week/month buckets.
      if (snapshot.comparison && previousSection && snapshot.filters.bucket === 'day') {
        const previous = new Map(
          previousSection.series
            .filter((p) => p.currency === currency)
            .map((p) => [p.date, Number(p.value)]),
        )
        const offset = Date.parse(snapshot.comparison.from) - Date.parse(snapshot.filters.from)
        datasets.push({
          label: `${reportLabel(section.key)} (${tr('précédent', 'previous')})`,
          color: palette[2]!,
          values: series.map(
            (p) =>
              previous.get(new Date(Date.parse(p.date) + offset).toISOString().slice(0, 10)) ?? 0,
          ),
          dashed: true,
        })
      }
      ensure(180 + datasets.length * 12, title)
      wrap(`${tr('Évolution comparée', 'Activity trend')} · ${currency}`, 10, ink, true)
      y += drawReportTrend(c, {
        left,
        top: y,
        width,
        from: snapshot.filters.from,
        to: snapshot.filters.to,
        dates: series.map((point) => point.date),
        currency,
        datasets,
        language,
      })
      if (snapshot.comparison && snapshot.filters.bucket !== 'day')
        wrap(
          tr(
            'Comparaison chiffrée dans les indicateurs ; courbe précédente disponible uniquement par jour.',
            'Comparison shown in metrics; the previous trend is available for daily intervals only.',
          ),
          8,
        )
    }
    if (section.key === 'collections' && snapshot.filters.bucket === 'day') {
      for (const currency of [...new Set(section.series.map((point) => point.currency))]) {
        const amounts = new Map(
          section.series
            .filter((point) => point.currency === currency)
            .map((point) => [point.date, Number(point.value)]),
        )
        const maximum = Math.max(0, ...amounts.values())
        for (const [month, dates] of collectionMonths(snapshot.filters.from, snapshot.filters.to)) {
          ensure(collectionMonthHeight(dates) + 16, title)
          wrap(tr('Calendrier des encaissements', 'Collection calendar'), 9, ink, true)
          y += drawCollectionMonth(c, {
            left,
            top: y,
            width,
            month,
            dates,
            amounts,
            maximum,
            currency,
            language,
          })
        }
      }
    }
    if (section.key === 'vat') {
      for (const currency of [
        ...new Set(section.metrics.map((metric) => metric.currency).filter(Boolean)),
      ]) {
        const points = ['net', 'vat'].map((key) => {
          const value =
            section.metrics.find((metric) => metric.key === key && metric.currency === currency)
              ?.value ?? '0'
          return {
            label: reportLabel(key),
            value: Number(value),
            formatted: `${figure(value, 'money')} ${currency}`,
          }
        })
        ensure(145, title)
        wrap(`${reportLabel('vat')} · ${currency}`, 9, ink, true)
        y += drawReportDonut(c, { left, top: y, width, points, language })
      }
    }
    const visuals = exportVisuals(snapshot, section)
    for (const group of [...new Set(visuals.map((point) => point.group))]) {
      for (const currency of [
        ...new Set(visuals.filter((point) => point.group === group).map((point) => point.currency)),
      ]) {
        const points = visuals.filter(
          (point) => point.group === group && point.currency === currency,
        )
        const order =
          group === 'cohort'
            ? ['issued', 'accepted', 'invoiced']
            : group === 'aging'
              ? ['current', '1_30', '31_60', '61_plus']
              : []
        points.sort((a, b) =>
          order.length
            ? order.indexOf(a.key) - order.indexOf(b.key)
            : Number(b.value) - Number(a.value),
        )
        if (
          isRingBreakdown(section.key, group) &&
          points.every((point) => Number(point.value) >= 0)
        ) {
          const slices = points.map((point) => ({
            label: group === 'ranking' ? point.label : reportLabel(point.key),
            value: Number(point.value),
            formatted: `${figure(point.value, point.unit)}${currency && point.unit === 'money' ? ` ${currency}` : point.unit === 'kg' ? ' kg' : ''}`,
          }))
          for (let start = 0; start < slices.length; start += 8) {
            ensure(reportDonutHeight(c, width, slices, start) + 18, title)
            wrap(`${reportLabel(group)}${currency ? ` · ${currency}` : ''}`, 9, ink, true)
            y += drawReportDonut(c, { left, top: y, width, points: slices, start, language })
          }
          continue
        }
        const groupHeight =
          20 +
          points.reduce(
            (sum, point) =>
              sum +
              c.wrap(
                ['ranking', 'variants'].includes(group) ? point.label : reportLabel(point.key),
                width - 125,
                8,
              ).length *
                10 +
              15,
            0,
          )
        ensure(Math.min(180, groupHeight), title)
        wrap(`${reportLabel(group)}${currency ? ` · ${currency}` : ''}`, 9, ink, true)
        const max = Math.max(1, ...points.map((point) => Number(point.value)))
        for (const [index, point] of points.entries()) {
          const label = ['ranking', 'variants'].includes(group)
            ? point.label
            : reportLabel(point.key)
          const lines = c.wrap(label, width - 125, 8)
          ensure(lines.length * 10 + 15, title)
          lines.forEach((line, i) => c.text(line, left, y + i * 10, 8, ink))
          const value = `${figure(point.value, point.unit)}${currency && point.unit === 'money' ? ` ${currency}` : point.unit === 'kg' ? ' kg' : ''}`
          c.text(value, W - left - c.measure(value, 9, 'bold'), y, 9, ink, 'bold')
          y += lines.length * 10 + 2
          c.rect(left, y, width, 5, light)
          c.rect(left, y, (Number(point.value) / max) * width, 5, palette[index % palette.length]!)
          y += 13
        }
      }
    }
    if (!section.total) wrap(tr('Aucune activité correspondante.', 'No matching activity.'))
    if (
      section.key === 'revenue' ||
      (section.key === 'collections' && !snapshot.sections.some((s) => s.key === 'revenue'))
    )
      wrap(
        tr(
          'Les encaissements peuvent régler des factures antérieures. Ventes moins encaissements ne correspond pas au solde restant.',
          'Collections may settle earlier invoices. Sales minus collections is not the outstanding balance.',
        ),
        8,
      )
    if (section.key === 'deliveries')
      wrap(
        tr(
          'Le lien avec une facture ne signifie pas son règlement. Les poids inconnus sont exclus du poids total.',
          'Invoice linkage does not mean payment. Unknown weights are excluded from total weight.',
        ),
        8,
      )
    if (section.key === 'estimates')
      wrap(
        tr(
          'Un devis peut produire plusieurs factures. Les étapes sont suivies jusqu’à la capture. Les devis remplacés restent dans l’historique.',
          'An estimate can produce several invoices. Stages are tracked until capture. Superseded estimates remain in history.',
        ),
        8,
      )
    if (section.key === 'sales_by_client')
      wrap(
        tr(
          'Encaissements et soldes à la capture pour les factures émises dans la période.',
          'Collections and balances at capture for invoices issued in this period.',
        ),
        8,
      )
    if (snapshot.snapshotVersion >= 3 && section.key !== 'summary')
      y = drawReportTable(c, section, language, y + 10, () => {
        page(`${title}${continuation}`)
        return y
      })
    y += 10
  }
  for (let index = 0; index < c.pageCount; index++) {
    c.selectPage(index)
    c.text(
      tr('Slama Finance · Rapport financier figé', 'Slama Finance · Frozen financial report'),
      left,
      H - 28,
      8,
      muted,
    )
    c.text(`${index + 1} / ${c.pageCount}`, W - 75, H - 28, 8, muted)
  }
  c.pdf.setTitle(`${reportTitle} ${snapshot.filters.from} - ${snapshot.filters.to}`)
  return Buffer.from(await c.pdf.save())
}
