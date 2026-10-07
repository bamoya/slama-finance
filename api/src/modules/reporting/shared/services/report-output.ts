export type ReportFormat = 'pdf' | 'xlsx' | 'csv'

/** Missing output belongs to legacy frozen runs, never to a new schedule. */
export function reportFormats(output?: 'pdf' | 'excel' | 'both'): ReportFormat[] {
  if (!output) return ['pdf', 'csv']
  return output === 'both' ? ['pdf', 'xlsx'] : [output === 'excel' ? 'xlsx' : 'pdf']
}

export function reportContentType(format: ReportFormat) {
  return format === 'pdf'
    ? 'application/pdf'
    : format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8'
}
