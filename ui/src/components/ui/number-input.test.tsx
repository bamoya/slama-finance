import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { normalizeNumberDraft, NumberInput } from './number-input'

function Harness({ initial = 0 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return (
    <>
      <NumberInput
        aria-label="qty"
        min="0"
        step="any"
        value={value}
        onValueChange={(v) => setValue(Number(v))}
      />
      <output data-testid="out">{value}</output>
    </>
  )
}

describe('NumberInput', () => {
  it('normalizes leading zeros', () => {
    expect(normalizeNumberDraft('040')).toBe('40')
    expect(normalizeNumberDraft('00')).toBe('0')
    expect(normalizeNumberDraft('0.25')).toBe('0.25')
    expect(normalizeNumberDraft('-007')).toBe('-7')
    expect(normalizeNumberDraft('')).toBe('')
  })

  it('replaces a 0 default while typing', () => {
    render(<Harness />)
    const input = screen.getByLabelText('qty') as HTMLInputElement
    fireEvent.change(input, { target: { value: '04' } })
    expect(input.value).toBe('4')
    fireEvent.change(input, { target: { value: '40' } })
    expect(input.value).toBe('40')
    expect(screen.getByTestId('out').textContent).toBe('40')
  })

  it('keeps decimals', () => {
    render(<Harness />)
    const input = screen.getByLabelText('qty') as HTMLInputElement
    fireEvent.change(input, { target: { value: '0.' } })
    fireEvent.change(input, { target: { value: '0.25' } })
    expect(input.value).toBe('0.25')
    expect(screen.getByTestId('out').textContent).toBe('0.25')
  })

  it('can be cleared and follows external value', () => {
    render(<Harness initial={3} />)
    const input = screen.getByLabelText('qty') as HTMLInputElement
    fireEvent.change(input, { target: { value: '' } })
    expect(input.value).toBe('')
  })
})
