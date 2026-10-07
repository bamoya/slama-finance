import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Button } from './button'
import { Combobox } from './combobox'
import { Input } from './input'
import { Select, SelectGroup, SelectOption } from './select'
import { Switch } from './switch'
import { Textarea } from './textarea'

describe('shared form control appearance', () => {
  it('uses the same surface, border, focus, disabled and error styles across field types', () => {
    render(
      <>
        <Input aria-label="Name" disabled aria-invalid />
        <Textarea aria-label="Notes" disabled aria-invalid />
        <Select aria-label="Frequency" value="weekly" disabled aria-invalid>
          <SelectGroup>
            <SelectOption value="weekly">Weekly</SelectOption>
          </SelectGroup>
        </Select>
        <Combobox
          aria-label="Timezone"
          value="UTC"
          options={[{ value: 'UTC', label: 'UTC' }]}
          onValueChange={() => {}}
          disabled
          aria-invalid
        />
        <Button variant="field" disabled aria-invalid>
          Date range
        </Button>
      </>,
    )
    for (const control of [
      screen.getByLabelText('Name'),
      screen.getByLabelText('Notes'),
      screen.getByLabelText('Frequency'),
      screen.getByLabelText('Timezone'),
      screen.getByRole('button', { name: 'Date range' }),
    ]) {
      expect(control).toHaveClass(
        'bg-[var(--field-bg)]',
        'border-[var(--field-border)]',
        'rounded-control',
        'focus-visible:ring-[var(--accent-soft)]',
        'disabled:opacity-50',
        'aria-invalid:border-[var(--error-border)]',
      )
      expect(control).toBeDisabled()
      expect(control).toHaveAttribute('aria-invalid', 'true')
    }
  })
  it('uses theme tokens for switch track and thumb instead of a separate color palette', () => {
    render(<Switch aria-label="Enabled" />)
    const control = screen.getByRole('switch')
    expect(control).toHaveClass('bg-[var(--switch-track)]')
    expect(control.firstElementChild).toHaveClass('bg-[var(--switch-thumb)]')
  })
})
