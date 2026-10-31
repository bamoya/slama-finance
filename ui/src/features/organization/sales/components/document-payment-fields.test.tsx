import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { AgreedPaymentMethodSelect, DocumentBankPicker } from './document-payment-fields'
import { DocumentPaymentSummary } from './document-payment-summary'

const state = vi.hoisted(() => ({ canRead: true }))
vi.mock('../../identity', () => ({ useAuthorization: () => ({ can: () => state.canRead }) }))
vi.mock('../../settings', () => ({
  useBankAccounts: () => ({
    data: [{ id: 'bank-id', name: 'Main account', bankName: 'Credit Agricole', archivedAt: null }],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  }),
}))
beforeEach(() => {
  state.canRead = true
})
describe('document payment fields', () => {
  it('starts with the company default and supports explicitly hiding details', () => {
    const change = vi.fn()
    const { rerender } = render(<DocumentBankPicker value={undefined} onChange={change} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Company default')
    rerender(<DocumentBankPicker value={null} onChange={change} />)
    expect(screen.getByRole('combobox')).toHaveTextContent('Hide bank details')
  })
  it('does not expose the bank selector without bank read permission', () => {
    state.canRead = false
    render(<DocumentBankPicker value={undefined} onChange={vi.fn()} />)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
  it('selects an agreed transfer without creating a payment', () => {
    const change = vi.fn()
    render(<AgreedPaymentMethodSelect value={null} onChange={change} />)
    fireEvent.click(screen.getByRole('combobox'))
    fireEvent.click(screen.getByRole('option', { name: 'Bank transfer' }))
    expect(change).toHaveBeenCalledWith('bank_transfer')
  })
  it('shows the frozen bank snapshot alongside the agreement', () => {
    render(
      <DocumentPaymentSummary
        document={{
          agreedPaymentMethod: 'bank_transfer',
          bankDetailsSnapshot: {
            bankName: 'Saved Bank',
            accountHolder: 'Slama',
            rib: '225091032701984651012213',
            iban: null,
          },
        }}
      />,
    )
    expect(screen.getByText('Bank transfer')).toBeInTheDocument()
    expect(screen.getByText(/Saved Bank/)).toBeInTheDocument()
    expect(screen.getByText(/225091032701984651012213/)).toBeInTheDocument()
  })
})
