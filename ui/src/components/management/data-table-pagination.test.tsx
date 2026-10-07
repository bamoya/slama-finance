import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DataTablePagination } from './data-table-pagination'

describe('Shared server-side pagination', () => {
  it('disables navigation and size changes during a request', () => {
    render(
      <DataTablePagination
        total={120}
        page={2}
        pageSize={25}
        onPage={vi.fn()}
        onPageSizeChange={vi.fn()}
        disabled
      />,
    )
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
  it('keeps a single-page footer visible with all navigation disabled', () => {
    render(<DataTablePagination total={3} page={1} pageSize={25} onPage={vi.fn()} />)
    expect(screen.getByText('1–3 of 3 records')).toBeInTheDocument()
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument()
    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
  })
  it('shows an honest empty range', () => {
    render(<DataTablePagination total={0} page={1} pageSize={25} onPage={vi.fn()} />)
    expect(screen.getByText('0–0 of 0 records')).toBeInTheDocument()
  })
  it('uses the server total for first, previous, next and last page', () => {
    const onPage = vi.fn()
    render(<DataTablePagination total={120} page={2} pageSize={25} onPage={onPage} />)
    expect(screen.getByText('26–50 of 120 records')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPage).toHaveBeenLastCalledWith(3)
    fireEvent.click(screen.getByRole('button', { name: 'Last page' }))
    expect(onPage).toHaveBeenLastCalledWith(5)
    fireEvent.click(screen.getByRole('button', { name: 'First page' }))
    expect(onPage).toHaveBeenLastCalledWith(1)
  })
  it('adapts offset APIs without slicing loaded rows', () => {
    const onOffset = vi.fn()
    render(<DataTablePagination total={61} offset={25} limit={25} onOffset={onOffset} />)
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onOffset).toHaveBeenLastCalledWith(50)
    fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
    expect(onOffset).toHaveBeenLastCalledWith(0)
  })
  it('allows returning from an empty page after records are removed', () => {
    render(<DataTablePagination total={3} page={2} pageSize={25} onPage={vi.fn()} />)
    expect(screen.getByText('0–0 of 3 records')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
