import './lib/visual-translations'

import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ReportAnalysisSchema,
  type ReportSection,
} from '../../api/generated/schemas/reporting/reporting.schemas'
import { VisualBreakdown } from './components/visual-breakdown'
import { VisualReport } from './components/visual-report'

const state = vi.hoisted(() => ({ keys: ['reports.read'] }))
vi.mock('../identity/auth/hooks/use-session', () => ({
  useSession: () => ({ data: { purpose: 'full', permissionKeys: state.keys }, isError: false }),
}))
type Point = NonNullable<ReportSection['visuals']>[number]
const point = (key: string, value: string, group: Point['group'] = 'aging'): Point => ({
  group,
  key,
  label: key,
  currency: 'MAD',
  value,
  unit: group === 'cohort' ? 'count' : 'money',
})
const receivablesSection = (
  key: 'outstanding' | 'overdue',
  currencies = ['MAD'],
): ReportSection => ({
  key,
  timeBasis: 'capture',
  metrics: [],
  series: [],
  rows: [],
  total: 2,
  limit: 25,
  offset: 0,
  coverage: null,
  visuals: currencies.flatMap((currency) =>
    (key === 'outstanding'
      ? [point('current', '90'), point('1_30', '10')]
      : [point('1_30', '10')]
    ).map((entry) => ({ ...entry, currency })),
  ),
})
const analysis = (sections: ReportSection[], currencies = ['MAD']) =>
  ReportAnalysisSchema.parse({
    snapshotVersion: 2,
    metricDefinitionVersion: '2',
    companyName: 'Test',
    capturedAt: '2026-10-03T12:00:00Z',
    currencies,
    filters: {
      from: '2026-09-01',
      to: '2026-09-30',
      timezone: 'UTC',
      sections: sections.map((section) => section.key),
      start: '2026-09-01T00:00:00Z',
      endExclusive: '2026-10-01T00:00:00Z',
    },
    sections,
  })
