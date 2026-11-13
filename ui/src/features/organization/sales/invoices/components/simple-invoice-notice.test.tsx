import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ keys: new Set<string>(), legalType: 'individual' }))
vi.mock('../../../identity', () => ({
  useAuthorization: () => ({ can: (key: string) => state.keys.has(key) }),
}))
vi.mock('../../../settings', () => ({
  useCompanySettings: (enabled: boolean) => ({
    data: enabled ? { legalType: state.legalType } : undefined,
  }),
}))

import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { SimpleInvoiceNotice } from './simple-invoice-notice'

const view = () =>
  render(
    <Router hook={memoryLocation({ path: '/invoices' }).hook}>
      <SimpleInvoiceNotice />
    </Router>,
  )

describe('simple invoice notice', () => {
  it('explains simple invoices with a link for users who may update settings', () => {
    state.keys = new Set(['company_settings.read', 'company_settings.update'])
    state.legalType = 'individual'
    view()
    expect(screen.getByRole('note')).toHaveTextContent('simple invoices')
    expect(screen.getByRole('link', { name: 'Open company settings' })).toBeInTheDocument()
  })
  it('is plain text without the update permission', () => {
    state.keys = new Set(['company_settings.read'])
    state.legalType = 'individual'
    view()
    expect(screen.getByRole('note')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })
  it('is hidden for a registered legal type', () => {
    state.keys = new Set(['company_settings.read', 'company_settings.update'])
    state.legalType = 'sarl'
    view()
    expect(screen.queryByRole('note')).toBeNull()
  })
})
