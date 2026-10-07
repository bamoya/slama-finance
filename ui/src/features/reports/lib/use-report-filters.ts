import { useLocation, useSearch } from 'wouter'

import { ReportCriteriaSchema } from '../../../api/generated/schemas/reporting/reporting.schemas'

export function useReportFilters() {
  const search = useSearch()
  const [path, navigate] = useLocation()
  const params = new URLSearchParams(search)
  const raw = Object.fromEntries(params)
  for (const key of ['topic', 'compare', 'period', 'recordDate', 'recordCurrency']) delete raw[key]
  const candidate = {
    ...raw,
    sections: raw.sections ? raw.sections.split(',') : undefined,
    limit: raw.limit ? Number(raw.limit) : 25,
    offset: raw.offset ? Number(raw.offset) : 0,
  }
  const parsed = ReportCriteriaSchema.safeParse(candidate)
  const set = (values: Record<string, string | undefined>, page = false) => {
    for (const [key, value] of Object.entries(values)) {
      if (value) params.set(key, value)
      else params.delete(key)
    }
    if (!page) params.delete('offset')
    navigate(`${path}?${params}`, { replace: true })
  }
  return { filters: parsed.success ? parsed.data : undefined, invalid: !parsed.success, set }
}
