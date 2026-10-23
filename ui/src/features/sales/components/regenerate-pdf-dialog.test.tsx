import '../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { apiRequest } from '../../../api/http'
import { RegeneratePdfDialog } from './regenerate-pdf-dialog'

vi.mock('../../../api/http', () => ({ apiRequest: vi.fn() }))
vi.mock('../../identity', () => ({ useAuthorization: () => ({ can: () => true }) }))
vi.mock('../../settings', () => ({
  useDocumentTemplates: () => ({
    data: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'Atelier', archivedAt: null },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Archived', archivedAt: '2026-10-01' },
    ],
    isPending: false,
    error: null,
  }),
}))
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
  it('requires confirmation, defaults to company template, and reports success', async () => {
    vi.mocked(apiRequest).mockResolvedValue({ id, generatedAt: new Date().toISOString() })
    const dialog = setup()
    expect(apiRequest).not.toHaveBeenCalled()
    expect(within(dialog).getByRole('combobox')).toHaveTextContent('Company default')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate PDF' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('ready to download'))
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/v1/documents/invoice/${id}/regenerate-pdf`,
        data: { templateId: null },
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
      expect.objectContaining({ data: { templateId: null } }),
      expect.anything(),
    )
    expect(within(dialog).getByRole('button', { name: 'Regenerate PDF' })).toBeEnabled()
  })
  it('allows selecting active templates and submits the chosen template', async () => {
    vi.mocked(apiRequest)
      .mockReset()
      .mockResolvedValue({ id, generatedAt: new Date().toISOString() })
    const dialog = setup()
    fireEvent.keyDown(within(dialog).getByRole('combobox'), { key: 'ArrowDown' })
    expect(screen.queryByRole('option', { name: 'Archived' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('option', { name: 'Atelier' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Regenerate PDF' }))
    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({ data: { templateId: '22222222-2222-4222-8222-222222222222' } }),
        expect.anything(),
      ),
    )
  })
})
