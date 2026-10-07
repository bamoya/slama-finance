import type { createDocumentCanvas } from '../../../../lib/documents/canvas.js'

type Canvas = Awaited<ReturnType<typeof createDocumentCanvas>>
export function collectionMonthHeight(dates: string[]) {
  if (!dates.length) return 41
  const offset = (new Date(`${dates[0]}T12:00:00Z`).getUTCDay() + 6) % 7
  return 41 + Math.ceil((offset + dates.length) / 7) * 33
}
export function collectionMonths(from: string, to: string) {
  const months = new Map<string, string[]>()
  for (
    let date = new Date(`${from}T12:00:00Z`);
    date.toISOString().slice(0, 10) <= to;
    date.setUTCDate(date.getUTCDate() + 1)
  ) {
    const day = date.toISOString().slice(0, 10),
      month = day.slice(0, 7)
    if (!months.has(month)) months.set(month, [])
    months.get(month)!.push(day)
  }
  return [...months.entries()]
}

/** Printed counterpart of CollectionCalendar: no hover is required to read an amount. */
export function drawCollectionMonth(
  c: Canvas,
  options: {
    left: number
    top: number
    width: number
    month: string
    dates: string[]
    amounts: Map<string, number>
    maximum: number
    currency: string
    language: 'fr' | 'en'
  },
) {
  const { left, top, width, month, dates, amounts, maximum, currency, language } = options
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB'
  c.text(
    `${new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T12:00:00Z`))} · ${currency}`,
    left,
    top,
    9,
    '#26322e',
    'bold',
  )
  const weekdays =
    language === 'fr'
      ? ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']
      : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const cellWidth = width / 7,
    offset = (new Date(`${dates[0] ?? `${month}-01`}T12:00:00Z`).getUTCDay() + 6) % 7
  weekdays.forEach((day, column) =>
    c.text(day, left + column * cellWidth + 5, top + 18, 7, '#64716b'),
  )
  let lastRow = 0
  for (const [position, date] of dates.entries()) {
    const day = Number(date.slice(-2)),
      index = offset + position
    const column = index % 7,
      row = Math.floor(index / 7),
      amount = amounts.get(date) ?? 0
    lastRow = Math.max(lastRow, row)
    const x = left + column * cellWidth,
      y = top + 31 + row * 33
    const intensity = maximum ? Math.max(0, amount) / maximum : 0
    const fill =
      intensity > 0.66
        ? '#3d8075'
        : intensity > 0.33
          ? '#a8ccc2'
          : intensity > 0
            ? '#d5e8e1'
            : '#f1f3f1'
    const ink = intensity > 0.66 ? '#ffffff' : '#26322e'
    c.rect(x, y, cellWidth - 3, 30, fill)
    c.text(String(day), x + 4, y + 3, 7, ink)
    const label = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
      .format(amount)
      .replace(/[\u00a0\u202f]/g, ' ')
    const size = Math.min(8, (8 * (cellWidth - 10)) / Math.max(1, c.measure(label, 8, 'bold')))
    c.text(label, x + 4, y + 15, size, ink, 'bold')
  }
  return 31 + (lastRow + 1) * 33 + 10
}
