import type * as GeneratedApi from '../api/generated/identity/identity'
import { apiRequest } from '../api/http'
vi.mock('../api/http', () => ({ apiRequest: vi.fn() }))
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Route, Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import type { Session } from '../api/generated/schemas/identity/auth.schemas'
import type { Permission, Role } from '../api/generated/schemas/identity/rbac.schemas'
import type { StaffCreated, StaffDetail } from '../api/generated/schemas/identity/staff.schemas'
import * as auth from '../features/identity/auth/api/auth-client'
import { RoleCreatePage } from '../features/identity/roles/pages/role-create-page'
import { RolesPage } from '../features/identity/roles/pages/roles-page'
import { StaffDetailPage } from '../features/identity/staff/pages/staff-detail-page'
import { StaffFormPage } from '../features/identity/staff/pages/staff-form-page'
import { StaffPage } from '../features/identity/staff/pages/staff-page'
import { ApiError } from '../lib/api-error'
import { routeApiRequest } from '../test/api-transport'
const api = {
  listRoles: vi.fn<typeof GeneratedApi.listRoles>(),
  listPermissions: vi.fn<typeof GeneratedApi.listPermissions>(),
  createRole: vi.fn<typeof GeneratedApi.createRole>(),
  deleteRole: vi.fn<typeof GeneratedApi.deleteRole>(),
  replaceRolePermissions: vi.fn<typeof GeneratedApi.replaceRolePermissions>(),
  listStaff: vi.fn<typeof GeneratedApi.listStaff>(),
  getStaff: vi.fn<typeof GeneratedApi.getStaff>(),
  createStaff: vi.fn<typeof GeneratedApi.createStaff>(),
  updateStaff: vi.fn<typeof GeneratedApi.updateStaff>(),
  replaceUserRoles: vi.fn<typeof GeneratedApi.replaceUserRoles>(),
  disableStaff: vi.fn<typeof GeneratedApi.disableStaff>(),
  enableStaff: vi.fn<typeof GeneratedApi.enableStaff>(),
  archiveStaff: vi.fn<typeof GeneratedApi.archiveStaff>(),
  reissueTemporaryPassword: vi.fn<typeof GeneratedApi.reissueTemporaryPassword>(),
}
vi.mock('../features/identity/auth/api/auth-client', () => ({ getSession: vi.fn() }))
const id = '11111111-1111-4111-8111-111111111111'
const roleId = '22222222-2222-4222-8222-222222222222'
const stamp = '2026-09-26T12:00:00.000Z'
const role: Role = {
  id: roleId,
  key: 'viewer',
  name: 'Viewer',
  description: 'Read-only access',
  isSystem: false,
  createdAt: stamp,
  updatedAt: stamp,
  permissionKeys: ['staff.read'],
}
const permission: Permission = {
  id: '33333333-3333-4333-8333-333333333333',
  key: 'staff.read',
  description: 'View staff',
  createdAt: stamp,
  updatedAt: stamp,
}
const person: StaffCreated = {
  id,
  email: 'sara@example.test',
  firstName: 'Sara',
  lastName: 'Amrani',
  disabledAt: null,
  archivedAt: null,
}
const detail: StaffDetail = {
  ...person,
  roles: [{ id: role.id, key: role.key, name: role.name }],
  permissionKeys: ['staff.read'],
}
const session: Session = {
  user: {
    id: '44444444-4444-4444-8444-444444444444',
    email: 'admin@example.test',
    firstName: 'Admin',
    lastName: 'User',
    avatarUrl: null,
  },
  purpose: 'full',
  permissionKeys: [
    'roles.read',
    'roles.create',
    'roles.update',
    'roles.delete',
    'staff.read',
    'staff.create',
    'staff.update',
    'staff.update',
    'staff.update',
    'staff.update',
    'staff.update',
    'staff.update',
  ],
}
const caches: QueryClient[] = []
function setup(node: ReactNode, path: string, route = path, initialSession = session) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['/v1/auth/session'], initialSession)
  caches.push(client)
  const location = memoryLocation({ path, record: true })
  render(
    <QueryClientProvider client={client}>
      <Router hook={location.hook}>
        <Route path={route}>{node}</Route>
      </Router>
    </QueryClientProvider>,
  )
  return { client, location }
}
const fill = fillField
function openMore() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })
}
async function confirm(label: string) {
  const button = screen.queryByRole('button', { name: label })
  if (button) fireEvent.click(button)
  else {
    if (!screen.queryByRole('menuitem', { name: label })) {
      await screen.findByRole('button', { name: 'More' })
      openMore()
    }
    fireEvent.click(await screen.findByRole('menuitem', { name: label }))
  }
  const dialog = await screen.findByRole('dialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
}
beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(apiRequest).mockImplementation(routeApiRequest(api) as typeof apiRequest)
  vi.mocked(auth.getSession).mockResolvedValue(session)
  vi.mocked(api.listRoles).mockResolvedValue([role])
  vi.mocked(api.listPermissions).mockResolvedValue([permission])
  vi.mocked(api.listStaff).mockResolvedValue({ items: [person], total: 1, page: 1, pageSize: 25 })
  vi.mocked(api.getStaff).mockResolvedValue(detail)
})
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.clear())
})
describe('API-integrated identity pages', () => {
  it('renders a module/action matrix with unavailable cells, not invented permissions', async () => {
    vi.mocked(api.listPermissions).mockResolvedValue([
      permission,
      { ...permission, id, key: 'roles.update', description: 'Manage roles' },
    ])
    setup(<RolesPage />, '/settings/roles')
    const matrix = await screen.findByRole('table', { name: /Role permission matrix/ })
    expect(within(matrix).getByRole('columnheader', { name: 'View' })).toBeInTheDocument()
    expect(within(matrix).getByRole('columnheader', { name: 'Edit' })).toBeInTheDocument()
    expect(within(matrix).getAllByLabelText('Not available')).toHaveLength(6)
    expect(within(matrix).getAllByRole('switch')).toHaveLength(2)
  })
  it('filters staff by role while preserving search/status and resetting pagination', async () => {
    vi.mocked(api.listStaff).mockResolvedValue({
      items: [person],
      total: 26,
      page: 1,
      pageSize: 25,
    })
    setup(<StaffPage />, '/settings/staff')
    await waitFor(() => expect(screen.getByLabelText('Role')).toBeEnabled())
    fill('Search staff', 'Sara')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    fill('Accounts', 'all')
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(api.listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    )
    fill('Role', roleId)
    await waitFor(() =>
      expect(api.listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ roleId, q: 'Sara', status: 'all', page: 1 }),
        expect.anything(),
      ),
    )
    fill('Role', '')
    await waitFor(() =>
      expect(api.listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ roleId: undefined, page: 1 }),
        expect.anything(),
      ),
    )
  })
  it('deletes a custom role only after warning and confirming assignment removal', async () => {
    vi.mocked(api.deleteRole).mockResolvedValue(undefined)
    const { location } = setup(
      <RolesPage />,
      '/settings/roles/' + roleId,
      '/settings/roles/:roleId',
    )
    const actions = await screen.findByRole('group', { name: 'Form actions' })
    expect(within(actions).getByRole('button', { name: 'Save permissions' })).toHaveAttribute(
      'data-variant',
      'default',
    )
    expect(within(actions).getByRole('button', { name: 'Reload selection' })).toBeInTheDocument()
    openMore()
    const deleteItem = await screen.findByRole('menuitem', { name: 'Delete role' })
    expect(deleteItem).toHaveAttribute('data-variant', 'destructive')
    fireEvent.click(deleteItem)
    expect(api.deleteRole).not.toHaveBeenCalled()
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Staff accounts remain')
    expect(dialog).toHaveTextContent('This cannot be undone')
    vi.mocked(api.listRoles).mockResolvedValue([])
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(api.deleteRole).toHaveBeenCalledWith(roleId))
    await waitFor(() => expect(location.history.at(-1)).toBe('/settings/roles'))
  })
  it('shows deletion errors and keeps the current role', async () => {
    vi.mocked(api.deleteRole).mockRejectedValue(
      new ApiError(403, 'FORBIDDEN', 'Cannot delete this role'),
    )
    setup(<RolesPage />, '/settings/roles')
    await confirm('Delete role')
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot delete this role')
  })
  it('loads the actual staff list and submits server-side search and filters', async () => {
    setup(<StaffPage />, '/settings/staff')
    expect(await screen.findByText(person.email)).toBeInTheDocument()
    expect(screen.queryByText('Yassine Idrissi')).not.toBeInTheDocument()
    fill('Search staff', 'Sara')
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() =>
      expect(api.listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ q: 'Sara', page: 1 }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      ),
    )
    fill('Accounts', 'archived')
    await waitFor(() =>
      expect(api.listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'archived', page: 1 }),
        expect.anything(),
      ),
    )
  })
  it('paginates using server totals', async () => {
    vi.mocked(api.listStaff).mockResolvedValue({
      items: [person],
      total: 26,
      page: 1,
      pageSize: 25,
    })
    setup(<StaffPage />, '/settings/staff')
    await screen.findByText(person.email)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await waitFor(() =>
      expect(api.listStaff).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 2 }),
        expect.anything(),
      ),
    )
  })
  it('shows an empty state and access failures without mock fallback', async () => {
    vi.mocked(api.listStaff).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 25 })
    setup(<StaffPage />, '/settings/staff')
    expect(await screen.findByText('No staff found')).toBeInTheDocument()
  })
  it('shows forbidden reads explicitly', async () => {
    vi.mocked(api.listStaff).mockRejectedValue(new ApiError(403, 'FORBIDDEN', 'Forbidden'))
    setup(<StaffPage />, '/settings/staff')
    expect(await screen.findByText('Access denied')).toBeInTheDocument()
  })
  it('loads saved permission keys and clears them only after confirmation', async () => {
    setup(<RolesPage />, '/settings/roles')
    const toggle = await screen.findByRole('switch', { name: /View staff/ })
    expect(toggle).toBeChecked()
    fireEvent.click(toggle)
    fireEvent.click(screen.getByRole('button', { name: 'Save permissions' }))
    expect(api.replaceRolePermissions).not.toHaveBeenCalled()
    vi.mocked(api.replaceRolePermissions).mockResolvedValue(undefined)
    vi.mocked(api.listRoles).mockResolvedValue([{ ...role, permissionKeys: [] }])
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Clear all permissions')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() =>
      expect(api.replaceRolePermissions).toHaveBeenCalledWith(roleId, { permissionKeys: [] }),
    )
    expect(await screen.findByText('Permissions saved.')).toBeInTheDocument()
  })
  it('protects the system administrator role', async () => {
    vi.mocked(api.listRoles).mockResolvedValue([{ ...role, key: 'admin', isSystem: true }])
    setup(<RolesPage />, '/settings/roles')
    expect(await screen.findByRole('switch', { name: /View staff/ })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save permissions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete role' })).not.toBeInTheDocument()
  })
  it('does not allow granting a permission the current user lacks', async () => {
    const extra = { ...permission, id: id, key: 'staff.create', description: 'Manage staff' }
    vi.mocked(auth.getSession).mockResolvedValue({
      ...session,
      permissionKeys: ['roles.read', 'roles.update', 'staff.read'],
    })
    vi.mocked(api.listPermissions).mockResolvedValue([permission, extra])
    setup(<RolesPage />, '/settings/roles')
    await waitFor(() => expect(screen.getByRole('switch', { name: /Manage staff/ })).toBeDisabled())
  })
  it('creates an empty role then navigates to permission setup', async () => {
    vi.mocked(api.createRole).mockResolvedValue({ ...role, permissionKeys: [] })
    const { location } = setup(<RoleCreatePage />, '/settings/roles/new')
    fill('Role name', 'Viewer')
    fill('Role key', 'viewer')
    fill('Description', 'Read-only access')
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/settings/roles/' + roleId))
    expect(api.createRole).toHaveBeenCalledWith({
      name: 'Viewer',
      key: 'viewer',
      description: 'Read-only access',
    })
  })
  it('displays duplicate-role errors without navigating', async () => {
    vi.mocked(api.createRole).mockRejectedValue(
      new ApiError(409, 'DUPLICATE_RECORD', 'A record with these values already exists.'),
    )
    const { location } = setup(<RoleCreatePage />, '/settings/roles/new')
    fill('Role name', 'Viewer')
    fill('Role key', 'viewer')
    fireEvent.click(screen.getByRole('button', { name: 'Create role' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists')
    expect(location.history.at(-1)).toBe('/settings/roles/new')
  })
  it('creates staff without a supplied password and keeps the generated secret out of caches', async () => {
    vi.mocked(api.createStaff).mockResolvedValue({
      ...person,
      temporaryPassword: 'one-use-secret',
      temporaryPasswordExpiresAt: stamp,
    })
    const { client } = setup(<StaffFormPage />, '/settings/staff/new')
    await screen.findByRole('checkbox', { name: /Viewer/ })
    fill('First name', 'Sara')
    fill('Family name', 'Amrani')
    fill('Email address', person.email)
    fireEvent.click(screen.getByRole('checkbox', { name: /Viewer/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Create staff account' }))
    expect(await screen.findByText('one-use-secret')).toBeInTheDocument()
    expect(api.createStaff).toHaveBeenCalledWith({
      firstName: 'Sara',
      lastName: 'Amrani',
      email: person.email,
      roleIds: [roleId],
    })
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('one-use-secret')
    await waitFor(() => expect(client.getMutationCache().getAll()).toHaveLength(0))
    fireEvent.click(screen.getByRole('button', { name: 'I saved it — close' }))
    await waitFor(() => expect(screen.queryByText('one-use-secret')).not.toBeInTheDocument())
  })
  it('validates staff fields before sending', async () => {
    setup(<StaffFormPage />, '/settings/staff/new')
    await screen.findByRole('checkbox', { name: /Viewer/ })
    fireEvent.click(screen.getByRole('button', { name: 'Create staff account' }))
    await waitFor(() => expect(screen.getAllByRole('alert').length).toBeGreaterThan(0))
    expect(api.createStaff).not.toHaveBeenCalled()
  })
  it('loads and saves profile edits separately from role assignments', async () => {
    vi.mocked(api.updateStaff).mockResolvedValue({ ...person, firstName: 'Sarah' })
    const { location } = setup(
      <StaffFormPage />,
      '/settings/staff/' + id + '/edit',
      '/settings/staff/:staffId/edit',
    )
    await screen.findByDisplayValue('Sara')
    fill('First name', 'Sarah')
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
    await waitFor(() => expect(location.history.at(-1)).toBe('/settings/staff/' + id))
    expect(api.updateStaff).toHaveBeenCalledWith(id, {
      firstName: 'Sarah',
      lastName: 'Amrani',
      email: person.email,
    })
    expect(api.replaceUserRoles).not.toHaveBeenCalled()
  })
  it('saves staff role ids and shows server last-admin protection', async () => {
    vi.mocked(api.replaceUserRoles).mockRejectedValue(
      new ApiError(409, 'LAST_ADMIN', 'At least one active administrator must remain'),
    )
    setup(<StaffDetailPage />, '/settings/staff/' + id, '/settings/staff/:staffId')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Viewer/ }))
    await confirm('Save roles')
    expect(await screen.findByRole('alert')).toHaveTextContent('At least one active administrator')
    expect(api.replaceUserRoles).toHaveBeenCalledWith(id, { roleIds: [] })
  })
  it('confirms disable, refreshes the account and enables it again', async () => {
    vi.mocked(api.disableStaff).mockResolvedValue(undefined)
    vi.mocked(api.enableStaff).mockResolvedValue(undefined)
    setup(<StaffDetailPage />, '/settings/staff/' + id, '/settings/staff/:staffId')
    await screen.findByRole('button', { name: 'More' })
    vi.mocked(api.getStaff).mockResolvedValue({ ...detail, disabledAt: stamp })
    await confirm('Disable account')
    await waitFor(() => expect(api.disableStaff).toHaveBeenCalledWith(id))
    await screen.findByRole('button', { name: 'More' })
    openMore()
    expect(await screen.findByRole('menuitem', { name: 'Enable account' })).toBeInTheDocument()
    expect(api.disableStaff).toHaveBeenCalledWith(id)
    vi.mocked(api.getStaff).mockResolvedValue(detail)
    await confirm('Enable account')
    await screen.findByRole('button', { name: 'More' })
    expect(api.enableStaff).toHaveBeenCalledWith(id)
  })
  it('archives rather than deletes history and makes the account read-only', async () => {
    vi.mocked(api.archiveStaff).mockResolvedValue(undefined)
    setup(<StaffDetailPage />, '/settings/staff/' + id, '/settings/staff/:staffId')
    await screen.findByRole('button', { name: 'More' })
    vi.mocked(api.getStaff).mockResolvedValue({ ...detail, disabledAt: stamp, archivedAt: stamp })
    await confirm('Archive account')
    expect(await screen.findByText(/Archived accounts are read-only/)).toBeInTheDocument()
    expect(api.archiveStaff).toHaveBeenCalledWith(id)
    expect(screen.queryByRole('link', { name: 'Edit profile' })).not.toBeInTheDocument()
  })
  it('reissues credentials only on explicit confirmation and never caches them', async () => {
    vi.mocked(api.reissueTemporaryPassword).mockResolvedValue({
      temporaryPassword: 'reissued-secret',
      temporaryPasswordExpiresAt: stamp,
    })
    const { client } = setup(
      <StaffDetailPage />,
      '/settings/staff/' + id,
      '/settings/staff/:staffId',
    )
    await confirm('Reissue temporary password')
    expect(await screen.findByText('reissued-secret')).toBeInTheDocument()
    expect(api.reissueTemporaryPassword).toHaveBeenCalledWith(id)
    expect(
      JSON.stringify(
        client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('reissued-secret')
  })
  it('shows missing account errors', async () => {
    vi.mocked(api.getStaff).mockRejectedValue(new ApiError(404, 'STAFF_NOT_FOUND', 'Not found'))
    setup(<StaffDetailPage />, '/settings/staff/' + id, '/settings/staff/:staffId')
    expect(await screen.findByText('Record not found')).toBeInTheDocument()
  })
  it('allows staff state changes with Edit but protects role assignment', async () => {
    const limited = {
      ...session,
      permissionKeys: ['staff.read', 'staff.update'],
    }
    vi.mocked(auth.getSession).mockResolvedValue(limited)
    setup(<StaffDetailPage />, '/settings/staff/' + id, '/settings/staff/:staffId', limited)
    await screen.findByRole('link', { name: 'Edit profile' })
    for (const name of ['Save roles'])
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })
  it('allows role assignment with staff Edit and roles Edit', async () => {
    const limited = {
      ...session,
      permissionKeys: ['staff.read', 'staff.update', 'roles.read', 'roles.update'],
    }
    vi.mocked(auth.getSession).mockResolvedValue(limited)
    setup(<StaffDetailPage />, '/settings/staff/' + id, '/settings/staff/:staffId', limited)
    await screen.findByRole('button', { name: 'Save roles' })
    expect(screen.getByRole('link', { name: 'Edit profile' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument()
  })
  it('allows role deletion without granting permission editing or role creation', async () => {
    const limited = {
      ...session,
      permissionKeys: ['roles.read', 'roles.delete', 'staff.read'],
    }
    vi.mocked(auth.getSession).mockResolvedValue(limited)
    setup(<RolesPage />, '/settings/roles', '/settings/roles', limited)
    await screen.findByRole('button', { name: 'More' })
    openMore()
    expect(await screen.findByRole('menuitem', { name: 'Delete role' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Save permissions' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Create role' })).not.toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /View staff/ })).toBeDisabled()
  })
  it('does not offer initial role assignment to a staff creator without roles Edit', async () => {
    const limited = {
      ...session,
      permissionKeys: ['staff.read', 'staff.create', 'roles.read'],
    }
    vi.mocked(auth.getSession).mockResolvedValue(limited)
    setup(<StaffFormPage />, '/settings/staff/new', '/settings/staff/new', limited)
    await screen.findByText(/You need View and Edit permissions for roles/)
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(api.listRoles).not.toHaveBeenCalled()
  })
})
import { fillField } from '../test/fill-field'
