import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { getOrganizationStaffSessionQueryKey } from '../../../../api/generated/identity/identity'
import { httpClient } from '../../../../api/http'
import { organizationRoutes } from '../../../../app/router/organization-routes'
import { SessionEvents } from './components/session-events'
import { sessionKey } from './hooks/use-session'

const user = {
  id: '55555555-5555-4555-8555-555555555555',
  email: 'sara@example.test',
  firstName: 'Sara',
  lastName: null,
  avatarUrl: null,
}
const full = { user, purpose: 'full', permissionKeys: [] }
const clients: QueryClient[] = []
const response = (data: unknown, status = 200) =>
  ({ data: JSON.stringify(data), status, headers: {} }) as never
function setup(path = '/login') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  clients.push(client)
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <SessionEvents />
        {organizationRoutes}
      </Router>
    </QueryClientProvider>,
  )
  return { client, location }
}
const fill = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
})
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear())
})

describe('Organization staff authentication UI', () => {
  it('uses host-scoped organization endpoints and query keys', async () => {
    const request = vi.spyOn(httpClient, 'request').mockResolvedValue(response(full))
    const assign = vi.fn()
    vi.stubGlobal('location', { ...window.location, assign })
    const { client } = setup()
    fill('Email address', 'sara@example.test')
    fill('Password', 'sara-password-one-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/workspace/dashboard'))
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({ url: '/api/v1/organization-auth/login' }),
    )
    expect(client.getQueryData(getOrganizationStaffSessionQueryKey())).toEqual(full)
    expect(client.getQueryData(sessionKey)).toBeUndefined()
  })
  it('replaces paused access with a static page containing no actions', async () => {
    vi.spyOn(httpClient, 'request').mockResolvedValue(
      response(
        {
          code: 'ORGANIZATION_SUSPENDED',
          message: 'This organization is temporarily unavailable.',
        },
        403,
      ),
    )
    const { location } = setup()
    fill('Email address', 'sara@example.test')
    fill('Password', 'sara-password-one-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
    expect(
      await screen.findByRole('heading', { name: 'Organization temporarily unavailable' }),
    ).toBeInTheDocument()
    expect(location.history.at(-1)).toBe('/organization-unavailable')
    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(screen.queryAllByRole('link')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
  })
  it('requires first-login replacement and submits no current password for onboarding', async () => {
    const request = vi.spyOn(httpClient, 'request').mockImplementation(async (config) => {
      if (config.url?.endsWith('/change-password')) return response(full)
      return response({ ...full, purpose: 'password_change' })
    })
    setup('/set-password')
    await screen.findByLabelText('New password')
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument()
    fill('New password', 'new-staff-password-2026')
    fill('Confirm password', 'new-staff-password-2026')
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/organization-auth/change-password',
          data: { newPassword: 'new-staff-password-2026' },
        }),
      ),
    )
  })
  it('does not expire a legacy staff session when another organization rejects login', async () => {
    const expired = vi.fn()
    window.addEventListener('slama:session-expired', expired)
    try {
      vi.spyOn(httpClient, 'request').mockResolvedValue(
        response({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' }, 401),
      )
      const { client } = setup()
      client.setQueryData(sessionKey, full)
      fill('Email address', 'sara@example.test')
      fill('Password', 'wrong-password')
      fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
      await screen.findByRole('alert')
      expect(expired).not.toHaveBeenCalled()
      expect(client.getQueryData(sessionKey)).toEqual(full)
    } finally {
      window.removeEventListener('slama:session-expired', expired)
    }
  })
})
