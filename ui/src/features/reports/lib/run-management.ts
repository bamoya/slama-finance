import type { ReportRun } from '../../../api/generated/schemas/reporting/reporting.schemas'

export function hasMissingFiles(row: ReportRun) {
  const output = row.configurationSnapshot.output
  const formats = !output
    ? ['pdf', 'csv']
    : output === 'both'
      ? ['pdf', 'xlsx']
      : [output === 'excel' ? 'xlsx' : 'pdf']
  return formats.some((format) => !row.artifacts.some((file) => file.format === format))
}

export const canCleanRun = (row: ReportRun) =>
  !['queued', 'running'].includes(row.status) &&
  !row.deliveries.some((delivery) => ['pending', 'queued', 'sending'].includes(delivery.status))

export function formatFileSize(bytes: number, language: string) {
  const unit = bytes >= 1048576 ? 'megabyte' : 'kilobyte'
  return new Intl.NumberFormat(language, { style: 'unit', unit, maximumFractionDigits: 1 }).format(
    bytes / (unit === 'megabyte' ? 1048576 : 1024),
  )
}
