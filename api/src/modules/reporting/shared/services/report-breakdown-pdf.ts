import { rgb } from 'pdf-lib'

import { type createDocumentCanvas, H } from '../../../../lib/documents/canvas.js'

type Canvas = Awaited<ReturnType<typeof createDocumentCanvas>>
export const reportPalette = ['#a87828', '#3d8075', '#557ea8', '#ad8867', '#a65c72']
type Point = { label: string; value: number; formatted: string }
export function reportDonutHeight(c: Canvas, width: number, points: Point[], start: number) {
  return Math.max(
    122,
    10 +
      points
        .slice(start, start + 8)
        .reduce(
          (height, point) =>
            height +
            c.wrap(point.label, width - 155, 8).length * 10 +
            c.wrap(`${point.formatted} · 100%`, width - 155, 9, 'bold').length * 11 +
            5,
          0,
        ),
  )
}
const color = (hex: string) =>
  rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  )

/** Mirrors VisualReport's ring selection; cohort stages overlap and must never be a pie. */
export const isRingBreakdown = (section: string, group: string) =>
  ['methods', 'buyer_type', 'outcome', 'delivery_billing'].includes(group) ||
  (section === 'sales_by_category' && group === 'ranking')

/** Vector donut with a paginatable legend. Negative values cannot form pie slices. */
export function drawReportDonut(
  c: Canvas,
  options: {
    left: number
    top: number
    width: number
    points: Point[]
    start?: number
    language: 'fr' | 'en'
  },
) {
  const { left, top, width, points, language, start = 0 } = options
  const total = points.reduce((sum, point) => sum + Math.max(0, point.value), 0)
  const page = c.pdf.getPage(c.pageCount - 1)
  const radius = 48,
    inner = 32,
    cx = left + 60,
    cy = top + 58
  page.drawCircle({
    x: cx,
    y: H - cy,
    size: (radius + inner) / 2,
    borderWidth: radius - inner,
    borderColor: color('#e8ece9'),
  })
  let angle = -Math.PI / 2
  points.forEach((point, index) => {
    const sweep = total ? (Math.max(0, point.value) / total) * Math.PI * 2 : 0
    // Two semicircles also handle a single 100% category without an empty SVG arc.
    for (let offset = 0; offset < sweep; offset += Math.PI) {
      const a = angle + offset,
        b = angle + Math.min(sweep, offset + Math.PI)
      const p = (r: number, theta: number) => `${r * Math.cos(theta)} ${r * Math.sin(theta)}`
      page.drawSvgPath(
        `M ${p(radius, a)} A ${radius} ${radius} 0 0 1 ${p(radius, b)} L ${p(inner, b)} A ${inner} ${inner} 0 0 0 ${p(inner, a)} Z`,
        {
          x: cx,
          y: H - cy,
          color: color(reportPalette[index % reportPalette.length]!),
        },
      )
    }
    angle += sweep
  })
  const center = total ? '100%' : '0'
  c.text(center, cx - c.measure(center, 14, 'bold') / 2, cy - 10, 14, '#26322e', 'bold')
  const caption = language === 'fr' ? 'Répartition' : 'Distribution'
  c.text(caption, cx - c.measure(caption, 7) / 2, cy + 10, 7, '#64716b')
  let y = top + 5
  for (const [offset, point] of points.slice(start, start + 8).entries()) {
    const x = left + 140
    c.rect(x, y + 3, 6, 6, reportPalette[(start + offset) % reportPalette.length]!)
    const percent = total ? (Math.max(0, point.value) / total) * 100 : 0
    const value = `${point.formatted} · ${percent.toLocaleString(language, { maximumFractionDigits: 1 })}%`
    const available = width - 155
    for (const line of c.wrap(point.label, available, 8)) {
      c.text(line, x + 12, y, 8, '#64716b')
      y += 10
    }
    for (const line of c.wrap(value, available, 9, 'bold')) {
      c.text(line, x + 12, y, 9, '#26322e', 'bold')
      y += 11
    }
    y += 5
  }
  return Math.max(122, y - top + 5)
}
