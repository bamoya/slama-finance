import { randomUUID } from 'node:crypto'

import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify, { type FastifyServerOptions, LogController } from 'fastify'

import { type Environment, loadEnvironment } from './config/env.js'
import type {
  EmailProvider,
  ObjectStorage,
  PasswordResetDelivery,
} from './integrations/contracts.js'
import { createResendResetDelivery } from './integrations/email/resend.js'
import { createSmtpEmailProvider } from './integrations/email/smtp.js'
import {
  createRecordingEmailProvider,
  createResendEmailProvider,
} from './integrations/email/transport.js'
import { createLocalStorage } from './integrations/storage/local.js'
import { createS3Storage } from './integrations/storage/s3.js'
import { createDatabase, type Database } from './lib/db.js'
import { AppError, registerErrorHandlers } from './lib/errors.js'
import { loggerOptions } from './lib/logging.js'
import type { WorkerObserver } from './lib/worker-observer.js'
import { createRequirePermission } from './middlewares/require-permission.js'
import { createCatalogModule } from './modules/catalog/index.js'
import { createClientModule, createClientNotificationModule } from './modules/clients/index.js'
import { createIdentityModule } from './modules/identity/index.js'
import { createMediaModule } from './modules/media/index.js'
import { createReportingModule } from './modules/reporting/index.js'
import { createSalesModule, createSalesNotificationsModule } from './modules/sales/index.js'
import { createNotificationSettingsModule, createSettingsModule } from './modules/settings/index.js'
import { createArtifactCleanup } from './support/artifacts/index.js'
import { createJobSupport } from './support/jobs/index.js'
import { createNotificationSupport } from './support/notifications/index.js'

declare module 'fastify' {
  interface FastifyInstance {
    database: () => Database
    environment: Environment
  }
}

export interface AppOptions {
  environment?: Environment
  logger?: FastifyServerOptions['logger']
  readinessProbe?: () => Promise<void>
  passwordReset?: { adapter: PasswordResetDelivery; resetUrl: string }
  mediaStorage?: ObjectStorage
  notificationProvider?: EmailProvider
}

