import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { ApiError } from '../../lib/api-error'
import { RunHistory } from './components/run-history'
import { ReportRunPage } from './pages/report-run-page'
import { ReportScheduleFormPage } from './pages/report-schedule-form-page'
import { ReportSchedulesPage } from './pages/report-schedules-page'

const mocks = vi.hoisted(() => ({
  keys: [] as string[],
  listReportSchedules: vi.fn(),
  listReportSections: vi.fn(),
  listReportEligibleRecipients: vi.fn(),
  createReportSchedule: vi.fn(),
  sendReportScheduleTestEmail: vi.fn(),
  getReportRun: vi.fn(),
  downloadArtifact: vi.fn(),
  disableReportSchedule: vi.fn(),
  deleteReportSchedule: vi.fn(),
  cleanupReportRun: vi.fn(),
  regenerateReportRunFiles: vi.fn(),
  listReportScheduleRuns: vi.fn(),
}))
vi.mock('../identity/auth/hooks/use-session', () => ({
  useSession: () => ({ data: { purpose: 'full', permissionKeys: mocks.keys }, isError: false }),
}))
vi.mock('../../api/http', async () => {
  const { routeApiRequest } = await import('../../test/api-transport')
  return {
    apiRequest: routeApiRequest({
      listReportSchedules: mocks.listReportSchedules,
      listReportSections: mocks.listReportSections,
      listReportEligibleRecipients: mocks.listReportEligibleRecipients,
      createReportSchedule: mocks.createReportSchedule,
      sendReportScheduleTestEmail: mocks.sendReportScheduleTestEmail,
      getReportRun: mocks.getReportRun,
      downloadArtifact: mocks.downloadArtifact,
      disableReportSchedule: mocks.disableReportSchedule,
      deleteReportSchedule: mocks.deleteReportSchedule,
      cleanupReportRun: mocks.cleanupReportRun,
      regenerateReportRunFiles: mocks.regenerateReportRunFiles,
      listReportScheduleRuns: mocks.listReportScheduleRuns,
    }),
  }
})
const id = '11111111-1111-4111-8111-111111111111',
  staffId = '22222222-2222-4222-8222-222222222222'
