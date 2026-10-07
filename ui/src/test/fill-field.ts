import { fireEvent, screen } from '@testing-library/react'

export function fillField(label: string, value: string) {
  const control = screen.getByLabelText(label)
  if (control.getAttribute('role') !== 'combobox') {
    fireEvent.change(control, { target: { value } })
    return
  }
  fireEvent.keyDown(control, { key: 'ArrowDown' })
  const option = screen
    .getAllByRole('option')
    .find((item) => item.getAttribute('data-value') === value)
  if (!option) throw new Error(`Option ${value} not found for ${label}`)
  fireEvent.click(option)
}
