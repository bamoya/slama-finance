import { createHash } from 'node:crypto'

import type { SendDocumentInput } from '../../../../contracts/generated/sales/notifications.schemas.js'
import type { NotificationRule } from '../../../../contracts/generated/settings/notifications.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import { assertVersion, companyDate, FinancialDecimal } from '../../../../lib/validation.js'
import type { createJobSupport } from '../../../../support/jobs/index.js'
import type { NotificationPublicApi } from '../../../../support/notifications/index.js'
import type { ClientNotificationsPublicApi } from '../../../clients/index.js'
import type { NotificationPolicyPublicApi } from '../../../settings/index.js'
import type {
  PrepareNotificationAttachment,
  ReportNotificationOwner,
} from '../notifications.public.js'
import type { createSalesNotificationRepository } from '../repositories/sales-notification.repository.js'

type Jobs = ReturnType<typeof createJobSupport>
type Type = 'invoice' | 'estimate' | 'report_run'
interface PreparationPayload {
  sourceType: 'invoice' | 'estimate'
  sourceId: string
  sourceVersion: number
  requestId: string
  expectedVersion: number
  eventKey: string
  recipient: string
  cc: string[]
  rule: NotificationRule
  content: { subject: string; html: string; text: string }
}
const recipientKey = (email: string) =>
  createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 32)
const recipientSet = (emails: string[]) =>
  JSON.stringify([...new Set(emails.map((email) => email.trim().toLowerCase()))].sort())
