export type CatalogPeriod = 'month' | 'lastmonth' | 'year' | 'all' | 'custom'

export type CatalogContext = {
  period: CatalogPeriod
  currency: string
  from: string
  to: string
}

const periods: CatalogPeriod[] = ['month', 'lastmonth', 'year', 'all', 'custom']
const datePattern = /^\d{4}-\d{2}-\d{2}$/

export function readCatalogContext(params: URLSearchParams): CatalogContext {
  const rawPeriod = params.get('period') as CatalogPeriod | null
  const rawCurrency = params.get('currency')?.toUpperCase()
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  return {
    period: rawPeriod && periods.includes(rawPeriod) ? rawPeriod : 'month',
    currency: rawCurrency && /^[A-Z]{3}$/.test(rawCurrency) ? rawCurrency : '',
    from: datePattern.test(from) ? from : '',
    to: datePattern.test(to) ? to : '',
  }
}

/** Presets are resolved by the API in the company's configured timezone. */
export function catalogPeriodParams(context: CatalogContext) {
  const period = (
    {
      month: 'this_month',
      lastmonth: 'last_month',
      year: 'this_year',
      all: 'all',
      custom: 'custom',
    } as const
  )[context.period]
  return {
    period,
    dateFrom: context.period === 'custom' ? context.from || undefined : undefined,
    dateTo: context.period === 'custom' ? context.to || undefined : undefined,
  }
}

export function catalogHref(path: string, params: URLSearchParams) {
  const context = readCatalogContext(params)
  const next = new URLSearchParams()
  if (context.period !== 'month') next.set('period', context.period)
  if (context.currency) next.set('currency', context.currency)
  if (context.period === 'custom') {
    if (context.from) next.set('from', context.from)
    if (context.to) next.set('to', context.to)
  }
  const query = next.toString()
  return query ? `${path}?${query}` : path
}
