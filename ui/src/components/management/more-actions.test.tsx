import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { PaymentCancellationSchema } from '../../api/generated/schemas/sales/payments.schemas'
import { CancellationDialog } from './cancellation-dialog'
import { ConfirmAction } from './confirm-action'
import { MoreAction, MoreActions } from './more-actions'

const openMenu = () =>
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), {
    button: 0,
    ctrlKey: false,
    pointerType: 'mouse',
  })

describe('detail page action menu', () => {
  it('supports keyboard opening, selection, and dismissal', async () => {
    const selected = vi.fn()
    render(
      <MoreActions>
        <MoreAction label="Export" onSelect={selected} />
      </MoreActions>,
    )
    const trigger = screen.getByRole('button', { name: 'More' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    const item = await screen.findByRole('menuitem', { name: 'Export' })
    await waitFor(() => expect(item).toHaveFocus())
    fireEvent.keyDown(item, { key: 'Enter' })
    expect(selected).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })

  it('does not expose an empty menu when no permitted action is rendered', () => {
    render(<MoreActions>{null}</MoreActions>)
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })

  it('closes the menu while keeping a confirmation dialog mounted, then restores focus', async () => {
    const confirm = vi.fn().mockResolvedValue(undefined)
    render(
      <MoreActions>
        <ConfirmAction
          label="Delete record"
          description="This removes the record."
          variant="destructive"
          onConfirm={confirm}
        />
      </MoreActions>,
    )
    expect(screen.queryByRole('button', { name: 'Delete record' })).not.toBeInTheDocument()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete record' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Delete record' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(confirm).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole('button', { name: 'More' })).toHaveFocus())
  })

  it('opens reason input only after selecting cancellation and preserves error feedback', async () => {
    render(
      <MoreActions>
        <CancellationDialog
          triggerLabel="Cancel payment"
          title="Cancel payment"
          onConfirm={vi.fn().mockRejectedValue(new Error('Failed'))}
          validateReason={(reason) =>
            PaymentCancellationSchema.shape.reason.safeParse(reason).success
          }
        />
      </MoreActions>,
    )
    openMenu()
    expect(screen.queryByLabelText('Cancellation reason')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cancel payment' }))
    fireEvent.change(screen.getByLabelText('Cancellation reason'), {
      target: { value: 'Wrong invoice' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm cancellation' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Cancellation reason')).toHaveValue('Wrong invoice')
  })

  it('keeps callbacks current and removes actions when their permission disappears', () => {
    const selected = vi.fn()
    function Example() {
      const [allowed, setAllowed] = useState(true)
      return (
        <>
          <button onClick={() => setAllowed(false)}>Revoke</button>
          <MoreActions>{allowed && <MoreAction label="Export" onSelect={selected} />}</MoreActions>
        </>
      )
    }
    render(<Example />)
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export' }))
    expect(selected).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument()
  })
})
