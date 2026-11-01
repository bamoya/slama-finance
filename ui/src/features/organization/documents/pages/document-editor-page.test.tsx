import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { Router } from 'wouter'
import { memoryLocation } from 'wouter/memory-location'

import { DocumentEditorPage } from './document-editor-page'

it('drops leading zeros typed in quantity and price fields', () => {
  render(
    <Router hook={memoryLocation({ path: '/invoices/new' }).hook}>
      <DocumentEditorPage kind="Invoice" />
    </Router>,
  )
  const quantity = screen.getAllByLabelText('Quantity')[0] as HTMLInputElement
  const price = screen.getAllByLabelText('Price')[0] as HTMLInputElement
  fireEvent.change(quantity, { target: { value: '040' } })
  fireEvent.change(price, { target: { value: '007.5' } })
  expect(quantity.value).toBe('40')
  expect(price.value).toBe('7.5')
})
