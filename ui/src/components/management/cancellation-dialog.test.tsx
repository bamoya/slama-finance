import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PaymentCancellationSchema } from '../../api/generated/schemas/sales/payments.schemas'
import { CancellationDialog } from './cancellation-dialog'

function setup(onConfirm = vi.fn().mockResolvedValue(undefined)) {
  render(
    <CancellationDialog
      triggerLabel="Cancel payment"
      title="Cancel payment"
      onConfirm={onConfirm}
      validateReason={(reason) => PaymentCancellationSchema.shape.reason.safeParse(reason).success}
    />,
  )
  return onConfirm
}

describe('cancellation dialog', () => {
  it('keeps reason off the page until opened, validates, trims, and confirms', async () => {
    const confirm = setup()
    expect(screen.queryByLabelText('Cancellation reason')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel payment' }))
    const dialog = screen.getByRole('dialog', { name: 'Cancel payment' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm cancellation' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a valid cancellation reason.')
    expect(confirm).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: '  Duplicate entry  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm).toHaveBeenCalledWith('Duplicate entry')
  })

  it('discards dismissed reasons and does not send requests', () => {
    const confirm = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel payment' }))
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: 'Do not send' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel payment' }))
    expect(screen.getByLabelText('Cancellation reason')).toHaveValue('')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('retains failed input for retry and prevents double submission while pending', async () => {
    const confirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('Failure'))
      .mockResolvedValueOnce(undefined)
    setup(confirm)
    fireEvent.click(screen.getByRole('button', { name: 'Cancel payment' }))
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: 'Wrong invoice' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    expect(screen.getByRole('button', { name: 'Cancelling…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Go back' })).toBeDisabled()
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Cancellation reason')).toHaveValue('Wrong invoice')
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})
