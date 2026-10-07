import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { Session } from '../../../api/generated/schemas/identity/auth.schemas'
import { ProtectedRoute } from '../../../app/router/protected-route'
import { publicRoutes } from '../../../app/router/public-routes'
import { ApiError } from '../../../lib/api-error'
import * as api from './api/auth-client'
import { AuthLayout } from './components/auth-layout'
import { LoginPage } from './components/login-page'
import { LogoutButton } from './components/logout-button'
import { SessionEvents } from './components/session-events'
import { sessionKey } from './hooks/use-session'
import { ChangePasswordPage } from './pages/change-password-page'
import { ForgotPasswordPage } from './pages/forgot-password-page'
import { ProfilePage } from './pages/profile-page'
import { ResetPasswordPage } from './pages/reset-password-page'
import { hasPermission, routePermission } from './permissions'
vi.mock('./api/auth-client', () => ({
  getSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  changePassword: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  updateProfile: vi.fn(),
}))
const session: Session = {
  user: {
    id: '123e4567-e89b-42d3-a456-426614174000',
    email: 'staff@example.com',
    firstName: 'Sara',
    lastName: 'Amrani',
    avatarUrl: null,
  },
  purpose: 'full',
  permissionKeys: ['staff.read', 'reports.read'],
}
const clients: QueryClient[] = []
function setup(node: ReactNode, path = '/login') {
  const location = memoryLocation({ path, record: true })
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>{node}</Router>
    </QueryClientProvider>,
  )
  return { client, location }
}
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(api.getSession).mockResolvedValue(null)
  window.history.replaceState({}, '', '/')
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})
describe('authentication UI', () => {
  it.each(['/profile', '/profile/edit', '/profile/change-password'])(
    'marks the sidebar profile link active on %s',
    async (path) => {
      vi.mocked(api.getSession).mockResolvedValue(session)
      setup(
        <ProtectedRoute>
          <p>Profile content</p>
        </ProtectedRoute>,
        path,
      )
      const link = await screen.findByRole('link', { name: 'View my profile' })
      expect(link).toHaveAttribute('data-sidebar', 'menu-button')
      expect(link).toHaveAttribute('data-active', 'true')
      expect(link).toHaveAttribute('aria-current', 'page')
    },
  )
  it('toggles and persists the theme on public authentication pages', () => {
    localStorage.setItem('slama-theme', 'light')
    setup(
      <AuthLayout title="Sign in" description="Welcome">
        <p>Form content</p>
      </AuthLayout>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(screen.getByRole('main')).toHaveClass('is-dark')
    expect(localStorage.getItem('slama-theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    expect(screen.getByRole('main')).not.toHaveClass('is-dark')
    expect(localStorage.getItem('slama-theme')).toBe('light')
  })
  it('does not register the removed password URL', () => {
    const { location } = setup(publicRoutes, '/change-password')
    expect(location.history.at(-1)).toBe('/change-password')
    expect(screen.queryByRole('button', { name: 'Save new password' })).not.toBeInTheDocument()
    expect(api.getSession).not.toHaveBeenCalled()
    expect(api.changePassword).not.toHaveBeenCalled()
  })
  it('redirects full sessions away from password onboarding', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session)
    const { location } = setup(<ChangePasswordPage />, '/set-password')
    await waitFor(() => expect(location.history.at(-1)).toBe('/profile/change-password'))
  })
  it('shows personal profile actions without staff-management permission', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session)
    const { location } = setup(<ProfilePage />, '/profile')
    expect(await screen.findByText('Sara')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Edit profile' })).toHaveAttribute(
      'href',
      '/profile/edit',
    )
    const more = screen.getByRole('button', { name: 'More' })
    fireEvent.pointerDown(more, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Change password' }))
    expect(location.history.at(-1)).toBe('/profile/change-password')
  })
  it('saves personal details using the self-profile endpoint', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session)
    vi.mocked(api.updateProfile).mockResolvedValue(session)
    const { location } = setup(<ProfilePage editing />, '/profile/edit')
    await screen.findByLabelText('First name')
    fill('First name', 'Sara')
    fill('Current password', ' secret password ')
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() =>
      expect(api.updateProfile).toHaveBeenCalledWith({
        firstName: 'Sara',
        lastName: 'Amrani',
        email: session.user.email,
        currentPassword: ' secret password ',
      }),
    )
    await waitFor(() => expect(location.history.at(-1)).toBe('/profile'))
  })
  it('opens the avatar menu and toggles the theme with one icon', async () => {
    localStorage.setItem('slama-theme', 'light')
    vi.mocked(api.getSession).mockResolvedValue(session)
    setup(
      <ProtectedRoute>
        <p>Dashboard content</p>
      </ProtectedRoute>,
      '/dashboard',
    )
    await screen.findByText('Dashboard content')
    expect(screen.getAllByRole('link', { name: 'View my profile' })).toHaveLength(1)
    const trigger = screen.getByRole('button', { name: 'Account menu' })
    expect(trigger).toHaveClass('bg-[var(--accent)]', 'text-[var(--brand-foreground)]')
    expect(trigger.closest('header')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Switch to dark mode' }))
    expect(localStorage.getItem('slama-theme')).toBe('dark')
    fireEvent.click(screen.getByRole('button', { name: 'Switch to light mode' }))
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(await screen.findByRole('menuitem', { name: 'Profile' })).toHaveAttribute(
      'href',
      '/profile',
    )
    expect(screen.getByRole('menuitem', { name: 'Log out' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
    vi.mocked(api.logout).mockResolvedValue(undefined)
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }))
    await waitFor(() => expect(api.logout).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('link', { name: 'Change password' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: "What's new" })).not.toBeInTheDocument()
  })
  it('disables submission while login is pending', async () => {
    let finish!: (value: Session) => void
    vi.mocked(api.login).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    setup(<LoginPage />)
    await screen.findByRole('button', { name: 'Log in' })
    fill('Email address', 'staff@example.com')
    fill('Password', 'correct-password')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(await screen.findByRole('button', { name: 'Please wait…' })).toBeDisabled()
    expect(api.login).toHaveBeenCalledTimes(1)
    await act(async () => finish(session))
  })
  it('does not claim logout succeeded when the server is unreachable', async () => {
    vi.mocked(api.logout).mockRejectedValue(
      new ApiError(0, 'NETWORK_ERROR', 'Unable to reach the server.'),
    )
    const { client, location } = setup(<LogoutButton />, '/dashboard')
    client.setQueryData(sessionKey, session)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to reach the server')
    expect(client.getQueryData(sessionKey)).toEqual(session)
    expect(location.history.at(-1)).toBe('/dashboard')
  })
  it('protects private content and sends anonymous users to login', async () => {
    const { location } = setup(
      <ProtectedRoute>
        <p>Private content</p>
      </ProtectedRoute>,
      '/dashboard',
    )
    expect(screen.queryByText('Private content')).not.toBeInTheDocument()
    await waitFor(() => expect(location.history.at(-1)).toBe('/login'))
  })
  it('fails closed on session errors and offers retry', async () => {
    vi.mocked(api.getSession).mockRejectedValue(new Error('offline'))
    setup(
      <ProtectedRoute>
        <p>Private content</p>
      </ProtectedRoute>,
      '/dashboard',
    )
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(screen.queryByText('Private content')).not.toBeInTheDocument()
  })
  it('redirects restricted sessions before rendering business content', async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      ...session,
      purpose: 'password_change',
      permissionKeys: [],
    })
    const { location } = setup(
      <ProtectedRoute>
        <p>Private content</p>
      </ProtectedRoute>,
      '/dashboard',
    )
    await waitFor(() => expect(location.history.at(-1)).toBe('/set-password'))
    expect(screen.queryByText('Private content')).not.toBeInTheDocument()
  })
  it('denies direct staff edit URLs without manage permission', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session)
    setup(
      <ProtectedRoute>
        <p>Edit staff</p>
      </ProtectedRoute>,
      '/settings/staff/123/edit',
    )
    expect(await screen.findByText(/do not have permission/)).toBeInTheDocument()
    expect(screen.queryByText('Edit staff')).not.toBeInTheDocument()
  })
  it('validates login using the generated schema and routes successful sessions', async () => {
    vi.mocked(api.login).mockResolvedValue(session)
    const { location, client } = setup(<LoginPage />)
    const button = await screen.findByRole('button', { name: 'Log in' })
    fireEvent.click(button)
    await screen.findByText('Invalid email')
    expect(api.login).not.toHaveBeenCalled()
    fill('Email address', 'staff@example.com')
    fill('Password', 'correct-password')
    client.setQueryData(['private-data'], 'old-user')
    fireEvent.click(button)
    await waitFor(() => expect(location.history.at(-1)).toBe('/dashboard'))
    expect(client.getQueryData(['private-data'])).toBeUndefined()
    expect(api.login).toHaveBeenCalledWith({
      email: 'staff@example.com',
      password: 'correct-password',
    })
  })
  it('shows login rate-limit errors and re-enables submission', async () => {
    vi.mocked(api.login).mockRejectedValue(
      new ApiError(429, 'RATE_LIMIT', 'Too many attempts. Try again later.'),
    )
    setup(<LoginPage />)
    const button = await screen.findByRole('button', { name: 'Log in' })
    fill('Email address', 'staff@example.com')
    fill('Password', 'correct-password')
    fireEvent.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts')
    await waitFor(() => expect(button).toBeEnabled())
  })
  it('uses a generic reset-request confirmation', async () => {
    vi.mocked(api.requestPasswordReset).mockResolvedValue({
      message: 'If eligible, a reset email will be sent.',
    })
    setup(<ForgotPasswordPage />)
    fill('Email address', 'staff@example.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }))
    expect(await screen.findByRole('status')).toHaveTextContent('If the account is eligible')
  })
  it('consumes fragment tokens, strips them from the URL and validates confirmation', async () => {
    const token = 'a'.repeat(43)
    window.history.replaceState({}, '', '/reset-password#token=' + token)
    vi.mocked(api.confirmPasswordReset).mockResolvedValue(undefined)
    setup(<ResetPasswordPage />, '/reset-password')
    expect(window.location.hash).toBe('')
    fill('New password', 'new-password-123')
    fill('Confirm new password', 'different')
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByText('Passwords do not match.')).toBeInTheDocument()
    expect(api.confirmPasswordReset).not.toHaveBeenCalled()
    fill('Confirm new password', 'new-password-123')
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Your password has been reset')
    expect(api.confirmPasswordReset).toHaveBeenCalledWith({ token, password: 'new-password-123' })
  })
  it('does not show a reset form without a valid token', () => {
    setup(<ResetPasswordPage />)
    expect(screen.getByRole('alert')).toHaveTextContent('missing or invalid')
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument()
  })
  it('handles expired reset links without claiming success', async () => {
    window.history.replaceState({}, '', '/reset-password#token=' + 'a'.repeat(43))
    vi.mocked(api.confirmPasswordReset).mockRejectedValue(
      new ApiError(400, 'INVALID_RESET_TOKEN', 'This reset link is invalid or has expired'),
    )
    setup(<ResetPasswordPage />)
    fill('New password', 'new-password-123')
    fill('Confirm new password', 'new-password-123')
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired')
  })
  it('replaces temporary passwords without requesting a current password', async () => {
    vi.mocked(api.getSession).mockResolvedValue({
      ...session,
      purpose: 'password_change',
      permissionKeys: [],
    })
    vi.mocked(api.changePassword).mockResolvedValue(session)
    const { location } = setup(<ChangePasswordPage />, '/set-password')
    await screen.findByLabelText('New password')
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    fill('New password', 'new-password-123')
    fill('Confirm new password', 'new-password-123')
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/dashboard'))
    expect(api.changePassword).toHaveBeenCalledWith({ newPassword: 'new-password-123' })
  })
  it('requires current password for a full session', async () => {
    vi.mocked(api.getSession).mockResolvedValue(session)
    setup(<ChangePasswordPage embedded />, '/profile/change-password')
    await screen.findByLabelText('Current password')
    fill('New password', 'new-password-123')
    fill('Confirm new password', 'new-password-123')
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }))
    await screen.findByRole('alert')
    expect(api.changePassword).not.toHaveBeenCalled()
  })
  it('clears private cache and redirects after confirmed logout', async () => {
    vi.mocked(api.logout).mockResolvedValue(undefined)
    const { client, location } = setup(<LogoutButton />, '/dashboard')
    client.setQueryData(['private-data'], 'secret')
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/login'))
    expect(client.getQueryData(['private-data'])).toBeUndefined()
    expect(client.getQueryData(sessionKey)).toBeNull()
  })
  it('expires local access when the transport reports an unauthorized request', async () => {
    const { client } = setup(<SessionEvents />)
    client.setQueryData(sessionKey, session)
    client.setQueryData(['private-data'], 'secret')
    act(() => window.dispatchEvent(new Event('slama:session-expired')))
    await waitFor(() => expect(client.getQueryData(sessionKey)).toBeNull())
    expect(client.getQueryData(['private-data'])).toBeUndefined()
  })
  it('uses exact permission keys, never role names or wildcards', () => {
    expect(routePermission('/settings/staff/123/edit')).toBe('staff.update')
    expect(routePermission('/settings/roles/new')).toBe('roles.create')
    expect(hasPermission(['admin', '*'], 'staff.create')).toBe(false)
    expect(hasPermission(['staff.read'], 'staff.read')).toBe(true)
  })
})
