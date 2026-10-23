import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { dateInputValue } from './date-input'
import { Input } from './input'

describe('shared date input', () => {
  it('shows DD-MM-YYYY and sends ISO values to forms', () => {
    function Example() {
      const [value, setValue] = useState('2026-10-23')
      return (
        <>
          <Input
            aria-label="Issue date"
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <output>{value}</output>
        </>
      )
    }
    render(<Example />)
    const input = screen.getByRole('textbox', { name: 'Issue date' })
    expect(input).toHaveValue('23-10-2026')
    fireEvent.change(input, { target: { value: '24-10-2026' } })
    expect(input).toHaveValue('24-10-2026')
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-24')
    expect(input).toBeValid()
    fireEvent.change(input, { target: { value: '31-02-2026' } })
    expect(input).toBeInvalid()
  })
  it('supports uncontrolled dates and rejects impossible dates', () => {
    render(<Input aria-label="Date" type="date" defaultValue="2026-10-23" />)
    const input = screen.getByRole('textbox', { name: 'Date' })
    fireEvent.change(input, { target: { value: '24-10-2026' } })
    expect(input).toHaveValue('24-10-2026')
    expect(dateInputValue('29-02-2024')).toBe('2024-02-29')
    expect(dateInputValue('23102026')).toBe('2026-10-23')
    expect(dateInputValue('29-02-2025')).toBe('29-02-2025')
  })
})
