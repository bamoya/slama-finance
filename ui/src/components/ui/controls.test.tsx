import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ActionLink } from '../management/action-link'
import { ConfirmAction } from '../management/confirm-action'
import { StatusBadge } from '../management/status-badge'
import { Select, SelectOption } from './select'

describe('Shared table controls', () => {
  it('renders a compact accessible link and shows its label on keyboard focus', async () => {
    render(
      <ActionLink href="/products/product-1" label="Edit product">
        <Pencil />
      </ActionLink>,
    )
    const link = screen.getByRole('link', { name: 'Edit product' })
    expect(link).toHaveAttribute('href', '/products/product-1')
    expect(link).toHaveClass('size-action')
    expect(link).toHaveTextContent('')
    fireEvent.focus(link)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Edit product')
  })

  it('keeps detail actions labeled unless table compact mode is requested', () => {
    const props = {
      label: 'Delete',
      description: 'Delete record?',
      onConfirm: vi.fn(),
      icon: <Trash2 />,
    }
    const { rerender } = render(<ConfirmAction {...props} />)
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveTextContent('Delete')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-size', 'default')
    rerender(<ConfirmAction {...props} iconOnly />)
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute('data-size', 'icon')
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveTextContent('')
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Delete record?')
  })

  it('marks active statuses consistently in tables and details', () => {
    render(<StatusBadge label="Active" />)
    expect(screen.getByText('Active')).toHaveAttribute('data-status', 'active')
  })
})

describe('Shared Radix select', () => {
  it('supports controlled selection and clearing an optional value', () => {
    function Example() {
      const [value, setValue] = useState('')
      return (
        <Select aria-label="Role" value={value} onValueChange={setValue}>
          <SelectOption value="">All roles</SelectOption>
          <SelectOption value="staff">Staff</SelectOption>
        </Select>
      )
    }
    render(<Example />)
    const trigger = screen.getByRole('combobox', { name: 'Role' })
    expect(trigger).toHaveTextContent('All roles')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: 'Staff' }))
    expect(trigger).toHaveTextContent('Staff')
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    fireEvent.click(screen.getByRole('option', { name: 'All roles' }))
    expect(trigger).toHaveTextContent('All roles')
  })

  it('supports numeric values, disabled fields and dark dropdown surfaces', async () => {
    localStorage.setItem('slama-theme', 'dark')
    try {
      const { rerender } = render(
        <Select aria-label="Page size" defaultValue={25}>
          <SelectOption value={25}>25 rows</SelectOption>
        </Select>,
      )
      const trigger = screen.getByRole('combobox', { name: 'Page size' })
      expect(trigger).toHaveTextContent('25 rows')
      fireEvent.keyDown(trigger, { key: 'ArrowDown' })
      expect(screen.getByRole('listbox')).toHaveClass('is-dark')
      fireEvent.keyDown(screen.getByRole('option'), { key: 'Escape' })
      await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
      rerender(
        <Select aria-label="Page size" defaultValue={25} disabled>
          <SelectOption value={25}>25 rows</SelectOption>
        </Select>,
      )
      expect(trigger).toBeDisabled()
    } finally {
      localStorage.removeItem('slama-theme')
    }
  })
})
