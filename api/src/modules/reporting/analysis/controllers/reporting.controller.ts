import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  getReportAnalysisQuerySchema,
  getReportScheduleParamsSchema,
  listReportEligibleRecipientsQuerySchema,
  listReportScheduleRunsQuerySchema,
  listReportSchedulesQuerySchema,
  ReportExportInputSchema,
  ReportScheduleInputSchema,
  ReportScheduleUpdateSchema,
  ReportVersionInputSchema,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import { ReportRunCleanupInputSchema } from '../../../../contracts/generated/reporting/run-management.schemas.js'
import { ReportSchedulePreviewInputSchema } from '../../../../contracts/generated/reporting/schedule-preview.schemas.js'
import type { createExportService } from '../../exports/services/export.service.js'
import type { createRunManagementService } from '../../schedules/services/run-management.service.js'
import type { createScheduleService } from '../../schedules/services/schedule.service.js'
import type { createAnalysisService } from '../services/analysis.service.js'
const id = (request: FastifyRequest) => getReportScheduleParamsSchema.parse(request.params).id
const query = (request: FastifyRequest) => {
  const input = request.query as Record<string, unknown>
  return {
    ...input,
    ...(input.sections === undefined
      ? {}
      : {
          sections: Array.isArray(input.sections)
            ? input.sections
            : typeof input.sections === 'string'
              ? input.sections.split(',')
              : input.sections,
        }),
  }
}
export function createReportingController(
  analysis: ReturnType<typeof createAnalysisService>,
  exports: ReturnType<typeof createExportService>,
  schedules: ReturnType<typeof createScheduleService>,
  runs: ReturnType<typeof createRunManagementService>,
) {
  return {
    cleanupRun: (request: FastifyRequest) =>
      runs.cleanup(
        id(request),
        ReportRunCleanupInputSchema.parse(request.body),
        request.actor!.userId,
      ),
    async regenerateFiles(request: FastifyRequest) {
      await runs.regenerate(id(request), request.actor!.userId)
      return schedules.run(id(request), request.actor!.userId)
    },
    async sendTest(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(202)
        .send(
          await schedules.sendTest(
            id(request),
            ReportVersionInputSchema.parse(request.body).expectedVersion,
            request.actor!.userId,
          ),
        )
    },
    preview: (request: FastifyRequest) =>
      schedules.preview(
        ReportSchedulePreviewInputSchema.parse(request.body),
        request.actor!.userId,
      ),
    analysis: (request: FastifyRequest) =>
      analysis.analyze(getReportAnalysisQuerySchema.parse(query(request)), request.actor!.userId),
    sections: (request: FastifyRequest) => analysis.registry(request.actor!.userId),
    async export(request: FastifyRequest, reply: FastifyReply) {
      const file = await exports(ReportExportInputSchema.parse(request.body), request.actor!.userId)
      return reply
        .type(file.contentType)
        .header('Content-Disposition', `attachment; filename="${file.filename}"`)
        .send(file.bytes)
    },
    schedules: (request: FastifyRequest) =>
      schedules.list(listReportSchedulesQuerySchema.parse(query(request)), request.actor!.userId),
    schedule: (request: FastifyRequest) => schedules.get(id(request), request.actor!.userId),
    async create(request: FastifyRequest, reply: FastifyReply) {
      return reply
        .code(201)
        .send(
          await schedules.create(
            ReportScheduleInputSchema.parse(request.body),
            request.actor!.userId,
          ),
        )
    },
    update: (request: FastifyRequest) =>
      schedules.update(
        id(request),
        ReportScheduleUpdateSchema.parse(request.body),
        request.actor!.userId,
      ),
    action: (action: 'enable' | 'disable' | 'archive' | 'restore') => (request: FastifyRequest) =>
      schedules.action(
        id(request),
        action,
        ReportVersionInputSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      ),
    async delete(request: FastifyRequest, reply: FastifyReply) {
      await runs.deleteSchedule(
        id(request),
        ReportVersionInputSchema.parse(request.body).expectedVersion,
        request.actor!.userId,
      )
      return reply.code(204).send()
    },
    recipients: (request: FastifyRequest) => {
      const input = listReportEligibleRecipientsQuerySchema.parse(query(request))
      return schedules.recipients(
        { ...input, sections: input.sections ?? [] },
        request.actor!.userId,
      )
    },
    runs: (request: FastifyRequest) => {
      const input = listReportScheduleRunsQuerySchema.parse(query(request))
      return schedules.runs(id(request), input, request.actor!.userId)
    },
    run: (request: FastifyRequest) => schedules.run(id(request), request.actor!.userId),
    retry: (request: FastifyRequest) => schedules.retry(id(request), request.actor!.userId),
    artifacts: (request: FastifyRequest) => schedules.artifacts(id(request), request.actor!.userId),
  }
}
