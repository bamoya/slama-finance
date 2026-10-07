import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../lib/api-error'
import { ConflictDialog } from './conflict-dialog'
import { FormError } from './form-error'
import { EmptyState, ErrorState, ForbiddenState, LoadingState } from './page-state'

describe('shared feature feedback', () => {
  it('announces loading and errors and permits explicit retry', () => {
    const retry = vi.fn()
    render(
      <>
        <LoadingState />
        <ErrorState onRetry={retry} requestId="test-id" />
      </>,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    expect(screen.getByRole('alert')).toHaveTextContent('Unable to load')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
  it('renders empty and forbidden states without exposing feature data', () => {
    render(
      <>
        <EmptyState title="No clients yet" />
        <ForbiddenState />
      </>,
    )
    expect(screen.getByRole('heading', { name: 'No clients yet' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Access denied' })).toBeInTheDocument()
  })
  it('shows safe form errors and field messages', () => {
    render(
      <FormError
        error={
          new ApiError(400, 'VALIDATION_ERROR', 'Check the fields', 'request-id', {
            email: ['Invalid email'],
          })
        }
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('email: Invalid email')
  })
  it('requires an explicit choice before discarding unsaved edits', () => {
    const onReload = vi.fn()
    const onOpenChange = vi.fn()
    render(<ConflictDialog open onOpenChange={onOpenChange} onReload={onReload} />)
    expect(screen.getByRole('dialog', { name: 'This record has changed' })).toBeInTheDocument()
    expect(onReload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Keep my edits' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onReload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Discard edits and reload' }))
    expect(onReload).toHaveBeenCalledOnce()
  })
})
