import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import type { Permission } from '../../../../../api/generated/schemas/identity/rbac.schemas'
import i18n from '../../../../../lib/i18n'
import { PermissionMatrix } from './permission-matrix'

it('renders one reporting permission without per-section or schedule rows', () => {
  const keys = [
    'reports.read',
    'invoices.update',
    'notification_rules.update',
    'notification_dispatches.update',
  ]
  const permissions = keys.map((key, index) => ({
    id: String(index),
    key,
    description: key,
  })) as Permission[]
  const onChange = vi.fn()
  render(
    <PermissionMatrix
      permissions={permissions}
      selected={[]}
      allowedKeys={keys}
      disabled={false}
      onChange={onChange}
    />,
  )
  const headings = screen.getAllByRole('columnheader').map((node) => node.textContent)
  expect(headings).toEqual(['Module', 'View', 'Create', 'Edit', 'Delete'])
  const row = screen.getByRole('rowheader', { name: 'reports' }).closest('tr')!
  fireEvent.click(within(row).getByRole('switch'))
  expect(onChange).toHaveBeenCalledWith(['reports.read'])
  expect(within(row).getAllByText('—')).toHaveLength(3)
})

it('labels the credit notes module in English and French', async () => {
  const permissions = ['read', 'create', 'update', 'delete'].map((action) => ({
    id: action,
    key: `credit_notes.${action}`,
    description: action,
  })) as Permission[]
  const props = {
    permissions,
    selected: [],
    allowedKeys: permissions.map((item) => item.key),
    disabled: false,
    onChange: vi.fn(),
  }
  const { unmount } = render(<PermissionMatrix {...props} />)
  expect(screen.getByRole('rowheader', { name: 'credit notes' })).toBeInTheDocument()
  unmount()
  await i18n.changeLanguage('fr')
  render(<PermissionMatrix {...props} />)
  expect(screen.getByRole('rowheader', { name: 'avoirs' })).toBeInTheDocument()
})