beforeEach(() => {
  state.keys = ['reports.read']
})
describe('Live visual reporting semantics', () => {
  it.each([false, true])(
    'renders one receivables breakdown when outstanding and overdue are selected (dashboard=%s)',
    (dashboard) => {
      const onRecords = vi.fn()
      render(
        <VisualReport
          data={analysis([receivablesSection('outstanding'), receivablesSection('overdue')])}
          dashboard={dashboard}
          onRecords={onRecords}
        />,
      )
      expect(screen.getAllByText('Where your receivables stand · MAD')).toHaveLength(1)
      fireEvent.click(screen.getByRole('button', { name: 'Not yet due' }))
      expect(onRecords).toHaveBeenLastCalledWith('outstanding', 'current', 'MAD')
      fireEvent.click(screen.getByRole('button', { name: '1–30 days' }))
      expect(onRecords).toHaveBeenLastCalledWith('outstanding', '1_30', 'MAD')
    },
  )
  it('preserves the overdue-only breakdown and its record filters', () => {
    const onRecords = vi.fn()
    render(<VisualReport data={analysis([receivablesSection('overdue')])} onRecords={onRecords} />)
    expect(screen.getByText('Where your receivables stand · MAD')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Not yet due' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1–30 days' }))
    expect(onRecords).toHaveBeenCalledWith('overdue', '1_30', 'MAD')
  })
  it('deduplicates per currency without mixing currencies or losing drilldowns', () => {
    const onRecords = vi.fn()
    const currencies = ['MAD', 'EUR']
    render(
      <VisualReport
        data={analysis(
          [
            receivablesSection('outstanding', currencies),
            receivablesSection('overdue', currencies),
          ],
          currencies,
        )}
        onRecords={onRecords}
      />,
    )
    expect(screen.getAllByText('Where your receivables stand · MAD')).toHaveLength(1)
    expect(screen.getAllByText('Where your receivables stand · EUR')).toHaveLength(1)
    const currentButtons = screen.getAllByRole('button', { name: 'Not yet due' })
    expect(currentButtons).toHaveLength(2)
    fireEvent.click(currentButtons[1]!)
    expect(onRecords).toHaveBeenCalledWith('outstanding', 'current', 'EUR')
  })
  it('preserves overdue aging for currencies not represented in outstanding aging', () => {
    const onRecords = vi.fn()
    render(
      <VisualReport
        data={analysis(
          [receivablesSection('outstanding'), receivablesSection('overdue', ['MAD', 'EUR'])],
          ['MAD', 'EUR'],
        )}
        onRecords={onRecords}
      />,
    )
    expect(screen.getAllByText('Where your receivables stand · MAD')).toHaveLength(1)
    expect(screen.getAllByText('Where your receivables stand · EUR')).toHaveLength(1)
    const overdueButtons = screen.getAllByRole('button', { name: '1–30 days' })
    expect(overdueButtons).toHaveLength(2)
    fireEvent.click(overdueButtons[1]!)
    expect(onRecords).toHaveBeenCalledWith('overdue', '1_30', 'EUR')
  })
  it.each([false, true])(
    'preserves overdue aging when outstanding has no visual data (dashboard=%s)',
    (dashboard) => {
      const outstanding = { ...receivablesSection('outstanding'), visuals: [] }
      render(
        <VisualReport
          data={analysis([outstanding, receivablesSection('overdue')])}
          dashboard={dashboard}
        />,
      )
      expect(screen.getByText('Where your receivables stand · MAD')).toBeInTheDocument()
      expect(screen.getByText('1–30 days')).toBeInTheDocument()
    },
  )
  it('orders cohort stages and uses the issued population as the percentage denominator', () => {
    render(
      <VisualBreakdown
        title="Cohort"
        description="Unique estimates"
        points={[
          point('accepted', '5', 'cohort'),
          point('invoiced', '4', 'cohort'),
          point('issued', '8', 'cohort'),
        ]}
      />,
    )
    expect(screen.getByText(/100%$/)).toBeInTheDocument()
    expect(screen.getByText(/63%$/)).toBeInTheDocument()
    expect(screen.getByText(/50%$/)).toBeInTheDocument()
    expect(screen.queryByText(/47%$/)).not.toBeInTheDocument()
  })
  it('preserves the selected bucket and currency after reordering aging points', () => {
    const select = vi.fn()
    render(
      <VisualBreakdown
        title="Aging"
        description="Capture"
        points={[point('61_plus', '10'), point('current', '90')]}
        onSelect={select}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Not yet due' }))
    expect(select).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'current', currency: 'MAD', value: '90' }),
    )
  })
  it('uses a clear empty state instead of NaN percentages when values are zero', () => {
    render(<VisualBreakdown title="Empty" description="Capture" points={[point('current', '0')]} />)
    expect(screen.getByText('No matching activity')).toBeInTheDocument()
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument()
  })
  it('does not reveal cached chart figures after section permission is removed', () => {
    state.keys = []
    const data = ReportAnalysisSchema.parse({
      snapshotVersion: 2,
      metricDefinitionVersion: '2',
      companyName: 'Test',
      capturedAt: '2026-10-03T12:00:00Z',
      currencies: ['MAD'],
      filters: {
        from: '2026-09-01',
        to: '2026-09-30',
        timezone: 'UTC',
        sections: ['outstanding'],
        start: '2026-09-01T00:00:00Z',
        endExclusive: '2026-10-01T00:00:00Z',
      },
      sections: [
        {
          key: 'outstanding',
          timeBasis: 'capture',
          metrics: [
            {
              key: 'amount',
              value: '987654',
              currency: 'MAD',
              unit: 'money',
              timeBasis: 'capture',
            },
          ],
          series: [],
          rows: [],
          total: 1,
          limit: 25,
          offset: 0,
          coverage: null,
          visuals: [point('current', '987654')],
        },
      ],
    })
    render(<VisualReport data={data} />)
    expect(screen.queryByText(/987/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Where your receivables/)).not.toBeInTheDocument()
  })
})
