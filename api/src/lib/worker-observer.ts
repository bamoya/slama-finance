/** Allowlisted operational metadata only: never pass recipient or document payloads. */
export interface WorkerEvent {
  worker: 'notification' | 'report'
  event: 'accepted' | 'retry' | 'failed' | 'captured' | 'published'
  id: string
  attempt: number
  durationMs?: number
  artifactBytes?: number
  errorCode?: string
  responseClass?: '2xx' | '4xx' | '5xx' | 'network' | 'internal'
}
export type WorkerObserver = (event: WorkerEvent) => void

export function observeWorker(observer: WorkerObserver | undefined, event: WorkerEvent) {
  try {
    observer?.(event)
  } catch {
    // Telemetry failure must not change delivery or financial job outcomes.
  }
}
