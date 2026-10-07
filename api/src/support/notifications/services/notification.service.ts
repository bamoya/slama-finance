import { createHash, randomUUID } from 'node:crypto'

import type { EmailProvider, ObjectStorage } from '../../../integrations/contracts.js'
import { EmailTransportError } from '../../../integrations/email/transport.js'
import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import { observeWorker, type WorkerObserver } from '../../../lib/worker-observer.js'
import type { createNotificationRepository } from '../repositories/notification.repository.js'
import type { ComposedMessage, NotificationPublicApi } from '../types/notification.types.js'

export function canonicalMessageHash(input: ComposedMessage) {
  return createHash('sha256')
    .update(
      JSON.stringify({
        from: { email: input.from.email, name: input.from.name },
        to: input.to,
        cc: input.cc,
        subject: input.subject,
        html: input.html,
        text: input.text,
        attachments: [...input.attachments]
          .sort((a, b) => a.position - b.position)
          .map((a) => ({
            objectKey: a.objectKey,
            filename: a.filename,
            contentType: a.contentType,
            byteSize: a.byteSize,
            position: a.position,
          })),
      }),
    )
    .digest('hex')
}
export function validateComposedMessage(input: ComposedMessage, allowedFrom: string[]) {
  const email = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/
  if (
    !allowedFrom.includes(input.from.email) ||
    !email.test(input.to) ||
    input.cc.length > 10 ||
    input.cc.some((c) => !email.test(c)) ||
    new Set(input.cc.map((c) => c.toLowerCase())).size !== input.cc.length
  )
    throw new AppError(
      400,
      'INVALID_EMAIL_IDENTITY',
      'Select a permitted sender and valid unique recipients.',
    )
  if (
    !input.idempotencyKey.includes(':') ||
    input.idempotencyKey.length > 256 ||
    !input.subject ||
    input.subject.length > 200 ||
    /[\r\n]/.test(input.subject) ||
    /[\r\n<>]/.test(input.from.name) ||
    !input.from.name ||
    input.from.name.length > 100 ||
    input.html.length > 100_000 ||
    input.text.length > 100_000
  )
    throw new AppError(400, 'INVALID_MESSAGE', 'Invalid composed message.')
  if (
    input.attachments.length > 5 ||
    new Set(input.attachments.map((a) => a.position)).size !== input.attachments.length ||
    input.attachments.reduce((sum, a) => sum + a.byteSize, 0) > 8 * 1024 * 1024
  )
    throw new AppError(400, 'INVALID_ATTACHMENTS', 'Attachments exceed delivery limits.')
  for (const a of input.attachments)
    if (
      !/^artifacts\/(invoice|estimate|delivery_note|payment_receipt|report_run)\/[a-f0-9-]{36}\.(pdf|csv|xlsx)$/.test(
        a.objectKey,
      ) ||
      !/^[^/\\]{1,150}$/.test(a.filename) ||
      [...a.filename].some((c) => c.charCodeAt(0) < 32) ||
      ![
        'application/pdf',
        'text/csv',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ].includes(a.contentType) ||
      !Number.isInteger(a.position) ||
      a.position < 0 ||
      a.byteSize <= 0 ||
      a.byteSize > 8 * 1024 * 1024
    )
      throw new AppError(400, 'INVALID_ATTACHMENTS', 'Invalid private attachment.')
}

