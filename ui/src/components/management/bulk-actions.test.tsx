import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api-error'
import { BulkActions } from './bulk-actions'
import { SelectionCell, SelectionHeader } from './selection-cell'
import { useTableSelection } from './use-table-selection'

const rows = [
  { id: 'a', name: 'Atlas', version: 1 },
  { id: 'b', name: 'Basma', version: 1 },
  { id: 'c', name: 'Cedar', version: 1 },
]
describe('Shared bulk actions', () => {
  it('uses the same action order regardless of the order supplied by a list', () => {
    const keys = [
      'delete',
      'cancel',
      'archive',
      'disable',
      'deliver',
      'restore',
      'enable',
      'update',
      'regenerate',
      'downloadZip',
    ]
    const actions = keys.map((key) => ({ key, label: key, run: vi.fn() }))
    const view = render(
      <BulkActions
        selected={rows}
        actions={actions}
        name={(row) => row.name}
        clear={vi.fn()}
        refresh={vi.fn()}
      />,
    )
    const buttons = () =>
      within(screen.getByRole('group'))
        .getAllByRole('button')
        .map((button) => button.textContent)
    const expected = ['Clear selection', ...[...keys].reverse()]
    expect(buttons()).toEqual(expected)
    view.rerender(
      <BulkActions
        selected={rows}
        actions={[...actions].reverse()}
        name={(row) => row.name}
        clear={vi.fn()}
        refresh={vi.fn()}
      />,
    )
    expect(buttons()).toEqual(expected)
    expect(actions.map((action) => action.key)).toEqual(keys)
  })
  it('recovers from a batch failure and allows retrying', async () => {
    const runBatch = vi
      .fn()
      .mockRejectedValueOnce(new Error('Archive failed'))
      .mockResolvedValueOnce([{ name: 'Atlas', status: 'success' }])
    const onDismiss = vi.fn()
    render(
      <BulkActions
        selected={rows.slice(0, 1)}
        name={(row) => row.name}
        clear={vi.fn()}
        refresh={vi.fn()}
        actions={[{ key: 'zip', label: 'Prepare ZIP', runBatch, onDismiss }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Prepare ZIP' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('0 succeeded · 0 skipped · 1 failed')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss results' }))
    expect(onDismiss).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Prepare ZIP' }))
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await screen.findByText('1 succeeded · 0 skipped · 0 failed')
    expect(runBatch).toHaveBeenCalledTimes(2)
  })
  it('requires confirmation and reports successes, failures and ineligible records separately', async () => {
    const run = vi.fn(async (row: (typeof rows)[number]) => {
      if (row.id === 'b') throw new ApiError(409, 'IN_USE', 'Record is in use.')
    })
    const clear = vi.fn(),
      refresh = vi.fn(async () => {})
    render(
      <BulkActions
        selected={rows}
        name={(row) => row.name}
        clear={clear}
        refresh={refresh}
        actions={[
          {
            key: 'delete',
            label: 'Delete',
            destructive: true,
            eligible: (row) => row.id !== 'c',
            run,
          },
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(run).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Atlas')).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await screen.findByText('1 succeeded · 1 skipped · 1 failed')
    expect(run).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Basma: Record is in use.')).toBeInTheDocument()
    expect(clear).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('does not execute a cancelled confirmation', () => {
    const run = vi.fn()
    render(
      <BulkActions
        selected={rows}
        name={(row) => row.name}
        clear={vi.fn()}
        refresh={vi.fn()}
        actions={[{ key: 'archive', label: 'Archive', run }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(run).not.toHaveBeenCalled()
  })
  it('prevents double submission while processing', async () => {
    let finish!: () => void
    const run = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(
      <BulkActions
        selected={rows.slice(0, 1)}
        name={(row) => row.name}
        clear={vi.fn()}
        refresh={vi.fn()}
        actions={[{ key: 'archive', label: 'Archive', run }]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Archive' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    fireEvent.click(confirm)
    fireEvent.click(confirm)
    expect(run).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('selects the current page and clears selection after filters, page, or versions change', () => {
    function Table({ scope, version = 1 }: { scope: string; version?: number }) {
      const selection = useTableSelection(
        rows.map((row) => ({ ...row, version })),
        scope,
      )
      return (
        <table>
          <thead>
            <tr>
              <SelectionHeader selection={selection} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <SelectionCell selection={selection} id={row.id} name={row.name} />
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    const view = render(<Table scope="page=1" />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Atlas' }))
    expect(screen.getByRole('checkbox', { name: 'Select current page' })).toHaveAttribute(
      'data-state',
      'indeterminate',
    )
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select current page' }))
    expect(
      screen.getAllByRole('checkbox').every((box) => box.getAttribute('data-state') === 'checked'),
    ).toBe(true)
    view.rerender(<Table scope="page=2" />)
    expect(
      screen
        .getAllByRole('checkbox')
        .every((box) => box.getAttribute('data-state') === 'unchecked'),
    ).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Atlas' }))
    view.rerender(<Table scope="page=2" version={2} />)
    expect(screen.getByRole('checkbox', { name: 'Select Atlas' })).not.toBeChecked()
  })
})
