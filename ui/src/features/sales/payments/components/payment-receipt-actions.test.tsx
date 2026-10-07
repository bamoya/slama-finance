import '../../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { Payment } from '../../../../api/generated/models'
import { apiRequest } from '../../../../api/http'
import { PaymentReceiptActions } from './payment-receipt-actions'

vi.mock('../../../../api/http', () => ({ apiRequest: vi.fn() }))
vi.mock('../../../identity', () => ({
  Can: ({ children }: { children: React.ReactNode }) => children,
}))
const payment = {
  id: '11111111-1111-4111-8111-111111111111',
  receiptNumber: 'REC-2026-1234567890',
} as Payment
function setup() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
    >
      <PaymentReceiptActions payment={payment} />
    </QueryClientProvider>,
  )
}
describe('Payment receipt actions', () => {
  beforeEach(() => {
    vi.mocked(apiRequest).mockReset()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    URL.createObjectURL = vi.fn(() => 'blob:receipt')
    URL.revokeObjectURL = vi.fn()
  })
  it('uses the generated prepare and download endpoints', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ id: 'artifact-id', generatedAt: new Date().toISOString() })
      .mockResolvedValueOnce(new Blob(['%PDF-']))
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Download receipt' }))
    await waitFor(() => expect(HTMLAnchorElement.prototype.click).toHaveBeenCalled())
    expect(apiRequest).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ url: `/v1/payments/${payment.id}/receipt`, method: 'POST' }),
      expect.anything(),
    )
    expect(apiRequest).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ url: '/v1/artifacts/artifact-id/download' }),
      expect.objectContaining({ responseType: 'blob' }),
    )
    expect(screen.getByRole('button', { name: 'Regenerate PDF' })).toBeEnabled()
  })
  it('shows a retryable error when preparing a receipt fails', async () => {
    vi.mocked(apiRequest).mockRejectedValueOnce(new Error('Storage offline'))
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Download receipt' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('button', { name: 'Download receipt' })).toBeEnabled()
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled()
  })
})