const schedule = {
  id,
  name: 'Daily sales report',
  language: 'fr',
  frequency: 'daily',
  weekday: null,
  monthDay: null,
  localTime: '08:00',
  timezone: 'Africa/Casablanca',
  period: 'previous_day',
  includedSections: ['revenue'],
  recipientIds: [staffId],
  enabled: true,
  nextRunAt: '2026-10-03T07:00:00Z',
  archivedAt: null,
  version: 2,
  createdAt: '2026-10-01T10:00:00Z',
  updatedAt: '2026-10-01T10:00:00Z',
}
const run = {
  id,
  scheduleId: id,
  scheduledFor: '2026-10-02T07:00:00Z',
  periodStart: '2026-10-01',
  periodEnd: '2026-10-01',
  status: 'succeeded',
  attempts: 1,
  maxAttempts: 3,
  dataCapturedAt: '2026-10-02T10:00:00Z',
  startedAt: '2026-10-02T10:00:00Z',
  finishedAt: '2026-10-02T10:00:01Z',
  errorCode: null,
  configurationSnapshot: schedule,
  dataSnapshot: {
    metricDefinitionVersion: '1',
    snapshotVersion: 1,
    capturedAt: '2026-10-02T10:00:00Z',
    companyName: 'Slama',
    currencies: [],
    filters: {
      from: '2026-10-01',
      to: '2026-10-01',
      timezone: 'Africa/Casablanca',
      sections: ['revenue'],
      bucket: 'day',
      limit: 25,
      offset: 0,
      sort: 'date_desc',
      start: '2026-10-01T00:00:00Z',
      endExclusive: '2026-10-02T00:00:00Z',
    },
    sections: [],
  },
  artifacts: [
    {
      id,
      format: 'pdf',
      mimeType: 'application/pdf',
      byteSize: 100,
      createdAt: '2026-10-02T10:00:01Z',
    },
  ],
  deliveries: [{ userId: staffId, status: 'sent', reason: null, messageId: id }],
}
const caches: QueryClient[] = []
beforeEach(() =>
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  ),
)
afterEach(() => caches.splice(0).forEach((cache) => cache.clear()))
function setup(node: React.ReactNode, path = '/reports/schedules', route = path) {
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  caches.push(cache)
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={cache}>
      <Router hook={location.hook}>
        <Route path={route}>{node}</Route>
      </Router>
    </QueryClientProvider>,
  )
  return location
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.keys = [
    'reports.read',
    'reports.export',
    'reports.sections.revenue',
    'report_schedules.read',
    'report_schedules.create',
    'report_schedules.update',
    'report_runs.read',
  ]
  mocks.listReportSchedules.mockResolvedValue({ items: [schedule], total: 1, limit: 25, offset: 0 })
  mocks.listReportSections.mockResolvedValue({
    metricDefinitionVersion: '1',
    sections: [
      {
        key: 'revenue',
        available: true,
        timeBasis: 'period',
        supportedFilters: ['currency', 'clientId', 'productId', 'categoryId'],
      },
    ],
  })
  mocks.listReportEligibleRecipients.mockResolvedValue({
    items: [
      {
        id: staffId,
        name: 'Recipient Staff',
        email: 'staff@example.test',
        eligible: true,
        reasons: [],
      },
    ],
    total: 1,
    limit: 100,
    offset: 0,
  })
  mocks.createReportSchedule.mockResolvedValue(schedule)
  mocks.sendReportScheduleTestEmail.mockResolvedValue({ ...run, trigger: 'test', status: 'queued' })
  mocks.disableReportSchedule.mockResolvedValue({ ...schedule, enabled: false, version: 3 })
  mocks.deleteReportSchedule.mockResolvedValue(undefined)
  mocks.getReportRun.mockResolvedValue(run)
  mocks.cleanupReportRun.mockResolvedValue({
    removedFiles: 1,
    freedBytes: 1024,
    retainedFiles: 0,
    pendingFiles: 0,
  })
  mocks.regenerateReportRunFiles.mockResolvedValue(run)
  mocks.listReportScheduleRuns.mockResolvedValue({
    items: [run],
    total: 1,
    offset: 0,
    limit: 25,
    storageBytes: 1024,
  })
  mocks.downloadArtifact.mockResolvedValue(new Blob(['pdf'], { type: 'application/pdf' }))
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }),
  )
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
describe('persisted schedules and frozen reports', () => {
  it('confirms file cleanup from the run menu without deleting the snapshot', async () => {
    setup(<ReportRunPage />, `/reports/runs/${id}`, '/reports/runs/:runId')
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Report run actions' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete generated files' }))
    expect(mocks.cleanupReportRun).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Frozen data and charts remain available')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mocks.cleanupReportRun).toHaveBeenCalledWith(id, { mode: 'files' }))
  })
  it('restores missing files using the generated operation', async () => {
    mocks.getReportRun.mockResolvedValue({ ...run, artifacts: [] })
    setup(<ReportRunPage />, `/reports/runs/${id}`, '/reports/runs/:runId')
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Report run actions' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Regenerate files' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mocks.regenerateReportRunFiles).toHaveBeenCalledWith(id))
  })
  it('keeps permanent deletion last and disables cleanup during delivery', async () => {
    mocks.getReportRun.mockResolvedValue({
      ...run,
      deliveries: [{ userId: staffId, messageId: id, status: 'queued', reason: null }],
    })
    setup(<ReportRunPage />, `/reports/runs/${id}`, '/reports/runs/:runId')
    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Report run actions' }), {
      button: 0,
      ctrlKey: false,
      pointerType: 'mouse',
    })
    const items = await screen.findAllByRole('menuitem')
    expect(items.at(-1)).toHaveTextContent('Delete report run')
    expect(screen.getByRole('menuitem', { name: 'Delete report run' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })
  it('filters and selects run history with shared bulk confirmations', async () => {
    const onOffset = vi.fn()
    setup(<RunHistory id={id} offset={0} onOffset={onOffset} />)
    expect(await screen.findByText(/Files for matching runs:/)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search run, name or period…' }), {
      target: { value: 'October' },
    })
    await waitFor(() =>
      expect(mocks.listReportScheduleRuns).toHaveBeenCalledWith(
        id,
        expect.objectContaining({ search: 'October', offset: 0, limit: 25 }),
      ),
    )
    expect(onOffset).toHaveBeenCalledWith(0)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select current page' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Delete report run' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mocks.cleanupReportRun).toHaveBeenCalledWith(id, { mode: 'run' }))
  })
  it('changes page size through the API and resets offset while preserving filters', async () => {
    setup(
      <ReportSchedulesPage />,
      '/reports/schedules?offset=25&status=disabled',
      '/reports/schedules',
    )
    fireEvent.click(await screen.findByRole('combobox', { name: 'Rows per page' }))
    fireEvent.click(await screen.findByRole('option', { name: '50' }))
    await waitFor(() =>
      expect(mocks.listReportSchedules).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'disabled', offset: 0, limit: 50 }),
      ),
    )
  })
  it('confirms a self-only email test and opens the queued run without changing the schedule', async () => {
    const location = setup(<ReportSchedulesPage />)
    const sendButton = await screen.findByRole('button', { name: 'Send test email' })
    expect(sendButton).toHaveAttribute('data-size', 'icon-md')
    expect(sendButton.className).toBe(
      screen.getByRole('link', { name: `Edit ${schedule.name}` }).className,
    )
    fireEvent.click(await screen.findByRole('button', { name: 'Send test email' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('your own email only')
    expect(mocks.sendReportScheduleTestEmail).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.sendReportScheduleTestEmail).toHaveBeenCalledWith(id, {
        expectedVersion: schedule.version,
      }),
    )
    await waitFor(() => expect(location.history.at(-1)).toBe(`/reports/runs/${id}`))
    expect(mocks.disableReportSchedule).not.toHaveBeenCalled()
  })
  it('keeps test errors in the dialog without claiming success', async () => {
    mocks.sendReportScheduleTestEmail.mockRejectedValueOnce(
      new ApiError(409, 'REPORT_SCHEDULE_CONFLICT', 'Reload the schedule.'),
    )
    const location = setup(<ReportSchedulesPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Send test email' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mocks.sendReportScheduleTestEmail).toHaveBeenCalled())
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(location.history.at(-1)).toBe('/reports/schedules')
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
  it('confirms bulk changes, skips ineligible rows and sends each current version', async () => {
    mocks.listReportSchedules.mockResolvedValue({
      items: [schedule, { ...schedule, id: staffId, name: 'Disabled report', enabled: false }],
      total: 2,
      limit: 25,
      offset: 0,
    })
    setup(<ReportSchedulesPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select current page' }))
    expect(screen.getByRole('button', { name: 'Delete schedule' })).toHaveClass('ui-action')
    fireEvent.click(screen.getByRole('button', { name: 'Disable' }))
    expect(mocks.disableReportSchedule).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(mocks.disableReportSchedule).toHaveBeenCalledWith(id, { expectedVersion: 2 }),
    )
    expect(mocks.disableReportSchedule).toHaveBeenCalledTimes(1)
    expect(await screen.findByText('1 succeeded · 1 skipped · 0 failed')).toBeInTheDocument()
  })
  it('clears selection when searching', async () => {
    setup(<ReportSchedulesPage />)
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select current page' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Weekly' } })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Disable' })).not.toBeInTheDocument(),
    )
  })
  it('does not expose row selection without the reporting grant', async () => {
    mocks.keys = []
    setup(<ReportSchedulesPage />)
    await screen.findByRole('link', { name: 'Daily sales report' })
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
  })
  it('renders detail, edit and create actions with the single reporting grant', async () => {
    mocks.keys = ['reports.read']
    setup(<ReportSchedulesPage />)
    const name = await screen.findByRole('link', { name: 'Daily sales report' })
    expect(name).toHaveAttribute('href', `/reports/schedules/${id}`)
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit Daily sales report' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'New schedule' })).toBeInTheDocument()
  })
  it('validates a schedule before persistence and never navigates on fake success', async () => {
    const location = setup(<ReportScheduleFormPage />, '/reports/schedules/new')
    fireEvent.click(await screen.findByRole('button', { name: 'Create schedule' }))
    expect(
      await screen.findByText('Check the schedule fields, section selection and recipients.'),
    ).toBeInTheDocument()
    expect(mocks.createReportSchedule).not.toHaveBeenCalled()
    expect(location.history).toEqual(['/reports/schedules/new'])
  })
  it('uses staff IDs and only navigates after the generated create operation succeeds', async () => {
    const location = setup(<ReportScheduleFormPage />, '/reports/schedules/new')
    fireEvent.change(await screen.findByLabelText('Schedule name'), {
      target: { value: 'Weekly finance' },
    })
    expect(screen.getByRole('combobox', { name: 'Output format' })).toHaveTextContent('PDF')
    expect(screen.getByRole('combobox', { name: 'Email and report language' })).toHaveTextContent(
      'French',
    )
    fireEvent.click(screen.getByRole('combobox', { name: 'Email and report language' }))
    fireEvent.click(await screen.findByRole('option', { name: 'English' }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Revenue' }))
    fireEvent.click(screen.getByRole('combobox', { name: 'Add staff recipient' }))
    fireEvent.click(
      await screen.findByRole('option', { name: 'Recipient Staff · staff@example.test' }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Create schedule' }))
    await waitFor(() =>
      expect(mocks.createReportSchedule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Weekly finance',
          language: 'en',
          recipientIds: [staffId],
          includedSections: ['revenue'],
          weekday: 1,
          monthDay: null,
          enabled: false,
        }),
      ),
    )
    await waitFor(() => expect(location.history.at(-1)).toBe(`/reports/schedules/${id}`))
  })
  it('downloads a captured artifact through generated operations and has no edit action', async () => {
    setup(<ReportRunPage />, `/reports/runs/${id}`, '/reports/runs/:runId')
    fireEvent.click(await screen.findByRole('button', { name: 'Download PDF' }))
    await waitFor(() => expect(mocks.downloadArtifact).toHaveBeenCalledWith(id))
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByText(/ · Provider accepted$/)).toBeInTheDocument()
    expect(screen.getByText(/Recipient Staff · staff@example.test/)).toBeInTheDocument()
    expect(screen.queryByText(new RegExp(staffId))).not.toBeInTheDocument()
  })
  it('hides saved downloads without reports export and renders permission denial honestly', async () => {
    mocks.keys = ['reports.read', 'report_runs.read']
    mocks.getReportRun.mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Not allowed.'))
    setup(<ReportRunPage />, `/reports/runs/${id}`, '/reports/runs/:runId')
    expect(await screen.findByText('Access denied')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Download PDF' })).not.toBeInTheDocument()
  })
})