export function createNotificationService(
  repo: ReturnType<typeof createNotificationRepository>,
  storage: ObjectStorage,
  provider: EmailProvider,
  options: { allowedFrom: string[]; clock?: () => Date; observe?: WorkerObserver },
) {
  const clock = options.clock ?? (() => new Date())
  const transaction = <T>(tx: Transaction | undefined, fn: (tx: Transaction) => Promise<T>) =>
    tx ? fn(tx) : repo.transaction(fn)
  const api: NotificationPublicApi = {
    enqueue(input, tx) {
      validateComposedMessage(input, options.allowedFrom)
      return transaction(tx, (t) => repo.enqueue(input, canonicalMessageHash(input), t))
    },
    status(id, tx) {
      return repo.get(id, tx)
    },
    retry(id, tx) {
      return transaction(tx, async (t) => {
        const row = await repo.get(id, t, true)
        if (
          row.payloadErasedAt ||
          row.lastErrorCode === 'PROVIDER_OUTCOME_UNCERTAIN' ||
          (row.firstAttemptAt && clock().getTime() - row.firstAttemptAt.getTime() >= 23 * 3600_000)
        )
          throw new AppError(
            409,
            'PROVIDER_OUTCOME_UNCERTAIN',
            'Automatic resend is unsafe. Review the provider outcome; confirm a new send only when appropriate.',
          )
        return repo.transition(
          id,
          'failed',
          { status: 'queued', maxAttempts: row.maxAttempts + 3, availableAt: clock() },
          t,
        )
      })
    },
    cancel(id, tx) {
      return transaction(tx, (t) =>
        repo.transition(
          id,
          'queued',
          { status: 'cancelled', leaseToken: null, lockedUntil: null, lastErrorCode: 'CANCELLED' },
          t,
        ),
      )
    },
  }
  return {
    ...api,
    metrics: () => repo.metrics(clock()),
    async retainPayloads(days: number) {
      if (!Number.isInteger(days) || days < 1) return 0
      return (await repo.erasePayloads(new Date(clock().getTime() - days * 86400_000), clock()))
        .length
    },
    worker: {
      async runOne() {
        const row = await repo.transaction((tx) => repo.claim(clock(), randomUUID(), tx))
        if (!row) return false
        const started = Date.now()
        let heartbeat: ReturnType<typeof setInterval> | undefined
        let heartbeatFlight: Promise<unknown> | undefined
        let leaseError: unknown
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 20_000)
        const bounded = <T>(work: Promise<T>) =>
          Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
              controller.signal.addEventListener(
                'abort',
                () => reject(new EmailTransportError('PROVIDER_TIMEOUT', false)),
                { once: true },
              )
            }),
          ])
        try {
          heartbeat = setInterval(() => {
            if (heartbeatFlight) return
            heartbeatFlight = repo
              .transaction((tx) =>
                repo.fence(row, clock(), { lockedUntil: new Date(clock().getTime() + 30_000) }, tx),
              )
              .catch((error) => {
                leaseError = error
                controller.abort()
              })
              .finally(() => {
                heartbeatFlight = undefined
              })
          }, 10_000)
          heartbeat.unref()
          const metadata = await repo.attachments(row.id)
          const attachments = []
          for (const a of metadata) {
            const bytes = await bounded(storage.get(a.objectKey))
            if (bytes.byteLength !== a.byteSize)
              throw new EmailTransportError('ATTACHMENT_UNAVAILABLE', true)
            attachments.push({ filename: a.filename, contentType: a.contentType, bytes })
          }
          const result = await bounded(
            provider.send(
              {
                idempotencyKey: row.idempotencyKey,
                from: { email: row.fromEmail, name: row.fromName },
                to: row.to,
                cc: row.cc,
                subject: row.subject,
                html: row.html,
                text: row.text,
                attachments,
              },
              controller.signal,
            ),
          )
          if (heartbeatFlight) await heartbeatFlight
          if (leaseError) throw leaseError
          await repo.transaction((tx) =>
            repo.fence(
              row,
              clock(),
              {
                status: 'sent',
                sentAt: clock(),
                providerMessageId: result.providerMessageId,
                leaseToken: null,
                lockedUntil: null,
                lastErrorCode: null,
              },
              tx,
            ),
          )
          observeWorker(options.observe, {
            worker: 'notification',
            event: 'accepted',
            id: row.id,
            attempt: row.attempts,
            durationMs: Date.now() - started,
            responseClass: '2xx',
          })
        } catch (error) {
          const permanent = error instanceof EmailTransportError && error.permanent
          const code = error instanceof EmailTransportError ? error.code : 'TRANSPORT_UNAVAILABLE'
          const terminal =
            permanent || row.attempts >= row.maxAttempts || !provider.supportsIdempotency
          observeWorker(options.observe, {
            worker: 'notification',
            event: terminal ? 'failed' : 'retry',
            id: row.id,
            attempt: row.attempts,
            durationMs: Date.now() - started,
            errorCode: code,
            responseClass: error instanceof EmailTransportError ? error.responseClass : 'internal',
          })
          try {
            await repo.transaction((tx) =>
              repo.fence(
                row,
                clock(),
                {
                  status: terminal ? 'failed' : 'queued',
                  leaseToken: null,
                  lockedUntil: null,
                  lastErrorCode: code,
                  availableAt: new Date(
                    clock().getTime() +
                      Math.min(60_000 * 2 ** (row.attempts - 1), 3600_000) +
                      Math.floor(Math.random() * 1000),
                  ),
                },
                tx,
              ),
            )
          } catch {
            /* Another worker owns an expired lease. */
          }
        } finally {
          clearTimeout(timer)
          if (heartbeat) clearInterval(heartbeat)
          if (heartbeatFlight) await heartbeatFlight
        }
        return true
      },
    },
  }
}
