import '../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, within } from '@testing-library/react'
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
  it('requires a reason in the dialog, trims it and sends the selected version', async () => {
    setup('invoices')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel records' }))
    expect(screen.queryByText(/Deletion is permanent/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeDisabled()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Duplicate order  ' } })
    confirm()
    await screen.findByText('1 succeeded · 0 skipped · 0 failed')
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/v1/invoices/${id}/cancel`,
        data: { expectedVersion: 7, reason: 'Duplicate order' },
      }),
      undefined,
    )
  })
  it('deletes only drafts and reports server conflicts without losing the batch results', async () => {
    vi.mocked(apiRequest).mockRejectedValue(
      new ApiError(409, 'VERSION_CONFLICT', 'Invoice changed.'),
    )
    const { clear, refresh } = setup('invoices', [
      row,
      { ...row, id: 'draft', number: null, status: 'draft' },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    confirm()
    await screen.findByText('0 succeeded · 1 skipped · 1 failed')
    expect(apiRequest).toHaveBeenCalledTimes(1)
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ method: 'DELETE', data: { expectedVersion: 7 } }),
      undefined,
    )
    expect(clear).toHaveBeenCalledOnce()
    expect(refresh).toHaveBeenCalledOnce()
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
  it('does not offer deletion of payments that have issued receipts', () => {
    setup('payments', [
      {
        ...row,
        status: 'confirmed',
        receiptIssuedAt: '2026-10-02T10:00:00Z',
      } as unknown as PaymentPageItemsItem,
    ])
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled()
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
