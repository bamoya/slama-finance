import type { Database } from '../../lib/db.js'
import { createJobRepository } from './repositories/job.repository.js'
import { createJobService } from './services/job.service.js'
import { createPdfJobWorker } from './services/job-worker.js'

export type { PreparePdfPayload } from './services/job.service.js'

export function createJobSupport(database: () => Database) {
  return createJobService(createJobRepository(database))
}

export { createPdfJobWorker }
