import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'

import type { WorkspaceSession } from '../../../../api/generated/schemas/identity/workspace.schemas'
import { SidebarProvider } from '../../../../components/ui/sidebar'
import { useOwnerPortfolio } from '../../../platform/organizations/hooks/use-owner-portfolio'
import { WorkspaceContext } from './workspace-state'
import { WorkspaceSwitcher } from './workspace-switcher'

vi.mock('../../../platform/organizations/hooks/use-owner-portfolio', () => ({
  useOwnerPortfolio: vi.fn(),
}))
const id = '11111111-1111-4111-8111-111111111111'
const workspace: WorkspaceSession = {
  organization: {
    id,
    name: 'Atlas SARL',
    slug: 'atlas',
    locale: 'fr',
    status: 'active',
    staffCount: 0,
    createdAt: '2026-10-30T10:00:00Z',
  },
  identityType: 'staff',
  defaultVatRate: null,
  session: {
    user: { id, email: 'owner@example.test', firstName: 'Sara', lastName: null, avatarUrl: null },
    purpose: 'full',
    permissionKeys: [],
  },
  subscription: {
    entitlements: {
      organizations: 1,
      staffPerOrganization: 2,
      features: [],
      storageBytes: 1e9,
      businessEmails: 50,
    },
  },
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useOwnerPortfolio).mockReturnValue({
    data: [
      workspace.organization,
      {
        ...workspace.organization,
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Rif Trading',
      },
      {
        ...workspace.organization,
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Paused Company',
        status: 'paused',
      },
    ],
    isPending: false,
    error: null,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useOwnerPortfolio>)
})
function setup(value = workspace) {
  render(
    <SidebarProvider>
      <WorkspaceContext.Provider value={value}>
        <WorkspaceSwitcher />
      </WorkspaceContext.Provider>
    </SidebarProvider>,
  )
}
it('shows the independent organization identity without querying platform organizations or offering owner login', () => {
  setup({ ...workspace, identityType: 'staff' })
  expect(screen.getByText('Atlas SARL')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /Switch organization/ })).not.toBeInTheDocument()
  expect(useOwnerPortfolio).not.toHaveBeenCalled()
})
