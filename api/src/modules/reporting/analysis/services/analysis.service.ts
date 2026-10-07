import type {
  ReportAnalysis,
  ReportCriteria,
  ReportFilters,
  ReportSectionKey,
} from '../../../../contracts/generated/reporting/reporting.schemas.js'
import type { Transaction } from '../../../../lib/db.js'
import { AppError } from '../../../../lib/errors.js'
import type { IdentityPublicApi } from '../../../identity/identity.public.js'
import type { SalesReportingApi } from '../../../sales/index.js'
import {
  addDays,
  localInstant,
  localParts,
  REPORT_LIMITS,
} from '../../shared/services/report-time.service.js'
import type { createAnalysisRepository } from '../repositories/analysis.repository.js'

export const METRIC_DEFINITION_VERSION = '2'
export const REPORT_SECTIONS: ReportSectionKey[] = [
  'summary',
  'revenue',
  'collections',
  'outstanding',
  'overdue',
  'payment_methods',
  'pending_cheques',
  'vat',
  'sales_by_client',
  'sales_by_product',
  'sales_by_category',
  'estimates',
  'deliveries',
]
export const sectionFilters = (key: ReportSectionKey) =>
  key === 'deliveries'
    ? ['clientId', 'productId', 'categoryId']
    : key === 'sales_by_product' || key === 'sales_by_category'
      ? ['currency', 'clientId', 'productId', 'categoryId']
      : ['currency', 'clientId']

export function normalizeCriteria(
  input: ReportCriteria,
  context: { timezone: string; capturedAt: Date },
  sections: ReportSectionKey[],
): ReportFilters {
  const timezone = input.timezone ?? context.timezone
  const today = localParts(context.capturedAt, timezone).date
  const from = input.from ?? `${today.slice(0, 7)}-01`
  const to =
    input.to ??
    addDays(
      new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 1))
        .toISOString()
        .slice(0, 10),
      -1,
    )
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value
  if (
    !validDate(from) ||
    !validDate(to) ||
    from > to ||
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000 + 1 >
      REPORT_LIMITS.periodDays
  )
    throw new AppError(
      400,
      'INVALID_REPORT_PERIOD',
      'Choose an inclusive date range of at most 366 days.',
    )
  if (input.detailSection && !sections.includes(input.detailSection))
    throw new AppError(400, 'INVALID_DETAIL_SECTION', 'The detail section must be selected.')
  if (input.segment) {
    const allowed: Partial<Record<ReportSectionKey, string[]>> = {
      outstanding: ['current', '1_30', '31_60', '61_plus'],
      overdue: ['1_30', '31_60', '61_plus'],
      payment_methods: ['cash', 'bank_transfer', 'cheque', 'other'],
      estimates: [
        'issued',
        'accepted',
        'rejected',
        'expired',
        'converted_estimate',
        'converted_invoice',
        'cohort:issued',
        'cohort:awaiting',
        'cohort:accepted',
        'cohort:invoiced',
        'outcome:issued',
        'outcome:sent',
        'outcome:accepted',
        'outcome:rejected',
        'outcome:expired',
        'outcome:superseded',
        'outcome:cancelled',
      ],
      deliveries: ['prepared', 'delivered', 'acknowledged', 'billing:linked', 'billing:unlinked'],
    }
    const section = input.detailSection
    const valid =
      section &&
      (allowed[section]?.includes(input.segment) ||
        (['sales_by_client', 'sales_by_product', 'sales_by_category'].includes(section) &&
          (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.segment) ||
            (section !== 'sales_by_client' && input.segment === 'manual') ||
            (section === 'sales_by_category' && input.segment === 'uncategorized'))))
    if (!valid)
      throw new AppError(400, 'INVALID_REPORT_SEGMENT', 'Choose a supported detail bucket.')
  }
  for (const section of sections)
    for (const filter of ['currency', 'clientId', 'productId', 'categoryId'] as const)
      if (input[filter] && !sectionFilters(section).includes(filter))
        throw new AppError(
          400,
          'UNSUPPORTED_REPORT_FILTER',
          `${filter} is not supported for ${section}; choose compatible sections.`,
        )
  return {
    ...input,
    from,
    to,
    timezone,
    sections,
    bucket: input.bucket ?? 'day',
    limit: input.limit ?? 25,
    offset: input.offset ?? 0,
    sort: input.sort ?? 'date_desc',
    start: localInstant(from, '00:00', timezone).toISOString(),
    endExclusive: localInstant(addDays(to, 1), '00:00', timezone).toISOString(),
  }
}
export function assertReportPermissions(grants: string[]) {
  if (!grants.includes('reports.read'))
    throw new AppError(403, 'FORBIDDEN', 'Report access is required.')
}
export function createAnalysisService(
  repo: ReturnType<typeof createAnalysisRepository>,
  sales: SalesReportingApi,
  identity: Pick<IdentityPublicApi, 'grants'>,
) {
  async function capture(
    input: ReportCriteria,
    actor: string | null,
    tx: Transaction,
    detailLimit?: number,
    grantsOverride?: string[],
  ): Promise<ReportAnalysis> {
    const context = await repo.context(tx)
    const grants = grantsOverride ?? (actor ? await identity.grants(actor, tx) : [])
    const sections = input.sections ?? REPORT_SECTIONS
    assertReportPermissions(grants)
    const filters = normalizeCriteria(input, context, sections)
    const result = await sales.capture(
      filters,
      tx,
      detailLimit,
      localParts(context.capturedAt, filters.timezone).date,
    )
    const days = (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1
    const previousFilters = filters.comparePrevious
      ? normalizeCriteria(
          {
            ...input,
            from: addDays(filters.from, -days),
            to: addDays(filters.from, -1),
            detailSection: undefined,
            segment: undefined,
            offset: 0,
          },
          context,
          sections.filter((key) => !['outstanding', 'overdue', 'pending_cheques'].includes(key)),
        )
      : undefined
    const previous = previousFilters
      ? await sales.capture(
          previousFilters,
          tx,
          1,
          localParts(context.capturedAt, filters.timezone).date,
        )
      : undefined
    return {
      metricDefinitionVersion: METRIC_DEFINITION_VERSION,
      snapshotVersion: 3,
      capturedAt: context.capturedAt.toISOString(),
      companyName: context.companyName,
      filters,
      ...result,
      ...(previous && previousFilters
        ? {
            comparison: {
              from: previousFilters.from,
              to: previousFilters.to,
              sections: previous.sections,
            },
          }
        : {}),
    }
  }
  return {
    capture,
    analyze: (input: ReportCriteria, actor: string, detailLimit?: number) =>
      repo.snapshot((tx) => capture(input, actor, tx, detailLimit)),
    async registry(actor: string) {
      const grants = await identity.grants(actor)
      assertReportPermissions(grants)
      return {
        metricDefinitionVersion: METRIC_DEFINITION_VERSION,
        sections: REPORT_SECTIONS.map((key) => ({
          key,
          available: grants.includes('reports.read'),
          timeBasis: ['outstanding', 'overdue', 'pending_cheques'].includes(key)
            ? ('capture' as const)
            : key === 'estimates'
              ? ('lifecycle' as const)
              : ('period' as const),
          supportedFilters: sectionFilters(key),
        })),
      }
    },
  }
}
