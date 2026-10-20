import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'

import { DeletionCascadeOption } from './deletion-cascade-option'

describe('deletion cascade option', () => {
  it('opts in through the whole label and explains both states', () => {
    function Example() {
      const [checked, setChecked] = useState(false)
      return (
        <DeletionCascadeOption
          checked={checked}
          onCheckedChange={setChecked}
          label="Delete related records"
        />
      )
    }
    render(<Example />)
    const checkbox = screen.getByRole('checkbox', { name: 'Delete related records' })
    expect(checkbox).not.toBeChecked()
    expect(checkbox).toHaveAccessibleDescription('Leave unchecked to preserve related records.')
    fireEvent.click(screen.getByText('Delete related records'))
    expect(checkbox).toBeChecked()
    expect(checkbox).toHaveAccessibleDescription(
      'Related records will also be permanently deleted.',
    )
    fireEvent.click(checkbox)
    expect(checkbox).not.toBeChecked()
  })

  it('respects the pending dialog fieldset', () => {
    render(
      <fieldset disabled>
        <DeletionCascadeOption checked={false} onCheckedChange={() => {}} label="Delete related" />
      </fieldset>,
    )
    expect(screen.getByRole('checkbox')).toBeDisabled()
  })
})
