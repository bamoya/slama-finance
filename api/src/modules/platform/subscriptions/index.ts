import type { FastifyInstance } from 'fastify'

import type { ObjectStorage } from '../../../integrations/contracts.js'
import type { Database, Transaction } from '../../../lib/db.js'
import { createSubscriptionController } from './controllers/subscription.controller.js'
import { createBillingRepository } from './repositories/billing.repository.js'
import type { InvoiceRecord } from './repositories/billing-documents.repository.js'
import {
  coverageLifecycleSql,
  type CoverageReads,
} from './repositories/coverage-lifecycle.repository.js'
import { createSubscriptionRepository } from './repositories/subscription.repository.js'
import { createTimezoneRepository } from './repositories/timezone.repository.js'
import { registerSubscriptionRoutes } from './routes/subscription.routes.js'
import { createBillingService, toInvoice } from './services/billing.service.js'
import { createMeteredStorage } from './services/metered-storage.service.js'
import type { ShadowDiff } from './services/period-resolver.service.js'
import { createSubscriptionService } from './services/subscription.service.js'
import {
  createTimezoneGuard,
  databaseTimezoneCheck,
  type TimezoneReport,
} from './services/timezone-consistency.service.js'
export type { CoverageReads } from './repositories/coverage-lifecycle.repository.js'
export { billingDay, billingTimezone, zonedDayStart } from './services/billing-calendar.service.js'
export type { ShadowDiff } from './services/period-resolver.service.js'
export type { TimezoneReport } from './services/timezone-consistency.service.js'
export type SubscriptionsPublicApi = ReturnType<typeof createSubscriptionService>
const adminInvoice = (row: InvoiceRecord) => ({
  ownerId: row.ownerId,
  ownerEmail: row.ownerEmail,
  invoice: toInvoice(row),
})
/**
 * `timezone.check` compares application and database zone data; it defaults to the real database
 * comparison. Tests inject agreeing, mismatching or failing checks.
 */
export function createSubscriptionsModule(
  database: () => Database,
  options: {
    check?: () => Promise<TimezoneReport>
    onReport?: (report: TimezoneReport) => void
    onError?: (error: unknown) => void
    onShadowDiff?: (diff: ShadowDiff) => void
    /** S5b dual write of coverage periods (SUBSCRIPTION_PERIOD_WRITES); legacy rows always written. */
    periodWrites?: boolean
    /**
     * S5c coverage read authority (SUBSCRIPTION_COVERAGE_READS, default legacy). One value drives
     * API admissions, billing, worker eligibility and the administrator lifecycle SQL together.
     */
    coverageReads?: CoverageReads
  } = {},
) {
  const reads = options.coverageReads ?? 'legacy'
  const repo = createSubscriptionRepository(database),
    billingRepo = createBillingRepository(database)
  const timezone = createTimezoneGuard(
    options.check ?? databaseTimezoneCheck(createTimezoneRepository(database)),
    options,
  )
  const writable = timezone.assertWritable
  const service = createSubscriptionService(
    repo,
    billingRepo,
    undefined,
    writable,
    options.onShadowDiff,
    options.periodWrites ?? true,
    reads,
  )
  const billing = createBillingService(
    billingRepo,
    repo,
    undefined,
    writable,
    options.periodWrites ?? true,
    reads,
  )
  return {
    publicApi: service,
    /** Startup timezone-data consistency (readiness detail and write guard). */
    timezone,
    /** Privileged operator actions; never exposed through owner or staff routes. */
    administration: {
      confirm: billing.confirm,
      reject: billing.reject,
      invoices: async (
        filter: { ownerId?: string; page: number; pageSize: number },
        tx?: Transaction,
      ) => {
        const { rows, total } = await billing.adminInvoices(filter, tx)
        return { rows: rows.map(adminInvoice), total }
      },
      creditNote: async (
        invoiceId: string,
        input: { amountHt: number; reason: string },
        issuedBy: string,
        onIssued?: (tx: Transaction, note: ReturnType<typeof adminInvoice>) => Promise<void>,
        tx?: Transaction,
      ) =>
        adminInvoice(
          await billing.creditNote(
            invoiceId,
            input,
            issuedBy,
            onIssued && ((t, note) => onIssued(t, adminInvoice(note))),
            tx,
          ),
        ),
      lifecycle: billing.administration,
      /** Set-based lifecycle status for bounded administrator counts and filters (same authority). */
      lifecycleStatus: coverageLifecycleSql(reads),
    },
    storage: (storage: ObjectStorage) => createMeteredStorage(storage, service),
    async registerRoutes(app: FastifyInstance, owner: (token?: string) => Promise<{ id: string }>) {
      registerSubscriptionRoutes(app, createSubscriptionController(service, billing, owner))
    },
  }
}
