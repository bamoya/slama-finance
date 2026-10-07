import type { FastifyInstance, preHandlerHookHandler } from 'fastify'

import type { ObjectStorage } from '../../integrations/contracts.js'
import type { Database } from '../../lib/db.js'
import type { Transaction } from '../../lib/db.js'
import { AppError } from '../../lib/errors.js'
import { type ArtifactOwnerAccess, createArtifactSupport } from '../../support/artifacts/index.js'
import { createJobSupport, createPdfJobWorker } from '../../support/jobs/index.js'
import type { MessageAttachment, NotificationPublicApi } from '../../support/notifications/index.js'
import type { ClientNotificationsPublicApi } from '../clients/index.js'
import type { MediaPublicApi } from '../media/index.js'
import type { NotificationPolicyPublicApi } from '../settings/index.js'
import { createArtifactController } from './artifacts/controllers/artifact.controller.js'
import { registerArtifactRoutes } from './artifacts/routes/artifact.routes.js'
import { createRegeneratePdfService } from './artifacts/services/regenerate-pdf.service.js'
import { createDeliveryNoteController } from './delivery-notes/controllers/delivery-note.controller.js'
import { createDeliveryNoteRepository } from './delivery-notes/repositories/delivery-note.repository.js'
import { registerDeliveryNoteRoutes } from './delivery-notes/routes/delivery-note.routes.js'
import {
  createDeliveryNoteOwnerAccess,
  createDeliveryNoteService,
} from './delivery-notes/services/delivery-note.service.js'
import { createEstimateController } from './estimates/controllers/estimate.controller.js'
import { createEstimateRepository } from './estimates/repositories/estimate.repository.js'
import { registerEstimateRoutes } from './estimates/routes/estimate.routes.js'
import {
  createEstimateOwnerAccess,
  createEstimateService,
} from './estimates/services/estimate.service.js'
import { createInvoiceController } from './invoices/controllers/invoice.controller.js'
import { createInvoiceRepository } from './invoices/repositories/invoice.repository.js'
import { registerInvoiceRoutes } from './invoices/routes/invoice.routes.js'
import {
  createInvoiceOwnerAccess,
  createInvoiceService,
} from './invoices/services/invoice.service.js'
import { createSalesNotificationController } from './notifications/controllers/sales-notification.controller.js'
import type {
  PrepareNotificationAttachment,
  ReportNotificationOwner,
} from './notifications/notifications.public.js'
import { createSalesNotificationRepository } from './notifications/repositories/sales-notification.repository.js'
import { registerSalesNotificationRoutes } from './notifications/routes/sales-notification.routes.js'
import { createSalesNotificationService } from './notifications/services/sales-notification.service.js'
import { createPaymentController } from './payments/controllers/payment.controller.js'
import { createPaymentRepository } from './payments/repositories/payment.repository.js'
import { registerPaymentRoutes } from './payments/routes/payment.routes.js'
import { createPaymentService } from './payments/services/payment.service.js'
import {
  createPaymentReceiptOwner,
  createPaymentReceiptService,
} from './payments/services/payment-receipt.service.js'
import { renderPaymentReceiptPdf } from './payments/services/payment-receipt-pdf.service.js'
import { createReportingReadRepository } from './shared/repositories/reporting-read.repository.js'
import { renderDeliveryPdf } from './shared/services/delivery-pdf.service.js'
import { createReportingReadService } from './shared/services/reporting-read.service.js'
import { renderSalesPdf } from './shared/services/sales-pdf.service.js'
export type { SalesReportingApi } from './sales.public.js'

