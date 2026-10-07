import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { ObjectStorage } from '../../integrations/contracts.js'
import type { Database } from '../../lib/db.js'
import type { WorkerObserver } from '../../lib/worker-observer.js'
import { createArtifactSupport } from '../../support/artifacts/index.js'
import type { NotificationPublicApi } from '../../support/notifications/index.js'
import type { IdentityPublicApi } from '../identity/identity.public.js'
import type { SalesReportingApi } from '../sales/index.js'
import { createReportingController } from './analysis/controllers/reporting.controller.js'
import { createAnalysisRepository } from './analysis/repositories/analysis.repository.js'
import { registerReportingRoutes } from './analysis/routes/reporting.routes.js'
import { createAnalysisService } from './analysis/services/analysis.service.js'
import { createExportService } from './exports/services/export.service.js'
import { createRunManagementRepository } from './schedules/repositories/run-management.repository.js'
import { createScheduleRepository } from './schedules/repositories/schedule.repository.js'
import { createRunManagementService } from './schedules/services/run-management.service.js'
import { createScheduleService } from './schedules/services/schedule.service.js'
export function createReportingModule(options: {
  database: () => Database
  sales: SalesReportingApi
  identity: IdentityPublicApi
  storage: ObjectStorage
  notifications?: NotificationPublicApi
  sender?: { email: string; name: string }
  uiOrigin?: string
  clock?: () => Date
  leaseMs?: number
  observe?: WorkerObserver
}) {
  const repo = createAnalysisRepository(options.database, options.clock)
  const analysis = createAnalysisService(repo, options.sales, options.identity)
  const schedules = createScheduleService(
    createScheduleRepository(options.database),
    options.identity,
    analysis,
    options,
  )
  const artifacts = createArtifactSupport(options.database, options.storage, schedules.owners)
  return {
    metrics: schedules.metrics,
    owners: schedules.owners,
    reportOwner: schedules.reportOwner,
    invalidateStaff: schedules.invalidateStaff,
    worker: {
      sweep: schedules.worker.sweep,
      runOne: () => schedules.worker.runOne(artifacts.service),
    },
    async registerRoutes(app: FastifyInstance, permission: (key: string) => preHandlerHookHandler) {
      await app.register(
        async (scope) =>
          registerReportingRoutes(
            scope,
            createReportingController(
              analysis,
              createExportService(analysis, repo, options.identity),
              schedules,
              createRunManagementService(
                createRunManagementRepository(options.database),
                options.identity,
                artifacts.service,
              ),
            ),
            permission,
          ),
        { prefix: '/v1' },
      )
    },
  }
}
