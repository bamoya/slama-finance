import './lib/visual-translations'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ReportAnalysisSchema } from '../../api/generated/schemas/reporting/reporting.schemas'
import { ReportSummary } from './components/report-summary'

const analysis = (sections: unknown[]) =>
  ReportAnalysisSchema.parse({
    snapshotVersion: 2,
    metricDefinitionVersion: '2',
    companyName: 'Test',
    capturedAt: '2026-10-03T12:00:00Z',
    currencies: ['MAD'],
    filters: {
      from: '2026-09-01',
      to: '2026-09-30',
      timezone: 'UTC',
      sections: sections.map((section) => (section as { key: string }).key),
      start: '2026-09-01T00:00:00Z',
      endExclusive: '2026-10-01T00:00:00Z',
    },
    sections,
  })
const section = (key: string, metrics: unknown[] = []) => ({
  key,
  timeBasis: 'period',
  metrics,
  series: [],
  limit: 25,
  offset: 0,
  coverage: null,
  rows: [],
  total: 0,
})
describe('Report summary layout and totals', () => {
  it('retains all five dashboard cards for empty returned aggregates', () => {
    const { container } = render(
      <ReportSummary
        dashboard
        data={analysis([section('summary'), section('overdue'), section('pending_cheques')])}
      />,
    )
    expect(container.querySelectorAll('dt')).toHaveLength(5)
    expect(container.querySelector('dl')).toHaveClass('lg:grid-cols-5')
  })
  it('uses aggregate units and net sales for average price, not paginated rows or gross', () => {
    render(
      <ReportSummary
        data={analysis([
          section('sales_by_product', [
            { key: 'net', value: '600', currency: 'MAD', unit: 'money', timeBasis: 'period' },
            { key: 'gross', value: '720', currency: 'MAD', unit: 'money', timeBasis: 'period' },
            { key: 'quantity', value: '3', currency: 'MAD', unit: 'count', timeBasis: 'period' },
          ]),
        ])}
      />,
    )
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('MAD 200.00')).toBeInTheDocument()
    expect(screen.queryByText('MAD 240.00')).not.toBeInTheDocument()
  })
})