export function createSalesModule(
  database: () => Database,
  storage: ObjectStorage,
  media: Pick<MediaPublicApi, 'documentImages'>,
  reportOwners?: () => ArtifactOwnerAccess,
) {
  const estimatesRepo = createEstimateRepository(database)
  const invoicesRepo = createInvoiceRepository(database)
  const deliveryNotesRepo = createDeliveryNoteRepository(database)
  const paymentsRepo = createPaymentRepository(database)
  let notificationCallbacks:
    | {
        invalidate: (tx: Transaction) => Promise<void>
        paymentConfirmed: (tx: Transaction, id: string) => Promise<void>
      }
    | undefined
  const changed = (tx: Transaction) => notificationCallbacks?.invalidate(tx) ?? Promise.resolve()
  const payments = createPaymentService(paymentsRepo, {
    invalidate: changed,
    paymentConfirmed: (tx, id) =>
      notificationCallbacks?.paymentConfirmed(tx, id) ?? Promise.resolve(),
  })
  const receiptOwner = createPaymentReceiptOwner(paymentsRepo)
  const estimateOwner = createEstimateOwnerAccess(estimatesRepo)
  const invoiceOwner = createInvoiceOwnerAccess(invoicesRepo)
  const deliveryNoteOwner = createDeliveryNoteOwnerAccess(deliveryNotesRepo)
  const owners: ArtifactOwnerAccess = {
    assertPublishable(tx, type, id, version) {
      if (type === 'report_run' && reportOwners)
        return reportOwners().assertPublishable(tx, type, id, version)
      if (type === 'payment_receipt') return receiptOwner.assertPublishable(tx, type, id, version)
      if (type === 'estimate') return estimateOwner.assertPublishable(tx, id, version)
      if (type === 'invoice') return invoiceOwner.assertPublishable(tx, id, version)
      if (type === 'delivery_note') return deliveryNoteOwner.assertPublishable(tx, id, version)
      throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Document owner is unavailable.')
    },
    assertReadable(tx, type, id, actor) {
      if (type === 'report_run' && reportOwners)
        return reportOwners().assertReadable(tx, type, id, actor)
      if (type === 'payment_receipt') return receiptOwner.assertReadable(tx, type, id, actor)
      if (type === 'estimate') return estimateOwner.assertReadable(tx, id, actor)
      if (type === 'invoice') return invoiceOwner.assertReadable(tx, id, actor)
      if (type === 'delivery_note') return deliveryNoteOwner.assertReadable(tx, id, actor)
      throw new AppError(404, 'ARTIFACT_NOT_FOUND', 'Document owner is unavailable.')
    },
    async assertCurrent(tx, row) {
      if (row.documentType === 'payment_receipt') await receiptOwner.assertCurrent!(tx, row)
    },
    async published(tx, row) {
      if (row.documentType === 'payment_receipt') await receiptOwner.published!(tx, row)
    },
  }
  const artifacts = createArtifactSupport(database, storage, owners)
  const jobs = createJobSupport(database)
  const receipts = createPaymentReceiptService(
    paymentsRepo,
    artifacts.service,
    async (id, version, design) => {
      const images = await media.documentImages('payment_receipt', id, version, design)
      return renderPaymentReceiptPdf(await paymentsRepo.one(id), images)
    },
  )
  const estimates = createEstimateService(estimatesRepo, jobs, artifacts.service, changed)
  const invoices = createInvoiceService(invoicesRepo, jobs, artifacts.service, changed)
  const deliveryNotes = createDeliveryNoteService(deliveryNotesRepo, jobs, artifacts.service)
  const regenerate = createRegeneratePdfService(
    { invoice: invoicesRepo, estimate: estimatesRepo, delivery_note: deliveryNotesRepo },
    artifacts.service,
    async (type, id, version, design) => {
      const images = await media.documentImages(type, id, version, design)
      if (type === 'delivery_note')
        return renderDeliveryPdf(
          await deliveryNotesRepo.one(id),
          await deliveryNotesRepo.lines(id),
          images,
        )
      if (type === 'invoice') {
        const row = await invoicesRepo.one(id)
        return renderSalesPdf(
          { ...row, appearanceSnapshot: images.appearance },
          await invoicesRepo.lines(id),
          'INVOICE',
          images,
        )
      }
      const row = await estimatesRepo.one(id)
      return renderSalesPdf(
        { ...row, appearanceSnapshot: images.appearance },
        await estimatesRepo.lines(id),
        'ESTIMATE',
        images,
      )
    },
  )
  const preparePdf = async (
    payload: { documentType: string; documentId: string; sourceVersion: number },
    actor: string | null,
  ) => {
    if (payload.documentType === 'estimate') {
      const row = await estimatesRepo.one(payload.documentId)
      const lines = await estimatesRepo.lines(row.id)
      const images = await media.documentImages('estimate', row.id, payload.sourceVersion)
      const bytes = await renderSalesPdf(row, lines, 'ESTIMATE', images)
      await artifacts.service.publishPdf({
        type: 'estimate',
        documentId: row.id,
        sourceVersion: payload.sourceVersion,
        bytes,
        actor,
      })
    } else if (payload.documentType === 'invoice') {
      const row = await invoicesRepo.one(payload.documentId)
      const lines = await invoicesRepo.lines(row.id)
      const images = await media.documentImages('invoice', row.id, payload.sourceVersion)
      const bytes = await renderSalesPdf(row, lines, 'INVOICE', images)
      await artifacts.service.publishPdf({
        type: 'invoice',
        documentId: row.id,
        sourceVersion: payload.sourceVersion,
        bytes,
        actor,
      })
    } else if (payload.documentType === 'delivery_note') {
      const row = await deliveryNotesRepo.one(payload.documentId)
      const lines = await deliveryNotesRepo.lines(row.id)
      const bytes = await renderDeliveryPdf(row, lines)
      await artifacts.service.publishPdf({
        type: 'delivery_note',
        documentId: row.id,
        sourceVersion: payload.sourceVersion,
        bytes,
        actor,
      })
    } else throw new Error('UNSUPPORTED_JOB')
  }
  const worker = createPdfJobWorker(jobs, preparePdf)
  return {
    configureNotificationCallbacks(callbacks: {
      invalidate: (tx: Transaction) => Promise<void>
      paymentConfirmed: (tx: Transaction, id: string) => Promise<void>
    }) {
      notificationCallbacks = callbacks
    },
    async prepareNotificationAttachment(
      type: 'invoice' | 'estimate',
      id: string,
      version: number,
      actor: string | null,
    ): Promise<MessageAttachment> {
      const attachments = createSalesNotificationRepository(database)
      let row = await attachments.artifact(type, id, version)
      if (!row) {
        await preparePdf({ documentType: type, documentId: id, sourceVersion: version }, actor)
        row = await attachments.artifact(type, id, version)
      }
      if (!row) throw new AppError(409, 'ARTIFACT_NOT_READY', 'Document file is not ready.')
      return {
        objectKey: row.objectKey,
        filename: `${type}-${id}.pdf`,
        contentType: row.mimeType,
        byteSize: row.byteSize,
        position: 0,
      }
    },
    publicApi: { reporting: createReportingReadService(createReportingReadRepository(database)) },
    worker,
    async registerRoutes(
      app: FastifyInstance,
      permission: (key: string) => preHandlerHookHandler,
      authenticate: preHandlerHookHandler,
    ) {
      await app.register(
        async (scope) => {
          registerEstimateRoutes(scope, createEstimateController(estimates), permission)
          registerPaymentRoutes(scope, createPaymentController(payments, receipts), permission)
          registerInvoiceRoutes(scope, createInvoiceController(invoices), permission)
          registerDeliveryNoteRoutes(scope, createDeliveryNoteController(deliveryNotes), permission)
          registerArtifactRoutes(
            scope,
            createArtifactController(artifacts.service, (params, input, actor) =>
              params.documentType === 'payment_receipt'
                ? receipts.regenerate(params.id, actor, input.design)
                : regenerate({ ...params, documentType: params.documentType }, input, actor),
            ),
            authenticate,
          )
        },
        { prefix: '/v1' },
      )
    },
  }
}

export function createSalesNotificationsModule(
  database: () => Database,
  notifications: NotificationPublicApi,
  policies: NotificationPolicyPublicApi,
  clients: ClientNotificationsPublicApi,
  prepareAttachment: PrepareNotificationAttachment,
  options: { reportOwner?: ReportNotificationOwner; clock?: () => Date } = {},
) {
  const service = createSalesNotificationService(
    createSalesNotificationRepository(database),
    createJobSupport(database),
    notifications,
    policies,
    clients,
    prepareAttachment,
    options,
  )
  return {
    worker: service.worker,
    sweep: service.sweep,
    invalidate: service.invalidate,
    paymentConfirmed: service.paymentConfirmed,
    registerRoutes: async (
      app: FastifyInstance,
      permission: (key: string) => preHandlerHookHandler,
    ) =>
      app.register(
        async (scope) =>
          registerSalesNotificationRoutes(
            scope,
            createSalesNotificationController(service),
            permission,
          ),
        { prefix: '/v1' },
      ),
  }
}
export type {
  PrepareNotificationAttachment,
  ReportNotificationOwner,
} from './notifications/notifications.public.js'
