import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'

import type { Permission } from '../../../../api/generated/schemas/identity/rbac.schemas'
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
