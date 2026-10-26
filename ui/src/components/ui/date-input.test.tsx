import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { setUiLanguage } from '../../lib/i18n'
import { dateInputValue } from './date-input'
import { Input } from './input'

describe('shared date input', () => {
  it('inserts separators progressively while emitting ISO only for a complete valid date', () => {
    function Example() {
      const [value, setValue] = useState('')
      return (
        <>
          <Input
            aria-label="Date"
            type="date"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          <output>{value}</output>
        </>
      )
    }
    render(<Example />)
    const input = screen.getByRole('textbox', { name: 'Date' }) as HTMLInputElement
    const expected = [
      '2',
      '23-',
      '23-1',
      '23-10-',
      '23-10-2',
      '23-10-20',
      '23-10-202',
      '23-10-2026',
    ]
    for (const [index, digit] of [...'23102026'].entries()) {
      fireEvent.change(input, { target: { value: input.value + digit } })
      expect(input).toHaveValue(expected[index])
      expect(input.selectionStart).toBe(input.value.length)
    }
    expect(screen.getByRole('status')).toHaveTextContent('2026-10-23')
    expect(input).toBeValid()
  })
  it('allows backspacing through separators, clearing, and pasting dates', () => {
    render(<Input aria-label="Date" type="date" />)
    const input = screen.getByRole('textbox', { name: 'Date' })
    fireEvent.change(input, { target: { value: '23' } })
    expect(input).toHaveValue('23-')
    fireEvent.input(input, { target: { value: '23' }, inputType: 'deleteContentBackward' })
    expect(input).toHaveValue('23')
    fireEvent.input(input, { target: { value: '2' }, inputType: 'deleteContentBackward' })
    expect(input).toHaveValue('2')
    fireEvent.change(input, { target: { value: '' } })
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: '23102026' } })
    expect(input).toHaveValue('23-10-2026')
    fireEvent.change(input, { target: { value: '2026-10-24' } })
    expect(input).toHaveValue('24-10-2026')
    fireEvent.change(input, { target: { value: '31/02/2026' } })
    expect(input).toHaveValue('31-02-2026')
    expect(input).toBeInvalid()
  })
  it('keeps the cursor near edits in the middle of a date', () => {
    render(<Input aria-label="Date" type="date" defaultValue="2026-10-23" />)
    const input = screen.getByRole('textbox', { name: 'Date' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: '24-10-2026', selectionStart: 2, selectionEnd: 2 } })
    expect(input).toHaveValue('24-10-2026')
    expect(input.selectionStart).toBe(3)
    fireEvent.input(input, {
      target: { value: '2410-2026', selectionStart: 2, selectionEnd: 2 },
      inputType: 'deleteContentForward',
    })
    expect(input).toHaveValue('24-10-2026')
    expect(input.selectionStart).toBe(3)
  })
  it('localizes the format placeholder and refreshes it when language changes', async () => {
    render(<Input aria-label="Date" type="date" />)
    const input = screen.getByRole('textbox', { name: 'Date' })
    expect(input).toHaveAttribute('placeholder', 'DD-MM-YYYY')
    await act(async () => {
      await setUiLanguage('fr')
    })
    expect(input).toHaveAttribute('placeholder', 'JJ-MM-AAAA')
    fireEvent.change(input, { target: { value: 'invalid' } })
    expect((input as HTMLInputElement).validationMessage).toBe(
      'Saisissez une date valide au format JJ-MM-AAAA.',
    )
    await act(async () => {
      await setUiLanguage('en')
    })
    expect(input).toHaveAttribute('placeholder', 'DD-MM-YYYY')
    expect((input as HTMLInputElement).validationMessage).toBe('Enter a valid date as DD-MM-YYYY.')
  })
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