export async function buildApp(options: AppOptions = {}) {
  const env = options.environment ?? loadEnvironment()
  const app = Fastify({
    logger: options.logger ?? { ...loggerOptions, level: env.LOG_LEVEL },
    bodyLimit: env.BODY_LIMIT_BYTES,
    requestTimeout: env.REQUEST_TIMEOUT_MS,
    requestIdHeader: false,
    trustProxy: env.TRUST_PROXY_IPS.length ? env.TRUST_PROXY_IPS : false,
    genReqId: () => randomUUID(),
    logController: new LogController({ requestIdLogLabel: 'requestId' }),
  })
  let connection: ReturnType<typeof createDatabase> | undefined
  const getConnection = () => {
    if (!env.DATABASE_URL)
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is not ready.')
    return (connection ??= createDatabase(env.DATABASE_URL, env.DATABASE_POOL_SIZE))
  }
  app.decorate('database', () => getConnection().db)
  app.decorate('environment', env)
  app.addHook('onClose', async () => {
    clearInterval(cleanup)
    clearInterval(workerTimer)
    clearInterval(notificationTimer)
    clearInterval(reportTimer)
    clearInterval(metricsTimer)
    await running
    await runningWorker
    await runningNotification
    await runningReport
    await runningMetrics
    await connection?.close()
  })
  registerErrorHandlers(app)
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id)
    reply.header('cache-control', 'no-store')
    // All browser mutations, including login/logout, must carry an exact trusted Origin.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      if (!request.headers.origin || !env.CORS_ORIGIN.includes(request.headers.origin)) {
        throw new AppError(403, 'UNTRUSTED_ORIGIN', 'This request origin is not allowed.')
      }
    }
  })

  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    exposedHeaders: ['x-request-id', 'content-disposition'],
  })
  await app.register(cookie)
  await app.register(helmet)
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: '1 minute',
    errorResponseBuilder: () =>
      new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again later.'),
  })

  app.get('/health', async () => ({ status: 'ok' }))
  app.get('/ready', async () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        options.readinessProbe
          ? options.readinessProbe()
          : getConnection().ready(env.READINESS_TIMEOUT_MS),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error('Readiness timed out')),
            env.READINESS_TIMEOUT_MS,
          )
        }),
      ])
      return { status: 'ready' }
    } catch {
      throw new AppError(503, 'DATABASE_UNAVAILABLE', 'The service is not ready.')
    } finally {
      clearTimeout(timer)
    }
  })
  app.decorateRequest('actor', null)
  const identity = createIdentityModule({
    database: () => app.database(),
    ttlDays: env.SESSION_TTL_DAYS,
    secure: env.NODE_ENV === 'production',
    onAuthorizationChange: async (tx, userIds) => {
      await reporting.invalidateStaff(tx, userIds)
      await salesNotifications.invalidate(tx)
    },
    passwordReset:
      options.passwordReset ??
      (env.RESEND_API_KEY && env.EMAIL_FROM && env.PASSWORD_RESET_URL
        ? {
            adapter: createResendResetDelivery({
              apiKey: env.RESEND_API_KEY,
              from: env.EMAIL_FROM,
              onFailure: () =>
                app.log.error(
                  { code: 'RESET_EMAIL_DELIVERY_FAILED' },
                  'Password reset email delivery failed',
                ),
            }),
            resetUrl: env.PASSWORD_RESET_URL,
          }
        : undefined),
  })
  await identity.registerRoutes(app, createRequirePermission(identity.publicApi))
  const unavailableStorage: ObjectStorage = {
    async putImmutable() {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Configure private company asset storage.')
    },
    async get() {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Configure private company asset storage.')
    },
    async deleteUnreferenced() {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Configure private media storage.')
    },
    async signedDownloadUrl() {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Configure private media storage.')
    },
    async list() {
      throw new AppError(503, 'STORAGE_UNAVAILABLE', 'Configure private document storage.')
    },
  }
  const storage =
    options.mediaStorage ??
    (env.S3_ENDPOINT && env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY
      ? createS3Storage({
          endpoint: env.S3_ENDPOINT,
          region: env.S3_REGION,
          bucket: env.S3_BUCKET,
          accessKeyId: env.S3_ACCESS_KEY_ID,
          secretAccessKey: env.S3_SECRET_ACCESS_KEY,
        })
      : env.NODE_ENV === 'production'
        ? unavailableStorage
        : createLocalStorage(env.MEDIA_ASSET_DIR))
  const media = createMediaModule(() => app.database(), storage)
  const sales = createSalesModule(
    () => app.database(),
    storage,
    media.publicApi,
    () => reporting.owners,
  )
  const notificationTransport =
    env.NOTIFICATION_TRANSPORT ?? (env.NODE_ENV === 'production' ? 'resend' : 'recording')
  const senderEmail = env.EMAIL_FROM ?? 'notifications@example.invalid'
  const observe: WorkerObserver = (event) => {
    if (event.event === 'failed' || event.event === 'retry')
      app.log.warn(event, 'Background worker outcome')
    else app.log.info(event, 'Background worker outcome')
  }
  const notifications = createNotificationSupport(
    () => app.database(),
    storage,
    options.notificationProvider ??
      (notificationTransport === 'resend'
        ? createResendEmailProvider({ apiKey: env.RESEND_API_KEY! })
        : notificationTransport === 'smtp'
          ? createSmtpEmailProvider({ host: env.SMTP_HOST, port: env.SMTP_PORT })
          : createRecordingEmailProvider()),
    { allowedFrom: [senderEmail], observe },
  )
  const reporting = createReportingModule({
    database: () => app.database(),
    sales: sales.publicApi.reporting,
    identity: identity.publicApi,
    storage,
    notifications,
    sender: { email: senderEmail, name: 'Slama Finance' },
    uiOrigin: env.CORS_ORIGIN[0],
    observe,
  })
  const notificationSettings = createNotificationSettingsModule(
    () => app.database(),
    notifications,
    {
      allowedFrom: [senderEmail],
      onPolicyChange: (tx, event) =>
        salesNotifications.invalidate(tx, { event }).then(() => undefined),
    },
  )
  const clientNotifications = createClientNotificationModule(
    () => app.database(),
    notificationSettings.publicApi,
    (tx, clientId) => salesNotifications.invalidate(tx, { clientId }).then(() => undefined),
  )
  const salesNotifications = createSalesNotificationsModule(
    () => app.database(),
    notifications,
    notificationSettings.publicApi,
    clientNotifications.publicApi,
    sales.prepareNotificationAttachment,
    { reportOwner: reporting.reportOwner },
  )
  sales.configureNotificationCallbacks({
    invalidate: async (tx) => {
      await salesNotifications.invalidate(tx)
    },
    paymentConfirmed: (tx, paymentId) => salesNotifications.paymentConfirmed(tx, paymentId),
  })
  const cleanupArtifacts = createArtifactCleanup(() => app.database(), storage)
  const jobMetrics = createJobSupport(() => app.database())
  await media.registerRoutes(app, async (r) => {
    const user = await identity.publicApi.resolveSession(r.cookies.slama_session)
    if (!user) throw new AppError(403, 'FORBIDDEN', 'Sign in with a full session.')
    r.actor = { userId: user.id }
  })
  let cleanup: ReturnType<typeof setInterval> | undefined
  let running: Promise<unknown> | undefined
  let workerTimer: ReturnType<typeof setInterval> | undefined
  let runningWorker: Promise<unknown> | undefined
  let notificationTimer: ReturnType<typeof setInterval> | undefined
  let reportTimer: ReturnType<typeof setInterval> | undefined
  let runningNotification: Promise<unknown> | undefined
  let runningReport: Promise<unknown> | undefined
  let metricsTimer: ReturnType<typeof setInterval> | undefined
  let runningMetrics: Promise<unknown> | undefined
  app.addHook('onReady', async () => {
    if (env.NODE_ENV === 'test') return
    metricsTimer = setInterval(() => {
      runningMetrics ??= Promise.all([
        jobMetrics.metrics(),
        notifications.metrics(),
        reporting.metrics(),
      ])
        .then(([preparation, delivery, reports]) => {
          app.log.info(
            { event: 'worker_queue_metrics', preparation, delivery, reports },
            'Background queue metrics',
          )
        })
        .catch(() =>
          app.log.warn({ code: 'WORKER_METRICS_UNAVAILABLE' }, 'Background metrics unavailable'),
        )
        .finally(() => {
          runningMetrics = undefined
        })
    }, 60_000)
    metricsTimer.unref()
    workerTimer = setInterval(() => {
      runningWorker ??= sales.worker
        .runOne()
        .catch(() => app.log.error('Document preparation worker failed'))
        .finally(() => {
          runningWorker = undefined
        })
    }, 2000)
    workerTimer.unref()
    if (env.NOTIFICATION_WORKER_ENABLED) {
      if (notificationTransport === 'recording' && !options.notificationProvider)
        app.log.warn('Business email uses recording transport; no external messages are sent.')
      notificationTimer = setInterval(() => {
        runningNotification ??= salesNotifications.worker
          .runOne()
          .then(() => notifications.worker.runOne())
          .catch(() => app.log.error({ code: 'NOTIFICATION_WORKER_FAILED' }, 'Email worker failed'))
          .finally(() => {
            runningNotification = undefined
          })
      }, env.NOTIFICATION_POLL_MS)
      notificationTimer.unref()
    }
    reportTimer = setInterval(() => {
      runningReport ??= reporting.worker
        .sweep()
        .then(() => reporting.worker.runOne())
        .then(() => salesNotifications.sweep())
        .catch(() => app.log.error({ code: 'REPORT_WORKER_FAILED' }, 'Report worker failed'))
        .finally(() => {
          runningReport = undefined
        })
    }, env.REPORT_POLL_MS)
    reportTimer.unref()
    cleanup = setInterval(
      () => {
        running ??= Promise.all([
          media.cleanup(),
          cleanupArtifacts(),
          notifications.retainPayloads(env.NOTIFICATION_PAYLOAD_RETENTION_DAYS),
        ])
          .then((result) => {
            if (result[0].failed)
              app.log.warn(
                { failed: result[0].failed },
                'Media cleanup will retry failed deletions',
              )
            if (result[1].failed)
              app.log.warn(
                { failed: result[1].failed },
                'Artifact cleanup will retry failed deletions',
              )
          })
          .catch(() => app.log.error('Media cleanup failed'))
          .finally(() => {
            running = undefined
          })
      },
      60 * 60 * 1000,
    )
    cleanup.unref()
  })
  await createSettingsModule(() => app.database(), media.publicApi).registerRoutes(
    app,
    createRequirePermission(identity.publicApi),
  )
  await createCatalogModule(() => app.database(), media.publicApi).registerRoutes(
    app,
    createRequirePermission(identity.publicApi),
  )
  await createClientModule(
    () => app.database(),
    (tx, clientId) => salesNotifications.invalidate(tx, { clientId }).then(() => undefined),
  ).registerRoutes(app, createRequirePermission(identity.publicApi))
  await sales.registerRoutes(app, createRequirePermission(identity.publicApi), async (request) => {
    const user = await identity.publicApi.resolveSession(request.cookies.slama_session)
    if (!user) throw new AppError(403, 'FORBIDDEN', 'Sign in with a full session.')
    request.actor = { userId: user.id }
  })
  await reporting.registerRoutes(app, createRequirePermission(identity.publicApi))
  await notificationSettings.registerRoutes(app, createRequirePermission(identity.publicApi))
  await clientNotifications.registerRoutes(app, createRequirePermission(identity.publicApi))
  await salesNotifications.registerRoutes(app, createRequirePermission(identity.publicApi))

  return app
}
