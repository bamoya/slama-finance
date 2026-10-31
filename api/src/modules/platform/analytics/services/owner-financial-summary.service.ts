import type { GetOwnerFinancialSummaryQuery } from '../../../../contracts/generated/identity/owner-analytics.schemas.js'
import { AppError } from '../../../../lib/errors.js'
import type { createOwnerAuthService } from '../../identity/services/owner-auth.service.js'
import type { createOwnerFinancialSummaryRepository } from '../repositories/owner-financial-summary.repository.js'

const minor = (value: string) => BigInt(value.replace('.', ''))
const amount = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, '0')}`
export function createOwnerFinancialSummaryService(
  repo: ReturnType<typeof createOwnerFinancialSummaryRepository>,
  owners: ReturnType<typeof createOwnerAuthService>,
) {
  return {
    async get(token: string | undefined, input: GetOwnerFinancialSummaryQuery) {
      const owner = await owners.session(token),
        start = new Date(input.start),
        end = new Date(input.end)
      const days = (end.getTime() - start.getTime()) / 86400000
      if (!Number.isFinite(days) || days < 0 || days > 365)
        throw new AppError(400, 'INVALID_PERIOD', 'Choose a reporting period of at most 366 days.')
      const rows = await repo.read(owner.id, input.start, input.end, input.organizationId)
      const totals = { revenue: 0n, collected: 0n, outstanding: 0n, overdue: 0n },
        series = new Map<string, { date: string; revenue: bigint; collected: bigint }>()
      for (let i = 0; i <= days; i++) {
        const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10)
        series.set(date, { date, revenue: 0n, collected: 0n })
      }
      for (const row of rows) {
        for (const key of Object.keys(totals) as (keyof typeof totals)[])
          totals[key] += minor(row.totals[key])
        for (const item of row.series) {
          const point = series.get(item.date)
          if (point) {
            point.revenue += minor(item.revenue)
            point.collected += minor(item.collected)
          }
        }
      }
      return {
        currency: 'MAD' as const,
        start: input.start,
        end: input.end,
        capturedAt: new Date().toISOString(),
        totals: {
          revenue: amount(totals.revenue),
          collected: amount(totals.collected),
          outstanding: amount(totals.outstanding),
          overdue: amount(totals.overdue),
        },
        organizations: rows.map(({ id, name, totals }) => ({ id, name, totals })),
        series: [...series.values()].map((point) => ({
          ...point,
          revenue: amount(point.revenue),
          collected: amount(point.collected),
        })),
      }
    },
  }
}
