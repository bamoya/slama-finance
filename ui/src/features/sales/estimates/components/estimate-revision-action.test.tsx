import '../../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type * as Wouter from 'wouter'

import type { Estimate } from '../../../../api/generated/schemas/sales/estimates.schemas'
import { apiRequest } from '../../../../api/http'
import { EstimateRevisionAction } from './estimate-revision-action'

const state = vi.hoisted(() => ({ allowed: true, navigate: vi.fn() }))
vi.mock('../../../identity', () => ({
  useAuthorization: () => ({ can: () => state.allowed }),
  Can: ({ children }: { children: React.ReactNode }) => (state.allowed ? children : null),
}))
vi.mock('wouter', async (original) => ({
  ...(await original<typeof Wouter>()),
  useLocation: () => ['', state.navigate],
}))
vi.mock('../../../../api/http', () => ({ apiRequest: vi.fn() }))
const estimate = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 4,
  status: 'accepted',
  revisionId: null,
} as Estimate
const revisionId = '22222222-2222-4222-8222-222222222222'
function setup(row = estimate) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <EstimateRevisionAction estimate={row} />
    </QueryClientProvider>,
  )
}
beforeEach(() => {
  state.allowed = true
  state.navigate.mockReset()
  vi.mocked(apiRequest).mockReset()
})
it('confirms, creates through the generated API client, and opens the editable draft', async () => {
  vi.mocked(apiRequest).mockResolvedValue({ id: revisionId })
  setup()
  fireEvent.click(screen.getByRole('button', { name: 'Create revision' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText(/original stays valid/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
  await vi.waitFor(() =>
    expect(state.navigate).toHaveBeenCalledWith(`/estimates/${revisionId}/edit`),
  )
  expect(apiRequest).toHaveBeenCalledWith(
    expect.objectContaining({
      url: `/v1/estimates/${estimate.id}/revisions`,
      data: { expectedVersion: 4 },
    }),
    undefined,
  )
})
it('opens the existing draft instead of offering a competing revision', () => {
  setup({ ...estimate, revisionId })
  expect(screen.getByRole('link', { name: 'Open draft revision' })).toHaveAttribute(
    'href',
    `/estimates/${revisionId}/edit`,
  )
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('shows the successor as history on a superseded estimate', () => {
  setup({ ...estimate, status: 'superseded', revisionId })
  expect(screen.getByRole('link', { name: 'View revision' })).toHaveAttribute(
    'href',
    `/estimates/${revisionId}`,
  )
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
it('hides creation without permission', () => {
  state.allowed = false
  setup()
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
