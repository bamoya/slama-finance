import { rgb } from 'pdf-lib'

import { type createDocumentCanvas, H } from '../../../../lib/documents/canvas.js'

type Canvas = Awaited<ReturnType<typeof createDocumentCanvas>>
type Dataset = { label: string; color: string; values: number[]; dashed: boolean }
const formatNumber = (value: number, decimals = 2, language = 'fr') =>
  new Intl.NumberFormat(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: decimals })
    .format(value)
    .replace(/[\u00a0\u202f]/g, ' ')

export function trendAxis(values: number[]) {
  const max = Math.max(0, ...values)
  const raw = (max || 1) / 4
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= raw)! * magnitude
  const upper = Math.ceil((max || 1) / step) * step
  return {
    upper,
    ticks: Array.from({ length: Math.round(upper / step) + 1 }, (_, index) => index * step),
  }
}

/** All buckets remain plotted. Label only peaks/endpoints to avoid dense-period collisions. */
export function drawReportTrend(
  c: Canvas,
  options: {
    left: number
    top: number
    width: number
    from: string
    to: string
    dates: string[]
    currency: string
    datasets: Dataset[]
    language?: 'fr' | 'en'
  },
) {
  const { left, top, width, from, to, dates, currency, datasets } = options
  const number = (value: number, decimals = 2) => formatNumber(value, decimals, options.language)
  const page = c.pdf.getPage(c.pageCount - 1)
  const line = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    hex: string,
    dashed = false,
    thickness = 0.6,
  ) =>
    page.drawLine({
      start: { x: x1, y: H - y1 },
      end: { x: x2, y: H - y2 },
      thickness,
      color: rgb(
        ...([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
          number,
          number,
          number,
        ]),
      ),
      ...(dashed ? { dashArray: [2, 3] } : {}),
    })
  let legendY = top
  for (const dataset of datasets) {
    line(left, legendY + 4, left + 14, legendY + 4, dataset.color, dataset.dashed, 1.5)
    c.text(dataset.label, left + 19, legendY, 8, dataset.color)
    legendY += 12
  }
  const { upper, ticks } = trendAxis(datasets.flatMap((dataset) => dataset.values))
  const gutter = Math.max(42, ...ticks.map((tick) => c.measure(number(tick), 7) + 10))
  const plotLeft = left + gutter,
    plotWidth = width - gutter - 8
  const plotTop = legendY + 16,
    plotHeight = 112,
    baseline = plotTop + plotHeight
  const start = Date.parse(from),
    end = Date.parse(to)
  const x = (date: string) =>
    plotLeft +
    (end === start ? 0.5 : Math.max(0, Math.min(1, (Date.parse(date) - start) / (end - start)))) *
      plotWidth
  const y = (value: number) => baseline - (value / upper) * plotHeight
  c.text(currency, left, plotTop - 12, 8, '#26322e', 'bold')
  for (const tick of ticks) {
    line(plotLeft, y(tick), plotLeft + plotWidth, y(tick), '#d7ded9', tick !== 0)
    const label = number(tick)
    c.text(label, plotLeft - 8 - c.measure(label, 7), y(tick) - 4, 7, '#64716b')
  }
  line(plotLeft, plotTop, plotLeft, baseline, '#84928b')
  const days = Math.round((end - start) / 86400000)
  const tickCount = Math.min(6, days + 1)
  const tickDays = [
    ...new Set(
      Array.from({ length: tickCount }, (_, i) =>
        Math.round((i * days) / Math.max(1, tickCount - 1)),
      ),
    ),
  ]
  for (const day of tickDays) {
    const date = new Date(start + day * 86400000).toISOString().slice(0, 10)
    const label = new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      ...(days > 180 ? { year: '2-digit' } : {}),
      timeZone: 'UTC',
    }).format(new Date(date))
    line(x(date), plotTop, x(date), baseline + 3, '#d7ded9', true)
    c.text(
      label,
      Math.min(
        left + width - c.measure(label, 7),
        Math.max(left, x(date) - c.measure(label, 7) / 2),
      ),
      baseline + 8,
      7,
      '#64716b',
    )
  }
  const occupied: { x: number; y: number; width: number }[] = []
  datasets.forEach((dataset) => {
    const points = dates.map((date, i) => ({
      x: x(date),
      y: y(dataset.values[i]!),
      value: dataset.values[i]!,
    }))
    points.forEach((point, i) => {
      if (i)
        line(
          points[i - 1]!.x,
          points[i - 1]!.y,
          point.x,
          point.y,
          dataset.color,
          dataset.dashed,
          1.2,
        )
      if (points.length <= 62 || i === points.length - 1)
        c.rect(point.x - 1.3, point.y - 1.3, 2.6, 2.6, dataset.color)
    })
    const peak = dataset.values.indexOf(Math.max(...dataset.values))
    const indexes =
      points.length <= 7 ? points.map((_, i) => i) : [...new Set([peak, points.length - 1])]
    for (const index of indexes) {
      const point = points[index]!
      if (!point || (point.value === 0 && points.length > 7)) continue
      line(point.x, point.y, point.x, baseline, dataset.color, true, 0.35)
      line(plotLeft, point.y, point.x, point.y, dataset.color, true, 0.35)
      const label = number(point.value),
        w = c.measure(label, 7, 'bold') + 6
      const lx = Math.min(plotLeft + plotWidth - w, Math.max(plotLeft + 2, point.x - w / 2))
      let ly = point.y - 13
      for (let attempt = 0; attempt < 12; attempt++) {
        if (ly < plotTop - 10) ly = point.y + 7 + attempt * 2
        if (
          !occupied.some(
            (b) => lx < b.x + b.width + 3 && lx + w + 3 > b.x && Math.abs(ly - b.y) < 11,
          )
        )
          break
        ly -= 11
      }
      if (
        ly > baseline - 10 ||
        occupied.some((b) => lx < b.x + b.width + 3 && lx + w + 3 > b.x && Math.abs(ly - b.y) < 11)
      )
        continue
      occupied.push({ x: lx, y: ly, width: w })
      c.rect(lx, ly - 1, w, 10, '#ffffff')
      c.text(label, lx + 3, ly, 7, dataset.color, 'bold')
    }
  })
  c.text('Date', plotLeft + plotWidth / 2 - 9, baseline + 21, 7, '#64716b')
  return baseline + 35 - top
}
