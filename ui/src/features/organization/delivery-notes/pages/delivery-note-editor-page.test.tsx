import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { DeliveryNoteEditorPage } from './delivery-note-editor-page'

it('drops leading zeros typed in the quantity field', () => {
  render(
    <Router hook={memoryLocation({ path: '/delivery-notes/new' }).hook}>
      <DeliveryNoteEditorPage />
    </Router>,
  )
  const quantity = screen.getAllByLabelText('Quantity')[0] as HTMLInputElement
  fireEvent.change(quantity, { target: { value: '030' } })
  expect(quantity.value).toBe('30')
})
