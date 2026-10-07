import type { createReportingReadRepository } from '../repositories/reporting-read.repository.js'
export function createReportingReadService(repo: ReturnType<typeof createReportingReadRepository>) {
  return { capture: repo.capture }
}
