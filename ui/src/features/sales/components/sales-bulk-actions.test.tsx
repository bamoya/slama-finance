import '../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { InvoicePageItemsItem, PaymentPageItemsItem } from '../../../api/generated/models'
import { apiRequest } from '../../../api/http'
import { ApiError } from '../../../lib/api-error'
import { SalesBulkActions, type SalesBulkResource } from './sales-bulk-actions'

const auth = vi.hoisted(() => ({ permissions: new Set<string>() }))
vi.mock('../../identity', () => ({
  useAuthorization: () => ({ can: (key: string) => auth.permissions.has(key) }),
}))
vi.mock('../../../api/http', () => ({ apiRequest: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const row = { id, number: 'FAC-2026-889999', version: 7, status: 'issued' } as InvoicePageItemsItem
function setup(
  resource: SalesBulkResource,
  rows: (InvoicePageItemsItem | PaymentPageItemsItem)[] = [row],
) {
  const clear = vi.fn()
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  const refresh = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <SalesBulkActions resource={resource} selected={rows} clear={clear} />
    </QueryClientProvider>,
  )
  return { clear, refresh }
}
function confirm() {
  fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirm' }))
}
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.mocked(apiRequest).mockReset().mockResolvedValue({})
  auth.permissions = new Set([
    'invoices.update',
    'invoices.delete',
    'invoices.update',
    'payments.update',
    'payments.update',
    'payments.delete',
  ])
})
describe('Sales bulk actions through generated API hooks', () => {
  it.each(['estimates', 'delivery_notes', 'payments'] as const)(
    'cancels the whole %s selection through one signed request',
    async (resource) => {
      auth.permissions.add(`${resource}.update`)
      const second = { ...row, id: '22222222-2222-4222-8222-222222222222' }
      vi.mocked(apiRequest)
        .mockResolvedValueOnce({
          token: 'cancel-impact',
          resource,
          records: [row, second].map((item) => ({
            id: item.id,
            name: item.number,
            status: item.status,
            version: item.version,
          })),
          receipts: 0,
        })
        .mockResolvedValueOnce(undefined)
      const { clear } = setup(resource, [row, second])
      fireEvent.click(screen.getByRole('button', { name: 'Cancel records' }))
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Correction' } })
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeEnabled(),
      )
      fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
      await screen.findByText('2 succeeded · 0 skipped · 0 failed')
      expect(apiRequest).toHaveBeenCalledTimes(2)
      expect(apiRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          url: '/v1/sales/cancellation',
          data: {
            resource,
            records: [
              { id, expectedVersion: 7 },
              { id: second.id, expectedVersion: 7 },
            ],
            reason: 'Correction',
            token: 'cancel-impact',
          },
        }),
        undefined,
      )
      expect(clear).toHaveBeenCalledOnce()
    },
  )
  it.each(['invoices', 'estimates', 'delivery_notes', 'payments'] as const)(
    'deletes the entire %s selection in one impact-confirmed request',
    async (resource) => {
      auth.permissions.add(`${resource}.delete`)
      const second = {
        ...row,
        id: '22222222-2222-4222-8222-222222222222',
        status: 'draft',
      } as InvoicePageItemsItem
      vi.mocked(apiRequest)
        .mockResolvedValueOnce({
          token: 'bulk-preview',
          groups: [],
          blockers: [],
          files: 0,
          retainedFiles: 0,
          jobs: 0,
          emails: 0,
        })
        .mockResolvedValueOnce(undefined)
      const { clear, refresh } = setup(resource, [row, second])
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
      const button = within(await screen.findByRole('dialog')).getByRole('button', {
        name: 'Delete permanently',
      })
      await waitFor(() => expect(button).toBeEnabled())
      fireEvent.click(button)
      await screen.findByText('2 succeeded · 0 skipped · 0 failed')
      expect(apiRequest).toHaveBeenCalledTimes(2)
      expect(apiRequest).toHaveBeenLastCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/v1/sales/deletion',
          data: {
            resource,
            cascadeInvoices: false,
            records: [
              { id, expectedVersion: 7 },
              { id: second.id, expectedVersion: 7 },
            ],
            token: 'bulk-preview',
          },
        }),
        undefined,
      )
      expect(clear).toHaveBeenCalledOnce()
      expect(refresh).toHaveBeenCalledOnce()
    },
  )
  it('does not partially cancel a mixed selection when its server preview is rejected', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(
      new ApiError(409, 'INVALID_STATUS', 'Every selected invoice must be issued.'),
    )
    const { clear } = setup('invoices', [
      row,
      { ...row, id: '22222222-2222-4222-8222-222222222222', status: 'draft' },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Cancel records' }))
    await screen.findByText('Every selected invoice must be issued.')
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Reason' } })
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(clear).not.toHaveBeenCalled()
  })
  it('requires a reason in the dialog, trims it and sends the selected version', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({
        token: 'confirmed-impact',
        invoices: [row],
        payments: [],
        deliveryNotes: [],
        receipts: 0,
        alreadyCancelled: 0,
      })
      .mockResolvedValueOnce(undefined)
    setup('invoices')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel records' }))
    expect(screen.queryByText(/Deletion is permanent/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Duplicate order  ' } })
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirm cancellation' })).toBeEnabled(),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await screen.findByText('1 succeeded · 0 skipped · 0 failed')
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/v1/invoices/cancellation',
        data: {
          invoices: [{ id, expectedVersion: 7 }],
          token: 'confirmed-impact',
          reason: 'Duplicate order',
        },
      }),
      undefined,
    )
  })
  it('keeps the entire selection when the deletion preview conflicts', async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError(409, 'VERSION_CONFLICT', 'Invoice changed.'),
    )
    const { clear, refresh } = setup('invoices', [
      row,
      { ...row, id: 'draft', number: null, status: 'draft' },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByText('Invoice changed.')
    expect(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete permanently' }),
    ).toBeDisabled()
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        url: '/v1/sales/deletion/preview',
        data: {
          resource: 'invoices',
          cascadeInvoices: false,
          records: [
            { id, expectedVersion: 7 },
            { id: 'draft', expectedVersion: 7 },
          ],
        },
      }),
      undefined,
    )
    expect(clear).not.toHaveBeenCalled()
    expect(refresh).not.toHaveBeenCalled()
  })
  it('restores cancelled payments but skips active ones', async () => {
    setup('payments', [
      { ...row, status: 'cancelled' } as unknown as PaymentPageItemsItem,
      { ...row, id: 'active', status: 'confirmed' } as unknown as PaymentPageItemsItem,
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    confirm()
    await screen.findByText('1 succeeded · 1 skipped · 0 failed')
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: `/v1/payments/${id}/restore`, data: { expectedVersion: 7 } }),
      undefined,
    )
  })
  it('offers impact-confirmed deletion of payments that have issued receipts', () => {
    setup('payments', [
      {
        ...row,
        status: 'confirmed',
        receiptIssuedAt: '2026-10-02T10:00:00Z',
      } as unknown as PaymentPageItemsItem,
    ])
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled()
  })
  it('regenerates only issued documents using the saved design by default', async () => {
    setup('invoices', [row, { ...row, id: 'draft', status: 'draft' }])
    fireEvent.click(screen.getByRole('button', { name: 'Regenerate PDF' }))
    expect(screen.getByRole('combobox')).toHaveTextContent('Original saved design')
    confirm()
    await screen.findByText('1 succeeded · 1 skipped · 0 failed')
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/v1/documents/invoice/${id}/regenerate-pdf`,
        data: { design: 'saved' },
      }),
      expect.objectContaining({ timeout: 60000 }),
    )
  })
  it('hides actions without permissions', () => {
    auth.permissions.clear()
    setup('invoices')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
