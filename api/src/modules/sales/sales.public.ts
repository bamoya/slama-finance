import type {
  ReportFilters,
  ReportSection,
} from '../../contracts/generated/reporting/reporting.schemas.js'
import type { Transaction } from '../../lib/db.js'
export interface SalesReportingApi {
  capture(
    filters: ReportFilters,
    tx: Transaction,
    detailLimit?: number,
    captureDate?: string,
  ): Promise<{ sections: ReportSection[]; currencies: string[] }>
}
