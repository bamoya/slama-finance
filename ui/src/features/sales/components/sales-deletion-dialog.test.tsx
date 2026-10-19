import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { apiRequest } from '../../../api/http'
import { MoreActions } from '../../../components/management/more-actions'
import { ApiError } from '../../../lib/api-error'
import { SalesDeletionDialog } from './sales-deletion-dialog'

vi.mock('../../../api/http', () => ({ apiRequest: vi.fn() }))
const selected = [{ id: '11111111-1111-4111-8111-111111111111', version: 4 }]
const impact = {
  token: 'preview-token',
  groups: [
    {
      resource: 'estimates',
      operation: 'delete',
      records: [{ id: selected[0]!.id, name: 'DEV-2026-123', version: 4, status: 'issued' }],
    },
  ],
  files: 1,
  retainedFiles: 0,
  jobs: 2,
  emails: 1,
  blockers: [],
}
function setup(menu = false) {
  const complete = vi.fn().mockResolvedValue(undefined)
  const node = (
    <SalesDeletionDialog resource="estimates" selected={selected} onComplete={complete} />
  )
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      {menu ? <MoreActions>{node}</MoreActions> : node}
    </QueryClientProvider>,
  )
  return complete
}
const button = () =>
  within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete permanently' })
beforeEach(() => {
  vi.mocked(apiRequest).mockReset().mockResolvedValue(impact)
})
describe('shared sales deletion dialog', () => {
  it('previews default preservation, recomputes when cascade changes, and resets the option after dismiss', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(button()).toBeDisabled()
    await screen.findByText('DEV-2026-123')
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/v1/sales/deletion/preview',
        data: {
          resource: 'estimates',
          cascadeInvoices: false,
          records: [{ id: selected[0]!.id, expectedVersion: 4 }],
        },
      }),
      undefined,
    )
    fireEvent.click(checkbox)
    await waitFor(() =>
      expect(apiRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ cascadeInvoices: true }) }),
        undefined,
      ),
    )
    await waitFor(() => expect(button()).toBeEnabled())
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })
  it('blocks sending emails and failed previews without executing deletion', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ ...impact, blockers: ['EMAIL_DELIVERY_IN_PROGRESS'] })
      .mockRejectedValueOnce(new ApiError(403, 'FORBIDDEN', 'Permission changed.'))
    const complete = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await screen.findByRole('alert')
    expect(button()).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Review impact again' }))
    await screen.findByText('Permission changed.')
    expect(button()).toBeDisabled()
    expect(complete).not.toHaveBeenCalled()
    expect(apiRequest).toHaveBeenCalledTimes(2)
  })
  it('sends the signed selection once and requires fresh review after a stale confirmation', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce(impact)
      .mockRejectedValueOnce(new ApiError(409, 'IMPACT_CHANGED', 'Review again.'))
      .mockResolvedValueOnce({ ...impact, token: 'fresh-token' })
      .mockResolvedValueOnce(undefined)
    const complete = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await waitFor(() => expect(button()).toBeEnabled())
    fireEvent.click(button())
    await screen.findByText('Review again.')
    expect(button()).toBeDisabled()
    expect(complete).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Review impact again' }))
    await waitFor(() => expect(button()).toBeEnabled())
    fireEvent.click(button())
    await waitFor(() => expect(complete).toHaveBeenCalledOnce())
    expect(apiRequest).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: '/v1/sales/deletion',
        data: expect.objectContaining({ token: 'fresh-token', cascadeInvoices: false }),
      }),
      undefined,
    )
  })
  it('uses the existing More menu and restores focus when dismissed', async () => {
    setup(true)
    const trigger = screen.getByRole('button', { name: 'More' })
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete permanently' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })
})
