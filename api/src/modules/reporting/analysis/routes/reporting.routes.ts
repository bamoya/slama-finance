import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { createReportingController } from '../controllers/reporting.controller.js'
export function registerReportingRoutes(
  app: FastifyInstance,
  c: ReturnType<typeof createReportingController>,
  permission: (key: string) => preHandlerHookHandler,
) {
  app.get('/dashboard', { preHandler: permission('reports.read') }, c.analysis)
  app.get('/reports/analysis', { preHandler: permission('reports.read') }, c.analysis)
  app.get('/reports/sections', { preHandler: permission('reports.read') }, c.sections)
  app.post(
    '/reports/exports',
    {
      preHandler: permission('reports.read'),
      config: { rateLimit: { max: 5, timeWindow: 60000 } },
    },
    c.export,
  )
  app.get('/report-schedules', { preHandler: permission('reports.read') }, c.schedules)
  app.post('/report-schedules/preview', { preHandler: permission('reports.read') }, c.preview)
  app.post('/report-schedules', { preHandler: permission('reports.read') }, c.create)
  app.get(
    '/report-schedules/eligible-recipients',
    { preHandler: permission('reports.read') },
    c.recipients,
  )
  app.get('/report-schedules/:id', { preHandler: permission('reports.read') }, c.schedule)
  app.post(
    '/report-schedules/:id/test-email',
    {
      preHandler: permission('reports.read'),
      config: { rateLimit: { max: 3, timeWindow: 60000 } },
    },
    c.sendTest,
  )
  app.patch('/report-schedules/:id', { preHandler: permission('reports.read') }, c.update)
  app.delete('/report-schedules/:id', { preHandler: permission('reports.read') }, c.delete)
  for (const action of ['enable', 'disable', 'archive', 'restore'] as const)
    app.post(
      `/report-schedules/:id/${action}`,
      { preHandler: permission('reports.read') },
      c.action(action),
    )
  app.get('/report-schedules/:id/runs', { preHandler: permission('reports.read') }, c.runs)
  app.get('/report-runs/:id', { preHandler: permission('reports.read') }, c.run)
  app.post('/report-runs/:id/cleanup', { preHandler: permission('reports.read') }, c.cleanupRun)
  app.post(
    '/report-runs/:id/regenerate-files',
    {
      preHandler: permission('reports.read'),
      config: { rateLimit: { max: 5, timeWindow: 60000 } },
    },
    c.regenerateFiles,
  )
  app.post('/report-runs/:id/retry', { preHandler: permission('reports.read') }, c.retry)
  app.get('/report-runs/:id/artifacts', { preHandler: permission('reports.read') }, c.artifacts)
}
