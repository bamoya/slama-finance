import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Input } from '../ui/input'
import { DataTableToolbar } from './data-table-toolbar'

const viewport = vi.hoisted(() => ({ mobile: false }))
vi.mock('../../lib/use-compact-layout', () => ({ useCompactLayout: () => viewport.mobile }))

describe('shared table toolbar', () => {
  it('keeps search visible and moves ordinary filters into the same sheet', () => {
    viewport.mobile = true
    render(
      <DataTableToolbar onReset={vi.fn()}>
        <div className="table-search">
          <Input aria-label="Search records" />
        </div>
        <>
          <label>
            Status
            <Input aria-label="Status" />
          </label>
          <label>
            Minimum
            <Input aria-label="Minimum" />
          </label>
        </>
      </DataTableToolbar>,
    )
    expect(screen.getByLabelText('Search records')).toBeVisible()
    expect(screen.queryByLabelText('Status')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Filters/ }))
    expect(screen.getByLabelText('Status')).toBeVisible()
    expect(screen.getByLabelText('Minimum')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Search records')).toBeVisible()
  })
  it('keeps advanced filters collapsed on mobile and indicates active criteria', () => {
    viewport.mobile = true
    render(
      <DataTableToolbar
        activeCount={2}
        advanced={
          <label>
            From date
            <Input type="date" />
          </label>
        }
      >
        <Input className="table-search" aria-label="Search" />
      </DataTableToolbar>,
    )
    const toggle = screen.getByRole('button', { name: /Filters.*\(2\)/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByLabelText('From date')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('From date')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('clears filters only when the explicit reset action is clicked', () => {
    viewport.mobile = false
    const reset = vi.fn()
    render(<DataTableToolbar onReset={reset} advanced={<span>Secondary filters</span>} />)
    expect(screen.queryByRole('button', { name: 'Filters' })).not.toBeInTheDocument()
    expect(screen.getByText('Secondary filters')).toBeVisible()
    expect(reset).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(reset).toHaveBeenCalledOnce()
  })
})
