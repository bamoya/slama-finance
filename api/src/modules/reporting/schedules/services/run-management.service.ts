import {
  ReportAnalysisSchema,
  ReportScheduleSchema,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import type { ReportRunCleanupInput } from '../../../../contracts/generated/reporting/run-management.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { createArtifactSupport } from '../../../../support/artifacts/index.js'
import type { IdentityPublicApi } from '../../../identity/identity.public.js'
import { assertReportPermissions } from '../../analysis/services/analysis.service.js'
import { reportFormats } from '../../shared/services/report-output.js'
import { renderReport } from '../../shared/services/report-renderer.service.js'
import type { createRunManagementRepository } from '../repositories/run-management.repository.js'

export function createRunManagementService(
  repo: ReturnType<typeof createRunManagementRepository>,
  identity: IdentityPublicApi,
  artifacts: ReturnType<typeof createArtifactSupport>['service'],
) {
  const authorize = async (actor: string, tx: Transaction) => {
    await repo.authorizeLock(tx)
    assertReportPermissions(await identity.grants(actor, tx))
  }
  return {
    async deleteSchedule(id: string, version: number, actor: string) {
      const files = await repo.transaction(async (tx) => {
        await authorize(actor, tx)
        const schedule = await repo.one(id, tx, true)
        if (schedule.version !== version)
          throw new AppError(
            409,
            'REPORT_SCHEDULE_CONFLICT',
            'Reload the schedule before deleting.',
          )
        const runs = await repo.runsForDeletion(id, tx)
        if (runs.some((run) => ['queued', 'running'].includes(run.status)))
          throw new AppError(
            409,
            'REPORT_RUN_ACTIVE',
            'Wait for report generation before deleting this schedule.',
          )
        const released = []
        for (const run of runs) released.push(...(await repo.release(run.id, true, tx)))
        await repo.remove(id, tx)
        await repo.audit(
          tx,
          actor,
          'delete',
          id,
          { name: schedule.name, runs: runs.length, files: released.length },
          null,
        )
        return [...new Map(released.map((file) => [file.objectKey, file])).values()]
      })
      return artifacts.removeReleasedObjects(files)
    },
    async cleanup(id: string, input: ReportRunCleanupInput, actor: string) {
      const files = await repo.transaction(async (tx) => {
        await authorize(actor, tx)
        const row = await repo.run(id, tx, true)
        if (['queued', 'running'].includes(row.status))
          throw new AppError(
            409,
            'REPORT_RUN_ACTIVE',
            'Wait for report generation before cleaning up this run.',
          )
        const released = await repo.release(id, input.mode === 'run', tx)
        await repo.audit(
          tx,
          actor,
          input.mode === 'run' ? 'delete' : 'delete_files',
          id,
          {
            scheduleId: row.scheduleId,
            periodStart: row.periodStart,
            periodEnd: row.periodEnd,
            fileCount: released.length,
          },
          null,
          'report_runs',
        )
        return released
      })
      return artifacts.removeReleasedObjects(files)
    },
    async regenerate(id: string, actor: string) {
      const row = await repo.transaction(async (tx) => {
        await authorize(actor, tx)
        return repo.run(id, tx)
      })
      if (row.status !== 'succeeded' || !row.dataSnapshot)
        throw new AppError(
          409,
          'REPORT_NOT_CAPTURED',
          'Only completed reports can restore their files.',
        )
      const snapshot = ReportAnalysisSchema.parse(row.dataSnapshot)
      const config = ReportScheduleSchema.parse(row.configurationSnapshot)
      const files = await Promise.all(
        reportFormats(config.output).map(async (format) => ({
          format,
          bytes: await renderReport(snapshot, format, config.language),
        })),
      )
      await repo.transaction(async (tx) => {
        await authorize(actor, tx)
        const current = await repo.run(id, tx, true)
        if (current.status !== 'succeeded')
          throw new AppError(409, 'REPORT_RUN_STATE', 'Reload the report before restoring files.')
        await artifacts.restoreReportFiles(tx, id, actor, files)
        await repo.audit(
          tx,
          actor,
          'regenerate_files',
          id,
          null,
          { capturedAt: row.dataCapturedAt?.toISOString() },
          'report_runs',
        )
      })
    },
  }
}
