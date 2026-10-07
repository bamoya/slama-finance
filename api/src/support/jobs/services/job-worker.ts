import type { createJobService, PreparePdfPayload } from './job.service.js'

type JobService = ReturnType<typeof createJobService>

export function createPdfJobWorker(
  jobs: Pick<JobService, 'claim' | 'heartbeat' | 'complete' | 'fail'>,
  prepare: (payload: PreparePdfPayload, actor: string | null) => Promise<void>,
) {
  return {
    async runOne() {
      const job = await jobs.claim()
      if (!job) return false
      let heartbeat: ReturnType<typeof setInterval> | undefined
      let heartbeatFailure: unknown
      let heartbeatInFlight: Promise<unknown> | undefined
      try {
        if (job.jobType !== 'prepare_pdf' || job.payloadVersion !== 1)
          throw new Error('UNSUPPORTED_JOB')
        heartbeat = setInterval(() => {
          if (heartbeatInFlight) return
          heartbeatInFlight = jobs
            .heartbeat(job)
            .catch((error) => {
              heartbeatFailure = error
            })
            .finally(() => {
              heartbeatInFlight = undefined
            })
        }, 10_000)
        heartbeat.unref()
        await prepare(job.payload as PreparePdfPayload, job.initiatedByUserId)
        if (heartbeatInFlight) await heartbeatInFlight
        if (heartbeatFailure) throw heartbeatFailure
        await jobs.complete(job)
      } catch (error) {
        const code =
          error instanceof Error && /^[A-Z][A-Z0-9_]{0,63}$/.test(error.message)
            ? error.message
            : 'PDF_PREPARATION_FAILED'
        try {
          await jobs.fail(job, code)
        } catch {
          // The lease was lost. Another worker owns recovery; do not overwrite it.
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat)
        if (heartbeatInFlight) await heartbeatInFlight
      }
      return true
    },
  }
}
