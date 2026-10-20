import '../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { apiRequest } from '../../../api/http'
import { RegeneratePdfDialog } from './regenerate-pdf-dialog'

vi.mock('../../../api/http', () => ({ apiRequest: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
function setup() {
  vi.stubGlobal('localStorage', { getItem: () => null })
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <RegeneratePdfDialog documentType="invoice" id={id} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Regenerate PDF' }))
  return screen.getByRole('dialog')
}
describe('PDF regeneration dialog', () => {
  it('requires confirmation, has no design selector, and reports success', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id, generatedAt: new Date().toISOString() })
    const dialog = setup()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(within(dialog).queryByRole('combobox')).not.toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate PDF' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ready to download'))
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/v1/documents/invoice/${id}/regenerate-pdf`,
        data: {},
      }),
      expect.objectContaining({ timeout: 60000 }),
    )
  })
  it('keeps errors available for retry', async () => {
    vi.mocked(apiRequest).mockReset().mockRejectedValue(new Error('Storage unavailable'))
    const dialog = setup()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate PDF' }))
    await screen.findByRole('alert')
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({ data: {} }),
      expect.anything(),
    )
    expect(within(dialog).getByRole('button', { name: 'Regenerate PDF' })).toBeEnabled()
  })
})
