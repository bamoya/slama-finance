import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type {
  BankAccount,
  DocumentTemplate,
} from '../../../../api/generated/schemas/settings/settings.schemas'
import { apiRequest } from '../../../../api/http'
import { SettingsBulkActions } from './settings-bulk-actions'

vi.mock('../../../../api/http', () => ({ apiRequest: vi.fn() }))
vi.mock('../../../identity', () => ({ useAuthorization: () => ({ can: () => true }) }))
const row = { id: 'bank', name: 'Main bank', version: 4, archivedAt: null } as BankAccount
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => null })
  vi.mocked(apiRequest).mockReset().mockResolvedValue({})
})
describe('Settings bulk actions', () => {
  it('restores archived bank accounts with version checks and skips active accounts', async () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsBulkActions
          resource="bank"
          clear={vi.fn()}
          selected={[row, { ...row, id: 'archived', archivedAt: '2026-10-02T10:00:00Z' }]}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('1 succeeded · 1 skipped · 0 failed')
    expect(apiRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/v1/bank-accounts/archived/restore',
        data: { expectedVersion: 4 },
      }),
      undefined,
    )
  })
  it('does not invent a restore action for templates', () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <SettingsBulkActions
          resource="template"
          clear={vi.fn()}
          selected={[{ ...row, archivedAt: '2026-10-02T10:00:00Z' } as unknown as DocumentTemplate]}
        />
      </QueryClientProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Restore' })).not.toBeInTheDocument()
  })
})
