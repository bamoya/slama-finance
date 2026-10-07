import { randomUUID } from 'node:crypto'

import type { Transaction } from '../../../lib/db.js'
import { AppError } from '../../../lib/errors.js'
import type { BackgroundJob, createJobRepository } from '../repositories/job.repository.js'

export interface PreparePdfPayload {
  documentType: 'invoice' | 'estimate' | 'delivery_note' | 'report_run'
  documentId: string
  sourceVersion: number
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
const canonical = (value: unknown): string =>
  JSON.stringify(
    value && typeof value === 'object'
      ? Array.isArray(value)
        ? value.map((v) => JSON.parse(canonical(v)))
        : Object.fromEntries(
            Object.entries(value)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, JSON.parse(canonical(v))]),
          )
      : value,
  )

function validPayload(value: PreparePdfPayload) {
  if (
    !['invoice', 'estimate', 'delivery_note', 'report_run'].includes(value.documentType) ||
    !UUID.test(value.documentId) ||
    !Number.isInteger(value.sourceVersion) ||
    value.sourceVersion < 1
  )
    throw new AppError(400, 'INVALID_JOB_PAYLOAD', 'Invalid PDF preparation request.')
}

function samePayload(left: unknown, right: PreparePdfPayload) {
  if (!left || typeof left !== 'object') return false
  const value = left as Record<string, unknown>
  return (
    value.documentType === right.documentType &&
    value.documentId === right.documentId &&
    value.sourceVersion === right.sourceVersion
  )
}

export function createJobService(repo: ReturnType<typeof createJobRepository>) {
  async function enqueuePdfInTransaction(
    tx: Transaction,
    payload: PreparePdfPayload,
    actor: string | null,
  ) {
    validPayload(payload)
    const idempotencyKey = `prepare_pdf:${payload.documentType}:${payload.documentId}:${payload.sourceVersion}`
    const job = await repo.enqueue(
      {
        jobType: 'prepare_pdf',
        payloadVersion: 1,
        payload,
        idempotencyKey,
        initiatedByUserId: actor,
      },
      tx,
    )
    if (
      job.jobType !== 'prepare_pdf' ||
      job.payloadVersion !== 1 ||
      !samePayload(job.payload, payload)
    )
      throw new AppError(409, 'JOB_CONFLICT', 'An existing job has different inputs.')
    return job.status === 'failed' ? ((await repo.retryFailed(job.id, tx)) ?? job) : job
  }
  return {
    metrics: (now = new Date()) => repo.metrics(now),
    enqueuePdfInTransaction,
    async enqueuePdf(payload: PreparePdfPayload, actor: string | null) {
      return repo.transaction((tx) => enqueuePdfInTransaction(tx, payload, actor))
    },
    claim(now = new Date(), supportedTypes: string[] = ['prepare_pdf']) {
      return repo.transaction((tx) =>
        repo.claim(now, randomUUID(), new Date(now.getTime() + 30_000), tx, supportedTypes),
      )
    },
    heartbeat(job: BackgroundJob, now = new Date()) {
      return repo.transaction(async (tx) => {
        const row = await repo.fence(
          job.id,
          job.leaseToken!,
          now,
          { lockedUntil: new Date(now.getTime() + 30_000) },
          tx,
        )
        if (!row) throw new AppError(409, 'STALE_JOB_LEASE', 'Job lease is no longer valid.')
        return row
      })
    },
    complete(job: BackgroundJob, now = new Date()) {
      return repo.transaction(async (tx) => {
        const row = await repo.fence(
          job.id,
          job.leaseToken!,
          now,
          { status: 'succeeded', finishedAt: now, leaseToken: null, lockedUntil: null },
          tx,
        )
        if (!row) throw new AppError(409, 'STALE_JOB_LEASE', 'Job lease is no longer valid.')
        return row
      })
    },
    fail(job: BackgroundJob, code: string, now = new Date(), permanent = false) {
      if (!/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) code = 'JOB_FAILED'
      const terminal = permanent || job.attempts >= job.maxAttempts
      const backoff = Math.min(60_000 * 2 ** Math.max(0, job.attempts - 1), 3_600_000)
      return repo.transaction(async (tx) => {
        const row = await repo.fence(
          job.id,
          job.leaseToken!,
          now,
          {
            status: terminal ? 'failed' : 'queued',
            leaseToken: null,
            lockedUntil: null,
            lastErrorCode: code,
            finishedAt: terminal ? now : null,
            availableAt: new Date(now.getTime() + backoff + Math.floor(Math.random() * 1000)),
          },
          tx,
        )
        if (!row) throw new AppError(409, 'STALE_JOB_LEASE', 'Job lease is no longer valid.')
        return row
      })
    },
    get: (id: string) => repo.get(id),
    async enqueueNotification(
      tx: Transaction,
      payload: unknown,
      idempotencyKey: string,
      actor: string | null,
    ) {
      const job = await repo.enqueue(
        {
          jobType: 'prepare_notification',
          payloadVersion: 1,
          payload,
          idempotencyKey,
          initiatedByUserId: actor,
        },
        tx,
      )
      if (job.jobType !== 'prepare_notification' || canonical(job.payload) !== canonical(payload))
        throw new AppError(
          409,
          'JOB_CONFLICT',
          'This preparation identity already has different inputs.',
        )
      return job
    },
    async completeInTransaction(job: BackgroundJob, tx: Transaction, now = new Date()) {
      const row = await repo.fence(
        job.id,
        job.leaseToken!,
        now,
        { status: 'succeeded', finishedAt: now, leaseToken: null, lockedUntil: null },
        tx,
      )
      if (!row) throw new AppError(409, 'STALE_JOB_LEASE', 'Job lease is no longer valid.')
      return row
    },
    retryPreparation: repo.retryPreparation,
    cancelPreparation: repo.cancelPreparation,
  }
}
