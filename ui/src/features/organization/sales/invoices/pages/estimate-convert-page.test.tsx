import '../../translations'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { setUiLanguage } from '../../../../../lib/i18n'
import { EstimateConvertPage } from './estimate-convert-page'

vi.mock('../../estimates/queries', () => ({
  useEstimate: () => ({
    isPending: false,
    isError: false,
    data: { id: 'e1', number: 'DEV-1', total: 100, currency: 'MAD', status: 'accepted' },
  }),
  refreshEstimates: vi.fn(),
}))
vi.mock('../queries', () => ({
  useEstimateInvoices: () => ({
    isPending: false,
    data: [{ id: 'i1', number: 'FAC-1', status: 'issued' }],
  }),
  useInvoiceActions: () => ({ convert: vi.fn() }),
  refreshInvoices: vi.fn(),
}))

describe('EstimateConvertPage', () => {
  beforeEach(async () => {
    await setUiLanguage('fr')
  })

  it('shows translated document statuses', () => {
    const location = memoryLocation({ path: '/estimates/e1/convert' })
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Router hook={location.hook}>
          <Route path="/estimates/:documentId/convert">
            <EstimateConvertPage />
          </Route>
        </Router>
      </QueryClientProvider>,
    )
    expect(screen.getByText(/Statut\s*:\s*Accepté/)).toBeTruthy()
    expect(screen.getByText(/FAC-1 · Émis/)).toBeTruthy()
  })
})
