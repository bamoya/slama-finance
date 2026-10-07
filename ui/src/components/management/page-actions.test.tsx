import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { Button } from '../ui/button'
import { FormActionBar } from './form-action-bar'
import { PageActionsProvider } from './page-actions-context'
import { PageHeader } from './page-header'
import { TextRecordForm } from './text-record-form'

describe('Shared page form actions', () => {
  it('submits the owning form once from the header and preserves disabled state', () => {
    const submit = vi.fn((event) => event.preventDefault())
    const page = (disabled: boolean) => (
      <PageActionsProvider>
        <PageHeader title="Edit record" description="Details" />
        <form id="record" onSubmit={submit}>
          <FormActionBar>
            <Button type="submit" form="record" disabled={disabled}>
              Save
            </Button>
          </FormActionBar>
        </form>
      </PageActionsProvider>
    )
    const view = render(page(false))
    const header = document.querySelector('[data-slot="page-header"]') as HTMLElement
    const button = within(header).getByRole('button', { name: 'Save' })
    expect((button as HTMLButtonElement).form?.id).toBe('record')
    expect(button.closest('form')).toBeNull()
    fireEvent.click(button)
    expect(submit).toHaveBeenCalledTimes(1)
    view.rerender(page(true))
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(document.querySelectorAll('[data-slot="form-action-bar"]')).toHaveLength(1)
  })

  it('keeps validation and pending state in the nested form', async () => {
    let finish!: () => void
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(
      <PageActionsProvider>
        <PageHeader title="Create record" description="Details" />
        <TextRecordForm
          fields={[{ name: 'name', label: 'Name' }]}
          schema={z.object({ name: z.string().min(1) })}
          submitLabel="Save"
          onSubmit={submit}
        />
      </PageActionsProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await screen.findByRole('alert')
    expect(submit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Example' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    finish()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
  })

  it('cleans up actions when navigating to a read-only page', () => {
    const view = render(
      <PageActionsProvider>
        <PageHeader title="Edit" description="Details" />
        <FormActionBar>
          <Button>Save</Button>
        </FormActionBar>
      </PageActionsProvider>,
    )
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
    view.rerender(
      <PageActionsProvider>
        <PageHeader title="View" description="Details" />
      </PageActionsProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
  })
})
