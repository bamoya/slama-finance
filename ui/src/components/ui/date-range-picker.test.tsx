import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DateRangePicker } from './date-range-picker'

describe('date range picker', () => {
  it('applies both local calendar dates together only after confirmation', async () => {
    const change = vi.fn()
    render(<DateRangePicker from="2026-10-01" to="2026-10-15" onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: /^Date range:/ }))
    await waitFor(() => expect(screen.getByRole('grid')).toBeVisible())
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(change).toHaveBeenCalledOnce()
    expect(change).toHaveBeenCalledWith('2026-10-01', '2026-10-15')
  })

  it('cancels without changing filters and clears both dates explicitly', () => {
    const change = vi.fn()
    render(<DateRangePicker from="2026-10-01" onChange={change} />)
    fireEvent.click(screen.getByRole('button', { name: /^Date range:/ }))
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(change).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /^Date range:/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Clear dates' }))
    expect(change).toHaveBeenCalledOnce()
    expect(change).toHaveBeenCalledWith('', '')
  })
})
