import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'

import { SchedulePreview } from './components/schedule-preview'

const preview = vi.hoisted(() => vi.fn())
vi.mock('../../api/http', async () => {
  const { routeApiRequest } = await import('../../test/api-transport')
  return { apiRequest: routeApiRequest({ previewReportSchedule: preview }) }
})
const cache = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
})
afterEach(() => cache.clear())

it('previews the server calendar without saving and hides stale results when configuration changes', async () => {
  preview.mockResolvedValue({
    nextRunAt: '2026-10-05T07:00:00Z',
    periodStart: '2026-09-28',
    periodEnd: '2026-10-04',
    timezone: 'Africa/Casablanca',
  })
  const configuration = {
    frequency: 'weekly' as const,
    weekday: 1,
    monthDay: null,
    localTime: '08:00',
    timezone: 'Africa/Casablanca',
    period: 'previous_week' as const,
  }
  const { rerender } = render(
    <QueryClientProvider client={cache}>
      <SchedulePreview configuration={configuration} />
    </QueryClientProvider>,
  )
  expect(preview).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Preview next occurrence' }))
  expect(await screen.findByText(/Includes 2026-09-28 through 2026-10-04/)).toHaveTextContent(
    'Africa/Casablanca',
  )
  expect(preview.mock.calls[0]?.[0]).toEqual(configuration)
  rerender(
    <QueryClientProvider client={cache}>
      <SchedulePreview configuration={{ ...configuration, localTime: '09:00' }} />
    </QueryClientProvider>,
  )
  expect(screen.queryByText(/Includes 2026-09-28/)).not.toBeInTheDocument()
})
