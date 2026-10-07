import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type {
  ReportAnalysis,
  ReportSectionRegistry,
} from '../../api/generated/schemas/reporting/reporting.schemas'
import { ApiError } from '../../lib/api-error'
import { DashboardPage } from '../dashboard'
import { ReportFilters } from './components/report-filters'
import { ReportViewer } from './components/report-viewer'
import { AnalyticsPage as ReportsPage } from './pages/analytics-page'

const state = vi.hoisted(() => ({
  keys: [] as string[],
  getReportAnalysis: vi.fn(),
  listReportSections: vi.fn(),
  exportReport: vi.fn(),
  listClients: vi.fn(),
  getDashboard: vi.fn(),
}))
vi.mock('../identity/auth/hooks/use-session', () => ({
  useSession: () => ({ data: { purpose: 'full', permissionKeys: state.keys }, isError: false }),
}))
vi.mock('../../api/http', async () => {
  const { routeApiRequest } = await import('../../test/api-transport')
  return {
    apiRequest: routeApiRequest({
      getReportAnalysis: state.getReportAnalysis,
      listReportSections: state.listReportSections,
      exportReport: state.exportReport,
      listClients: state.listClients,
      getDashboard: state.getDashboard,
    }),
  }
})
const caches: QueryClient[] = []
afterEach(() => caches.splice(0).forEach((cache) => cache.clear()))
const fixture: ReportAnalysis = {
  metricDefinitionVersion: '1',
  snapshotVersion: 1,
  capturedAt: '2026-10-02T10:00:00Z',
  companyName: 'Slama',
  currencies: ['MAD', 'EUR'],
  filters: {
    from: '2026-10-01',
    to: '2026-10-31',
    timezone: 'Africa/Casablanca',
    sections: ['revenue'],
    bucket: 'day',
    limit: 25,
    offset: 0,
    sort: 'date_desc',
    start: '2026-10-01T00:00:00Z',
    endExclusive: '2026-11-01T00:00:00Z',
  },
  sections: [
    {
      key: 'revenue',
      timeBasis: 'period',
      metrics: [
        { key: 'gross', currency: 'MAD', value: '100.00', unit: 'money', timeBasis: 'period' },
        { key: 'gross', currency: 'EUR', value: '20.00', unit: 'money', timeBasis: 'period' },
      ],
      series: [],
      rows: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          label: 'FAC-26-1',
          currency: 'MAD',
          date: '2026-10-02',
          status: 'issued',
          net: '100.00',
          vat: '0.00',
          gross: '100.00',
          amount: '100.00',
          quantity: null,
          weightKg: null,
          unknownWeightCount: 0,
        },
      ],
      total: 1,
      limit: 25,
      offset: 0,
      coverage: null,
    },
  ],
}
const registry: ReportSectionRegistry = {
  metricDefinitionVersion: '1',
  sections: [
    {
      key: 'revenue',
      available: true,
      timeBasis: 'period',
      supportedFilters: ['currency', 'clientId', 'productId', 'categoryId'],
    },
    {
      key: 'collections',
      available: true,
      timeBasis: 'period',
      supportedFilters: ['currency', 'clientId'],
    },
  ],
}
function setup(
  node: React.ReactNode = <ReportsPage />,
  path = '/reports?sections=revenue&currency=MAD',
) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  caches.push(cache)
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={cache}>
      <Router hook={location.hook}>{node}</Router>
    </QueryClientProvider>,
  )
  return { cache, location }
}
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.clearAllMocks()
  state.keys = [
    'reports.read',
    'reports.export',
    'reports.sections.revenue',
    'reports.sections.collections',
  ]
  state.getReportAnalysis.mockImplementation((params) =>
    Promise.resolve({ ...fixture, filters: { ...fixture.filters, ...params } }),
  )
  state.listReportSections.mockResolvedValue(registry)
  state.getDashboard.mockResolvedValue(fixture)
  state.listClients.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 })
  state.exportReport.mockResolvedValue(new Blob(['report'], { type: 'application/pdf' }))
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }),
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
describe('live reporting UI', () => {
  it('disables incompatible sections while currency is selected', () => {
    state.keys.push('reports.sections.deliveries')
    setup(
      <ReportFilters
        filters={{ ...fixture.filters, currency: 'MAD' }}
        registry={{
          ...registry,
          sections: [
            ...registry.sections,
            {
              key: 'deliveries',
              available: true,
              timeBasis: 'period',
              supportedFilters: ['clientId'],
            },
          ],
        }}
        set={vi.fn()}
      />,
    )
    expect(screen.getByRole('checkbox', { name: /Deliveries/ })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Currency' })).not.toBeDisabled()
  })
  it('disables unsupported currency filtering and lets an invalid URL currency be cleared', () => {
    state.keys.push('reports.sections.deliveries')
    const set = vi.fn()
    setup(
      <ReportFilters
        filters={{ ...fixture.filters, sections: ['deliveries'], currency: 'MAD' }}
        registry={{
          ...registry,
          sections: [
            {
              key: 'deliveries',
              available: true,
              timeBasis: 'period',
              supportedFilters: ['clientId'],
            },
          ],
        }}
        set={set}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeDisabled()
    expect(screen.getByText(/Currency filtering is unavailable/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Clear currency filter' }))
    expect(set).toHaveBeenCalledWith({ currency: undefined })
  })
  it('uses units rather than currency grouping to format count metrics', () => {
    setup(
      <ReportViewer
        data={{
          ...fixture,
          sections: [
            {
              ...fixture.sections[0]!,
              metrics: [
                { key: 'count', currency: 'MAD', value: '2', unit: 'count', timeBasis: 'period' },
                {
                  key: 'unknown_weight_count',
                  currency: null,
                  value: '1',
                  unit: 'count',
                  timeBasis: 'period',
                },
              ],
            },
          ],
        }}
      />,
    )
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.queryByText('2 MAD')).not.toBeInTheDocument()
    expect(screen.getByText('Lines with unknown weight')).toBeInTheDocument()
  })
  it('shows authorized live dashboard charts without rendering tables or sample records', async () => {
    state.keys.push('reports.sections.deliveries')
    setup(<DashboardPage />, '/')
    await screen.findByText('Live analysis')
    expect(screen.getByText('Sales over time · MAD')).toBeInTheDocument()
    expect(state.getReportAnalysis).toHaveBeenCalled()
    expect(screen.queryByText('Design preview')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('FAC-26-1')).not.toBeInTheDocument()
  })
  it('does not query the dashboard without report access', () => {
    state.keys = []
    setup(<DashboardPage />, '/')
    expect(state.getDashboard).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
  it('searches clients on the server and commits a timezone only after selecting a result', async () => {
    state.keys.push('clients.read')
    const set = vi.fn()
    setup(<ReportFilters filters={fixture.filters} registry={registry} set={set} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Client' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search options' }), {
      target: { value: 'Beyond first page' },
    })
    await waitFor(() =>
      expect(state.listClients).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'Beyond first page', limit: 100 }),
      ),
    )
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search options' }), { key: 'Escape' })
    fireEvent.click(screen.getByRole('combobox', { name: 'Timezone' }))
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search options' }), {
      target: { value: 'Paris' },
    })
    expect(set).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('option', { name: 'Europe/Paris' }))
    expect(set).toHaveBeenCalledWith({ timezone: 'Europe/Paris' })
  })
  it('keeps currencies separate and hides financial drill-through without owner read', async () => {
    setup(<ReportViewer data={fixture} />)
    expect(screen.getByText('100.00 MAD')).toBeInTheDocument()
    expect(screen.getByText('20.00 EUR')).toBeInTheDocument()
    expect(screen.queryByText('120.00')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'FAC-26-1' })).not.toBeInTheDocument()
    expect(screen.getByText('FAC-26-1')).toBeInTheDocument()
  })
  it('hides a captured section if report access is revoked', () => {
    state.keys = []
    setup(<ReportViewer data={fixture} frozen />)
    expect(screen.queryByText('100.00 MAD')).not.toBeInTheDocument()
  })
  it('uses URL criteria and exports normalized selected sections through the generated operation', async () => {
    setup()
    await screen.findByText('Live analysis')
    expect(state.getReportAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        currency: 'MAD',
        sections: ['revenue', 'vat', 'sales_by_product', 'sales_by_category'],
        offset: 0,
        limit: 25,
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Download visual PDF' }))
    await waitFor(() =>
      expect(state.exportReport).toHaveBeenCalledWith(
        expect.objectContaining({
          currency: 'MAD',
          sections: ['revenue', 'vat', 'sales_by_product', 'sales_by_category'],
          from: '2026-10-01',
          format: 'pdf',
        }),
      ),
    )
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(state.getReportAnalysis).toHaveBeenCalledTimes(1)
  })
  it('shows export errors without fabricating a successful download', async () => {
    state.exportReport.mockRejectedValue(
      new ApiError(400, 'EXPORT_TOO_LARGE', 'Narrow the filters.'),
    )
    setup()
    await screen.findByText('Live analysis')
    fireEvent.click(screen.getByRole('button', { name: 'Download Excel' }))
    expect(await screen.findByText(/Narrow the filters/)).toBeInTheDocument()
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('does not issue analysis for malformed URL section criteria', async () => {
    setup(undefined, '/reports?sections=unknown')
    expect(
      await screen.findByText('Check the schedule fields, section selection and recipients.'),
    ).toBeInTheDocument()
    expect(state.getReportAnalysis).not.toHaveBeenCalled()
  })
})
