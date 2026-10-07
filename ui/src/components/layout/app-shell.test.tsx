import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { useSession } from '../../features/identity/auth/hooks/use-session'
import { AppShell } from './app-shell'

vi.mock('../../features/identity/auth/hooks/use-session', () => ({
  useSession: vi.fn(),
  useAuthTransition: () => vi.fn(),
}))
const caches: QueryClient[] = []
beforeEach(() => {
  document.cookie = 'sidebar_state=; path=/; max-age=0'
  vi.mocked(useSession).mockReturnValue({
    data: {
      purpose: 'full',
      user: { id: 'staff', firstName: 'Sara', lastName: 'Amrani', email: 'sara@example.test' },
      permissionKeys: [
        'staff.read',
        'roles.read',
        'company_settings.read',
        'bank_accounts.read',
        'templates.read',
        'products.read',
        'categories.read',
        'clients.read',
        'invoices.read',
        'estimates.read',
        'delivery_notes.read',
        'payments.read',
        'reports.read',
        'report_schedules.read',
        'notification_rules.read',
      ],
    },
    isError: false,
  } as ReturnType<typeof useSession>)
})
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.clear())
  document.cookie = 'sidebar_state=; path=/; max-age=0'
  localStorage.removeItem('slama-theme')
  document.documentElement.classList.remove('theme-dark')
})
function setup(path = '/reports/schedules') {
  const location = memoryLocation({ path, record: true })
  const cache = new QueryClient()
  caches.push(cache)
  render(
    <QueryClientProvider client={cache}>
      <Router hook={location.hook}>
        <AppShell>
          <p>Page content</p>
        </AppShell>
      </Router>
    </QueryClientProvider>,
  )
  return location
}
describe('shadcn application sidebar', () => {
  it('uses the shared page width and applies dark mode to the document root', async () => {
    setup()
    expect(screen.getByText('Page content').parentElement).toHaveClass('app-page')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    await waitFor(() => expect(document.documentElement).toHaveClass('theme-dark'))
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    await waitFor(() => expect(document.documentElement).not.toHaveClass('theme-dark'))
  })
  it('groups routes by domain and marks only the most specific link active', () => {
    setup()
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    for (const label of [
      'Overview',
      'Catalog',
      'Customers',
      'Sales',
      'Reporting',
      'Identity',
      'Settings',
    ])
      expect(within(nav).getByLabelText(label)).toBeInTheDocument()
    expect(within(nav).getByRole('link', { name: 'Scheduled reports' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: 'Reports' })).not.toHaveAttribute('aria-current')
    expect(
      within(within(nav).getByLabelText('Identity')).getByRole('link', { name: 'Staff' }),
    ).toBeInTheDocument()
  })
  it('collapses to icons, shows tooltips and persists the preference', async () => {
    setup()
    fireEvent.click(screen.getAllByRole('button', { name: 'Toggle navigation' }).at(-1)!)
    expect(document.querySelector('[data-collapsible="icon"]')).toHaveAttribute(
      'data-state',
      'collapsed',
    )
    expect(document.cookie).toContain('sidebar_state=false')
    fireEvent.focus(screen.getByRole('link', { name: 'Staff' }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Staff')
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true })
    expect(document.querySelector('[data-collapsible]')).toHaveAttribute('data-state', 'expanded')
  })
  it('restores a collapsed desktop preference', () => {
    document.cookie = 'sidebar_state=false; path=/'
    setup()
    expect(document.querySelector('[data-collapsible="icon"]')).toBeInTheDocument()
  })
  it('hides forbidden links and empty domain groups', () => {
    vi.mocked(useSession).mockReturnValue({
      data: {
        purpose: 'full',
        permissionKeys: [] as string[],
        user: {
          id: 'reader',
          email: 'reader@example.test',
          firstName: null,
          lastName: null,
          avatarUrl: null,
        },
      },
      isError: false,
    } as ReturnType<typeof useSession>)
    setup()
    const nav = screen.getByRole('navigation')
    expect(within(nav).queryByLabelText('Identity')).not.toBeInTheDocument()
    expect(within(nav).queryByLabelText('Sales')).not.toBeInTheDocument()
    expect(within(nav).queryByRole('link', { name: 'Bank accounts' })).not.toBeInTheDocument()
  })
  it('uses a mobile dialog and closes after navigating or pressing Escape', async () => {
    vi.stubGlobal('innerWidth', 390)
    const location = setup()
    expect(screen.queryByRole('navigation', { name: 'Main navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Mobile navigation' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('link', { name: 'Bank accounts' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(location.history.at(-1)).toBe('/settings/bank-accounts')
    fireEvent.click(screen.getByRole('button', { name: 'Toggle navigation' }))
    await screen.findByRole('dialog')
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('opens the mobile sales menu and closes it after navigation', async () => {
    vi.stubGlobal('innerWidth', 390)
    const location = setup('/invoices')
    const nav = screen.getByRole('navigation', { name: 'Mobile navigation' })
    fireEvent.click(within(nav).getByRole('button', { name: 'Sales' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('link', { name: 'Estimates' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(location.history.at(-1)).toBe('/estimates')
  })
})
