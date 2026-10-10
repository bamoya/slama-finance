import type { ReportExportInput } from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { AppError } from '../../../../lib/errors.js'
import { resolveLanguage } from '../../../../lib/language.js'
import type { IdentityPublicApi } from '../../../identity/identity.public.js'
import type { createAnalysisRepository } from '../../analysis/repositories/analysis.repository.js'
import {
  assertReportPermissions,
  type createAnalysisService,
} from '../../analysis/services/analysis.service.js'
import { reportContentType } from '../../shared/services/report-output.js'
import { renderReport } from '../../shared/services/report-renderer.service.js'
import { REPORT_LIMITS } from '../../shared/services/report-time.service.js'
export function createExportService(
  analysis: ReturnType<typeof createAnalysisService>,
  repo: ReturnType<typeof createAnalysisRepository>,
  identity: Pick<IdentityPublicApi, 'grants'>,
) {
  const requests = new Map<string, number[]>()
  return async (input: ReportExportInput, actor: string) => {
    const clock = Date.now()
    for (const [id, times] of requests)
      if (!times.some((time) => time > clock - 60000)) requests.delete(id)
    const recent = (requests.get(actor) ?? []).filter((time) => time > clock - 60000)
    if (recent.length >= 5)
      throw new AppError(
        429,
        'REPORT_EXPORT_RATE_LIMIT',
        'Wait one minute before requesting another export.',
      )
    requests.set(actor, [...recent, clock])
    const { snapshot, language } = await repo.snapshot(async (tx) => {
      const grants = await identity.grants(actor, tx)
      assertReportPermissions(grants)
      const snapshot = await analysis.capture(
        input,
        actor,
        tx,
        (input.format === 'pdf' ? REPORT_LIMITS.pdfRows : REPORT_LIMITS.csvRows) + 1,
        grants,
      )
      return {
        snapshot,
        language: resolveLanguage(input.language, (await repo.context(tx)).locale),
      }
    })
    try {
      const bytes = await renderReport(snapshot, input.format, language)
      await repo.audit(actor, snapshot.filters, input.format, snapshot.capturedAt, 'succeeded')
      return {
        bytes,
        contentType: reportContentType(input.format),
        filename: `report-${snapshot.filters.from}-${snapshot.filters.to}.${input.format}`,
      }
    } catch (error) {
      await repo.audit(actor, snapshot.filters, input.format, snapshot.capturedAt, 'failed')
      throw error
    }
  }
}