function printableClientName(snapshot: unknown, fallback: string) {
  if (!snapshot || typeof snapshot !== 'object') return fallback
  const value = snapshot as Record<string, unknown>
  if (typeof value.legalName === 'string' && value.legalName) return value.legalName
  const personal = [value.firstName, value.lastName]
    .filter((part): part is string => typeof part === 'string' && !!part)
    .join(' ')
  return personal || fallback
}
export function reminderOccurs(
  basis: string,
  date: string,
  offsetDays: number,
  repeatEveryDays: number | null,
) {
  const elapsed =
    Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${basis}T00:00:00Z`)) / 86400_000) -
    offsetDays
  return (
    elapsed === 0 || (elapsed > 0 && repeatEveryDays !== null && elapsed % repeatEveryDays === 0)
  )
}
export function assertSendable(type: 'invoice' | 'estimate', status: string) {
  if (!(type === 'invoice' ? ['issued', 'sent'] : ['issued', 'sent', 'accepted']).includes(status))
    throw new AppError(
      409,
      'DOCUMENT_NOT_SENDABLE',
      'Only current finalized eligible documents can be sent.',
    )
}

export function createSalesNotificationService(
  repo: ReturnType<typeof createSalesNotificationRepository>,
  jobs: Jobs,
  notifications: NotificationPublicApi,
  policies: NotificationPolicyPublicApi,
  clients: ClientNotificationsPublicApi,
  prepareAttachment: PrepareNotificationAttachment,
  options: { reportOwner?: ReportNotificationOwner; clock?: () => Date } = {},
) {
  const clock = options.clock ?? (() => new Date())
  let reminderCursor: { invoice?: string; estimate?: string } = {}
  async function owner(tx: Transaction, type: Type, id: string, actor: string, retry = false) {
    if (type === 'report_run') {
      if (!options.reportOwner)
        throw new AppError(404, 'OWNER_NOT_FOUND', 'Report owner unavailable.')
      await options.reportOwner.assertReadable(tx, id, actor)
      if (retry) await options.reportOwner.assertRetryable(tx, id, actor)
      return
    }
    await repo.authorize(tx, actor, `${type}s.read`)
    if (retry) await repo.authorize(tx, actor, `${type}s.update`)
    await repo.owner(type, id, tx)
  }
  async function eligibility(
    tx: Transaction,
    type: 'invoice' | 'estimate',
    id: string,
    event: string,
    recipient?: string,
    cc?: string[],
  ) {
    const row = await repo.owner(type, id, tx, true)
    assertSendable(type, row.status)
    if (event === 'estimate_expiry_reminder' && !['issued', 'sent'].includes(row.status))
      throw new AppError(409, 'SOURCE_INELIGIBLE', 'This estimate no longer needs a reminder.')
    if (
      event === 'invoice_due_reminder' &&
      new FinancialDecimal(await repo.outstanding(id, tx)).lte(0)
    )
      throw new AppError(409, 'SOURCE_SETTLED', 'Invoice no longer has an outstanding balance.')
    const rule = await policies.rule(event, tx)
    const client = await clients.effective(row.clientId, rule, tx)
    if (!client.enabled || !client.recipient)
      throw new AppError(
        409,
        client.reason ?? 'MISSING_EMAIL',
        'Notification policy or client recipient is ineligible.',
      )
    if (recipient && recipient !== client.recipient)
      throw new AppError(409, 'RECIPIENT_CHANGED', 'Client email changed; confirm a new send.')
    if (cc !== undefined && recipientSet(cc) !== recipientSet(client.cc))
      throw new AppError(409, 'RECIPIENT_CHANGED', 'Client recipients changed; confirm a new send.')
    return { row, rule, client }
  }
  function preparationItem(job: Awaited<ReturnType<Jobs['get']>>) {
    if (!job) throw new AppError(404, 'PREPARATION_NOT_FOUND', 'Preparation not found.')
    const p = job.payload as PreparationPayload
    return {
      id: job.id,
      kind: 'preparation' as const,
      status: job.status,
      createdAt: job.createdAt.toISOString(),
      attempts: job.attempts,
      errorCode: job.lastErrorCode,
      recipient: p.recipient,
      eventKey: p.eventKey,
    }
  }
  async function validatePreparation(tx: Transaction, p: PreparationPayload, actor: string | null) {
    if (!actor)
      throw new AppError(403, 'FORBIDDEN', 'An authorized initiating operator is required.')
    await owner(tx, p.sourceType, p.sourceId, actor, true)
    const value = await eligibility(tx, p.sourceType, p.sourceId, p.eventKey, p.recipient, p.cc)
    if (value.row.contentVersion !== p.sourceVersion)
      throw new AppError(409, 'SOURCE_CHANGED', 'Printable document content changed.')
    return value
  }
  async function invalidate(tx: Transaction, filters: { event?: string; clientId?: string } = {}) {
    const dispatches = await repo.readyDispatches(tx, filters)
    let cancelled = 0
    for (const d of dispatches) {
      try {
        if (d.actor && d.source_type !== 'payment')
          await owner(tx, d.source_type, d.source_id, d.actor, true)
        if (d.source_type === 'payment') {
          const payment = await repo.payment(d.source_id, tx)
          if (payment.status !== 'confirmed')
            throw new AppError(409, 'SOURCE_INELIGIBLE', 'Payment is no longer confirmed.')
          await eligibility(tx, 'invoice', payment.invoiceId, d.event_key, d.recipient, d.cc)
        } else await eligibility(tx, d.source_type, d.source_id, d.event_key, d.recipient, d.cc)
      } catch (error) {
        if (!(error instanceof AppError) || ![403, 404, 409].includes(error.statusCode)) throw error
        await notifications.cancel(d.message_id, tx)
        cancelled++
      }
    }
    for (const job of await repo.queuedPreparations(tx)) {
      const p = job.payload as PreparationPayload
      if (filters.event && p.eventKey !== filters.event) continue
      try {
        await validatePreparation(tx, p, job.initiatedByUserId)
      } catch (error) {
        if (!(error instanceof AppError) || ![403, 404, 409].includes(error.statusCode)) throw error
        await jobs.cancelPreparation(job.id, tx)
        cancelled++
      }
    }
    return cancelled
  }
  return {
    invalidate,
    async send(type: 'invoice' | 'estimate', id: string, input: SendDocumentInput, actor: string) {
      return repo.transaction(async (tx) => {
        await owner(tx, type, id, actor, true)
        const key = `prepare_notification:${actor}:${type}:${id}:${input.requestId}`
        const existing = await repo.keyJob(key, tx)
        if (existing) {
          const p = existing.payload as PreparationPayload
          if (p.expectedVersion !== input.expectedVersion || p.requestId !== input.requestId)
            throw new AppError(409, 'JOB_CONFLICT', 'This request identity has different inputs.')
          return {
            jobId: existing.id,
            status: existing.status,
            recipient: p.recipient,
            sourceVersion: p.sourceVersion,
          }
        }
        const eventKey = `${type}_sent`
        const { row, rule, client } = await eligibility(tx, type, id, eventKey)
        assertVersion(row.version, input.expectedVersion)
        const content = policies.compose(rule, {
          clientName: printableClientName(row.clientSnapshot, client.clientName),
          documentNumber: row.number ?? '',
          issueDate: row.issueDate,
          total: row.total,
          currency: row.currency,
          validUntil: 'validUntil' in row ? (row.validUntil ?? '') : '',
        })
        const p: PreparationPayload = {
          sourceType: type,
          sourceId: id,
          sourceVersion: row.contentVersion,
          requestId: input.requestId,
          expectedVersion: input.expectedVersion,
          eventKey,
          recipient: client.recipient!,
          cc: client.cc,
          rule,
          content,
        }
        const job = await jobs.enqueueNotification(tx, p, key, actor)
        await repo.audit(tx, actor, 'send_requested', id, null, {
          jobId: job.id,
          requestId: input.requestId,
        })
        return {
          jobId: job.id,
          status: job.status,
          recipient: p.recipient,
          sourceVersion: p.sourceVersion,
        }
      })
    },
    timeline(type: Type, id: string, limit: number, offset: number, actor: string) {
      return repo.transaction(async (tx) => {
        await owner(tx, type, id, actor)
        await repo.authorize(tx, actor, 'notification_dispatches.read')
        return repo.timeline(type, id, limit, offset, tx)
      })
    },
    dispatchAction(
      type: Type,
      id: string,
      dispatchId: string,
      action: 'retry' | 'cancel',
      actor: string,
    ) {
      return repo.transaction(async (tx) => {
        await owner(tx, type, id, actor, action === 'retry')
        await repo.authorize(tx, actor, 'notification_dispatches.update')
        const dispatch = await repo.dispatch(type, id, dispatchId, tx)
        if (action === 'retry' && type === 'report_run')
          await options.reportOwner!.assertRetryable(tx, id, actor, dispatch.messageId)
        const before = await notifications.status(dispatch.messageId, tx)
        if (action === 'retry' && type !== 'report_run')
          await eligibility(tx, type, id, dispatch.eventKey, before.to, before.cc)
        const message = await notifications[action](dispatch.messageId, tx)
        await repo.audit(tx, actor, `notification_${action}`, id, null, {
          dispatchId,
          messageId: message.id,
        })
        return {
          id: dispatch.id,
          kind: 'dispatch' as const,
          status: message.status,
          createdAt: dispatch.createdAt.toISOString(),
          attempts: message.attempts,
          errorCode: message.lastErrorCode,
          recipient: message.to,
          eventKey: dispatch.eventKey,
        }
      })
    },
    preparationAction(
      type: Type,
      id: string,
      jobId: string,
      action: 'retry' | 'cancel',
      actor: string,
    ) {
      return repo.transaction(async (tx) => {
        await owner(tx, type, id, actor, action === 'retry')
        await repo.authorize(tx, actor, 'notification_dispatches.update')
        const before = await repo.job(jobId, tx)
        const p = before.payload as PreparationPayload
        if (p.sourceType !== type || p.sourceId !== id)
          throw new AppError(
            404,
            'PREPARATION_NOT_FOUND',
            'Preparation does not belong to this owner.',
          )
        if (action === 'retry') await validatePreparation(tx, p, actor)
        const job = await (action === 'retry' ? jobs.retryPreparation : jobs.cancelPreparation)(
          jobId,
          tx,
        )
        if (!job)
          throw new AppError(
            409,
            'PREPARATION_CLAIMED',
            'Only failed preparation can be retried and queued preparation cancelled.',
          )
        await repo.audit(tx, actor, `preparation_${action}`, id, null, { jobId })
        return preparationItem(job)
      })
    },
    worker: {
      async runOne() {
        const job = await jobs.claim(clock(), ['prepare_notification'])
        if (!job) return false
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let heartbeatFlight: Promise<unknown> | undefined
        let leaseError: unknown
        try {
          const p = job.payload as PreparationPayload
          if (job.payloadVersion !== 1 || !['invoice', 'estimate'].includes(p.sourceType))
            throw new AppError(400, 'INVALID_JOB_PAYLOAD', 'Unsupported notification preparation.')
          await repo.transaction((tx) => validatePreparation(tx, p, job.initiatedByUserId))
          heartbeat = setInterval(() => {
            if (heartbeatFlight) return
            heartbeatFlight = jobs
              .heartbeat(job, clock())
              .catch((error) => {
                leaseError = error
              })
              .finally(() => {
                heartbeatFlight = undefined
              })
          }, 10_000)
          heartbeat.unref()
          const attachment = await prepareAttachment(
            p.sourceType,
            p.sourceId,
            p.sourceVersion,
            job.initiatedByUserId,
          )
          if (heartbeatFlight) await heartbeatFlight
          if (leaseError) throw leaseError
          await repo.transaction(async (tx) => {
            await validatePreparation(tx, p, job.initiatedByUserId)
            await repo.pinCurrentArtifact(
              p.sourceType,
              p.sourceId,
              p.sourceVersion,
              attachment.objectKey,
              tx,
            )
            const occurrence = `${p.requestId}:${recipientKey(p.recipient)}`
            const message = await notifications.enqueue(
              {
                idempotencyKey: `sales:${p.sourceType}:${p.sourceId}:${occurrence}`,
                actor: job.initiatedByUserId,
                from: { email: p.rule.senderEmail, name: p.rule.senderName },
                to: p.recipient,
                cc: p.cc,
                ...p.content,
                attachments: [attachment],
              },
              tx,
            )
            await repo.insertDispatch(
              {
                sourceType: p.sourceType,
                sourceId: p.sourceId,
                eventKey: p.eventKey,
                occurrenceKey: occurrence,
                logicalOccurrenceKey: occurrence,
                messageId: message.id,
                createdByUserId: job.initiatedByUserId,
              },
              tx,
            )
            await jobs.completeInTransaction(job, tx, clock())
          })
        } catch (error) {
          try {
            await jobs.fail(
              job,
              error instanceof AppError ? error.code : 'NOTIFICATION_PREPARATION_FAILED',
              clock(),
              error instanceof AppError && [400, 403, 404, 409].includes(error.statusCode),
            )
          } catch {
            /* Lease takeover owns recovery. */
          }
        } finally {
          if (heartbeat) clearInterval(heartbeat)
          if (heartbeatFlight) await heartbeatFlight
        }
        return true
      },
    },
    async paymentConfirmed(tx: Transaction, id: string) {
      const payment = await repo.payment(id, tx)
      if (payment.status !== 'confirmed') return
      const row = await repo.owner('invoice', payment.invoiceId, tx, true)
      const rule = await policies.rule('payment_received', tx)
      const client = await clients.effective(row.clientId, rule, tx)
      if (!client.enabled || !client.recipient || !['issued', 'sent'].includes(row.status)) return
      const logical = 'first-confirmed'
      if (await repo.occurrenceExists('payment', id, 'payment_received', logical, tx)) return
      const content = policies.compose(rule, {
        clientName: printableClientName(row.clientSnapshot, client.clientName),
        documentNumber: row.number ?? '',
        paymentNumber: payment.number,
        amount: payment.amount,
        currency: payment.currency,
      })
      const message = await notifications.enqueue(
        {
          idempotencyKey: `payment:${id}:first-confirmed`,
          actor: null,
          from: { email: rule.senderEmail, name: rule.senderName },
          to: client.recipient,
          cc: client.cc,
          ...content,
          attachments: [],
        },
        tx,
      )
      await repo.insertDispatch(
        {
          sourceType: 'payment',
          sourceId: id,
          eventKey: 'payment_received',
          occurrenceKey: `${logical}:${recipientKey(client.recipient)}`,
          logicalOccurrenceKey: logical,
          messageId: message.id,
        },
        tx,
      )
    },
    async sweep() {
      return repo.transaction(async (tx) => {
        // Also serializes rule/preference/identity revocations and financial mutations.
        const { invoiceRows, estimateRows } = await repo.automaticCandidates(tx, reminderCursor)
        reminderCursor = {
          invoice: invoiceRows.length === 200 ? invoiceRows.at(-1)!.id : undefined,
          estimate: estimateRows.length === 200 ? estimateRows.at(-1)!.id : undefined,
        }
        const date = companyDate(clock(), await repo.companyTimezone(tx))
        const expired = await repo.expiry(date, clock(), tx)
        let reminders = 0
        for (const [type, rows, event] of [
          ['invoice', invoiceRows, 'invoice_due_reminder'],
          ['estimate', estimateRows, 'estimate_expiry_reminder'],
        ] as const) {
          const rule = await policies.rule(event, tx)
          if (!rule.enabled) continue
          for (const row of rows) {
            const basis = 'dueDate' in row ? row.dueDate : row.validUntil
            if (!basis || !reminderOccurs(basis, date, rule.offsetDays, rule.repeatEveryDays))
              continue
            let eligible: Awaited<ReturnType<typeof eligibility>>
            try {
              eligible = await eligibility(tx, type, row.id, event)
            } catch (error) {
              if (error instanceof AppError && [403, 404, 409].includes(error.statusCode)) continue
              throw error
            }
            const { client } = eligible
            const logical = `${basis}:${date}:${recipientKey(client.recipient!)}`
            if (await repo.occurrenceExists(type, row.id, event, logical, tx)) continue
            const content = policies.compose(rule, {
              clientName: printableClientName(row.clientSnapshot, client.clientName),
              documentNumber: row.number ?? '',
              dueDate: basis,
              validUntil: basis,
              total: row.total,
              currency: row.currency,
              outstanding: type === 'invoice' ? await repo.outstanding(row.id, tx) : '',
            })
            const occurrence = `v${rule.version}:${logical}`
            const message = await notifications.enqueue(
              {
                idempotencyKey: `reminder:${type}:${row.id}:${logical}`,
                actor: null,
                from: { email: rule.senderEmail, name: rule.senderName },
                to: client.recipient!,
                cc: client.cc,
                ...content,
                attachments: [],
              },
              tx,
            )
            await repo.insertDispatch(
              {
                sourceType: type,
                sourceId: row.id,
                eventKey: event,
                occurrenceKey: occurrence,
                logicalOccurrenceKey: logical,
                messageId: message.id,
              },
              tx,
            )
            reminders++
          }
        }
        const cancelled = await invalidate(tx)
        const reconciled = await repo.reconcile(tx)
        return { expired, reminders, cancelled, reconciled }
      })
    },
  }
}
