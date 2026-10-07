import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { Combobox } from './combobox'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from './dialog'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet'

const options = [
  { value: 'atlas', label: 'Atlas SARL', keywords: ['Rabat'] },
  { value: 'slama', label: 'Slama Agricole' },
]

describe('shared searchable combobox', () => {
  it.each(['sheet', 'dialog'] as const)(
    'keeps searchable options inside the containing %s modal boundary',
    async (kind) => {
      const onValueChange = vi.fn()
      const picker = (
        <Combobox aria-label="Client" value="" onValueChange={onValueChange} options={options} />
      )
      render(
        kind === 'sheet' ? (
          <Sheet defaultOpen>
            <SheetContent>
              <SheetTitle>Filters</SheetTitle>
              <SheetDescription>Choose a client</SheetDescription>
              {picker}
            </SheetContent>
          </Sheet>
        ) : (
          <Dialog defaultOpen>
            <DialogContent>
              <DialogTitle>Filters</DialogTitle>
              <DialogDescription>Choose a client</DialogDescription>
              {picker}
            </DialogContent>
          </Dialog>
        ),
      )
      const modal = screen.getByRole('dialog', { name: 'Filters' })
      fireEvent.click(within(modal).getByRole('combobox', { name: 'Client' }))
      const option = await within(modal).findByRole('option', { name: 'Atlas SARL' })
      expect(
        option
          .closest('[role="dialog"][aria-label="Client"]')
          ?.parentElement?.closest('[role="dialog"]'),
      ).toBe(modal)
      fireEvent.click(option)
      expect(onValueChange).toHaveBeenCalledWith('atlas')
      expect(modal).toBeInTheDocument()
    },
  )
  it('searches labels and keywords, selects with keyboard, and clears optional values', async () => {
    function Example() {
      const [value, setValue] = useState('')
      return (
        <Combobox
          aria-label="Client"
          value={value}
          onValueChange={setValue}
          options={options}
          clearLabel="All clients"
        />
      )
    }
    render(<Example />)
    const trigger = screen.getByRole('combobox', { name: 'Client' })
    fireEvent.click(trigger)
    const search = await screen.findByRole('combobox', { name: 'Search options' })
    fireEvent.change(search, { target: { value: 'Rabat' } })
    await waitFor(() =>
      expect(screen.queryByRole('option', { name: 'Slama Agricole' })).not.toBeInTheDocument(),
    )
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'ArrowDown' })
    fireEvent.keyDown(search, { key: 'Enter' })
    await waitFor(() => expect(trigger).toHaveTextContent('Atlas SARL'))
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('option', { name: 'All clients' }))
    expect(trigger).toHaveTextContent('All clients')
  })

  it('uses remote results without filtering twice and retains a selected label', async () => {
    const onSearchChange = vi.fn()
    const onValueChange = vi.fn()
    const { rerender } = render(
      <Combobox
        aria-label="Invoice"
        value="previous"
        selectedLabel="INV-2026-001"
        options={options}
        onValueChange={onValueChange}
        search=""
        onSearchChange={onSearchChange}
      />,
    )
    const trigger = screen.getByRole('combobox', { name: 'Invoice' })
    expect(trigger).toHaveTextContent('INV-2026-001')
    fireEvent.click(trigger)
    fireEvent.change(await screen.findByRole('combobox', { name: 'Search options' }), {
      target: { value: 'remote query' },
    })
    expect(onSearchChange).toHaveBeenCalledWith('remote query')
    expect(screen.getByRole('option', { name: 'Atlas SARL' })).toBeInTheDocument()
    rerender(
      <Combobox
        aria-label="Invoice"
        value="previous"
        selectedLabel="INV-2026-001"
        options={[]}
        loading
        onValueChange={onValueChange}
      />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading…')
    expect(screen.queryByText('No matching records.')).not.toBeInTheDocument()
    expect(trigger).toHaveTextContent('INV-2026-001')
  })

  it('shows empty and retry states, supports Escape, and respects disabled state', async () => {
    const retry = vi.fn()
    const props = { 'aria-label': 'Product', value: '', onValueChange: vi.fn(), options: [] }
    const { rerender } = render(<Combobox {...props} />)
    const trigger = screen.getByRole('combobox', { name: 'Product' })
    fireEvent.click(trigger)
    expect(await screen.findByText('No matching records.')).toBeInTheDocument()
    rerender(<Combobox {...props} error onRetry={retry} />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retry).toHaveBeenCalledOnce()
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search options' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    rerender(<Combobox {...props} disabled />)
    expect(trigger).toBeDisabled()
  })
})
